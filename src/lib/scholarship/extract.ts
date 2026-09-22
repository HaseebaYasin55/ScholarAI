// ─── Structured extraction of scholarship data from a scraped page ────────────
// Server-side only. Uses Groq to pull a strict JSON record from a page's
// plain text, then validates & normalizes it. We never invent information: when
// a value is absent the field stays null/empty and the UI renders "Not
// specified".

import type { Scholarship } from "./types";
import {
  scholarshipId,
  isGenericName,
  truncateText,
  isJunkUrl,
  hostCountry,
} from "./web";
import type { FetchedPage } from "./web";
import { groqJSON, GroqError } from "./groq";

// ─── Raw JSON shape requested from Gemini ─────────────────────────────────────

interface RawExtraction {
  name: string;
  university: string;
  country: string;
  degreeLevels: string[];
  fields: string[];
  fundingType: string;
  tuitionCoverage: string;
  tuitionFee: string;
  stipendAmount: string;
  stipendFrequency: string;
  accommodationSupport: string;
  travelAllowance: string;
  healthInsurance: string;
  applicationFee: string;
  eligibilityRequirements: string;
  requiredDocuments: string[];
  ieltsRequirement: string;
  openingDate: string;
  deadline: string;
  cycle: string;
  applicationStatus: string;
  officialUniversityUrl: string;
  description: string;
  applicationInfo: string;
  /** Countries/nationalities the page explicitly states are eligible (verbatim). */
  eligibleNationalities: string[];
  /** Nationality scope: "open_to_all" | "restricted" | "" (not stated). */
  nationalityRestriction: string;
  /** True ONLY when the page explicitly says open to all academic disciplines. */
  openToAllDisciplines: boolean;
}

// ─── Cleaning helpers ─────────────────────────────────────────────────────────

function cleanStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s === "" || /^(n\/?a|not specified|none|tbd|to be determined)$/i.test(s)
    ? null
    : s;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const s = cleanStr(v);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * True when a value is a broad eligibility statement ("all academic
 * disciplines", "any field of study", "open to all subjects", …) rather than a
 * concrete eligible program/field. Such statements must NOT become program
 * dropdown options — the UI keeps its manual fallback instead of inventing a
 * list the official page never gave.
 */
function isBroadFieldStatement(value: string): boolean {
  const s = value.trim().toLowerCase();
  if (!s) return true;
  return (
    /^(all|any|every|various|multiple|other|open)\b[\s\S]{0,60}\b(disciplines?|fields?|subjects?|areas?|courses?|programs?|programmes?|studies|study)\b/.test(
      s,
    ) ||
    /\b(open to all|across all|all academic disciplines|all disciplines|all fields of study|any discipline|any field of study|all subject areas|all areas of study|all programmes?)\b/.test(
      s,
    )
  );
}

/** Eligible programs/fields — concrete values only, verbatim from the page. */
function cleanFields(value: unknown): string[] {
  return cleanList(value).filter((f) => !isBroadFieldStatement(f));
}

/** Explicit "open to all academic disciplines" statements on a page. */
const ALL_DISCIPLINES_RE =
  /(all academic disciplines|all (fields|areas|subject areas?) of study|any (academic )?(subject|discipline|field( of study)?)|open to all (subjects|disciplines|fields|areas))/i;

function scrapeAllDisciplines(text: string): Scholarship["openToAllDisciplines"] {
  return ALL_DISCIPLINES_RE.test(text) ? true : null;
}

// ─── Deterministic eligible-programme scanner ────────────────────────────────
// Pulls the eligible programme list straight out of the official page text when
// the LLM is unavailable (rate limit / outage). Deliberately conservative: a
// candidate must be a section entry under an explicit programme heading OR carry
// a real degree signal (MSc / Master of / PhD …), every entry is a verbatim line
// from the page, and broad "all disciplines" statements are rejected so the UI
// keeps its manual entry instead of inventing a list.

// Whole-line (or short prefix) programme headings: "Eligible programmes",
// "List of degrees", "Available courses for this scholarship:", …
const PROGRAM_SECTION_HEAD_RE =
  /^(?:list\s+of\s+|available\s+|eligible\s+|offered\s+|supported\s+|funded\s+|covered\s+|selected\s+|existing\s+|taught\s+|research\s+)?(?:programmes?|programs?|courses?|degrees?|fields\s+of\s+study|subjects?|disciplines?|specialis(?:a|z)ations?)\s*:?\s*$/i;

// Programme entries written starting with an explicit degree token — the
// dominant format on official pages ("MSc in X", "Master of Public Health",
// "PhD in Computer Science", "BSc Nursing").
const PROGRAM_LEAD_RE =
  /^(?:master(?:'s|s)?\s+(?:of|in)|research\s+master(?:'s|s)?|professional\s+master(?:'s|s)?|msc\b|m\.\s*sc\b|mres\b|mphil\b|mba\b|m\.\s*a\b|ma\b|meng\b|m\.\s*eng\b|mtech\b|btech\b|mph\b|mlitt\b|mcom\b|llm\b|ph\.?\s*d\b|phd\b|dphil\b|doctorate\b|doctoral\b|bachelor(?:'s|s)?\s+(?:of|in|degree)|bsc\b|b\.\s*sc\b|b\.\s*a\b|ba\b|beng\b|b\.\s*eng\b|llb\b|b\.\s*ed\b|postgraduate\s+(?:in|degree|course|program(?:me)?|certificate|diploma)|pgcert\b|pgdip\b|graduate\s+(?:diploma|certificate|degree|program(?:me)?|in)|diploma\s+in|certificate\s+in)\b/i;

// Reject navigation / boilerplate lines that are not actual programme entries.
const PROGRAM_NOISE_RE =
  /\b(?:apply|deadline|eligib|criteria|award(?:s|ed)?\s+(?:value|amount|is|of|for)|benefit|covers?|tuition|fee|stipend|monthly|yearly|annually|per\s+(?:month|year|semester)|how\s+to|click|more\s+info|view\s+(?:list|details|pdf)|download|read\s+more|learn\s+more|check|contact|call|email|register|enrol|opens?\s+(?:in|on)|tbc|tbd|n\/a|and\s+more|among\s+others|the\s+following|list\s+of|such\s+as|including|e\.g\.|i\.e\.|please\s+note|selection|informations?|guidelines?|prerequisite|requirement|button|updated?|last\s+update|breadcrumb|nav\b|home\b|back\s+to|skip|jump|share|print|save|bookmark|compare|related|process|taught|admission|entry|overview|explore|search|browse|more\s+about)\b|@|https?:|\bwww\./i;

// Lines that read like prose rather than a programme title ("…is designed to
// prepare students who …") must never become program options.
const PROGRAM_PROSE_RE =
  /\b(?:is|are|will|can|has|have|been|designed|aims?|provides?|offers?|prepares?|teaches?|qualifies?|equips?|students|applicants|those)\b/i;

const PROGRAM_STOP_WORDS = new Set([
  "of", "in", "and", "or", "the", "a", "an", "for", "with", "by", "from",
  "to", "on", "at", "into", "over", "under", "as", "it", "its", "that",
  "this", "master", "msc", "phd", "mphil", "mres", "mba", "bsc", "ba",
  "llm", "postgraduate", "graduate", "diploma", "certificate", "degree",
]);

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasSolidSubject(rest: string): boolean {
  const rest2 = rest.replace(/\([^)]*\)/g, " ").replace(/[^\w\s]/g, " ");
  const words = rest2.split(/\s+/).filter(Boolean);
  return words.some((w) => {
    const wl = w.toLowerCase();
    if (wl.length < 4) return false;
    if (PROGRAM_STOP_WORDS.has(wl)) return false;
    return true;
  });
}

function scrapePrograms(text: string): string[] {
  const out: string[] = [];
  let inSection = false;
  let sectionStretch = 0;
  let pendingSectionLines = 0;
  let guard = 0;

  for (const raw of text.split("\n")) {
    if (out.length >= 20 || guard++ > 1_500) break;
    const line = raw.trim();
    if (!line) {
      if (inSection) sectionStretch += 1;
      continue;
    }
    if (inSection && sectionStretch > 2) {
      inSection = false;
      sectionStretch = 0;
    }
    if (line.length <= 60 && PROGRAM_SECTION_HEAD_RE.test(line)) {
      inSection = true;
      sectionStretch = 0;
      pendingSectionLines = 3;
      continue;
    }

    const prog = line.replace(/^\s*(?:[-•·*–—]|\d{1,2}[.)])\s*/, "").trim();
    if (!prog || prog.length > 90) {
      if (inSection) sectionStretch += 1;
      continue;
    }

    // Strong rule: the programme title starts with an explicit degree token.
    const leadMatch = PROGRAM_LEAD_RE.exec(prog);
    if (leadMatch) {
      const rest = prog.slice(leadMatch[0].length);
      const solid =
        rest.trim().length > 0 &&
        hasSolidSubject(rest) &&
        !PROGRAM_PROSE_RE.test(prog) &&
        !/[:|]\s*$/.test(prog);
      if (solid) {
        if (!PROGRAM_NOISE_RE.test(collapseWhitespace(prog).toLowerCase()) &&
            !isBroadFieldStatement(collapseWhitespace(prog)) &&
            !out.includes(collapseWhitespace(prog))) {
          out.push(collapseWhitespace(prog));
        }
        sectionStretch = 0;
        continue;
      }
      if (inSection) sectionStretch += 1;
      continue;
    }

    // Header-anchored fallback: entries under a programme heading may omit the
    // degree token ("Data Science", "Public Health"), but only a few lines after
    // the heading are trusted and they must look like titles (no prose).
    if (inSection && pendingSectionLines > 0) {
      pendingSectionLines -= 1;
      const clean = collapseWhitespace(prog);
      const words = clean.split(/\s+/).filter(Boolean);
      const looksTitled =
        words.length >= 2 || (words.length === 1 && words[0].length >= 5 && /^[A-Z]/.test(words[0]));
      if (
        looksTitled &&
        words.length <= 8 &&
        !/:$/.test(clean) &&
        !PROGRAM_NOISE_RE.test(clean.toLowerCase()) &&
        !PROGRAM_PROSE_RE.test(clean) &&
        !isBroadFieldStatement(clean) &&
        !out.includes(clean)
      ) {
        out.push(clean);
      }
      sectionStretch = 0;
      continue;
    }

    if (inSection) sectionStretch += 1;
  }
  return out;
}

function cleanNumber(value: unknown): number | null {
  const s = cleanStr(value);
  if (!s) return null;
  const m = s.replace(/[$,\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Parse a human or ISO date into YYYY-MM-DD (or null). */
function cleanDate(value: unknown): string | null {
  const s = cleanStr(value);
  if (!s) return null;

  // ISO / SQL date
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const monthNames = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const monthIndex = (token: string | undefined): number => {
    const t = (token ?? "").toLowerCase().slice(0, 3);
    return t ? monthNames.indexOf(t) : -1;
  };

  // Day Month Year (UK/Europe) — "15 January 2026", "15th January 2026",
  // "1 Mar 2026". Common on European official scholarship pages.
  const dayFirst = s.match(
    /(\d{1,2})(?:st|nd|rd|th)?[\s,·.]+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+((?:20\d{2}|19\d{2}))/i,
  );
  if (dayFirst) {
    const month = monthIndex(dayFirst[2]);
    const day = Number(dayFirst[1]);
    if (month >= 0 && day >= 1 && day <= 31) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${dayFirst[3]}-${mm}-${dd}`;
    }
  }

  // Month Day, Year (US) — "March 1, 2027", "Mar 1st 2026".
  const monthFirst = s.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,]+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:20\d{2}|19\d{2}))/i,
  );
  if (monthFirst) {
    const month = monthIndex(monthFirst[1]);
    const day = Number(monthFirst[2]);
    if (month >= 0 && day >= 1 && day <= 31) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${monthFirst[3]}-${mm}-${dd}`;
    }
  }

  // "2027/03/01" or "03/01/2027"
  const numeric = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (numeric) {
    let a = numeric[1];
    let b = numeric[2];
    const year = numeric[3];
    // 4-digit month/day is never the year; assume MM/DD (US-style) when both ≤12
    if (Number(a) > 12) [a, b] = [b, a];
    return `${year}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }

  return null;
}

function normalizeFundingType(value: unknown): string | null {
  const s = cleanStr(value);
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.includes("full")) return "Fully funded";
  if (low.includes("partial")) return "Partially funded";
  if (low.includes("waiver") || low.includes("tuiti")) return "Tuition fee waiver";
  if (low.includes("funding available") || low === "yes") return "Funding available";
  return null;
}

function normalizeTuitionCoverage(value: unknown): string | null {
  const s = cleanStr(value);
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.includes("tuiti") && low.includes("liv")) return "Tuition + living costs";
  if (low.includes("full")) return "Full tuition";
  if (low.includes("partial")) return "Partial tuition";
  if (low.includes("no") || low.includes("not")) return "Not covered";
  return cleanStr(value);
}

function normalizeUniversity(value: unknown, host?: string): string | null {
  const s = cleanStr(value);
  if (s) return s.replace(/\buniversity of\b/i, "University of");
  if (host) return host.replace(/^www\./i, "").split(".")?.[0] ?? host;
  return null;
}

// ─── Defensive key lookup (Gemini may rename keys slightly) ──────────────────

function pick(raw: Record<string, unknown>, ...names: string[]): unknown {
  const wanted = new Set(names.map((n) => n.toLowerCase().replace(/[^a-z]/g, "")));
  for (const [key, value] of Object.entries(raw)) {
    if (wanted.has(key.toLowerCase().replace(/[^a-z]/g, ""))) return value;
  }
  return undefined;
}

const asString = (raw: Record<string, unknown>, ...names: string[]): string | null =>
  cleanStr(pick(raw, ...names));

const asList = (raw: Record<string, unknown>, ...names: string[]): string[] =>
  cleanList(pick(raw, ...names));

// ─── Name cleaning ────────────────────────────────────────────────────────────

function cleanName(value: string | null, title: string | undefined): string | null {
  let name = cleanStr(value ?? "") ?? cleanStr(title ?? "");
  if (!name) return null;
  // Drop "… | www.site.com" / "… - Site name" style suffixes, then any
  // trailing "| Brand" segment, bracketed "[Updated]" markers and year tags.
  name = name
    .replace(/\s*[|–—:-]\s*(www\.)?[a-z0-9.-]+\.[a-z]{2,}\s*$/i, "")
    .replace(/\s*\|[^|]*$/i, "")
    .replace(/\s+\[(?:updated?|20\d{2}(?:[-–]\d{2})?)\]\s*$/i, "")
    .replace(/\s+(?:20\d{2})(?:\s*[-–]\s*(?:20)?\d{2})?\s*$/i, "")
    .trim();
  if (!name || isGenericName(name)) return null;
  return name.slice(0, 140);
}

// ─── Per-page cleanup + validation ───────────────────────────────────────────

function cleanOne(
  rawItem: Record<string, unknown>,
  page: FetchedPage,
  verified = false,
): Scholarship | null {
  const name = cleanName(asString(rawItem, "name"), page.title);
  const nameFromTitle = name !== asString(rawItem, "name") && !cleanStr(asString(rawItem, "name"));
  if (!name) return null;

  // Deterministic facts scraped from the SAME official page. Used as a safety
  // net when the LLM misses a value that is plainly on the page — never
  // invented, always from this exact source.
  const det = scrapeExtraction(page);

  const llmDeadline = cleanDate(pick(rawItem, "deadline"));
  const deadline = llmDeadline ?? det.deadline ?? null;
  const llmDegrees = asList(rawItem, "degreeLevels");
  const degreeLevels = llmDegrees.length > 0 ? llmDegrees : (det.degreeLevels ?? []);
  const description =
    asString(rawItem, "description") ??
    (nameFromTitle ? cleanStr(page.title) : null);
  const eligibility = asString(rawItem, "eligibilityRequirements");

  // Nationality scope stated on the page — used to filter by the user's
  // citizenship. Only an explicit restriction excludes anyone; leaving it
  // null/empty never hides a scholarship.
  const restrictionRaw = (asString(rawItem, "nationalityRestriction") ?? "").toLowerCase();
  let nationalityOpenToAll: Scholarship["nationalityOpenToAll"] = null;
  if (restrictionRaw.includes("open") || restrictionRaw.includes("all")) {
    nationalityOpenToAll = true;
  } else if (restrictionRaw.includes("restrict") || restrictionRaw.includes("limit")) {
    nationalityOpenToAll = false;
  }
  const eligibleNationalities = cleanList(pick(rawItem, "eligibleNationalities", "nationalities"));

  // Open to ALL academic disciplines — preserved as a fact instead of being
  // turned into a made-up program list. Fall back to the page text signal only
  // when the page states it plainly. null when the page does not state it.
  const allDispRaw = asString(rawItem, "openToAllDisciplines");
  const openToAllDisciplines: Scholarship["openToAllDisciplines"] =
    (allDispRaw == null ? null : /^(true|yes|1|open)$/i.test(allDispRaw.trim()) === true) ??
    scrapeAllDisciplines(page.text);

  // Current application status read from the page ("open / closed / not open
  // yet"), used verbatim; the UI derives a badge from it + the deadline.
  const statusRaw = (asString(rawItem, "applicationStatus") ?? "").toLowerCase();
  let currentStatus: Scholarship["currentStatus"] = null;
  if (statusRaw) {
    if (/\b(closed|expired|ended|no longer|not (?:currently )?accepting)\b/.test(statusRaw)) {
      currentStatus = "closed";
    } else if (/\b(upcoming|will open|not (?:yet|open)|opens?\s+(?:in|on))\b/.test(statusRaw)) {
      currentStatus = "upcoming";
    } else if (/\b(open|accepting|available|now)\b/.test(statusRaw)) {
      currentStatus = "open";
    }
  }

const hasSubstance =
    description !== null ||
    eligibility !== null ||
    cleanNumber(pick(rawItem, "stipendAmount")) !== null ||
    cleanNumber(pick(rawItem, "tuitionFee")) !== null ||
    normalizeFundingType(pick(rawItem, "fundingType")) !== null ||
    deadline !== null ||
    openToAllDisciplines === true;
  if (!hasSubstance) return null;

  const host = page.host;

  const llmFields = cleanFields(
    pick(rawItem, "fields", "eligiblePrograms", "programs", "fieldsOfStudy"),
  );
  const fields =
    llmFields.length > 0 || openToAllDisciplines === true
      ? llmFields
      : (det.fields ?? []);

  return {
    id: scholarshipId(page.url),
    name,
    university: normalizeUniversity(
      pick(rawItem, "university", "institution"),
      host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) ? "" : host,
    ),
    country: asString(rawItem, "country"),
    degreeLevels,
    fields,
    fundingType:
      normalizeFundingType(pick(rawItem, "fundingType")) ??
      normalizeFundingType(det.fundingType),
    tuitionCoverage:
      normalizeTuitionCoverage(pick(rawItem, "tuitionCoverage")) ??
      normalizeTuitionCoverage(det.tuitionCoverage),
    tuitionFee: cleanNumber(pick(rawItem, "tuitionFee")),
    stipendAmount: cleanNumber(pick(rawItem, "stipendAmount")) ?? det.stipendAmount ?? null,
    stipendFrequency: asString(rawItem, "stipendFrequency") ?? det.stipendFrequency ?? null,
    accommodationSupport: asString(rawItem, "accommodationSupport"),
    travelAllowance: asString(rawItem, "travelAllowance"),
    healthInsurance: asString(rawItem, "healthInsurance"),
    applicationFee: cleanNumber(pick(rawItem, "applicationFee")),
    eligibilityRequirements: eligibility,
    requiredDocuments: asList(rawItem, "requiredDocuments"),
    ieltsRequirement: asString(rawItem, "ieltsRequirement"),
    openingDate: cleanDate(pick(rawItem, "openingDate")) ?? det.openingDate ?? null,
    deadline,
    cycle: asString(rawItem, "cycle") ?? det.cycle ?? null,
    officialScholarshipUrl: page.url,
    officialUniversityUrl: asString(rawItem, "officialUniversityUrl"),
    sourceUrl: page.url,
    lastUpdated: page.fetchedAt,
    officialSourceVerified: verified,
    currentStatus,
    description,
    applicationInfo: asString(rawItem, "applicationInfo") ?? det.applicationInfo ?? null,
    eligibleNationalities,
    nationalityOpenToAll,
    openToAllDisciplines,
  };
}

// ─── Deterministic field scraper (offline data from the official page) ───────
// Pulls truthful deadline / opening / funding / degree / country / cycle data
// straight out of the fetched official page text. Used to keep cards complete
// when LLM enrichment is rate-limited. Nothing is invented: a value only appears
// if the page itself states it (country additionally from the host TLD).

const DEGREE_TERMS: Array<[RegExp, string]> = [
  [/\bbachelor(?:'s)?\b|\b(?:b\.?a\.?|b\.?s\.?c\.?|bsc|ba)\b|\bundergraduate\b/i, "Bachelor's"],
  [/\bmaster(?:'s)?\b|\bgraduate degree\b/i, "Master's"],
  [/\bph\.?d\.?\b|\bdoctoral\b|\bdoctorate\b|\bphd\s+scholarship\b/i, "PhD"],
  [/\bmba\b|\bmaster\s+of\s+business/i, "MBA"],
  [/\bpostgraduate\b|\bpost-graduate\b/i, "Postgraduate"],
  [/\bpostdoc(?:toral)?\b|\bpost-doctoral\b/i, "Postdoctoral"],
];

const CYCLE_RE =
  /\b(?:(?:winter|summer|spring|fall|autumn)\s+semester|academic\s+year|admission\s+(?:round|cycle)?)\s*\b(?:20\d{2}\s*[/–-]\s*(?:20)?\d{2}|20\d{2}\s*(?:cycle|round|intake)?)\b/i;

function scrapeDateNearKeyword(
  text: string,
  keywords: RegExp,
  offsetBefore = 110,
  offsetAfter = 260,
): { date: string; cycle: string | null } | null {
  // Scan EVERY keyword occurrence — the first "deadline" mention on a page is
  // often just navigation text with no date. Only stop at a match with a real,
  // plausible date near it (so "…15th January 2026 … APPLICATION DEADLINE"
  // — date BEFORE the keyword — is also caught).
  const pattern = new RegExp(keywords.source, keywords.flags.includes("i") ? "g" : `${keywords.flags}g`);
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = pattern.exec(text)) && guard < 60) {
    guard += 1;
    const start = Math.max(0, (m.index ?? 0) - offsetBefore);
    const snippet = text.slice(start, (m.index ?? 0) + m[0].length + offsetAfter);
    const date = cleanDate(snippet);
    if (!date) continue;
    // Ignore implausibly old/stale dates ("deadline: 2001").
    const year = Number(date.slice(0, 4));
    if (year < 2018 || year > 2040) continue;
    const cycle = snippet.match(CYCLE_RE)?.[0]?.replace(/\s+/g, " ") ?? null;
    return { date, cycle };
  }
  return null;
}

function scrapeExtraction(page: FetchedPage): Partial<Scholarship> {
  const text = page.text.replace(/\r/g, " ").replace(/[ \t]+/g, " ").slice(0, 80_000);

  // ── Deadline (keyword-anchored; never guessed) ─────────────────────────────
  let deadline: string | null = null;
  let openingDate: string | null = null;
  let cycle: string | null = null;
  if (!/\b(?:no\s+deadline|rolling\s+admission|rolling\s+application|open\s+year\s*-\s*round)\b/i.test(text)) {
    const dm = scrapeDateNearKeyword(
      text,
      /\b(?:deadline|closing\s+date|application\s+deadline|closes|apply\s+by|must\s+be\s+submitted\s+by|last\s+day\s+to\s+apply|applications?\s+(?:close|received)\s+by)\b/,
    );
    if (dm) {
      deadline = dm.date;
      cycle = dm.cycle ?? cycle;
    }
  }

  // ── Opening date ("applications open from 1 March 2027") ───────────────────
  const om = scrapeDateNearKeyword(
    text,
    /\b(?:application\s+period|applications?\s+open|opening\s+date|opens?\s+on|accepting\s+applications?\s+as\s+of)\b/,
  );
  if (om) {
    openingDate = om.date;
    cycle = om.cycle ?? cycle;
  }
  const cyc = text.match(CYCLE_RE);
  if (cyc) cycle = cyc[0].replace(/\s+/g, " ");

  // ── Funding / stipend ──────────────────────────────────────────────────────
  let fundingType: string | null = null;
  let tuitionCoverage: string | null = null;
  let stipendAmount: number | null = null;
  let stipendFrequency: string | null = null;
  if (/\bfully\s+funded\b|\bfully\s+financed\b|\bfull\s+funding\b/i.test(text)) {
    fundingType = "Fully funded";
  } else if (
    /\bfull\s+tuition\b|\btuition\s+fee\s+(?:waiver|waived)|\bcovers?\s+full\s+tuition\b/i.test(text)
  ) {
    fundingType = "Tuition fee waiver";
    tuitionCoverage = "Full tuition";
  } else if (/\bpartial(?:ly)?\s+funded\b|\bpartial\s+tuition\b/i.test(text)) {
    fundingType = "Partially funded";
    tuitionCoverage = "Partial tuition";
  }
  const amount = text.match(
    /\b((?:€|EUR|US\$|\$|USD|£|GBP)\s?\d[\d,.]*|\d[\d,.]*\s?(?:€|EUR|US\$|\$|USD|£|GBP))\b\s*(?:per\s*|a\s*)?(month|year|annum|semester)?\b/i,
  );
  if (amount) {
    const raw = amount[1].replace(/[^\d.]/g, "");
    stipendAmount = Number(raw) || null;
    if (amount[2]) {
      stipendFrequency = amount[2].toLowerCase().startsWith("month")
        ? "monthly"
        : amount[2].toLowerCase().startsWith("semester")
          ? "per semester"
          : "annually";
    }
  }

  // ── Degree level(s) present on the official page ───────────────────────────
  const degreeLevels: string[] = [];
  for (const [re, label] of DEGREE_TERMS) {
    if (re.test(text) && !degreeLevels.includes(label)) degreeLevels.push(label);
  }

  // ── Eligible programmes listed on the official page ────────────────────────
  const fields = scrapePrograms(text);

  // ── Country: host TLD is a real property of the official source ────────────
  const country = hostCountry(page.url);

  const applyMatch = text.match(
    /(?:how\s+to\s+apply|application\s+via|you\s+can\s+apply|submit\s+(?:your\s+)?application)[^.!?]{0,220}/i,
  );
  const applicationInfo = applyMatch
    ? applyMatch[0].replace(/\s+/g, " ").trim()
    : null;

  return {
    deadline,
    openingDate,
    cycle,
    fundingType,
    tuitionCoverage,
    stipendAmount,
    stipendFrequency,
    degreeLevels: degreeLevels.slice(0, 4),
    fields,
    country,
    applicationInfo,
  };
}

// ─── Fallback record (from the scraped page itself) ──────────────────────────
// Used only when LLM enrichment is unavailable (rate limit / outage) so real
// results never vanish. Built strictly from real page data — the page's title,
// its meta description and its own URL — never invented content.

export function fallbackRecord(page: FetchedPage, verified = false): Scholarship {
  const bareHost =
    page.host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(page.host)
      ? ""
      : page.host;
  const name =
    cleanName(null, page.title) ??
    (bareHost.replace(/^www\./i, "").split(".")[0] || "Scholarship");

  // Use the trailing "| Brand" segment of the title as the organization when
  // present; otherwise fall back to the hostname-derived label.
  const pipePart = page.title?.match(/\|\s*([^|]+)$/);
  const brand = pipePart ? cleanStr(pipePart[1]) : null;
  const university = brand ?? normalizeUniversity(null, bareHost);

  const description =
    page.description ||
    truncateText(page.text, 220).replace(/\s+/g, " ").trim() ||
    null;

  const scraped = scrapeExtraction(page);

  // Preserve "open to all academic disciplines" as a fact from the page rather
  // than showing nothing or inventing a program list.
  const openToAllDisciplines = scrapeAllDisciplines(page.text);

  return {
    id: scholarshipId(page.url),
    name,
    university,
    country: scraped.country ?? null,
    degreeLevels: scraped.degreeLevels ?? [],
    fields: openToAllDisciplines ? [] : (scraped.fields ?? []),
    openToAllDisciplines,
    fundingType: scraped.fundingType ?? null,
    tuitionCoverage: scraped.tuitionCoverage ?? null,
    tuitionFee: null,
    stipendAmount: scraped.stipendAmount ?? null,
    stipendFrequency: scraped.stipendFrequency ?? null,
    accommodationSupport: null,
    travelAllowance: null,
    healthInsurance: null,
    applicationFee: null,
    eligibilityRequirements: null,
    requiredDocuments: [],
    ieltsRequirement: null,
    openingDate: scraped.openingDate ?? null,
    deadline: scraped.deadline ?? null,
    cycle: scraped.cycle ?? null,
    officialScholarshipUrl: page.url,
    officialUniversityUrl: null,
    sourceUrl: page.url,
    lastUpdated: page.fetchedAt,
    officialSourceVerified: verified,
    currentStatus: null,
    description,
    applicationInfo: scraped.applicationInfo ?? null,
    eligibleNationalities: [],
    nationalityOpenToAll: null,
  };
}

// ─── Discovery pass: named scholarship opportunities ────────────────────────
// The first pipeline stage turns scraped pages (which are often articles and
// listicles) into CONCRETE, individual scholarship opportunities a student can
// apply to, so the final result is never the article itself.

export interface NamedScholarship {
  name: string;
  organization: string | null;
  country: string | null;
  /** An official URL literally present on the source page, or null. */
  mentionedOfficialUrl: string | null;
  /** 0-based index into the pages array passed to the discovery call. */
  pageIndex: number;
  sourcePageUrl: string;
}

/**
 * Accept a URL only when it is verifiable against the page: it must equal the
 * page itself, or literally appear (normalized) in the scraped text. This is
 * the "never invent URLs" gate.
 */
function normalizeMentionedUrl(value: string | null, page: FetchedPage): string | null {
  if (!value) return null;
  let s = value.trim().replace(/[.),>\]]+$/i, "");
  if (s.startsWith("www.")) s = `https://${s}`;
  if (!/^https?:\/\//i.test(s) || /\s/.test(s)) return null;

  let href: string;
  try {
    href = new URL(s).href;
  } catch {
    return null;
  }
  if (isJunkUrl(href)) return null;

  const pageUrlNorm = page.url.replace(/\/+$/, "").toLowerCase();
  if (href.replace(/\/+$/, "").toLowerCase() === pageUrlNorm) return href;

  const text = page.text.toLowerCase();
  const noSlash = href.replace(/\/+$/, "").toLowerCase();
  if (!text.includes(noSlash) && !text.includes(`${noSlash}/`)) {
    const wwwMc = noSlash.replace(/^https:\/\//, "https://www.");
    if (!text.includes(wwwMc)) return null;
  }
  return href;
}

const DISCOVERY_SCHEMA_DOC = `{
  "pageIndex": 1,
  "scholarships": [
    {
      "name": "",
      "organization": "",
      "country": "",
      "officialUrl": ""
    }
  ]
}`;

function discoveryPrompt(
  pages: FetchedPage[],
  context: { query: string; named?: string | null },
): string {
  const blocks = pages.map(
    (page, i) => `PAGE ${i + 1}
SOURCE_URL: ${page.url}
PAGE_TITLE: ${page.title || "unknown"}
CONTENT:
${truncateText(page.text, 2_400)}`,
  );

  return `You are a meticulous scholarship researcher.

A search was run for:
"${context.query}"
${context.named ? `The user is searching for a SPECIFIC programme/scholarship: "${context.named}".` : ""}

Below are ${pages.length} scraped web pages returned by that search. For EACH page
identify the CONCRETE, INDIVIDUAL scholarship opportunities a specific student could
apply to — NOT general articles, guide pages, or listicles.

Return ONE object per page (${pages.length} objects, in page order) shaped like:
${DISCOVERY_SCHEMA_DOC}

For each named scholarship capture ONLY facts actually stated on the page:
- "name": the specific scholarship name, e.g. "DAAD Study Scholarship for International Students".
  Never a headline like "Top 10 AI Scholarships in the USA" — that page is a listicle.
- "organization": who offers/awards it (university, government, foundation). Empty if not stated.
- "country": where it applies / the study destination. Empty if not stated.
- "officialUrl": an official application or scholarship page URL LITERALLY present in this
  page's text (copy it exactly). If the page itself is a single specific scholarship, use
  SOURCE_URL. Empty if there is none on the page.
${context.named ? `\nSCOPE RULE: when a specific programme ("${context.named}") is being searched, ONLY return that exact programme if it appears on the page; a page that does not cover it gets "scholarships": [].` : ""}

Rules:
- NEVER invent a name, organization, country, or URL.
- A page that is a generic article or listicle with no individual named scholarship gets
  "scholarships": [].
- Skip aggregate entries like "top 10 scholarships" and opportunities that are closed with
  no current cycle (page content is clearly stale/bygone).

Return ONLY a JSON ARRAY. Empty string means the value is not present.

--- PAGES ---
${blocks.join("\n\n--- PAGE BREAK ---\n\n")}`;
}

export async function discoverNamedScholarships(
  pages: FetchedPage[],
  context: { query: string; named?: string | null },
): Promise<NamedScholarship[]> {
  if (pages.length === 0) return [];

  let raw: Array<Record<string, unknown>>;
  try {
    const parsed = await groqJSON<Array<Record<string, unknown>> | Record<string, unknown>>({
      system:
        "You output only valid JSON matching the requested schema. Empty string means the value is not present on the page.",
      prompt: discoveryPrompt(pages.slice(0, 6), context),
      temperature: 0,
    });
    if (Array.isArray(parsed)) {
      raw = parsed;
    } else {
      const maybe = parsed.scholarships ?? parsed.results ?? parsed.pages;
      raw = (
        Array.isArray(maybe) ? maybe : []
      ) as unknown as Array<Record<string, unknown>>;
    }
  } catch (err) {
    if (err instanceof GroqError) {
      console.error(`[extract] Discovery Groq failed: ${err.message}`);
    } else {
      console.error("[extract] Discovery extraction failed:", err);
    }
    return [];
  }

  const out: NamedScholarship[] = [];
  const seen = new Set<string>();
  for (const block of raw) {
    const rawIndex = pick(block, "pageIndex", "page");
    const idx =
      typeof rawIndex === "number"
        ? rawIndex - 1
        : rawIndex != null && /^\d+$/.test(String(rawIndex))
          ? Number(rawIndex) - 1
          : -1;
    if (idx < 0 || idx >= pages.length) continue;
    const page = pages[idx];
    const list = pick(block, "scholarships", "items", "results");
    if (!Array.isArray(list)) continue;

    for (const rawItem of list as Array<Record<string, unknown>>) {
      const name = cleanName(asString(rawItem, "name"), page.title);
      if (!name) continue;
      const organization =
        asString(rawItem, "organization") ??
        asString(rawItem, "org") ??
        asString(rawItem, "university");
      const country = asString(rawItem, "country");
      const mentionedOfficialUrl = normalizeMentionedUrl(
        asString(rawItem, "officialUrl") ??
          asString(rawItem, "url") ??
          asString(rawItem, "official_url"),
        page,
      );
      const key = name.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        organization,
        country,
        mentionedOfficialUrl,
        pageIndex: idx,
        sourcePageUrl: page.url,
      });
    }
  }
  return out;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

const JSON_SCHEMA_DOC = `{
  "name": "",
  "university": "",
  "country": "",
  "degreeLevels": [],
  "fields": [],
  "fundingType": "",
  "tuitionCoverage": "",
  "tuitionFee": "",
  "stipendAmount": "",
  "stipendFrequency": "",
  "accommodationSupport": "",
  "travelAllowance": "",
  "healthInsurance": "",
  "applicationFee": "",
  "eligibilityRequirements": "",
  "requiredDocuments": [],
  "ieltsRequirement": "",
  "openingDate": "",
  "deadline": "",
  "cycle": "",
  "applicationStatus": "",
  "officialUniversityUrl": "",
  "description": "",
  "applicationInfo": "",
  "eligibleNationalities": [],
  "nationalityRestriction": "",
  "openToAllDisciplines": false
}`;

// ─── Targeted context (bounded, fast LLM input) ──────────────────────────────
// Sending every byte of a page makes extraction slower, pricier and more
// rate-limit-prone without better results. Instead we pull ONLY the regions a
// real deadline/funding/eligibility/application statement lives in — weighted,
// then capped — plus the page intro. The batch stays small (~2.8k chars/page)
// so ONE Groq call can cover all verified candidates.

const KEYWORD_REGIONS: Array<[RegExp, number]> = [
  [
    /\bapplication deadline\b|\bdeadline\b|\bclosing date\b|\bapply by\b|\bapplications? (?:close|closing)\b|\blast day\b|\bsubmit by\b/gi,
    900,
  ],
  [/\bapplication period\b|\bapplications? open\b|\bopening date\b|\bhow to apply\b/gi, 700],
  // Eligible programs / fields of study — the source of the Step 2 program
  // dropdown. Must be captured verbatim; never expanded or inferred.
  [
    /\b(?:eligible|target|available|offered|participating)\s+(?:fields?|programs?|programmes?|subjects?|disciplines?|courses?)\b|\bfields? of study\b|\bsubject areas?\b|\bcourses? of study\b|\bdegree (?:programs?|programmes?)\b|\bstudy (?:programs?|programmes?)\b|\bbranches? of study\b/gi,
    650,
  ],
  [/\b(?:scholarship|bursary|grant|fellowship|stipend)\b/gi, 400],
  [/\b(?:funding|fully funded|financial aid|covers tuition)\b/gi, 350],
  [/\beligibility\b|\beligible\b|\bcandidate must\b|\brequirements\b/gi, 250],
  [/\binternational (?:students|applicants)\b/gi, 120],
];

function targetedPageText(page: FetchedPage, budget = 2_800): string {
  const text = page.text;
  const regions: Array<{ start: number; weight: number }> = [];
  for (const [re, weight] of KEYWORD_REGIONS) {
    for (const m of text.matchAll(re)) {
      if (regions.some((r) => m.index >= r.start && m.index - r.start < 500)) continue;
      regions.push({ start: m.index, weight });
    }
  }
  regions.sort((a, b) => b.weight - a.weight || a.start - b.start);

  const chosen: Array<{ start: number; end: number }> = [];
  for (const r of regions) {
    if (chosen.some((c) => r.start >= c.start && r.start <= c.end)) continue;
    chosen.push({
      start: Math.max(0, r.start - 90),
      end: Math.min(text.length, r.start + 430),
    });
    if (chosen.length >= 6) break;
  }

  const segments = [
    text.slice(0, 480),
    ...chosen.map((c) => text.slice(c.start, c.end)),
  ]
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const joined = segments.join(" ");
  return truncateText(joined, budget) || text.slice(0, budget);
}

function batchPrompt(pages: FetchedPage[], context: { query: string }): string {
  const blocks = pages.map((page, i) => {
    const text = targetedPageText(page);
    return `PAGE ${i + 1}
SOURCE_URL: ${page.url}
PAGE_TITLE: ${page.title || "unknown"}
CONTENT:
${text}`;
  });

  const header = `You are a meticulous scholarship data extractor.

A search was run for:
"${context.query}"

Below are ${pages.length} scraped web pages found in that search. For EACH page
read the content and extract ONLY facts that are actually stated. Never guess,
never invent:

- If a value is not on the page leave the field empty ("" or []).
- The deadline is only a concrete application deadline stated for this opportunity.
- "applicationStatus": the page's CURRENT explicit status for this opportunity,
  one of "open", "upcoming", "closed", "expired" — or empty when the page does not
  state a current cycle status. Example signals: "applications open" → open;
  "applications open from 1 March 2027" → upcoming; "applications closed" /
  "no longer accepting applications" → closed; "ended" / "programme ended" → expired.
- "cycle": the application cycle/intake year this opening/deadline/status belongs to
  when the page states it (e.g. "2026/27", "2027 intake", "Round 2, 2027"). Empty if
  the page does not state a cycle. This helps us never present an OLD cycle as current.
- Money fields (tuitionFee, stipendAmount, applicationFee) are plain numbers (no "$", no commas).
- degreeLevels are one of: Bachelor, Master, PhD.
- "fields": the specific eligible programs / fields of study / subjects this
  scholarship explicitly says it is open to, copied verbatim from the page.
  Return ONE distinct program/field per array element (never join several into
  one comma-separated string), e.g. ["Computer Science", "Economics"]. Never
  normalize, rename, translate, expand, or infer. If the page explicitly names
  programs, ALWAYS copy them here. Do NOT return generic eligibility phrases
  such as "all academic disciplines", "all fields", "any subject",
  "open to all", "various disciplines" — if the page says the scholarship is
  open to ALL disciplines, leave "fields" = [] and set "openToAllDisciplines":
  true instead. Leave [] whenever the page does not explicitly name eligible
  programs/fields.
- "openToAllDisciplines": true ONLY when the page (or its related official
  pages) explicitly states the opportunity is open to all academic
  disciplines / any subject / any field of study / all fields. false otherwise.
- fundingType is one of: "Fully funded", "Partially funded", "Tuition fee waiver", "Funding available" — or empty.
- tuitionCoverage is one of: "Full tuition", "Partial tuition", "Tuition + living costs", "Not covered" — or empty.
- officialUniversityUrl must be a URL literally present on the page (or empty).
- description: a 2-3 sentence neutral summary of what this page/scholarship offers, using only stated facts.
- applicationInfo: how to apply (steps, link text, form), using only stated facts.
- "eligibleNationalities": the countries/nationalities this scholarship EXPLICITLY states
  are eligible to apply, copied verbatim from the page (e.g. ["Pakistani", "Bangladeshi",
  "Indian", "USA", "EU citizens", "children of alumni"]). Copy exactly as written — do not
  rename, expand, or infer. Leave [] whenever the page does not explicitly name any
  countries/nationalities.
- "nationalityRestriction": "open_to_all" ONLY when the page explicitly says eligibility is
  open to all nationalities/any nationality/international students generally with no country
  restriction ("open to international students" alone does NOT count — no restriction stated
  → ""). "restricted" ONLY when the page explicitly limits eligibility to specific
  countries/nationalities (e.g. "open only to citizens of X", "residents of Y", a listed
  country set). If the page says nothing about nationalities, use "".
- name: the specific scholarship/program name. If the page is a general list or
  article rather than one specific scholarship, use the page's topic as the name
  (without the site/brand suffix). If the page has nothing scholarship-related,
  set name to null.

Return ONLY a JSON ARRAY with exactly ${pages.length} objects, in the same order
as the pages. Object layout (all keys, all strings/arrays):

${JSON_SCHEMA_DOC}

Pages with nothing usable must still produce one object with all empty values
and "name": null.

Some pages include sections titled "[RELATED OFFICIAL PAGE: …]" followed by the
text of officially linked pages from the SAME organisation (e.g. its apply or
programmes page). These belong to the same official source as the main page:
use them for the deadline and the eligible programmes/fields exactly as stated
there.

--- PAGES ---
${blocks.join("\n\n--- PAGE BREAK ---\n\n")}`;

  return header;
}

export async function extractScholarshipsBatch(
  pages: FetchedPage[],
  context: { query: string },
  options?: { verified?: boolean },
): Promise<Array<Scholarship | null>> {
  if (pages.length === 0) return [];
  const verified = options?.verified === true;

  let raw: Array<Record<string, unknown>>;
  try {
    const parsed = await groqJSON<RawExtraction[] | Record<string, unknown>>({
      system:
        "You output only valid JSON matching the requested schema. Empty string means the value is not present on the page.",
      prompt: batchPrompt(pages.slice(0, 6), context),
      temperature: 0,
    });
    if (Array.isArray(parsed)) {
      raw = parsed as unknown as Array<Record<string, unknown>>;
    } else {
      // Defensive: some models wrap the array in an object like
      // {"scholarships": [...]} even in JSON mode.
      const maybe = parsed.scholarships ?? parsed.results ?? parsed.pages;
      raw = (
        Array.isArray(maybe) ? maybe : []
      ) as unknown as Array<Record<string, unknown>>;
    }
  } catch (err) {
    if (err instanceof GroqError) {
      console.error(
        `[extract] Batch Groq failed: ${err.message} — falling back to scraped page metadata`,
      );
    } else {
      console.error("[extract] Batch extraction failed:", err);
    }
    return pages.map((page) => fallbackRecord(page, verified));
  }

  return pages.map((page, i) => {
    const item = raw[i];
    if (!item) {
      // LLM returned nothing for this page → keep the deterministic facts
      // (deadline/extraction) instead of dropping the card entirely.
      return fallbackRecord(page, verified);
    }
    const result = cleanOne(item, page, verified);
    if (!result) {
      console.error(`[extract] Skipped (no/invalid name or no substance) ${page.url}`);
      // Never let a page's scraped deadline/programme facts disappear just
      // because the LLM had nothing usable to say about it.
      return fallbackRecord(page, verified);
    }
    return result;
  });
}

export async function extractScholarship(
  page: FetchedPage,
  context: { query: string },
  verified = false,
): Promise<Scholarship | null> {
  const [result] = await extractScholarshipsBatch([page], context, {
    verified,
  });
  return result ?? null;
}