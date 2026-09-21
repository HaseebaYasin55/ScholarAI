// ─── Server-side Groq JSON helper ────────────────────────────────────────────
// Only imported by server code (API routes / server utils). Never from the
// client — the API key is a server secret.

export const GROQ_MODEL = "openai/gpt-oss-120b";
export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export class GroqError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "GroqError";
  }
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function tryParseJSON(text: string): unknown {
  try {
    return JSON.parse(stripCodeFences(text));
  } catch {
    return null;
  }
}

/**
 * Call Groq requesting strict JSON output. Returns the parsed value.
 * Throws GroqError on any failure so callers can skip gracefully.
 */
export async function groqJSON<T>(request: {
  system?: string;
  prompt: string;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError("GROQ_API_KEY is not configured.");
  }

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (request.system) messages.push({ role: "system", content: request.system });
  messages.push({ role: "user", content: request.prompt });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Tight budget: this pipeline makes at most ONE Groq call per search, so the
  // worst case must stay short enough to feel fast even when throttled.
  const MAX_RESET_WAIT_MS = 12_000;

  const parseRetrySeconds = (message: string): number | null => {
    const m = message.match(/retry (?:in|after)\s+([\d.]+)\s*s/i);
    return m ? parseFloat(m[1]) : null;
  };

  let lastStatus = 0;
  let lastError = "";
  let retryWaitMs = 0;
  let waitedForReset = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(retryWaitMs);

    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        response = await fetch(GROQ_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages,
            temperature: request.temperature ?? 0.2,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      retryWaitMs = 2_000 + 2_000 * attempt; // network hiccup / timeout → retry
      continue;
    }

    if (!response.ok) {
      lastStatus = response.status;
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 500);
      } catch {
        // ignore
      }

      if (response.status === 429) {
        // Wait out the reset window once, then retry. If it is still 429 we
        // give up rather than burning ~3 more attempts inside the same window.
        if (waitedForReset) break;
        const retryHeader =
          response.headers.get("retry-after") ??
          response.headers.get("x-ratelimit-reset");
        const retryIn =
          parseRetrySeconds(detail) ??
          (retryHeader ? Number(retryHeader) : null);
        retryWaitMs =
          retryIn != null && Number.isFinite(retryIn) && retryIn > 0
            ? Math.min(retryIn * 1000, MAX_RESET_WAIT_MS)
            : 5_000;
        waitedForReset = true;
        continue;
      }
      if (response.status >= 500) {
        retryWaitMs = 3_000 * attempt; // server-side hiccup → exponential
        continue;
      }
      throw new GroqError(
        `Groq request failed (HTTP ${response.status})`,
        detail,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GroqError("Groq returned an unreadable response.");
    }

    const data = payload as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new GroqError("Groq returned an empty response.");
    }

    const parsed = tryParseJSON(text);
    if (parsed === null) {
      throw new GroqError("Groq returned invalid JSON.", text.slice(0, 300));
    }
    return parsed as T;
  }

  throw new GroqError(
    `Groq request failed after retries (HTTP ${lastStatus})`,
    lastError,
  );
}