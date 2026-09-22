// ─── Web search for scholarships (server-side) ───────────────────────────────
// Uses DuckDuckGo's public HTML endpoints (html, then lite as fallback). No API
// key required; results are parsed from the HTML directly. We never bypass
// CAPTCHAs or anti-bot measures — on repeated blocks the caller sees an error.
//
// DuckDuckGo answers shared/IP-heavy traffic with an anti-bot "anomaly"
// challenge (HTTP 202 + a page with no result links). This module detects that
// response, retries with gentle backoff, and surfaces a clear
// rate-limit/blocked message instead of an empty "no results" set.

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

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeRedirectHref(href: string): string | null {
  try {
    const link =
      href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(link, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg?.startsWith("http")) return uddg;
  } catch {
    // fall through to raw href
  }
  if (href.startsWith("http")) return href;
  return null;
}

/** Parse the classic html.duckduckgo.com results page. */
function parseDuckHtml(html: string): WebResult[] {
  const results: WebResult[] = [];
  const blockRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets = [...html.matchAll(snippetRe)].map((m) => stripTags(m[1]));

  let i = 0;
  for (const m of html.matchAll(blockRe)) {
    const url = decodeRedirectHref(m[1]);
    if (!url || isJunkUrl(url)) continue;
    const title = stripTags(m[2]);
    results.push({
      title,
      url,
      snippet: snippets[i] ?? "",
      rank: results.length,
    });
    i++;
  }
  return results;
}

/** Parse DuckDuckGo lite results page. */
function parseDuckLite(html: string): WebResult[] {
  const results: WebResult[] = [];
  const linkRe = /href="([^"]*\/l\/\?uddg=[^"]*)"/gi;
  const snippetRe = /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
  const snippets = [...html.matchAll(snippetRe)].map((m) => stripTags(m[1]));

  let i = 0;
  const seen = new Set<string>();
  for (const m of html.matchAll(linkRe)) {
    const url = decodeRedirectHref(m[1]);
    if (!url || seen.has(url) || isJunkUrl(url)) continue;
    seen.add(url);
    results.push({
      title: "",
      url,
      snippet: snippets[i] ?? "",
      rank: results.length,
    });
    i++;
  }
  return results;
}

// ─── Search execution ────────────────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 7_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; ScholarAI-Discovery/1.0; +https://scholarai.local)";

/** Backoff (ms) between search attempts. Kept gentle so a blocked provider is
 *  not hammered further; bounded so a fully-blocked provider fails fast. */
const RETRY_BACKOFF_MS = [0, 550, 1_200, 2_200];

/** Signals that mark a DuckDuckGo anti-bot / anomaly page (there are no real
 *  results to parse, regardless of HTTP status). */
function isAnomalyChallenge(text: string): boolean {
  const low = text.toLowerCase();
  return (
    low.includes("anomaly") ||
    /id="challenge"|class="[^"]*challenge/i.test(low) ||
    low.includes("verify you") ||
    (low.includes("captcha") && low.includes("duckduckgo"))
  );
}

async function fetchDuck(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
    if ([429, 403, 202].includes(res.status)) {
      // 429 = explicit rate limit; 202 = DuckDuckGo's anti-bot challenge;
      // 403 = blocked. All mean "the provider is temporarily rate limiting us".
      throw new Error(`Search provider rate limited (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function encodeQuery(q: string): string {
  return encodeURIComponent(q.replace(/\s+/g, " ").trim());
}

/** Run ONE engine attempt and parse its results. Throws only when the engine
 *  is blocked/rate-limited or returns an unparseable challenge page. */
async function engineResults(engine: "html" | "lite", q: string): Promise<WebResult[]> {
  const url =
    engine === "html"
      ? `https://html.duckduckgo.com/html/?q=${q}`
      : `https://lite.duckduckgo.com/lite/?q=${q}`;
  const res = await fetchDuck(url);
  const text = await res.text();
  if (isAnomalyChallenge(text)) {
    throw new Error("Search provider rate limited (challenge page)");
  }
  const results =
    engine === "html" ? parseDuckHtml(text) : parseDuckLite(text);
  if (results.length === 0) {
    // A 200 page with zero parseable results is effectively a bot block too.
    throw new Error("Search provider returned no results");
  }
  return results.slice(0, 40);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Search the web for scholarship pages. Tries html then lite, with gentle
 * retry/backoff, so a single transient rate-limit or challenge page can be
 * survived. Throws a clear, user-facing error when the provider is genuinely
 * blocked/rate-limited.
 */
export async function searchWeb(query: string): Promise<WebResult[]> {
  const q = encodeQuery(query);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const jitter = Math.floor(Math.random() * 350);
      await sleep(RETRY_BACKOFF_MS[attempt] + jitter);
    }
    const engine = attempt % 2 === 0 ? "html" : "lite";
    try {
      return await engineResults(engine, q);
    } catch {
      // attempt failed (blocked/rate-limited/unparseable) → back off + retry
    }
  }
  throw new Error(
    "Web search is temporarily unavailable (DuckDuckGo appears rate limited or blocked). Please try again in a minute.",
  );
}