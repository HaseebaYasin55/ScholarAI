import { NextResponse } from "next/server";
import { discoverScholarships } from "@/lib/scholarship/search";

const ALLOWED_FILTER_KEYS = new Set([
  "country",
  "degreeLevels",
  "field",
  "funding",
  "scholarshipType",
]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(Math.round(body.limit), 24))
      : 12;
  const refresh = body.refresh === true;
  const rawFilters = (body.filters ?? {}) as Record<string, unknown>;

  const filters: {
    country?: string | null;
    degreeLevels?: string[];
    field?: string | null;
    funding?: string | null;
    scholarshipType?: string | null;
  } = {};

  for (const key of Object.keys(rawFilters)) {
    if (!ALLOWED_FILTER_KEYS.has(key)) continue;
    const value = rawFilters[key];
    if (key === "degreeLevels") {
      if (Array.isArray(value)) {
        filters.degreeLevels = value
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean);
      }
    } else if (typeof value === "string" && value.trim()) {
      (filters as Record<string, unknown>)[key] = value.trim();
    }
  }

  if (!query && !filters.country && !filters.degreeLevels?.length) {
    return NextResponse.json(
      { error: "Provide a search query or at least one filter." },
      { status: 400 },
    );
  }

  try {
    const response = await discoverScholarships({
      query,
      filters,
      limit,
      refresh,
    });
    return NextResponse.json(response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Search failed unexpectedly.";
    console.error("[/api/scholarships/search]", message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}