// ─── Web search for scholarships (server-side) ───────────────────────────────
// Uses the Tavily Search API for discovery. No HTML scraping of search engines,
// no anti-bot wrestling. Tavily returns ranked URLs + short snippets; the
// snippet is used ONLY for relevance ranking — the scholarship pipeline always
// fetches and reads the ACTUAL official page (Cheerio + native fetch) before
// anything is shown. A Tavily snippet is never the final scholarship source.
//
// On transient provider failure (rate limit / 5xx / quota) this module throws a
// user-facing error which the orchestrator converts into a graceful 200
// transient-failure response — never a hard 500.

import { isJunkUrl } from "./web";

export interface SearchFilters {
  country?: string | null;
  degreeLevels?: string[];
  field?: string | null;
  funding?: string | null;
  scholarshipType?: string | null;
}

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  /** Number of distinct search queries that surfaced this URL (set by the
   *  orchestrator when aggregating multiple queries; 1 when unused). */
  hits?: number;
}

const FUNDING_TERMS: Record<string, string> = {
  fully_funded: "fully funded",
  partially_funded: "partially funded",
  tuition_fee_waiver: "tuition fee waiver",
  any: "",
};

// ─── Query building ──────────────────────────────────────────────────────────

/** Drop the possessive/short-form noise from user degree labels. */
function degreeTerm(level: string): string | null {
  const n = level.toLowerCase().trim();
  if (n.startsWith("bachelor") || n.startsWith("b") && n.length <= 3) return "bachelor";
  if (n.startsWith("master") || n.startsWith("masters")) return "master";
  if (n.startsWith("phd") || n.startsWith("doctor")) return "phd";
  return null;
}

export function buildSearchQuery(query: string, filters: SearchFilters = {}): string {
  const parts: string[] = [];
  const q = query.trim();
  if (q) parts.push(q);
  else parts.push("international");

  const degree =
    filters.degreeLevels?.[0] ? degreeTerm(filters.degreeLevels[0]) : null;
  if (degree) parts.push(degree);

  if (filters.field?.trim()) parts.push(filters.field.trim());
  if (filters.country?.trim()) parts.push(filters.country.trim());

  const funding = filters.funding ? FUNDING_TERMS[filters.funding] : null;
  if (funding) parts.push(funding);
  if (filters.scholarshipType?.trim()) parts.push(filters.scholarshipType.trim());

  if (!parts.some((p) => /scholarship/i.test(p))) parts.push("scholarships");

  return [...new Set(parts)].join(" ");
}

/**
 * An "official source" flavored query used alongside the main search to widen
 * the candidate pool with application/deadline pages from authoritative sites
 * (universities, funders, governments) rather than only listicles.
 */
export function buildOfficialSearchQuery(
  query: string,
  filters: SearchFilters = {},
): string {
  const base = buildSearchQuery(query, filters)
    .replace(/\bscholarships?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${base || "international"} scholarship official application`.trim();
}

// ─── Tavily search adapter ───────────────────────────────────────────────────

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 10_000;
const TAVILY_MAX_RESULTS = 20;

/** Backoff (ms) between attempts — gentle so a rate-limited provider is not
 *  hammered, bounded so a fully-blocked provider fails fast. */
const RETRY_BACKOFF_MS = [0, 700, 1_400, 2_800];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
}

/** Extract a human-readable error message from a (possibly malformed) body. */
function tavilyErrorDetail(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const detail = p.detail;
    if (typeof detail === "string" && detail) return detail;
    if (detail && typeof detail === "object") {
      const d = detail as Record<string, unknown>;
      if (typeof d.error === "string" && d.error) return d.error;
      if (typeof d.message === "string" && d.message) return d.message;
    }
    if (typeof p.error === "string" && p.error) return p.error;
    if (typeof p.message === "string" && p.message) return p.message;
  }
  return `HTTP ${status}`;
}

/** Run ONE Tavily search request. Throws on non-2xx or malformed payloads. */
async function tavilyOnce(query: string, apiKey: string): Promise<WebResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: TAVILY_MAX_RESULTS,
        topic: "general",
        chunks_per_source: 1,
      }),
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // non-JSON body → handled via the generic HTTP fallback below
    }

    if (!res.ok) {
      throw new Error(tavilyErrorDetail(payload, res.status));
    }

    const list = (payload as { results?: unknown } | null)?.results;
    if (!Array.isArray(list)) {
      throw new Error("Tavily returned malformed search data");
    }

    const out: WebResult[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const r = item as TavilyResult;
      const url = typeof r.url === "string" ? r.url.trim() : "";
      if (!url || !/^https?:\/\//i.test(url) || isJunkUrl(url)) continue;
      // The snippet is used for ranking ONLY — never as the final scholarship
      // source (the pipeline always fetches the real official page).
      out.push({
        title: typeof r.title === "string" ? r.title.slice(0, 240) : "",
        url,
        snippet: typeof r.content === "string" ? r.content : "",
        rank: out.length,
      });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search the web for scholarship pages via the Tavily Search API. Retries
 * transient provider failures (rate limits / 5xx) with backoff, then throws a
 * clear user-facing error so the orchestrator can respond with its graceful
 * transient-failure (200) path instead of a hard 500.
 */
export async function searchWeb(query: string): Promise<WebResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Tavily API key is not configured (TAVILY_API_KEY).");
  }

  const q = query.replace(/\s+/g, " ").trim();
  let lastError = "Tavily request failed";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const jitter = Math.floor(Math.random() * 400);
      await sleep(RETRY_BACKOFF_MS[attempt] + jitter);
    }
    try {
      const results = await tavilyOnce(q, apiKey);
      if (results.length > 0) return results.slice(0, 40);
      lastError = "Tavily returned no results";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(
    `Web search is temporarily unavailable (${lastError}). Please try again in a minute.`,
  );
}