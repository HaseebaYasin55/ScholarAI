// ─── robots.txt fetching, parsing + allow checks (server-side) ───────────────
// Implements the Robots Exclusion Protocol subset we need (RFC 9309): a
// per-origin, time-limited cache of the fetched robots.txt, user-agent group
// selection, and `Allow`/`Disallow` path matching with `*` wildcards and a
// trailing `$` terminator.
//
// Deliberately resilient: an unreachable/5xx robots.txt is treated as allowing
// the crawl (a page fetch that fails is already handled downstream as a normal
// "could not read" skip), a 404 means "no restrictions", and an unruly-giant
// robots.txt is ignored. Only a page your robots.txt actually disallows is
// never fetched. Not importable from the client.

const USER_AGENT =
  "Mozilla/5.0 (compatible; ScholarAI-Discovery/1.0; +https://scholarai.local)";

/** The product token browsers/crawlers use to identify us in robots.txt. */
const CRAWLER_TOKEN = "scholarai-discovery";

const ROBOTS_TTL_MS = 10 * 60 * 1000; // 10 minutes per origin
const ROBOTS_TIMEOUT_MS = 4_000;
const MAX_ROBOTS_BYTES = 512_000; // ignore absurd robots.txt files

interface RobotsGroup {
  tokens: string[];
  allow: string[];
  disallow: string[];
}

interface RobotsEntry {
  groups: RobotsGroup[];
  expiresAt: number;
}

const cache = new Map<string, RobotsEntry>();

// ─── Parsing ────────────────────────────────────────────────────────────────
// A new `User-agent:` line starts a new group once the current group already
// has rules (multiple UA lines before rules belong to the same group).
function parseRobotsText(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let cursor = -1;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      const hasRules =
        cursor >= 0 &&
        (groups[cursor].allow.length > 0 || groups[cursor].disallow.length > 0);
      if (cursor === -1 || hasRules) {
        groups.push({ tokens: [], allow: [], disallow: [] });
        cursor = groups.length - 1;
      }
      if (value) groups[cursor].tokens.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      if (cursor === -1) continue;
      const list = field === "allow" ? groups[cursor].allow : groups[cursor].disallow;
      list.push(value);
    }
    // sitemap / host / crawl-delay / comments → ignored (not part of allowance)
  }

  return groups;
}

// ─── User-agent selection ───────────────────────────────────────────────────
// The most specific token match wins: exact crawler token > "scholarai" > a
// token that prefixes our crawler token > "*". Ties → first group in the file.
function pickGroup(groups: RobotsGroup[]): RobotsGroup | null {
  let best: { group: RobotsGroup; specificity: number } | null = null;

  for (const group of groups) {
    let specificity = -1;
    for (const token of group.tokens) {
      if (token === CRAWLER_TOKEN) {
        specificity = 3;
        break;
      }
      if (token === "scholarai") {
        specificity = Math.max(specificity, 2);
      } else if (CRAWLER_TOKEN.startsWith(token) && token.length >= 4) {
        specificity = Math.max(specificity, 1);
      } else if (token === "*") {
        specificity = Math.max(specificity, 0);
      }
    }
    if (specificity >= 0 && (!best || specificity > best.specificity)) {
      best = { group, specificity };
    }
  }

  return best?.group ?? null;
}

// ─── Path matching ──────────────────────────────────────────────────────────
// RFC 9309: an `Allow`/`Disallow` pattern is a path prefix with `*` matching
// any run of bytes and a trailing `$` anchoring the end. The longest matching
// rule wins; on equal length a `Disallow` beats an `Allow`. No match → allowed.
function escapeRegexPart(part: string): string {
  return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makePatternTest(pattern: string): (path: string) => boolean {
  const anchored = pattern.endsWith("$");
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const source = `^${core
    .split("*")
    .map((p) => escapeRegexPart(p))
    .join(".*")}${anchored ? "$" : ""}`;
  let re: RegExp;
  try {
    re = new RegExp(source);
  } catch {
    // A malformed pattern must not block anything.
    return () => true;
  }
  return (path) => re.test(path);
}

interface Rule {
  allow: boolean;
  length: number;
  test: (path: string) => boolean;
}

function buildRules(group: RobotsGroup): Rule[] {
  const rules: Rule[] = [];

  for (const raw of group.allow) {
    const pattern = raw.trim();
    if (pattern === "") continue;
    rules.push({
      allow: true,
      length: pattern.length,
      test: makePatternTest(pattern),
    });
  }

  for (const raw of group.disallow) {
    const pattern = raw.trim();
    // An empty Disallow value explicitly permits everything.
    if (pattern === "") return rules.length > 0 ? [{ allow: true, length: -1, test: () => true }] : [];
    rules.push({
      allow: false,
      length: pattern.length,
      test: makePatternTest(pattern),
    });
  }

  return rules;
}

function pathAllowed(path: string, group: RobotsGroup | null): boolean {
  if (!group) return true;
  const rules = buildRules(group);
  if (rules.length === 0) return true;

  let best: Rule | null = null;
  for (const rule of rules) {
    if (!rule.test(path)) continue;
    if (!best || rule.length > best.length) {
      best = rule;
    } else if (rule.length === best.length && !rule.allow && best.allow) {
      // Equal specificity: a Disallow wins over an Allow.
      best = rule;
    }
  }
  return best ? best.allow : true;
}

function fetchRobotsTxt(origin: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROBOTS_TIMEOUT_MS);
  return (async () => {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/plain,*/*;q=0.1",
        },
      });
      if (res.ok) {
        const text = await res.text();
        return text.length > MAX_ROBOTS_BYTES ? "" : text;
      }
      if (res.status === 404) return ""; // no robots.txt → no restrictions
      throw new Error(`robots.txt HTTP ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  })();
}

/**
 * True when the crawler may fetch `url` under that origin's robots.txt.
 * Fails open (allows) when robots.txt cannot be read — a page the site does
 * not want crawled is only skipped when its own robots.txt says so.
 */
export async function robotsAllow(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const origin = parsed.origin;
  const path = `${parsed.pathname}${parsed.search}`;

  const cached = cache.get(origin);
  if (!cached || cached.expiresAt <= Date.now()) {
    let groups: RobotsGroup[];
    try {
      groups = parseRobotsText(await fetchRobotsTxt(origin));
    } catch (err) {
      // Unreachable/5xx robots.txt — treat as permissive, keep the page fetch
      // path normal (it fails on its own if actually blocked).
      console.warn(
        `[robots] Could not read robots.txt for ${origin} — treating as allowed:`,
        err instanceof Error ? err.message : String(err),
      );
      return true;
    }
    cache.set(origin, { groups, expiresAt: Date.now() + ROBOTS_TTL_MS });
    return pathAllowed(path, pickGroup(groups));
  }

  return pathAllowed(path, pickGroup(cached.groups));
}