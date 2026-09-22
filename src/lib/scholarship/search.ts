// ─── Scholarship discovery orchestrator (server-side) ────────────────────────
// Fast, mostly-deterministic pipeline:
//   user query → intent (heuristic, NO LLM) → 3-4 diverse web searches run in
//   parallel → aggregate + OFFICIAL-domain-preference prune (aggregators/news/
//   blogs/seo hard-blocked) → fetch ~10 candidate pages in parallel (bounded
//   concurrency, per-request timeout) → cheap local scholarship-signal filter →
//   pick ≤8 official pages → ONE bounded Groq batch extraction (targeted page
//   sections: deadline/funding/eligibility regions) → status/deadline from the
//   official page → status-priority assembly → cache (30 min).
//
//   SPEED: exactly one LLM call; every I/O step is parallel + time-boxed; a
//   single broken domain can never stall the search. Verification is the strict
//   deterministic official gate (not-blocked + institutional domain + on-page
//   scholarship signal) — we only surface official sources, never aggregators/
//   blogs/news/third-party listings, and never invent names/deadlines/URLs.

import type { Scholarship } from "./types";
import type { IntentInfo, SearchMeta, ScholarshipSearchResponse } from "./api-types";
import {
  searchWeb,
  type SearchFilters,
  type WebResult,
} from "./web-search";
import {
  fetchPageText,
  domainTrust,
  isBlockedSourceUrl,
  isGenericName,
  type FetchedPage,
} from "./web";
import { extractScholarshipsBatch } from "./extract";
import { fallbackIntent, fieldMatches, buildSearchQueries, type SearchIntent } from "./intent";
import { scholarshipStatus, type ScholarshipStatusId } from "./scholarship-status";
import { cacheKey, getCached, setCached, persistResults } from "./cache";

/** Short negative-cache TTL for "search provider temporarily unavailable" so
 *  repeated identical clicks don't re-hammer the search provider, while still
 *  recovering quickly once the provider clears up. */
const UNAVAILABLE_TTL_MS = 90_000;

/** In-process coalescing: identical concurrent requests share one pipeline run
 *  instead of re-running the whole search (prevents duplicate calls when the
 *  client (or StrictMode) fires the same payload twice). */
const inFlight = new Map<string, Promise<ScholarshipSearchResponse>>();

export interface SearchParams {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  refresh?: boolean;
  /** The user's nationality/citizenship (from their profile `country`), used
   *  to filter scholarships whose official source explicitly excludes it. */
  citizenship?: string | null;
}

// Budgets. Deliberately small: candidates are pruned hard BEFORE any expensive
// work so the whole search stays snappy. 10 → 8 max.
const MAX_WEB_QUERIES = 4;
const DISCOVER_FETCH = 10;
const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_EXTRACT_PAGES = 8;
const EXTRACT_BATCH = 8;
const MAX_ERRORS_REPORTED = 5;

const norm = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase();

/** Canonical form for URL-based dedupe (drop tracking params, trailing slash). */
function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (p.startsWith("utm_") || p === "ref" || p === "source") {
        u.searchParams.delete(p);
      }
    }
    u.pathname = u.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    return u.href.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// A URL resolution that was rejected by the official-source gate (blocked
// source, no institutional signal) — reported for transparency only.
interface RejectedSource {
  host: string;
  url: string;
}

// ─── Concurrency helper ──────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R | null | undefined>,
): Promise<R[]> {
  const results: Array<R | null | undefined> = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          results[i] = await fn(items[i], i);
        } catch (err) {
          console.error(`[search] worker error at ${i}:`, err);
          results[i] = undefined;
        }
      }
    },
  );
  await Promise.all(workers);
  return results.filter((r): r is R => r !== undefined && r !== null);
}

// ─── Candidate ranking ───────────────────────────────────────────────────────

function queryTokens(webQuery: string): string[] {
  return [
    ...new Set(
      webQuery
        .toLowerCase()
        .split(/[^a-z0-9+]+/)
        .filter((t) => t.length > 2),
    ),
  ];
}

// ─── Discovery ranking + prune (cheap, before any fetch) ─────────────────────

/** Relevance of a SERP entry to the intent (tokens in title/snippet + rank). */
function serpRelevance(r: WebResult, webQuery: string): number {
  const tokens = queryTokens(webQuery);
  const haystack = `${r.title} ${r.snippet}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) hits++;
  }
  const earlyBonus = r.rank < 4 ? 2.5 : r.rank < 9 ? 1.25 : 0;
  const phraseBonus = haystack.includes(webQuery.toLowerCase()) ? 3 : 0;
  return hits * 2 + phraseBonus + earlyBonus + (r.hits && r.hits > 1 ? 2 : 0);
}

/**
 * From aggregated SERP results pick a SMALL set of high-quality candidates to
 * fetch. Blocked sources (aggregators/news/blogs/SEO) are hard-excluded first
 * — they can never consume the fetch/LLM budget. Institutional domains
 * (university, government and trusted programme organisations) are preferred.
 */
function pruneDiscoveryResults(
  results: WebResult[],
  webQuery: string,
  budget: number,
): { toFetch: WebResult[]; rejected: RejectedSource[] } {
  const rejected: RejectedSource[] = [];
  const official: Array<{ r: WebResult; score: number }> = [];
  const other: Array<{ r: WebResult; score: number }> = [];

  for (const r of results) {
    if (isBlockedSourceUrl(r.url)) {
      rejected.push({ host: getHost(r.url), url: r.url });
      continue;
    }
    const trust = domainTrust(r.url);
    const score = serpRelevance(r, webQuery) + trust * 4;
    if (trust >= 2) official.push({ r, score });
    else other.push({ r, score: serpRelevance(r, webQuery) });
  }

  official.sort((a, b) => b.score - a.score);
  other.sort((a, b) => b.score - a.score);

  // Official domains only whenever there are enough; otherwise pad with the
  // most relevant non-blocked pages (keep a hard cap so budget is preserved).
  const take = budget + 2;
  const officialTake = official.slice(0, Math.max(6, Math.ceil(budget * 0.7)));
  const chosen = [...officialTake];
  if (chosen.length < budget) {
    for (const o of other) {
      if (chosen.length >= take) break;
      if (chosen.some((c) => c.r.url === o.r.url)) continue;
      chosen.push(o);
    }
  }
  return {
    toFetch: chosen.slice(0, budget).map((x) => x.r),
    rejected,
  };
}

const getHost = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** Hostname for a possibly-malformed URL without ever throwing. */
const safeHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown source";
  }
};

// ─── Candidate building + on-page signal filter (cheap, no LLM) ─────────────
// Candidates ARE the official pages themselves — we only fetch official-domain
// pages, so fetching a page == discovering a scholarship page. A local keyword
// filter drops pages with no scholarship/funding/application signal before any
// model call.

const SCHOLARSHIP_SIGNAL = /\b(scholarship|bursar|grant|fellowship|financial aid|funding|stipend|award|how to apply|application)\b/i;

/** 0-3 richness of scholarship signal on a page; 0 → discard. */
function pageSignalScore(page: FetchedPage): number {
  const text = (page.title ?? "") + " " + page.text.slice(0, 6_000);
  const matches = text.match(SCHOLARSHIP_SIGNAL);
  if (!matches) return 0;
  const low = text.toLowerCase();
  let score = 0;
  if (/\b(scholarship|bursary|bursaries)\b/i.test(page.title ?? "")) score += 2;
  if (/\b(funding|stipend|financial aid|fellowship|grant)\b/i.test(low)) score += 1;
  if (/\b(deadline|application deadline|closing date|apply by)\b/i.test(low)) score += 1;
  return matches ? Math.min(3, score + 1) : 0;
}

function candidateName(page: FetchedPage): string | null {
  let t = (page.title ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  t = t
    .replace(/\s*[|–—:]\s*(www\.)?[a-z0-9.-]+\.[a-z]{2,}\s*$/i, "")
    .replace(/\s*\|[^|]*$/i, "")
    .replace(/\s+\[(?:updated?|20\d{2})\]\s*$/i, "")
    .trim();
  if (!t || isGenericName(t)) return null;
  const low = t.toLowerCase();
  if (/^(top|best|the (top|best)|list( of)?|\d{1,2} )/i.test(low)) return null; // listicle
  return t.slice(0, 140);
}

/**
 * Rejects pages that LOOK like scholarship pages but are site furniture
 * (home/index/database-listing pages), so they never surface as a scholarship.
 */
function pageIsIndexOrHome(page: FetchedPage): boolean {
  const title = (page.title ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const url = page.url.toLowerCase();
  if (title.startsWith("home") || title.startsWith("welcome to")) return true;
  if (/\boverview\b/.test(title) && !/\bscholarship\b/.test(title)) return true;
  if (/scholarship-?database/.test(url) && !/detail=/.test(url)) return true;
  if (/scholarship\/?$/.test(url) && !/\bscholarship\b/.test(title)) return true;
  const path = (() => {
    try {
      const { pathname } = new URL(page.url);
      return pathname.replace(/\/+$/, "");
    } catch {
      return "";
    }
  })();
  if (!path && !/\bscholarship\b/.test(title) && !/\bscholarships?\b/.test(page.text.slice(0, 1200))) return true;
  return false;
}

// ─── Soft post-extraction filtering ─────────────────────────────────────────
// We only EXCLUDE a result when an extracted value directly conflicts with a
// requested filter. Unknown values pass through (ranked lower by the client's
// match engine) rather than being discarded. Field matching uses the SMART
// related-programme vocabulary from intent (#5): a scholarship matches when one
// of its ACTUAL eligible fields contains a wanted phrase — never mere token
// overlap ("Engineering" ≠ "Computer Engineering" unless the field lists it).

function listOverlaps(a: string[], b: string[]): boolean {
  const set = new Set(a.map((v) => norm(v)));
  return b.some((v) => set.has(norm(v)));
}

function fundingMatches(s: Scholarship, funding?: string | null): boolean {
  if (!funding || funding === "any") return true;
  const ft = norm(s.fundingType);
  if (!ft) return true; // unknown — can't confirm a conflict
  if (funding === "fully_funded") return ft.includes("full");
  if (funding === "partially_funded") return ft.includes("partial");
  if (funding === "tuition_fee_waiver") {
    return ft.includes("waiver") || norm(s.tuitionCoverage).includes("tuiti");
  }
  return true;
}

function appliesFilters(
  s: Scholarship,
  filters: SearchFilters = {},
  wantedFields?: string[],
): boolean {
  if (filters.country && s.country && norm(s.country) !== norm(filters.country)) {
    return false;
  }
  if (filters.degreeLevels?.length && s.degreeLevels.length) {
    if (!listOverlaps(s.degreeLevels, filters.degreeLevels)) return false;
  }
  if (wantedFields && wantedFields.length && s.fields.length) {
    if (!fieldMatches(s.fields, wantedFields)) return false;
  } else if (filters.field && s.fields.length) {
    if (!fieldMatches(s.fields, [filters.field])) return false;
  }
  if (!fundingMatches(s, filters.funding)) return false;
  // scholarshipType is folded into the query + ranking (not an extracted field).
  return true;
}

// ─── Citizenship/nationality gate (profile `country` = citizenship) ─────────
// A scholarship is excluded ONLY when its official page explicitly restricts
// eligibility to a set of nationalities and the user's citizenship is not in
// that set. Unknown / open-to-all / unusable values always pass — we never hide
// a real scholarship on a guess.

/** Demonyn/abbreviation → canonical country name (general, not scholarship
 *  specific). Unknown values fall back to their own normalized form. */
const NATIONALITY_TO_COUNTRY: Record<string, string> = {
  american: "united states",
  "american national": "united states",
  usa: "united states",
  us: "united states",
  "u.s.": "united states",
  "u.s.a.": "united states",
  british: "united kingdom",
  uk: "united kingdom",
  "u.k.": "united kingdom",
  "united kingdom of great britain and northern ireland": "united kingdom",
  canadian: "canada",
  australian: "australia",
  "new zealander": "new zealand",
  german: "germany",
  french: "france",
  italian: "italy",
  spanish: "spain",
  dutch: "netherlands",
  belgian: "belgium",
  austrian: "austria",
  swiss: "switzerland",
  swedish: "sweden",
  norwegian: "norway",
  danish: "denmark",
  finnish: "finland",
  irish: "ireland",
  portuguese: "portugal",
  greek: "greece",
  polish: "poland",
  czech: "czech republic",
  hungarian: "hungary",
  turkish: "turkey",
  japanese: "japan",
  chinese: "china",
  "south korean": "south korea",
  korean: "south korea",
  korea: "south korea",
  indian: "india",
  pakistani: "pakistan",
  bangladeshi: "bangladesh",
  "sri lankan": "sri lanka",
  nepali: "nepal",
  malaysian: "malaysia",
  singaporean: "singapore",
  indonesian: "indonesia",
  filipino: "philippines",
  filipina: "philippines",
  thai: "thailand",
  vietnamese: "vietnam",
  egyptian: "egypt",
  nigerian: "nigeria",
  kenyan: "kenya",
  ghanaian: "ghana",
  "south african": "south africa",
  ethiopian: "ethiopia",
  moroccan: "morocco",
  tunisian: "tunisia",
  brazilian: "brazil",
  mexican: "mexico",
  argentine: "argentina",
  chilean: "chile",
  colombian: "colombia",
  israeli: "israel",
  emirati: "united arab emirates",
  saudi: "saudi arabia",
  qatari: "qatar",
  kuwaiti: "kuwait",
  jordanian: "jordan",
  lebanese: "lebanon",
  omani: "oman",
  bahraini: "bahrain",
  russian: "russia",
  ukrainian: "ukraine",
  romanian: "romania",
  bulgarian: "bulgaria",
  croatian: "croatia",
  serbian: "serbia",
  slovak: "slovakia",
  slovenian: "slovenia",
  lithuanian: "lithuania",
  latvian: "latvia",
  estonian: "estonia",
  iranian: "iran",
  iraqi: "iraq",
  afghan: "afghanistan",
  afghanistan: "afghanistan",
  myanmar: "myanmar",
  cambodian: "cambodia",
  laotian: "laos",
  mongolian: "mongolia",
};

function normalizeNationality(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const key = raw.replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!key) return null;
  return NATIONALITY_TO_COUNTRY[key] ?? key;
}

/**
 * True when the user's citizenship is compatible with the scholarship's stated
 * nationality scope. Never excludes on unknown/unusable data.
 */
function nationalityAllowed(
  s: Scholarship,
  citizenship?: string | null,
): boolean {
  const citizen = normalizeNationality(citizenship);
  if (!citizen) return true;
  // Open to all nationalities, or nothing stated → always eligible.
  if (s.nationalityOpenToAll !== false) return true;
  // Restricted, but no usable country list was extracted → keep it (never
  // wrongly hide based on a truncated/partial extraction).
  const eligible = (s.eligibleNationalities ?? [])
    .map(normalizeNationality)
    .filter((n): n is string => n !== null);
  if (eligible.length === 0) return true;
  return eligible.includes(citizen);
}

// ─── Final assembly (verified-official + status + dedupe + filter) ───────────
// Hard, non-negotiable gates before a scholarship can be shown:
//   1. its official URL must not be a blocked source (aggregator/news/blog/…)
//   2. the source must have passed official-source verification
//   3. current status: OPEN results always come first; then NOT OPEN YET and
//      STATUS UNKNOWN; then DEADLINE PASSED / CLOSED. General searches still
//      surface closed/upcoming results when they are genuinely relevant (they
//      rank last so open alternatives win the top slots), but a named search
//      keeps its programme even when closed — always clearly badged.
//   4. duplicates (same programme name+org, or same official page) collapse.

const STATUS_PRIORITY: Record<ScholarshipStatusId, number> = {
  open: 0,
  upcoming: 1,
  unknown: 2,
  deadlinePassed: 3,
  closed: 4,
};

function recordQuality(s: Scholarship): number {
  let q = 0;
  if (s.currentStatus) q += 20;
  if (s.deadline) q += 10;
  if (s.openingDate) q += 5;
  if (s.cycle) q += 3;
  if (s.description) q += 2;
  q += domainTrust(s.officialScholarshipUrl ?? "");
  return q;
}

function assembleResults(
  extracted: Array<Scholarship | null>,
  opts: {
    filters: SearchFilters;
    wantedFields?: string[];
    citizenship?: string | null;
    limit: number;
  },
): Scholarship[] {
  const { filters, wantedFields, citizenship, limit } = opts;
  const seenName = new Set<string>();
  const seenUrl = new Set<string>();
  const results: Scholarship[] = [];

  // Open first, then upcoming/unknown, then closed/passed; within the same
  // status prefer the richest, most authoritative source.
  const ordered = extracted
    .filter((s): s is Scholarship => s !== null)
    .sort((a, b) => {
      const pa = STATUS_PRIORITY[scholarshipStatus(a).id];
      const pb = STATUS_PRIORITY[scholarshipStatus(b).id];
      if (pa !== pb) return pa - pb;
      return recordQuality(b) - recordQuality(a);
    });

  for (const s of ordered) {
    // 1. Never serve a blocked source (aggregator/news/blog/third-party/SEO).
    if (isBlockedSourceUrl(s.officialScholarshipUrl ?? "")) continue;
    // 2. Only officially-verified sources may be shown. No unverified fallback.
    if (!s.officialSourceVerified) continue;
    // 3. Deduplicate the same scholarship (by official URL OR by programme
    //    pronounced name + organization — one scholarship, one card).
    const nameKey = `${norm(s.name)}|${norm(s.university ?? s.country ?? "")}`;
    const urlKey = canonicalUrl(s.sourceUrl ?? s.officialScholarshipUrl ?? s.id);
    if (seenUrl.has(urlKey) || seenName.has(nameKey)) continue;
    seenUrl.add(urlKey);
    seenName.add(nameKey);
    // 4. Soft filter (country/degree/field/funding).
    if (!appliesFilters(s, filters, wantedFields)) continue;
    // 5. Citizenship gate — the user's nationality is excluded only when the
    //    official page explicitly lists the eligible nationalities and the
    //    user's is not among them.
    if (!nationalityAllowed(s, citizenship)) continue;
    results.push(s);
    if (results.length >= limit) break;
  }
  return results;
}

// ─── Public orchestrator ─────────────────────────────────────────────────────

export async function discoverScholarships(
  params: SearchParams,
): Promise<ScholarshipSearchResponse> {
  const query = params.query.trim();
  const filters = params.filters ?? {};
  const limit = Math.max(1, Math.min(params.limit ?? 12, 24));
  const citizenship = params.citizenship?.trim() || null;

  if (!query && !filters.country && !(filters.degreeLevels?.length)) {
    throw new Error("A search query or a filter is required.");
  }

  const key = cacheKey(
    JSON.stringify({
      q: query.toLowerCase(),
      degreeLevels: [...(filters.degreeLevels ?? [])].map(norm).sort(),
      country: norm(filters.country),
      field: norm(filters.field),
      funding: norm(filters.funding),
      scholarshipType: norm(filters.scholarshipType),
      citizenship: norm(citizenship),
      limit,
    }),
  );

  if (!params.refresh) {
    const cached = getCached<ScholarshipSearchResponse>(key);
    if (cached) return cached;
  }

  // Coalesce identical concurrent requests (duplicate client calls, StrictMode
  // double-invokes) into ONE pipeline run.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = runSearch({ key, query, filters, limit, citizenship });
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (inFlight.get(key) === run) inFlight.delete(key);
  }
}

async function runSearch(params: {
  key: string;
  query: string;
  filters: SearchFilters;
  limit: number;
  citizenship: string | null;
}): Promise<ScholarshipSearchResponse> {
  const { key, query, filters, limit, citizenship } = params;

  // ── Understand what the user MEANS (field? named programme? country/degree/
  //     funding?). DETERMINISTIC — no LLM, instant; aliases (Fullbright →
  //     Fulbright, Stipendium Hungary → Stipendium Hungaricum, …) handled fast.
  const intent: SearchIntent = fallbackIntent(query, filters);

  const webQuery = intent.webQuery;
  const queries = buildSearchQueries(intent, filters).slice(0, MAX_WEB_QUERIES);
  const errors: string[] = [];

  // ── 1. Discovery search: run the query set in PARALLEL. A single SERP is
  //        never enough — 3-4 diverse queries run at once.
  const queryResults = await mapConcurrent<
    string,
    { query: string; results: WebResult[]; error?: string }
  >(
    queries,
    Math.min(3, queries.length),
    async (q, idx = 0) => {
      // Stagger launches by ~350ms so the burst is gentler on the search
      // provider's rate limiter (still bounded: ≤ ~1s of added latency).
      await sleep(idx * 350);
      try {
        return { query: q, results: await searchWeb(q) };
      } catch (err) {
        return {
          query: q,
          results: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
  const anyTechnicalFailure =
    queryResults.length > 0 && queryResults.every((r) => r.error);

  // Aggregate across queries by canonical URL (best rank + hit count → the same
  // page found by several queries collapses into ONE candidate).
  const buckets = new Map<string, { r: WebResult; rank: number; hits: number }>();
  for (const qr of queryResults) {
    for (const r of qr.results) {
      const key = canonicalUrl(r.url);
      const got = buckets.get(key);
      if (!got) buckets.set(key, { r, rank: r.rank, hits: 1 });
      else {
        got.rank = Math.min(got.rank, r.rank);
        got.hits += 1;
      }
    }
  }
  const webResults: WebResult[] = [...buckets.values()].map((b) => ({
    ...b.r,
    rank: b.rank,
    hits: b.hits,
  }));
  const sourceCount = webResults.length;

  if (sourceCount === 0) {
    if (anyTechnicalFailure) {
      // Every search engine attempt was blocked/rate-limited. This is a
      // TRANSIENT provider outage, not "nothing exists" — degrade gracefully
      // (200, empty, flagged) so the UI can retry, and never crash the search.
      const message =
        "Web search is temporarily unavailable (rate limited or blocked). Please try again in a minute.";
      errors.push(message);
      const response = buildResponse({
        query,
        webQuery,
        sourceCount,
        fetched: 0,
        extracted: 0,
        errors,
        results: [],
        key,
        intent,
        transientFailure: true,
      });
      // Negative-cache briefly so duplicate retries don't re-hammer the search
      // provider, but recover quickly once the provider comes back.
      setCached(key, response, UNAVAILABLE_TTL_MS);
      return response;
    }
    errors.push("No relevant web results were returned for these queries.");
    return buildResponse({
      query,
      webQuery,
      sourceCount,
      fetched: 0,
      extracted: 0,
      errors,
      results: [],
      key,
      intent,
    });
  }

  // ── 2. Prune to a few high-quality candidates BEFORE any fetch/LLM work:
  //        blocked sources (aggregators/news/blogs/SEO) are hard-excluded and
  //        institutional domains (.edu/.ac.*/.gov/trusted programmes) win.
  const { toFetch, rejected } = pruneDiscoveryResults(
    webResults,
    webQuery,
    DISCOVER_FETCH,
  );
  for (const rj of rejected) errors.push(`Skipped non-official source: ${rj.host}`);
  if (toFetch.length === 0) {
    errors.push("Nothing relevant was found on official sources.");
    return buildResponse({
      query,
      webQuery,
      sourceCount,
      fetched: 0,
      extracted: 0,
      errors,
      results: [],
      key,
      intent,
    });
  }

  // ── 3. Fetch candidate pages IN PARALLEL (bounded concurrency, per-request
  //        timeout). Broken/unreachable pages are discarded quickly; the whole
  //        step is as fast as the slowest surviving page, not the slowest one.
  const pages = await mapConcurrent<WebResult, FetchedPage>(
    toFetch,
    FETCH_CONCURRENCY,
    (candidate) => fetchPageText(candidate.url, FETCH_TIMEOUT_MS, { enrich: true }),
  );
  const fetchedSet = new Set(pages.map((p) => p.url));
  for (const candidate of toFetch) {
    if (!fetchedSet.has(candidate.url)) {
      errors.push(`Could not read ${safeHostname(candidate.url)}`);
    }
  }

  // ── 4. Cheap local filter → candidates (NO LLM yet). Only official-domain
  //        pages with a real scholarship/funding/application signal survive;
  //        official-first ordering keeps the extraction budget focused on the
  //        strongest sources; dedupe by canonical URL; cap at the budget.
  const crouching = [...pages].sort(
    (a, b) => domainTrust(b.url) - domainTrust(a.url) || pageSignalScore(b) - pageSignalScore(a),
  );
  const candidates: FetchedPage[] = [];
  const seenCandidate = new Set<string>();
  for (const page of crouching) {
    if (isBlockedSourceUrl(page.url)) continue;
    if (domainTrust(page.url) < 2) continue;
    if (pageSignalScore(page) === 0) continue;
    if (pageIsIndexOrHome(page)) continue;
    if (!candidateName(page)) continue;
    const key = canonicalUrl(page.url);
    if (seenCandidate.has(key)) continue;
    seenCandidate.add(key);
    candidates.push(page);
    if (candidates.length >= MAX_EXTRACT_PAGES) break;
  }
  if (candidates.length === 0) {
    errors.push("No official scholarship pages could be read fast enough; try again.");
    return buildResponse({
      query,
      webQuery,
      sourceCount,
      fetched: pages.length,
      extracted: 0,
      errors,
      results: [],
      key,
      intent,
    });
  }

  // ── 5. ONE bounded Groq batch extraction over the verified official pages.
  //        Targeted page sections (deadline/funding/eligibility regions) keep
  //        the LLM input small; on Groq failure we fall back to deterministic
  //        scraping of the SAME official pages. Either way the deadline/status
  //        shown comes from the official source — never an invented value.
  const extractedRaws = await extractScholarshipsBatch(
    candidates.slice(0, EXTRACT_BATCH),
    { query: webQuery },
    { verified: true },
  );

  // ── 6. Final assembly: official source required + status-priority ordering
  //        (OPEN first, CLOSED/DEADLINE PASSED last) + dedupe + soft filters +
  //        citizenship gate.
  const results = assembleResults(extractedRaws, {
    filters,
    wantedFields: intent.mode === "general" ? intent.fields : undefined,
    citizenship,
    limit,
  });

  return buildResponse({
    query,
    webQuery,
    sourceCount,
    fetched: pages.length,
    extracted: results.length,
    verifiedOfficial: candidates.length,
    rejected,
    errors,
    results,
    key,
    intent,
  });
}

// ─── Response assembly + caching ─────────────────────────────────────────────

/** Serialize the server intent into the client-safe contract shape. */
function toIntentInfo(intent: SearchIntent): IntentInfo | null {
  if (!intent) return null;
  return {
    mode: intent.mode,
    namedScholarship: intent.namedScholarship,
    displayField: intent.displayField,
    relatedFields: intent.relatedFields.slice(0, 5),
    country: intent.country,
    degreeLevels: intent.degreeLevels.slice(0, 3),
    funding: intent.funding,
  };
}

function buildResponse(args: {
  query: string;
  webQuery: string;
  sourceCount: number;
  fetched: number;
  extracted: number;
  verifiedOfficial?: number;
  rejected?: RejectedSource[];
  errors: string[];
  results: Scholarship[];
  key: string;
  intent: SearchIntent;
  transientFailure?: boolean;
}): ScholarshipSearchResponse {
  const response: ScholarshipSearchResponse = {
    results: args.results,
    meta: {
      query: args.query,
      webQuery: args.webQuery,
      searchedAt: new Date().toISOString(),
      sourceCount: args.sourceCount,
      fetched: args.fetched,
      extracted: args.extracted,
      verifiedOfficial: args.verifiedOfficial ?? 0,
      rejected: args.rejected ?? [],
      intent: toIntentInfo(args.intent),
      errors: args.errors.slice(0, MAX_ERRORS_REPORTED),
      fromCache: false,
      transientFailure: args.transientFailure === true,
    } satisfies SearchMeta,
  };

  // Only cache non-empty responses — an empty result is usually a transient
  // extraction failure (e.g. LLM rate limit), not a definitive "nothing exists".
  if (args.results.length > 0) {
    setCached(args.key, response);
    void persistResults(args.results);
  }
  return response;
}