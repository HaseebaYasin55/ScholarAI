// ─── Scholarship discovery orchestrator (server-side) ────────────────────────
// Flow:
//   user query → web search (primary + official-flavored) → fetch pages →
//   LLM discovery (concrete, NAMED scholarships only) → resolve each name to
//   its OFFICIAL source (university / government / funder) → re-fetch & extract
//   current data from the official page → reject expired & aggregator results →
//   deduplicate → soft-filter → cache (30 min).
//
// Listicles and aggregators are used for discovery only; they are never served
// as a final result. If the discovery pass itself fails (e.g. LLM outage) we
// degrade to a legacy single-pass enrichment so genuine pages still surface,
// but the preferred path is official-sourced scholarships.

import type { Scholarship } from "./types";
import type { SearchMeta, ScholarshipSearchResponse } from "./api-types";
import {
  buildSearchQuery,
  buildOfficialSearchQuery,
  searchWeb,
  type SearchFilters,
  type WebResult,
} from "./web-search";
import {
  fetchPageText,
  domainTrust,
  isAggregatorUrl,
  isJunkUrl,
  type FetchedPage,
} from "./web";
import {
  extractScholarshipsBatch,
  discoverNamedScholarships,
  type NamedScholarship,
} from "./extract";
import { cacheKey, getCached, setCached, persistResults } from "./cache";

export interface SearchParams {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  refresh?: boolean;
}

const DISCOVER_FETCH = 12;
const EXTRACT_BATCH = 6;
const MAX_VERIFY = 6;
const VERIFY_CONCURRENCY = 3;
const MAX_ERRORS_REPORTED = 5;

const norm = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase();

const todayISO = () => new Date().toISOString().slice(0, 10);

// ─── Concurrency helper ──────────────────────────────────────────────────────

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null | undefined>,
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
          results[i] = await fn(items[i]);
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

function rankCandidate(r: WebResult, webQuery: string): number {
  const trust = domainTrust(r.url);
  const tokens = queryTokens(webQuery);
  const haystack = `${r.title} ${r.snippet}`.toLowerCase();

  let hits = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) hits++;
  }

  const earlyBonus = r.rank < 4 ? 4 : r.rank < 9 ? 2 : 0;
  return trust * 10 + hits * 3 + earlyBonus;
}

// ─── Official-source resolution ──────────────────────────────────────────────

/** Pick the most official, non-aggregator result from a search. */
function pickOfficialResult(results: WebResult[]): WebResult | null {
  const candidates = results.filter(
    (r) => !isJunkUrl(r.url) && !isAggregatorUrl(r.url),
  );
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => domainTrust(b.url) - domainTrust(a.url) || a.rank - b.rank,
  );
  const best = candidates[0];
  // Only an authoritative-looking source is acceptable as the official page
  // for a named scholarship. Aggregator-ish pages are rejected, not tolerated.
  if (domainTrust(best.url) < 2) return null;
  return best;
}

// ─── Soft post-extraction filtering ─────────────────────────────────────────
// We only EXCLUDE a result when an extracted value directly conflicts with a
// requested filter. Unknown values pass through (ranked lower by the client's
// match engine) rather than being discarded.

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

function appliesFilters(s: Scholarship, filters: SearchFilters = {}): boolean {
  if (filters.country && s.country && norm(s.country) !== norm(filters.country)) {
    return false;
  }
  if (filters.degreeLevels?.length && s.degreeLevels.length) {
    if (!listOverlaps(s.degreeLevels, filters.degreeLevels)) return false;
  }
  if (filters.field && s.fields.length) {
    if (!listOverlaps(s.fields, [filters.field])) return false;
  }
  if (!fundingMatches(s, filters.funding)) return false;
  // scholarshipType is folded into the query + ranking (not an extracted field).
  return true;
}

// ─── Final assembly (expiry + aggregator rejection + dedupe + filter) ────────

function assembleResults(
  extracted: Array<Scholarship | null>,
  filters: SearchFilters,
  limit: number,
): Scholarship[] {
  const today = todayISO();
  const seenName = new Set<string>();
  const seenUrl = new Set<string>();
  const results: Scholarship[] = [];

  for (const s of extracted) {
    if (!s) continue;
    // 1. Never serve an aggregator/listicle as a final result.
    if (isAggregatorUrl(s.officialScholarshipUrl ?? "")) continue;
    // 2. Never show an expired scholarship as active.
    if (s.deadline && s.deadline < today) continue;
    // 3. Deduplicate the same scholarship (by URL or normalized name).
    const nameKey = s.name.toLowerCase().replace(/\s+/g, " ").trim();
    const urlKey = s.sourceUrl ?? s.id;
    if (seenUrl.has(urlKey) || seenName.has(nameKey)) continue;
    seenUrl.add(urlKey);
    seenName.add(nameKey);
    // 4. Soft filter.
    if (!appliesFilters(s, filters)) continue;
    results.push(s);
    if (results.length >= limit) break;
  }
  return results;
}

// ─── Legacy degradation path ─────────────────────────────────────────────────
// Only used when LLM discovery finds nothing (e.g. transient Groq outage) or
// official resolution returns zero results. Single-pass enrichment of the
// discovery pages, with the same expiry check; aggregators are dropped when
// enough real alternatives exist, otherwise kept so the user is never empty.

async function runLegacyExtraction(
  pages: FetchedPage[],
  filters: SearchFilters,
  limit: number,
  context: { query: string },
): Promise<Scholarship[]> {
  const today = todayISO();
  const extractedRaws: Array<Scholarship | null> = [];
  for (let i = 0; i < pages.length; i += EXTRACT_BATCH) {
    const chunk = pages.slice(i, i + EXTRACT_BATCH);
    if (chunk.length === 0) break;
    const chunkResults = await extractScholarshipsBatch(chunk, context);
    extractedRaws.push(...chunkResults);
    if (
      extractedRaws.filter((x): x is Scholarship => x !== null).length >= limit * 2
    ) {
      break;
    }
  }

  const strict = assembleResults(extractedRaws, filters, limit);
  if (strict.length > 0) return strict;

  // Lenient: keep non-expired results even if they come from aggregators.
  const lenient: Scholarship[] = [];
  const seenName = new Set<string>();
  const seenUrl = new Set<string>();
  for (const s of extractedRaws) {
    if (!s) continue;
    if (s.deadline && s.deadline < today) continue;
    const nameKey = s.name.toLowerCase().replace(/\s+/g, " ").trim();
    const urlKey = s.sourceUrl ?? s.id;
    if (seenUrl.has(urlKey) || seenName.has(nameKey)) continue;
    seenUrl.add(urlKey);
    seenName.add(nameKey);
    if (!appliesFilters(s, filters)) continue;
    lenient.push(s);
    if (lenient.length >= limit) break;
  }
  return lenient;
}

// ─── Public orchestrator ─────────────────────────────────────────────────────

export async function discoverScholarships(
  params: SearchParams,
): Promise<ScholarshipSearchResponse> {
  const query = params.query.trim();
  const filters = params.filters ?? {};
  const limit = Math.max(1, Math.min(params.limit ?? 12, 24));

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
      limit,
    }),
  );

  if (!params.refresh) {
    const cached = getCached<ScholarshipSearchResponse>(key);
    if (cached) return cached;
  }

  const webQuery = buildSearchQuery(query, filters);
  const officialQuery = buildOfficialSearchQuery(query, filters);

  // ── 1. Discovery search: primary + official-flavored, deduplicated.
  const [primary, official] = await Promise.allSettled([
    searchWeb(webQuery),
    searchWeb(officialQuery),
  ]);
  const webResults = [
    ...(primary.status === "fulfilled" ? primary.value : []),
    ...(official.status === "fulfilled" ? official.value : []),
  ].filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i);
  const sourceCount = webResults.length;
  if (sourceCount === 0) {
    throw new Error(
      "Web search is temporarily unavailable (rate limited or blocked). Try again in a moment.",
    );
  }

  // ── 2. Rank + select candidates to fetch.
  const ranked = webResults
    .map((r) => ({ r, score: rankCandidate(r, webQuery) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
  const toFetch = ranked.slice(0, Math.min(DISCOVER_FETCH, Math.max(limit * 3, 8)));

  // ── 3. Fetch discovery pages (parallel, resilient).
  const pages = await mapConcurrent<WebResult, FetchedPage>(
    toFetch,
    4,
    (candidate) => fetchPageText(candidate.url),
  );
  const errors: string[] = [];
  const fetchedSet = new Set(pages.map((p) => p.url));
  for (const candidate of toFetch) {
    if (!fetchedSet.has(candidate.url)) {
      errors.push(`Could not read ${new URL(candidate.url).hostname}`);
    }
  }

  // ── 4. LLM discovery: concrete named scholarships only.
  let candidates: NamedScholarship[] = [];
  for (let i = 0; i < pages.length; i += EXTRACT_BATCH) {
    const chunk = pages.slice(i, i + EXTRACT_BATCH);
    if (chunk.length === 0) break;
    const found = await discoverNamedScholarships(chunk, { query: webQuery });
    candidates.push(...found.map((c) => ({ ...c, pageIndex: c.pageIndex + i })));
  }
  candidates = candidates.slice(0, MAX_VERIFY * 2);

  if (candidates.length === 0) {
    const results = await runLegacyExtraction(pages, filters, limit, {
      query: webQuery,
    });
    return buildResponse({
      query,
      webQuery,
      sourceCount,
      fetched: pages.length,
      extracted: results.length,
      errors,
      results,
      key,
    });
  }

  // ── 5. Resolve each candidate to its OFFICIAL source.
  const resolutions: Array<{ candidate: NamedScholarship; officialUrl: string }> = [];
  const resolvedUrls = new Set<string>();
  for (const candidate of candidates) {
    if (resolutions.length >= MAX_VERIFY) break;

    let official = candidate.mentionedOfficialUrl;
    if (!official) {
      try {
        const lookup = [
          candidate.name,
          candidate.organization,
          "scholarship",
        ]
          .filter(Boolean)
          .join(" ");
        const found = pickOfficialResult(await searchWeb(lookup));
        if (found) official = found.url;
      } catch {
        // search hiccup → candidate skipped below
      }
    }
    if (!official) continue;
    if (isAggregatorUrl(official)) continue; // reject aggregators as final source
    if (resolvedUrls.has(official)) continue;
    resolvedUrls.add(official);
    resolutions.push({ candidate, officialUrl: official });
  }

  // ── 6. Fetch the official pages.
  const verified = await mapConcurrent<
    { candidate: NamedScholarship; officialUrl: string },
    { candidate: NamedScholarship; page: FetchedPage }
  >(
    resolutions,
    VERIFY_CONCURRENCY,
    async ({ candidate, officialUrl }) => {
      const page = await fetchPageText(officialUrl);
      return { candidate, page };
    },
  );
  const verifiedSet = new Set(verified.map((v) => v.candidate));
  for (const r of resolutions) {
    if (!verifiedSet.has(r.candidate)) {
      errors.push(`Could not read ${new URL(r.officialUrl).hostname}`);
    }
  }
  const verifiedPages = verified.map((v) => v.page);

  // ── 7. Verification extraction: current data from the official source.
  const extractedRaws: Array<Scholarship | null> = [];
  for (let i = 0; i < verifiedPages.length; i += EXTRACT_BATCH) {
    const chunk = verifiedPages.slice(i, i + EXTRACT_BATCH);
    if (chunk.length === 0) break;
    const chunkResults = await extractScholarshipsBatch(chunk, {
      query: webQuery,
    });
    extractedRaws.push(...chunkResults);
    if (
      extractedRaws.filter((x): x is Scholarship => x !== null).length >= limit * 2
    ) {
      break;
    }
  }

  // ── 8. Final assembly: expiry + aggregator rejection + dedupe + soft filter.
  const results = assembleResults(extractedRaws, filters, limit);

  // No legacy fallback here: when a scholarship's official source can't be
  // verified, serving an aggregator/listicle instead would violate the goal.
  return buildResponse({
    query,
    webQuery,
    sourceCount,
    fetched: pages.length,
    extracted: results.length,
    errors,
    results,
    key,
  });
}

// ─── Response assembly + caching ─────────────────────────────────────────────

function buildResponse(args: {
  query: string;
  webQuery: string;
  sourceCount: number;
  fetched: number;
  extracted: number;
  errors: string[];
  results: Scholarship[];
  key: string;
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
      errors: args.errors.slice(0, MAX_ERRORS_REPORTED),
      fromCache: false,
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