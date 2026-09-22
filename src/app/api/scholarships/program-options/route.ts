import { NextResponse } from "next/server";
import { fetchPageText, isBlockedSourceUrl } from "@/lib/scholarship/web";
import { extractScholarship } from "@/lib/scholarship/extract";

// ─── Program options refresh ─────────────────────────────────────────────────
// Tracked applications created before `applications.fields` existed (or whose
// catalog snapshot predated the extraction fix) have no program list. This
// route re-reads the application's OWN official page and returns the eligible
// programs/fields the page actually states, so Step 2 can offer a
// scholarship-specific dropdown without deleting and re-adding the application.
//
// Safety: only http(s) URLs on public hosts are fetched, blocked/aggregator
// sources are refused, and every returned value comes from the official page
// (the extractor never invents). When the page lists no concrete programs the
// response is an empty list — the UI keeps its manual fallback.

const FETCH_TIMEOUT_MS = 12_000;

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "::") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url : "";
  const name = typeof body.name === "string" ? body.name.slice(0, 200) : "";

  const url = parseHttpUrl(rawUrl);
  if (!url) {
    return NextResponse.json({ error: "A valid http(s) official URL is required." }, { status: 400 });
  }
  if (isPrivateHost(url.hostname)) {
    return NextResponse.json({ error: "That host is not allowed." }, { status: 400 });
  }
  if (isBlockedSourceUrl(url.href)) {
    return NextResponse.json({ error: "That source is not an official scholarship page." }, { status: 400 });
  }

  try {
    const page = await fetchPageText(url.href, FETCH_TIMEOUT_MS, {
      enrich: true,
      includePdf: true,
    });
    const scholarship = await extractScholarship(page, { query: name || url.href });
    const fields = (scholarship?.fields ?? []).map((f) => f.trim()).filter(Boolean);
    return NextResponse.json({
      fields,
      openToAllDisciplines: scholarship?.openToAllDisciplines === true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the official page.";
    console.error("[/api/scholarships/program-options]", message);
    return NextResponse.json({ fields: [], error: message }, { status: 200 });
  }
}
