// ─── Official-source verification (server-side) ─────────────────────────────
// The STRICT gate in the discovery pipeline. After a candidate scholarship is
// resolved to a URL, the page is fetched and this module asks the model whether
// the page is genuinely the AUTHORITATIVE official source for that named
// scholarship — not a news article, blog, aggregator listing, or third-party
// "how to apply" guide, even if such a page happens to be informative.
//
// Fail-closed by design: an official source is surfaced only after it passes
// the LLM verifier OR the deterministic trust gate. When the LLM is unavailable
// (rate limit/outage) we fall back to strict on-page + domain checks rather than
// returning nothing — but unverifiable pages are always rejected.

import type { FetchedPage } from "./web";
import { truncateText, domainTrust, isBlockedSourceUrl, getUrlHost } from "./web";
import { groqJSON, GroqError } from "./groq";

export type CurrentStatus = "open" | "upcoming" | "closed" | "expired" | null;

export interface VerificationVerdict {
  /** Page belongs to / is published by the official provider or authority. */
  isOfficial: boolean;
  /** Page clearly presents THIS specific named scholarship (or its variant). */
  nameMatches: boolean;
  /** Page is the functional official application/scholarship page, not a story. */
  isApplicationPage: boolean;
  /** Explicitly stated current state; null when the page does not state it. */
  currentStatus: CurrentStatus;
  /** The official provider/organization the page identifies itself as. */
  provider: string | null;
  reason: string;
}

export const OFFICIAL_VERIFICATION_SCHEMA = `{
  "isOfficial": true,
  "nameMatches": true,
  "isApplicationPage": true,
  "currentStatus": "open",
  "provider": "",
  "reason": ""
}`;

const VERIFICATION_RULES = `Rules:
- "isOfficial": true ONLY if the page is published by the official provider, government body, university, foundation, or an official portal/site run by them (e.g. stipendiumhungaricum.hu, daad.de, a university's own scholarship page). If the page is published by a news outlet, blog, blogger, an aggregator/listicle site, a third-party study-abroad agent, or a personal website — even one that carefully explains the scholarship — it is NOT official. True only when the page itself carries the authority.
- "nameMatches": true if the page presents this exact scholarship (or is unambiguously the same program under a variant name). False if the page is about something else and merely mentions the scholarship.
- "isApplicationPage": true if a student would apply through / find the official application on this page (info, requirements, or "apply" link). A press release or news story about the scholarship is false.
- "currentStatus": infer ONLY from an explicit statement on the page (e.g. "applications open", "deadline", "closed", "not currently accepting", "ended", "next round opens MARCH"). Choose "open" | "upcoming" | "closed" | "expired". If the page gives no explicit current-cycle signal, use null — never guess from emptiness or from an old third-party article.
- "provider": the organization/authority the page identifies itself as (e.g. "TEMPUS Public Foundation", "DAAD"). Empty if unclear.
- "reason": one short sentence justifying the verdict.

If ANY of isOfficial, nameMatches, isApplicationPage is false, the page is REJECTED.`;

function singleVerdictPrompt(
  page: FetchedPage,
  candidate: { name: string; organization?: string | null },
  query: string,
): string {
  return `You are the official-source verifier for a scholarship discovery system. Your job is to determine whether a single web page is the authoritative, official source of a specific scholarship. Being informative about the scholarship is NOT enough — the page must be published by the scholarship's own provider/authority.

SCHOLARSHIP NAME: ${candidate.name}
PROVIDER (claimed by the discovery pass): ${candidate.organization || "unknown"}
ORIGINAL SEARCH: "${query}"
PAGE URL: ${page.url}
PAGE TITLE: ${page.title || "unknown"}

PAGE CONTENT:
${truncateText(page.text, 3_200)}

Answer ONLY from what the page actually states. Then return JSON:
${OFFICIAL_VERIFICATION_SCHEMA}

${VERIFICATION_RULES}`;
}

function batchVerdictPrompt(
  targets: VerifyTarget[],
): string {
  const base = targets[0];
  const blocks = targets.map(
    (t, i) => `PAGE ${i + 1}
SCHOLARSHIP NAME: ${t.name}
PROVIDER (claimed by the discovery pass): ${t.organization || "unknown"}
ORIGINAL SEARCH: "${t.query}"
PAGE URL: ${t.page.url}
PAGE TITLE: ${t.page.title || "unknown"}
PAGE CONTENT:
${truncateText(t.page.text, 3_200)}`,
  );

  return `You are the official-source verifier for a scholarship discovery system. Determine, for each of ${targets.length} web pages, whether it is the authoritative, official source of the named scholarship. Being informative about the scholarship is NOT enough — the page must be published by the scholarship's own provider/authority.

${blocks.join("\n\n--- PAGE BREAK ---\n\n")}

Answer EVERY page. Return ONE JSON object with a "verdicts" array of exactly ${targets.length} objects, one per page in order, shaped like:

{
  "verdicts": [
    { "page": 1, "isOfficial": true, "nameMatches": true, "isApplicationPage": true, "currentStatus": "open", "provider": "", "reason": "" }
  ]
}

${VERIFICATION_RULES}

The base search context being used is "${base?.query ?? ""}". Return ONLY valid JSON.`;

}

/** Map a model's "currentStatus" string to our typed status (null when none). */
function mapCurrentStatus(statusRaw: string): CurrentStatus {
  if (statusRaw.includes("open") && !statusRaw.includes("upcoming")) return "open";
  if (statusRaw.includes("upcoming") || statusRaw.includes("will open")) return "upcoming";
  if (statusRaw.includes("expired") || statusRaw.includes("ended")) return "expired";
  if (statusRaw.includes("closed")) return "closed";
  return null;
}

/** Parse a single verdict object (shared by single + batch paths). */
function parseVerdict(raw: Record<string, unknown>): VerificationVerdict {
  const bool = (v: unknown): boolean => v === true;
  const statusRaw =
    typeof raw.currentStatus === "string" ? raw.currentStatus.toLowerCase() : "";
  const isOfficial = bool(raw.isOfficial);
  const passed = isOfficial && bool(raw.nameMatches) && bool(raw.isApplicationPage);
  return {
    isOfficial: passed,
    nameMatches: bool(raw.nameMatches),
    isApplicationPage: bool(raw.isApplicationPage),
    currentStatus: passed ? mapCurrentStatus(statusRaw) : null,
    provider:
      typeof raw.provider === "string" && raw.provider.trim()
        ? raw.provider.slice(0, 120)
        : null,
    reason:
      typeof raw.reason === "string"
        ? raw.reason.slice(0, 200)
        : passed
          ? "Verified as the official source."
          : "Not verified as the official source.",
  };
}

/** An unsatisfied verdict (any Groq error / unparseable response). */
function rejectedVerdict(reason: string): VerificationVerdict {
  return {
    isOfficial: false,
    nameMatches: false,
    isApplicationPage: false,
    currentStatus: null,
    provider: null,
    reason,
  };
}

/**
 * Rule-based official-source check — used ONLY as a cache/stability fallback
 * when the LLM verifier itself is unavailable (rate limit, outage, timeout).
 * Much stricter than a heuristic: the host must carry a strong institutional
 * signal (edu/gov/ac/trusted program domain) AND the page must present a
 * scholarship/dedicated-programme signal. Anything aggregator/news/blog-like,
 * non-institutional, or purely generic is rejected. The current-status value is
 * always left null here (we never guess cycle state) — the pipeline re-derives
 * it during extraction if the page states it.
 */
function deterministicOfficialVerdict(
  page: FetchedPage,
  candidate: { name: string; organization?: string | null },
): VerificationVerdict | null {
  try {
    if (isBlockedSourceUrl(page.url)) return null;
    const trust = domainTrust(page.url);
    if (trust < 2) return null;

    const host = getUrlHost(page.url);
    const pageText = truncateText(page.text, 1_600).toLowerCase();
    const url = page.url.toLowerCase();

    // Positive on-page signals that this is a dedicated scholarship/programme page.
    const institutionalSignal =
      /\b(scholarship|scholarships|bursar[yies]+|grant|fellowship|award|financial aid|stipend)\b/
        .test(pageText) || /\/(scholarship|scholarships|bursaries?|stipend|funding)\b/.test(url);
    const providerSignal =
      !!candidate.organization &&
      (pageText.includes(candidate.organization.toLowerCase()) ||
        host.includes(candidate.organization.toLowerCase().replace(/\s+/g, "")));

    if (trust >= 3 && institutionalSignal) {
      return {
        isOfficial: true,
        nameMatches: true,
        isApplicationPage: true,
        currentStatus: null,
        provider: candidate.organization ?? host,
        reason: "Deterministic check: trusted institution domain + scholarship page signal (LLM verifier unavailable).",
      };
    }
    if (trust >= 2 && institutionalSignal && providerSignal) {
      return {
        isOfficial: true,
        nameMatches: true,
        isApplicationPage: true,
        currentStatus: null,
        provider: candidate.organization ?? host,
        reason: "Deterministic check: institutional domain matching the claimed provider + scholarship signal (LLM verifier unavailable).",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify that `page` is the authoritative official source for the named
 * scholarship. Returns an unverified verdict ({ isOfficial: false }) on any
 * error — the pipeline drops the candidate, never a degraded fallback.
 */
export async function verifyOfficialPage(
  page: FetchedPage,
  candidate: { name: string; organization?: string | null },
  query: string,
): Promise<VerificationVerdict> {
  try {
    const raw = await groqJSON<Record<string, unknown>>({
      system:
        "You verify whether a web page is the official authoritative source of a named scholarship. You output only valid JSON. Erring towards rejection is correct.",
      prompt: singleVerdictPrompt(page, candidate, query),
      temperature: 0,
    });
    return parseVerdict(raw);
  } catch (err) {
    if (err instanceof GroqError) {
      console.error(
        `[verify] Verification failed for ${page.url}: ${err.message}`,
      );
      // Rate limit/outage — never return "no source" for a strong page; fall
      // back to the strict deterministic gate before giving up.
      const fallback = deterministicOfficialVerdict(page, candidate);
      if (fallback) {
        console.warn(`[verify] Deterministic fallback accepted ${page.url} (LLM verifier unavailable).`);
        return fallback;
      }
    } else {
      console.error(`[verify] Verification failed for ${page.url}:`, err);
    }
    // Fail-closed: an unavailable verifier must not let unverified results through.
    return rejectedVerdict("Verifier unavailable — candidate rejected.");
  }
}

// ─── Batched verification (fewer LLM calls → fewer rate-limit failures) ──────

export interface VerifyTarget {
  name: string;
  organization?: string | null;
  page: FetchedPage;
  /** The query this verification is happening under (web context). */
  query: string;
}

export type VerifyOutcome =
  | { ok: true; verdict: VerificationVerdict }
  | { ok: false };

const VERIFY_BATCH_SIZE = 3;

/**
 * Verify several pages at once, batching up to ${VERIFY_BATCH_SIZE} pages per
 * LLM call. The result array is positionally aligned with `targets`. A failed
 * call fails-closed for the whole batch (all candidates rejected) — unsafe
 * pages are never let through by a partial parse.
 */
export async function verifyOfficialPages(
  targets: VerifyTarget[],
): Promise<VerifyOutcome[]> {
  if (targets.length === 0) return [];
  const outcomes: Array<VerifyOutcome | undefined> = new Array(targets.length);

  for (let start = 0; start < targets.length; start += VERIFY_BATCH_SIZE) {
    const chunk = targets.slice(start, start + VERIFY_BATCH_SIZE);
    const base = start;
    try {
      const raw = await groqJSON<Record<string, unknown>>({
        system:
          "You verify whether web pages are official authoritative sources of named scholarships. You output only valid JSON. Erring towards rejection is correct.",
        prompt: batchVerdictPrompt(chunk),
        temperature: 0,
      });
      const list = Array.isArray(raw?.verdicts) ? (raw.verdicts as unknown[]) : [];
      for (let i = 0; i < chunk.length; i++) {
        const item = list.find(
          (v) =>
            typeof v === "object" &&
            v !== null &&
            (v as Record<string, unknown>).page === i + 1,
        );
        if (!item) {
          outcomes[base + i] = { ok: false };
          continue;
        }
        const verdict = parseVerdict(item as Record<string, unknown>);
        outcomes[base + i] = verdict.isOfficial
          ? { ok: true, verdict }
          : { ok: false };
      }
    } catch (err) {
      const isRateLimit =
        err instanceof GroqError &&
        (err.message.toLowerCase().includes("429") ||
          err.message.toLowerCase().includes("rate limit"));
      if (isRateLimit) {
        // LLM verifier temporarily throttled → fall back per-page to the
        // deterministic gate so a throttling service does not blank results.
        for (let i = 0; i < chunk.length; i++) {
          const target = chunk[i];
          const fallback = deterministicOfficialVerdict(target.page, {
            name: target.name,
            organization: target.organization,
          });
          if (fallback) {
            console.warn(
              `[verify] Deterministic fallback accepted ${target.page.url} (batch rate-limited).`,
            );
            outcomes[base + i] = { ok: true, verdict: fallback };
          } else {
            outcomes[base + i] = { ok: false };
          }
        }
        continue;
      }
      const label =
        err instanceof GroqError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`[verify] Batch verification failed (${label}) — rejecting batch.`);
      for (let i = 0; i < chunk.length; i++) {
        outcomes[base + i] = { ok: false };
      }
    }
  }

  return outcomes.map((o) => o ?? { ok: false });
}