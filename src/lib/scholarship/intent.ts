// ─── Query-intent understanding (server-side) ────────────────────────────────
// The "smart search assistant" step. Turns free-form queries like
// "Hungary fully funded scholarship", "Fullbright", or "Masters scholarships for
// AI in Germany" into structured signals:
//
//   namedScholarship — a specific, well-known programme the user means
//                      (with safe spelling correction: Fullbright → Fulbright)
//   fields           — the academic field(s) + related programme terminology
//                      used for discovery AND for inspecting eligible fields
//   country/degree/funding/eligibility — the user's requirements
//   requireOpen      — did the user ask for currently open scholarships?
//
// Fail-soft by design: on any LLM hiccup we fall back to a deterministic
// heuristic interpretation so a search never breaks.

import type { SearchFilters } from "./web-search";
import { groqJSON, GroqError } from "./groq";

export type IntentMode = "name" | "general";

export interface SearchIntent {
  mode: IntentMode;
  /** A specific named scholarship/programme the user means (corrected), or null. */
  namedScholarship: string | null;
  /** Canonical field label for messages & display, e.g. "Computer Engineering". */
  displayField: string | null;
  /** Canonical field + related programme terms (used for field matching). */
  fields: string[];
  /** The related programme vocabulary (subset of `fields` for UI hints). */
  relatedFields: string[];
  country: string | null;
  degreeLevels: string[];
  funding: string | null;
  eligibility: string[];
  requireOpen: boolean;
  /** The web query the pipeline actually searches with. */
  webQuery: string;
}

// ─── Normalization helpers ───────────────────────────────────────────────────

const norm = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase();

const tokens = (s: string): string[] =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

// ─── Named-scholarship aliases (heuristic safety net) ────────────────────────
// The LLM normally repairs spelling/naming ("Fullbright" → "Fulbright",
// "Hungary fully funded scholarship" → "Stipendium Hungaricum"). These aliases
// only kick in when the LLM path fails: a GENERAL normalization strategy
// (normalize + token scan) rather than a rigid map, so it also catches future
// variants. Queries that carry an extra field/degree intent ("Hungarian
// scholarships for engineering") are left alone.

interface Alias {
  /** Tokens that identify the programme (matched in order, substring-fuzzy). */
  tokens: string[];
  canonical: string;
}

const ALIASES: Alias[] = [
  { tokens: ["stipendium", "hungaricum"], canonical: "Stipendium Hungaricum" },
  { tokens: ["stipendium"], canonical: "Stipendium Hungaricum" },
  { tokens: ["hungary", "funded", "scholarship"], canonical: "Stipendium Hungaricum" },
  { tokens: ["hungarian", "scholarship"], canonical: "Stipendium Hungaricum" },
  { tokens: ["hungaricum"], canonical: "Stipendium Hungaricum" },
  { tokens: ["fulbright"], canonical: "Fulbright" },
  { tokens: ["fullbright"], canonical: "Fulbright" },
  { tokens: ["daad"], canonical: "DAAD" },
  { tokens: ["german", "academic", "exchange"], canonical: "DAAD" },
  { tokens: ["chevening"], canonical: "Chevening" },
  { tokens: ["chivening"], canonical: "Chevening" },
  { tokens: ["erasmus", "mundus"], canonical: "Erasmus Mundus" },
  { tokens: ["commonwealth", "scholarship"], canonical: "Commonwealth Scholarship" },
  { tokens: ["rhodes", "scholarship"], canonical: "Rhodes Scholarship" },
];

/** Queries that clearly carry field/degree intent must never be aliased away. */
const NON_ALIAS_CONTEXT = /\b(engineering|computer|science|technology|artificial|intelligence|machine|law|medicine|business|economics|phd|masters|master|bachelor|degree|robot|embedded|software|data)\b/i;

function namedAlias(query: string): string | null {
  const n = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(?:for|in|the|a|to)\b/g, " ");
  for (const alias of ALIASES) {
    const present = alias.tokens.every((tok) => n.includes(tok));
    if (!present) continue;
    // Only claim the query when it doesn't also name a field/degree the
    // programme wouldn't stand in for ("Hungarian scholarships for
    // engineering" stays a general engineering search).
    const remainder = n.replace(new RegExp(alias.tokens.join("|"), "g"), " ");
    if (NON_ALIAS_CONTEXT.test(remainder)) continue;
    return alias.canonical;
  }
  return null;
}

// ─── Field matching (requirement #5) ─────────────────────────────────────────
// A scholarship matches a field when one of its ACTUAL eligible fields/progs
// (extracted from the official source) literally contains a wanted phrase (the
// canonical field or one of its related programme names). We never fall back to
// loose token overlap — "Mechanical Engineering" does NOT match a request for
// "Computer Engineering", but "Electrical and Computer Engineering" does.
//
// Exact-token equality is allowed for very short terms (e.g. "AI").

export function fieldMatches(
  scholarshipFields: string[],
  wantedFields: string[],
): boolean {
  const wantedPhrases = [
    ...new Set(wantedFields.map(norm).filter((w) => w.length >= 3)),
  ];
  const wantedTokens = new Set<string>();
  for (const orig of wantedFields) {
    for (const t of tokens(orig)) wantedTokens.add(t);
  }

  return scholarshipFields.some((rawField) => {
    const nf = norm(rawField);
    if (!nf) return false;
    // Phrase containment (word-boundary-ish): scholarship field contains a
    // wanted phrase, e.g. "electrical and computer engineering" ∋ "computer
    // engineering", "computer science and engineering" ∋ "computer science".
    for (const wp of wantedPhrases) {
      if (nf.includes(wp)) return true;
    }
    // Exact token equality for short/unusual terms ("AI", "ML").
    const ft = tokens(nf).filter((t) => wantedTokens.has(t));
    if (ft.length > 0) {
      const exact = ft.every((t) => wantedTokens.has(t));
      if (exact) return true;
    }
    return false;
  });
}

// ─── LLM parse ───────────────────────────────────────────────────────────────

const INTENT_SCHEMA_DOC = `{
  "mode": "general",
  "namedScholarship": "",
  "displayField": "Computer Engineering",
  "fields": ["Computer Engineering"],
  "relatedFields": [],
  "country": "",
  "degreeLevels": [],
  "funding": "",
  "eligibility": [],
  "requireOpen": true,
  "searchKeywords": []
}`;

function intentPrompt(query: string, filters: SearchFilters): string {
  const filt = {
    country: filters.country || "",
    degreeLevels: filters.degreeLevels ?? [],
    field: filters.field || "",
    funding: filters.funding || "",
    scholarshipType: filters.scholarshipType || "",
  };
  return `You are the scholarship-search assistant. A user typed a search for scholarships. Return a strict JSON object capturing what the user MEANS — not just their exact spelling.

USER QUERY: "${query}"
ALREADY-SELECTED FILTERS: ${JSON.stringify(filt)}

Return exactly this shape:
${INTENT_SCHEMA_DOC}

Rules:
- "mode": "name" ONLY when the query is fundamentally about ONE specific, named scholarship or funder/programme (DAAD, Fulbright, Chevening, Stipendium Hungaricum, "Erasmus Mundus", a named university scholarship, etc.). Otherwise "general".
- "namedScholarship": the ACTUAL programme name when mode is "name", repairing obvious spelling/name variants ONLY when you are confident about a real, well-known programme (e.g. "Fullbright" → "Fulbright", "Stipendium Hungary" → "Stipendium Hungaricum", "Chevening scholarship" → "Chevening"). Empty when not a name query or when unsure. Never invent a programme.
- "displayField": the canonical academic field the user is searching for (e.g. "Computer Engineering", "Artificial Intelligence", "Engineering"). Empty when the query names no field.
- "fields": [displayField] plus any other field the user clearly names.
- "relatedFields": 3-8 genuinely related programme terms under which that field appears on official pages — ONLY genuinely relevant ones. For "Computer Engineering": Computer Science and Engineering, Electrical and Computer Engineering, Computer Systems Engineering, Information and Computer Engineering, Computing, Computer Science, Software Engineering, Artificial Intelligence, Embedded Systems. For "Engineering": Mechanical Engineering, Electrical Engineering, Civil Engineering, Chemical Engineering, Computer Engineering. Do NOT over-include (e.g. "Medicine" is NOT related to "Engineering"); empty when no field was named.
- "country": the study destination country from the query, or "".
- "degreeLevels": Bachelor/Master/PhD from the query, e.g. ["Master"]. Empty if none.
- "funding": "fully_funded" | "partially_funded" | "tuition_fee_waiver" | "".
- "eligibility": short phrases like ["international students"], from the query.
- "requireOpen": true when the query asks for scholarships that are currently open/available/accepting applications; false otherwise. A specific programme name alone does NOT imply requireOpen.
- "searchKeywords": 3-6 concise web-search keywords capturing the search, e.g. ["Fulbright", "Fulbright scholarship"], ["Germany", "DAAD", "DAAD scholarship"], ["AI", "PhD scholarship", "artificial intelligence Germany"]. If a named scholarship is present, lead with it. Prefer official-flavored keywords ("application", "funding", "degree").

Only fill fields the query/filters actually support. Use "" / [] for the rest. Return ONLY valid JSON.`;
}

interface RawIntent {
  mode?: unknown;
  namedScholarship?: unknown;
  displayField?: unknown;
  fields?: unknown;
  relatedFields?: unknown;
  country?: unknown;
  degreeLevels?: unknown;
  funding?: unknown;
  eligibility?: unknown;
  requireOpen?: unknown;
  searchKeywords?: unknown;
}

function cleanListStr(value: unknown, cap = 8): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.replace(/\s+/g, " ").trim().slice(0, 80);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function cleanStr(value: unknown, cap = 120): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim().slice(0, cap);
  return s || null;
}

function degreeTerm(level: string): string {
  const n = level.toLowerCase().trim();
  if (n.startsWith("bachelor") || (n.startsWith("b") && n.length <= 3)) return "bachelor";
  if (n.startsWith("master") || n.startsWith("masters")) return "master";
  if (n.startsWith("phd") || n.startsWith("doctor")) return "phd";
  return n;
}

const FUNDING_TERMS: Record<string, string> = {
  fully_funded: "fully funded",
  partially_funded: "partially funded",
  tuition_fee_waiver: "tuition fee waiver",
};

// ─── Heuristic fallback (no LLM) ─────────────────────────────────────────────

// Queries that name an academic field/subject must NEVER be treated as a named
// programme ("Engineering", "Computer Engineering", "AI" are field searches).
const FIELD_QUERY = /\b(engineering|engineer|computer|computing|science|sciences|technology|tech|ai\b|artificial|intelligence|machine|learning|data|economics|business|management|medicine|medical|law|legal|design|physics|chemistry|biology|mathematics|math|statistics|psychology|finance|accounting|marketing|education|arts|humanities|architecture|robotics|software|systems|electrical|mechanical|civil|chemical|biomedical|environmental|english|history|philosophy|sociology|political|nursing|pharmacy|dentistry|astronomy|earth|marine|linguistics|literature|media|communication|journalism|sports|music|film|animation|information(?:technology|systems)?|research|internship|diplomacy|international\s+relations)\b/i;

// Related programme vocabulary (deterministic, mirrors what the LLM would emit)
// so field searches expand into the terminology official pages actually use.
// Longest/most specific keys must come first.
const FIELD_RELATED: Array<{ tokens: string[]; related: string[] }> = [
  { tokens: ["computer", "engineering"], related: ["Computer Science and Engineering", "Electrical and Computer Engineering", "Computer Systems Engineering", "Software Engineering", "Computer Science", "Artificial Intelligence", "Embedded Systems", "Information Engineering"] },
  { tokens: ["computer", "science"], related: ["Computer Science and Engineering", "Electrical and Computer Engineering", "Software Engineering", "Artificial Intelligence", "Data Science", "Cybersecurity", "Informatics"] },
  { tokens: ["data", "science"], related: ["Data Science and Analytics", "Statistics", "Machine Learning", "Applied Mathematics", "Computer Science", "Business Analytics"] },
  { tokens: ["data"], related: ["Data Science", "Data Analytics", "Machine Learning", "Applied Statistics", "Computer Science"] },
  { tokens: ["artificial", "intelligence"], related: ["Artificial Intelligence", "Machine Learning", "Data Science", "Computer Science", "Intelligent Systems", "AI and Robotics", "Information Engineering"] },
  { tokens: ["machine", "learning"], related: ["Machine Learning", "Artificial Intelligence", "Data Science", "Computer Science", "Statistical Machine Learning"] },
  { tokens: ["intelligence"], related: ["Artificial Intelligence", "Machine Learning", "Data Science", "Computer Science"] },
  { tokens: ["engineering"], related: ["Mechanical Engineering", "Electrical Engineering", "Civil Engineering", "Chemical Engineering", "Computer Engineering", "Engineering Science", "Sustainable Engineering"] },
  { tokens: ["business"], related: ["Business Administration", "Management", "Finance", "Marketing", "Accounting", "Entrepreneurship"] },
  { tokens: ["economics"], related: ["Economics", "Applied Economics", "Development Economics", "Business", "Finance", "Political Economy"] },
  { tokens: ["finance"], related: ["Finance", "Accounting", "Financial Engineering", "Business Administration"] },
  { tokens: ["medicine"], related: ["Medicine", "Clinical Medicine", "Biomedical Sciences", "Health Sciences", "Public Health"] },
  { tokens: ["health"], related: ["Public Health", "Health Sciences", "Biomedical Sciences", "Nursing", "Epidemiology"] },
  { tokens: ["law"], related: ["Law", "Legal Studies", "International Law", "European Law"] },
  { tokens: ["mathematics"], related: ["Mathematics", "Applied Mathematics", "Statistics", "Physics", "Computer Science"] },
  { tokens: ["physics"], related: ["Physics", "Astronomy", "Applied Physics", "Materials Science", "Mathematical Physics"] },
  { tokens: ["chemistry"], related: ["Chemistry", "Chemical Sciences", "Chemical Engineering", "Biochemistry"] },
  { tokens: ["biology"], related: ["Biology", "Biomedical Sciences", "Biotechnology", "Life Sciences"] },
  { tokens: ["environmental"], related: ["Environmental Science", "Environmental Engineering", "Sustainability", "Renewable Energy"] },
  { tokens: ["psychology"], related: ["Psychology", "Cognitive Science", "Neuroscience", "Behavioural Science"] },
];

function relatedFor(query: string): string[] {
  const qTokens = new Set(tokens(query));
  for (const entry of FIELD_RELATED) {
    if (entry.tokens.every((t) => qTokens.has(t))) return entry.related;
  }
  return [];
}

/** Rephrase a raw field query ("AI scholarships", "PhD in AI") into a label. */
function cleanFieldLabel(q: string): string {
  const s = q
    .replace(/\b(scholarships?|grants?|fellowships?|bursaries?|masters?|phd|ph\.d|bachelors?|degree|programmes?|programs?|funding|awards?)\b/gi, " ")
    .replace(/\b(in|for|of|and|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return (q.trim() || "scholarship").slice(0, 60);
  return s.slice(0, 60);
}

export function fallbackIntent(query: string, filters: SearchFilters): SearchIntent {
  const q = query.trim();
  // Named-scholarship aliases (incl. spelling repairs) take priority whenever
  // the LLM path is unavailable; otherwise very short queries that are not
  // obviously a field/country are treated as a probable programme/funder name
  // (e.g. "DAAD", "Fulbright", "Chevening").
  const alias = namedAlias(q);
  const word = q.split(/\s+/).filter(Boolean);
  const isField = !alias && FIELD_QUERY.test(q);
  const nameLike =
    !!alias ||
    (!isField &&
      q.length > 0 &&
      q.length <= 40 &&
      word.length <= 4 &&
      !/\b(in|for|and|fully|funded|scholarships?|study|masters|master's|phd|bachelor)\b/i.test(q));
  const namedScholarship = alias ?? (nameLike ? q.slice(0, 80) : null);

  // Prefer full programme names over abbreviations for display/searching.
  const DISPLAY_OVERRIDES: Record<string, string> = {
    ai: "Artificial Intelligence",
    ml: "Machine Learning",
    cs: "Computer Science",
    ds: "Data Science",
    ce: "Computer Engineering",
    ee: "Electrical Engineering",
    me: "Mechanical Engineering",
    it: "Information Technology",
  };
  const displayRaw = cleanStr(filters.field) ?? (isField ? cleanFieldLabel(q) : null);
  const displayField = displayRaw
    ? (DISPLAY_OVERRIDES[displayRaw.toLowerCase()] ?? displayRaw)
    : null;
  const related = displayField
    ? [...new Set([displayField, ...relatedFor(displayField)])]
    : [];
  const fieldTerm = displayField ?? (nameLike || q.length <= 4 ? null : q);

  const parts: string[] = [];
  if (alias) parts.push(alias);
  else if (isField && displayField) parts.push(displayField);
  else if (nameLike) parts.push(q);
  else if (fieldTerm) parts.push(fieldTerm);
  else parts.push("international");
  if (filters.country) parts.push(filters.country);
  const degree = filters.degreeLevels?.[0] ? degreeTerm(filters.degreeLevels[0]) : null;
  if (degree) parts.push(degree);
  const funding = filters.funding ? FUNDING_TERMS[filters.funding] : null;
  if (funding) parts.push(funding);
  if (filters.scholarshipType) parts.push(filters.scholarshipType);
  if (
    !parts.some((p) => /^[a-z0-9 ]+$/i.test(p) && /scholarship/i.test(p)) &&
    !nameLike &&
    !alias
  ) {
    parts.push("scholarships");
  }

  return {
    mode: nameLike || !!alias ? "name" : "general",
    namedScholarship,
    displayField: displayField ?? (nameLike || !!alias ? null : fieldTerm),
    fields: related,
    relatedFields: related,
    country: filters.country ?? null,
    degreeLevels: filters.degreeLevels ?? [],
    funding: filters.funding ?? null,
    eligibility: [],
    requireOpen: false,
    webQuery: [...new Set(parts)].join(" "),
  };
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Understand what the user means by their query. Always resolves; the heuristic
 * fallback is used when the LLM is unavailable.
 */
export async function parseIntent(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchIntent> {
  const trimmed = query.trim();
  if (!trimmed) return fallbackIntent("", filters);

  let raw: RawIntent;
  try {
    raw = await groqJSON<RawIntent>({
      system:
        "You understand scholarship-search intent in natural language. You output only valid JSON with the exact requested schema. When unsure, prefer fewer fields rather than guessed ones.",
      prompt: intentPrompt(trimmed, filters),
      temperature: 0,
    });
  } catch (err) {
    const label =
      err instanceof GroqError ? err.message : err instanceof Error ? err.message : String(err);
    console.error(`[intent] Parse failed (${label}) — using heuristic interpretation.`);
    return fallbackIntent(trimmed, filters);
  }

  const modeRaw = cleanStr(raw.mode)?.toLowerCase();
  const mode: IntentMode =
    modeRaw === "name" ? "name" : "general";

  const namedScholarship =
    mode === "name" ? cleanStr(raw.namedScholarship) : null;

  const displayField = cleanStr(raw.displayField);
  const llmFields = cleanListStr(raw.fields);
  const llmRelated = cleanListStr(raw.relatedFields);
  const fields = [...new Set([...(filters.field ? [filters.field] : []), ...llmFields, ...llmRelated])];
  const relatedFields = [
    ...new Set([
      ...(filters.field ? [filters.field] : []),
      ...(llmRelated.length ? llmRelated : llmFields),
    ]),
  ];

  // Explicit dropdown selections always win over the LLM's guesses.
  const country = filters.country || cleanStr(raw.country) || null;
  const degreeLevels =
    filters.degreeLevels && filters.degreeLevels.length
      ? filters.degreeLevels
      : cleanListStr(raw.degreeLevels, 3);
  const funding = filters.funding || cleanStr(raw.funding) || null;
  const eligibility = cleanListStr(raw.eligibility, 4);
  const requireOpen = raw.requireOpen === true;

  // Build the web query:
  //  - a named programme is searched by its actual (corrected) name;
  //  - otherwise by field (+ country/degree/funding), using the user's own
  //    keywords when the structured signals are thin.
  let webQuery: string;
  if (mode === "name" && namedScholarship) {
    webQuery = `${namedScholarship} scholarship`;
  } else {
    const keywords = cleanListStr(raw.searchKeywords, 6);
    if (keywords.length >= 2 || (keywords.length === 1 && !displayField && !country)) {
      webQuery = [...new Set(keywords)].join(" ");
    } else {
      const parts: string[] = [];
      if (displayField) parts.push(displayField);
      else if (keywords[0]) parts.push(keywords[0]);
      else parts.push("international");
      if (country) parts.push(country);
      if (degreeLevels[0]) parts.push(degreeTerm(degreeLevels[0]));
      const fundingTerm = funding ? FUNDING_TERMS[funding] : null;
      if (fundingTerm) parts.push(fundingTerm);
      if (filters.scholarshipType) parts.push(filters.scholarshipType);
      if (!parts.some((p) => /scholarship/i.test(p))) parts.push("scholarships");
      webQuery = [...new Set(parts)].join(" ");
    }
  }

  return {
    mode,
    namedScholarship,
    displayField,
    fields,
    relatedFields: relatedFields.slice(0, 6),
    country,
    degreeLevels,
    funding,
    eligibility,
    requireOpen,
    webQuery,
  };
}

// ─── Query expansion (breadth #1: never stop after one search) ────────────────
// A single web search is never enough. Expand one user query into a small set
// of diverse queries — the original, official-flavored variants, degree/
// country/funding-scoped variants, and related-field terminology — so the
// discovery pass sees enough official material to work with.

export function buildSearchQueries(
  intent: SearchIntent,
  filters: SearchFilters = {},
): string[] {
  const out: string[] = [];
  const pushUnique = (q: string) => {
    const s = q.replace(/\s+/g, " ").trim();
    if (s && !out.includes(s)) out.push(s);
  };

  pushUnique(intent.webQuery);

  if (intent.mode === "name" && intent.namedScholarship) {
    const n = intent.namedScholarship;
    pushUnique(`${n} scholarship`);
    if (intent.country) pushUnique(`${n} scholarship ${intent.country}`);
    pushUnique(`${n} official program application`);
    return out.slice(0, 4);
  }

  // General field search → related terminology + degree/country/funding scope.
  const field = intent.displayField ?? intent.fields[0] ?? null;
  const degree = intent.degreeLevels[0] ? degreeTerm(intent.degreeLevels[0]) : null;
  const fund = intent.funding ? FUNDING_TERMS[intent.funding] : null;
  const geo = intent.country ?? filters.country ?? null;

  if (field) {
    pushUnique(
      `${field} ${fund ?? ""} ${degree ?? ""} ${optional(geo)}scholarship international`
        .replace(/\s+/g, " ")
        .trim(),
    );
    // Surface institutional pages directly: site:-constraining a field query
    // outperforms bag-of-words "official application" spam when the SERP is
    // dominated by scholarship listicles.
    pushUnique(`site:edu ${field} scholarship`);
    pushUnique(`site:ac.uk ${field} scholarship`);
    for (const rel of intent.relatedFields.slice(0, 2)) {
      pushUnique(`${rel} scholarship international`.replace(/\s+/g, " ").trim());
    }
  } else {
    pushUnique(
      `international ${fund ?? ""} ${degree ?? ""} ${optional(geo)}scholarship`
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  pushUnique(`${intent.webQuery} official`);

  return out.slice(0, 6);
}

const optional = (s: string | null | undefined): string =>
  s ? `${s} ` : "";