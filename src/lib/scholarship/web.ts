// ─── Server-side web fetching & text utilities for scholarship discovery ─────
// These helpers never run on the client. They fetch a page, turn it into plain
// text, and provide domain-trust + hashing helpers used by the pipeline.
// We deliberately do NOT bypass CAPTCHAs, paywalls, or anti-bot measures.

import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { robotsAllow } from "./robots";

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
  "secai.org",
  "dfg.de",
  "humboldt-foundation.de",
  "stipendiumhungaricum.hu",
  "tempuspublicfoundation.hu",
  "study-in-hungary.hu",
];

// News / media websites that publish scholarship articles or "top scholarships"
// round-ups. Never an authoritative official application source.
const NEWS_HOSTS = [
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
  "theguardian.com",
  "nytimes.com",
  "washingtonpost.com",
  "reuters.com",
  "apnews.com",
  "aljazeera.com",
  "timeshighereducation.com",
  "thepienews.com",
  "universityworldnews.com",
  "theconversation.com",
  "forbes.com",
  "businessinsider.com",
  "fortune.com",
  "bloomberg.com",
  "economist.com",
  "usnews.com",
  "huffpost.com",
  "independent.co.uk",
  "telegraph.co.uk",
  "thetimes.com",
  "timesnownews.com",
  "indiatimes.com",
  "timesofindia.indiatimes.com",
  "hindustantimes.com",
  "thehindu.com",
  "dailymail.co.uk",
];

// Blog platforms & personal-publishing hosts. Posts there are never the
// authoritative official source for a scholarship.
const BLOG_HOSTS = [
  "blogspot.com",
  "blogspot.co.uk",
  "blogspot.in",
  "wordpress.com",
  "blogger.com",
  "substack.com",
  "typepad.com",
  "livejournal.com",
  "tumblr.com",
  "medium.com",
  "wixsite.com",
  "squarespace.com",
  "weebly.com",
  "ghost.org",
  "dev.to",
  "github.io",
  "hatenablog.com",
];

// Third-party study-abroad / listing / SEO scholarship sites that are sometimes
// mistaken for official sources. Discovery-only; never surfaced to the user.
const THIRD_PARTY_HOSTS = [
  "findamasters.com",
  "findaphd.com",
  "scholarshippositions.com",
  "scholarship-positions.com",
  "scholarshipsfordevelopment.com",
  "internationalscholarships.info",
  "scholarships360.org",
  "scholarshipjunkies.org",
  "yocket.com",
  "collegedunia.com",
  "studyinternational.com",
  "studying-in-germany.org",
  "mastersportal.com",
  "studyabroad.com",
  "goabroad.com",
  "topuniversities.com",
  "prodigyfinance.com",
  "gograd.org",
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
  "scholarhunter.com",
  "afterschoolafrica.com",
  "scholarafrika.com",
  "eduvision.edu.pk",
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

// Country for an official host's country-code TLD — a real property of the
// source (never from third-party text). Shared by extraction + candidates.
const TLD_TO_COUNTRY: Record<string, string> = {
  de: "Germany",
  uk: "United Kingdom",
  au: "Australia",
  ca: "Canada",
  us: "United States",
  jp: "Japan",
  fr: "France",
  nl: "Netherlands",
  se: "Sweden",
  fi: "Finland",
  it: "Italy",
  kr: "South Korea",
  es: "Spain",
  nz: "New Zealand",
  in: "India",
  my: "Malaysia",
  sg: "Singapore",
  cn: "China",
  ie: "Ireland",
  at: "Austria",
  pl: "Poland",
  no: "Norway",
  dk: "Denmark",
  ch: "Switzerland",
  be: "Belgium",
  hu: "Hungary",
  tr: "Turkey",
  cz: "Czech Republic",
  ru: "Russia",
  gr: "Greece",
  pt: "Portugal",
  il: "Israel",
  ae: "United Arab Emirates",
  th: "Thailand",
  id: "Indonesia",
  eg: "Egypt",
  br: "Brazil",
  mx: "Mexico",
};

/** Country inferred from a URL or bare hostname's TLD, or null. */
export function hostCountry(urlOrHost: string): string | null {
  const host = urlOrHost.includes("://") ? getUrlHost(urlOrHost) : urlOrHost;
  try {
    const parts = host.split(".").map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length < 2) return null;
    return TLD_TO_COUNTRY[parts[parts.length - 1]] ?? null;
  } catch {
    return null;
  }
}

function domainParts(host: string): string[] {
  const parts = host
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  // The www label is not a registrable-domain part: it must not inflate
  // "subdomain" counts that later translate into trust levels.
  if (parts[0] === "www" || parts[0] === "w2" || parts[0] === "www2") {
    parts.shift();
  }
  return parts;
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

function hostIn(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** News / media article hosts (scholarship journalism, never the authority). */
export function isNewsUrl(url: string): boolean {
  const host = getUrlHost(url);
  if (!host) return true;
  if (hostIn(host, NEWS_HOSTS)) return true;
  // A `news.`, `blog.` or `media.` label marks a section, not the authority.
  const labels = host.split(".");
  return labels.some((l) => l === "news" || l === "blog");
}

/** Blog platform hosts (personal publishing, never the authority). */
export function isBlogUrl(url: string): boolean {
  const host = getUrlHost(url);
  if (!host) return true;
  return hostIn(host, BLOG_HOSTS);
}

/**
 * THE source gate for surfacing a URL to a user anywhere.
 *
 * True  → the URL may be displayed as a scholarship link.
 * False → NEVER display this URL as a scholarship result / official link,
 *         even if a discovery search mentions it. No fallback.
 *
 * Unverifiable hosts, social media, aggregators, news, blogs and third-party
 * listing/SEO sites are all blocked. This is a hard, non-negotiable filter.
 */
export function isBlockedSourceUrl(url: string): boolean {
  const host = getUrlHost(url);
  if (!host) return true;
  if (isJunkUrl(url)) return true;
  if (hostIn(host, AGGREGATOR_HOSTS)) return true;
  if (hostIn(host, THIRD_PARTY_HOSTS)) return true;
  if (isNewsUrl(url)) return true;
  if (isBlogUrl(url)) return true;
  return false;
}

/**
 * A URL that is *plausibly official* to a human eye: not blocked and carrying
 * an educational/government/trusted-org signal. Used as a cheap pre-filter;
 * final acceptance additionally requires LLM verification in the pipeline.
 */
export function isAcceptableOfficialUrl(url: string): boolean {
  if (isBlockedSourceUrl(url)) return false;
  return domainTrust(url) >= 2;
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

export function htmlToText(html: string): string {
  try {
    const $ = cheerio.load(html);

    // Structural chrome that is never scholarship content. Stripping nav /
    // header / footer removes the "opens in a new window" style link noise that
    // otherwise dominates short pages.
    $(
      "script,style,noscript,svg,iframe,template,canvas,audio,video,nav,header,footer,form,button,select,option,input,textarea",
    ).remove();

    // Hoist <time datetime="…"> so machine-readable exact dates survive even
    // when the element has no inner text (common for deadline table cells).
    $("time[datetime]").each((_, el) => {
      const $el = $(el);
      const dt = $el.attr("datetime");
      if (!dt) return;
      const label = $el.text().trim().replace(/\s+/g, " ");
      if (label) $el.text(`${label} (${dt})`);
      else $el.text(dt);
    });

    // Linearize tables: cells separated by a space, rows on their own line —
    // the deadline/field-of-study data often lives in <table>/<li> markup.
    $("td,th").each((_, el) => {
      $(el).append(" ");
    });
    $("tr").each((_, el) => {
      $(el).append("\n");
    });
    $(
      "br,p,li,div,article,section,h1,h2,h3,h4,h5,h6,blockquote,table,ul,ol,details,summary,hr,caption,figcaption",
    ).each((_, el) => {
      $(el).append("\n");
    });

    const body = $("body").first();
    return (
      (body.length ? body.text() : $.root().text()) || ""
    )
      .replace(/\xa0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    // Malformed HTML should never take the whole pipeline down.
    return "";
  }
}

/** Extract <title> / og:title + meta description via a real DOM parse. */
export function extractMeta(html: string): { title: string; description?: string } {
  let title = "";
  let description: string | undefined;
  try {
    const $ = cheerio.load(html);
    title = (
      $("title").first().text() ||
      $('meta[property="og:title"]').attr("content") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    const desc =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";
    description = desc
      ? desc.replace(/\s+/g, " ").trim().slice(0, 300)
      : undefined;
  } catch {
    // fall through with empty metadata
  }
  return { title, description };
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

export interface FetchPageOptions {
  /**
   * Follow up to N same-origin official links (apply / deadline / programme /
   * eligibility pages) and append their text to the main page. Fixes the common
   * case where the scholarship HUB page links OUT to the pages that actually
   * state the deadline and the eligible programmes.
   */
  enrich?: boolean;
  /**
   * Also follow eligible-programme links that point at PDF documents. Many
   * scholarship sources (SH university portals, government PDFs) publish the
   * programme list only in a PDF, so the enrichment must be able to read them.
   */
  includePdf?: boolean;
}

// Anchor text / path signals used to pick worthwhile sibling pages.
const ENRICH_LINK_KEYWORDS =
  /(deadline|apply|application|programme?s?|programs?|fields?\s+of\s+study|courses?|subjects?|eligibility|criter|intake|admission|closing|open|funding|award|scholarships?|degree)/i;

// Never follow into non-PDF binary/download/feed artifacts.
const ENRICH_SKIP =
  /\.(docx?|xlsx?|pptx?|zip|png|jpe?g|gif|svg|css|js|json|xml|ics|rss)(\?|$)/i;

const ENRICH_MAX_PAGES = 2;
const ENRICH_BUDGET_CHARS = 120_000;

/**
 * Find same-origin pages worth reading to enrich a candidate page, based on
 * the official site's OWN links — no hardcoded site layouts.
 */
export function findRelatedOfficialPages(
  baseUrl: string,
  html: string,
  max = ENRICH_MAX_PAGES,
  options?: { includePdf?: boolean },
): string[] {
  const out: string[] = [];
  try {
    const base = new URL(baseUrl);
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    $("a[href]").each((_, el) => {
      if (out.length >= max) return;
      const href = $(el).attr("href") ?? "";
      if (!href || href.startsWith("#")) return;
      let abs: URL;
      try {
        abs = new URL(href, base);
      } catch {
        return;
      }
      if (abs.origin !== base.origin) return;
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      if (base.hostname.endsWith(".blogspot.com") || abs.hostname.includes("api.")) return;
      const clean = `${abs.origin}${abs.pathname}${abs.search}`;
      if (ENRICH_SKIP.test(clean)) return;
      if (/\.pdf(\?|$)/i.test(clean) && options?.includePdf !== true) return;
      if (abs.pathname === "/") return;
      if (abs.pathname === base.pathname) return;
      const label = $(el).text().replace(/\s+/g, " ").trim().slice(0, 140);
      if (!ENRICH_LINK_KEYWORDS.test(`${label} ${abs.pathname}`)) return;
      if (seen.has(clean)) return;
      seen.add(clean);
      out.push(clean);
    });
  } catch {
    // link graph unavailable → plain page only
  }
  return out;
}

function titleFromPdfUrl(url: string): string {
  try {
    const tail = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return tail.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
  } catch {
    return "";
  }
}

/**
 * Fetch a PDF document, cap its size, and extract its plain text via pdf.js.
 * Used to read eligible-programme lists that official sources publish only as
 * PDFs. Fails loudly so the pipeline can skip it gracefully.
 */
export async function fetchPdfText(
  url: string,
  timeoutMs = 8_000,
): Promise<FetchedPage> {
  if (!(await robotsAllow(url))) {
    throw new PageFetchError("Blocked by robots.txt");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/pdf,application/octet-stream",
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

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    throw new PageFetchError("Page too large");
  }

  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 8) throw new PageFetchError("Not a PDF");
  const magic = String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
  );
  if (!magic.startsWith("%PDF-")) {
    throw new PageFetchError("Not a PDF");
  }

  let text: string;
  try {
    const parser = new PDFParse({ data: bytes });
    const parsed = await parser.getText();
    text = (parsed?.text ?? "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    await parser.destroy();
  } catch {
    throw new PageFetchError("PDF text unreadable");
  }

  if (text.length < 20) {
    throw new PageFetchError("Page too thin");
  }

  return {
    url,
    host: getUrlHost(url),
    trust: domainTrust(url),
    text,
    title: titleFromPdfUrl(url) || "Eligible programmes",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch a single page, cap its size, convert to plain text.
 * Fails loudly (throws) so the pipeline can skip it gracefully.
 */
export async function fetchPageText(
  url: string,
  timeoutMs = 8_000,
  options?: FetchPageOptions,
): Promise<FetchedPage> {
  // Respect the origin's robots.txt before touching the page. A disallowed
  // page is a normal "could not read" skip for the pipeline.
  if (!(await robotsAllow(url))) {
    throw new PageFetchError("Blocked by robots.txt");
  }

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
  const meta = extractMeta(body);
  const title = meta.title;
  const description = meta.description;

  let text = htmlToText(body);

  if (text.length < 200) {
    throw new PageFetchError("Page too thin");
  }

  if (options?.enrich) {
    const links = findRelatedOfficialPages(url, body, ENRICH_MAX_PAGES, {
      includePdf: options.includePdf,
    });
    let extra = "";
    for (const link of links) {
      const isPdf = /\.pdf(\?|$)/i.test(link);
      try {
        const sibling = isPdf
          ? await fetchPdfText(link, Math.min(timeoutMs, 6_000))
          : await fetchPageText(link, Math.min(timeoutMs, 6_000));
        const label = sibling.title.trim() || link;
        extra += `\n\n[RELATED OFFICIAL PAGE${isPdf ? " (PDF)" : ""}: ${label}] (${link})\n${sibling.text}`;
        if (extra.length > ENRICH_BUDGET_CHARS) break;
      } catch {
        // sibling unreadable / robots-disallowed → skip quietly
      }
    }
    if (extra) text = truncateText(text + extra, 80_000);
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