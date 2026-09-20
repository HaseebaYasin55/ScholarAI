// ─── Server-side web fetching & text utilities for scholarship discovery ─────
// These helpers never run on the client. They fetch a page, turn it into plain
// text, and provide domain-trust + hashing helpers used by the pipeline.
// We deliberately do NOT bypass CAPTCHAs, paywalls, or anti-bot measures.

const USER_AGENT =
  "Mozilla/5.0 (compatible; ScholarAI-Discovery/1.0; +https://scholarai.local)";

const MAX_BYTES = 1_600_000; // ~1.6 MB cap on any downloaded page

const GENERIC_NAMES = new Set([
  "home",
  "homepage",
  "apply now",
  "apply",
  "scholarship",
  "scholarships",
  "funding",
  "funding opportunities",
  "financial aid",
  "404",
  "page not found",
  "not found",
  "error",
  "forbidden",
  "access denied",
]);

// Domains that are social media, aggregators with thin content, or otherwise
// not acceptable as an "official" scholarship source.
const JUNK_HOSTS = [
  "facebook.com",
  "fb.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "snapchat.com",
  "linkedin.com",
  "tumblr.com",
  "medium.com",
  "spotify.com",
  "discord.com",
  "wikipedia.org",
  "indeed.com",
  "glassdoor.com",
  "google.com",
  "duckduckgo.com",
  "bing.com",
  "yahoo.com",
];

// Well-known official scholarship bodies that may not be a .edu/.gov TLD.
const TRUSTED_ORGS = [
  "daad.de",
  "daad.org",
  "erasmusprogramme.com",
  "erasmus-plus.ec.europa.eu",
  "fulbright.org",
  "fulbrightonline.org",
  "iie.org",
  "marshallscholarship.org",
  "chevening.org",
  "study-in-germany.de",
  "gatescambridge.org",
  "obama.org",
  "rhodeshouse.ox.ac.uk",
  "scholars4dev.com",
  "secai.org",
  "dfg.de",
  "humboldt-foundation.de",
];

// Domains that aggregate/curate scholarship listings or listicles. Useful for
// DISCOVERY, but never acceptable as the FINAL official scholarship source.
const AGGREGATOR_HOSTS = [
  "thescholarshipsystem.com",
  "scholarshipdb.net",
  "scholarships4dev.com",
  "scholars4dev.com",
  "wemakescholars.com",
  "scholarshipsads.com",
  "mastersportal.com",
  "bachelorsportal.com",
  "globaladmissions.com",
  "studying-in-germany.org",
  "scholarshipportal.net",
  "scholarshipscafe.com",
  "scholarshipfellow.com",
  "germanyscholarships.de",
  "scholarshipsingermany.com",
  "oddylabs.com",
  "bnoook.com",
  "unicrossblog.com",
  "theonlinelearner.com",
  "scholarship-tracker.net",
  "applyforedu.com",
  "uniapply.com",
  "scholarsports.net",
  "scholarships.com",
  "brilliantscholarship.com",
  "gradgermany.com",
  "globalscholarships.com",
  "scholarshipowl.com",
  "fastweb.com",
  "collegescholarships.org",
  "scholarshipy.com",
  "scholarshiptable.com",
  "mystudium.com",
  "scholarships4students.net",
  "uscholarshipportal.com",
  "scholarshipsly.com",
  "educationdomain.org",
  "scholarshipsindia.com",
  "findscholarship.com",
];

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function getUrlHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function domainParts(host: string): string[] {
  return host
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isJunkUrl(url: string): boolean {
  const host = getUrlHost(url);
  if (!host) return true;
  return JUNK_HOSTS.some((j) => host === j || host.endsWith(`.${j}`));
}

/** True when the host is a scholarship listicle/aggregator site. */
export function isAggregatorUrl(url: string): boolean {
  const host = getUrlHost(url);
  if (!host) return true;
  return AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** 0-3 trust score. Higher = more likely an official source. */
export function domainTrust(url: string): number {
  const host = getUrlHost(url);
  if (!host) return 0;
  const parts = domainParts(host);

  if (parts.length >= 2) {
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    // .edu / .ac.<code> / .gov / .gov.<code> / .go.<code> are strongly official.
    if (tld === "edu") return 3;
    if (tld === "gov") return 3;
    if (tld === "mil") return 3;
    if (tld.startsWith("ac")) return 3;
    if (sld === "edu" || sld === "gov" || sld === "go" || sld === "mil" || sld === "ac") return 3;
  }

  if (TRUSTED_ORGS.some((o) => host === o || host.endsWith(`.${o}`))) return 3;

  // National bodies like daad.ch, fullbright etc. handled above; universities
  // with non-.edu TLDs get a small bonus when the name looks institutional.
  if (parts.length >= 3) return 2;
  return 1;
}

// ─── Hashing / ids ───────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash → base36. Stable across processes. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function scholarshipId(url: string): string {
  return `web_${fnv1a(url.trim()).toString(36)}`;
}

// ─── HTML → text ─────────────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16) || 63),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10) || 63))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"');
}

export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const text = withoutNoise
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|section|tr|blockquote|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Heuristic charset handling — try utf-8, fall back to latin1 if garbled. */
function decodeBuffer(buffer: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad > Math.max(8, utf8.length * 0.02)) {
    return new TextDecoder("latin1").decode(buffer);
  }
  return utf8;
}

// ─── Page fetching ───────────────────────────────────────────────────────────

export interface FetchedPage {
  url: string;
  host: string;
  trust: number;
  text: string;
  title: string;
  fetchedAt: string;
  /** Meta description tag (real page content) — used when enrichment is down. */
  description?: string;
}

export class PageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageFetchError";
  }
}

/**
 * Fetch a single page, cap its size, convert to plain text.
 * Fails loudly (throws) so the pipeline can skip it gracefully.
 */
export async function fetchPageText(
  url: string,
  timeoutMs = 8_000,
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PageFetchError(
      `Request failed (${reason.includes("abort") ? "timeout" : reason})`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new PageFetchError(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/html/i.test(contentType) && !contentType.startsWith("text/plain")) {
    throw new PageFetchError("Not an HTML page");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    throw new PageFetchError("Page too large");
  }

  const body = decodeBuffer(new Uint8Array(arrayBuffer));
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(titleMatch?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  const metaTag = body.match(
    /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*>/i,
  )?.[0];
  const description = metaTag
    ? (decodeEntities(metaTag.match(/content=["']([^"']*)["']/i)?.[1] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300) || undefined)
    : undefined;

  const text = htmlToText(body);

  if (text.length < 200) {
    throw new PageFetchError("Page too thin");
  }

  return {
    url,
    host: getUrlHost(url),
    trust: domainTrust(url),
    text,
    title,
    description,
    fetchedAt: new Date().toISOString(),
  };
}

export function truncateText(text: string, maxChars = 14_000): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > maxChars * 0.75 ? cut.slice(0, lastSpace) : cut;
}

export function isGenericName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.length < 3) return true;
  if (GENERIC_NAMES.has(n)) return true;
  if (n.includes("404")) return true;
  return false;
}

/** Extracts a hostname-ish "university/org" when not otherwise provided. */
export function guessOrg(host: string): string | null {
  const parts = domainParts(host);
  if (parts.length < 2) return null;
  const sld = parts[parts.length - 2];
  if (["edu", "gov", "ac", "org", "com", "net"].includes(sld)) {
    return parts[parts.length - 3] ?? sld;
  }
  return sld;
}