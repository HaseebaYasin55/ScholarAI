"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { useRequireOnboarding } from "@/hooks/useRequireOnboarding";
import { matchScholarships } from "@/lib/scholarship/match";
import type { MatchPreferences } from "@/lib/scholarship/match";
import type { Scholarship } from "@/lib/scholarship/types";
import type {
  ScholarshipSearchResponse,
  SearchMeta,
} from "@/lib/scholarship/api-types";
import ScholarshipCard from "@/components/scholarships/ScholarshipCard";
import Header from "@/components/Header";
import { useScholarshipResultsStore } from "@/store/scholarshipResultsStore";
import { DESTINATIONS } from "@/features/onboarding/data";

const DEGREES = ["Bachelor", "Master", "PhD"];

const FIELDS = [
  "Computer Science",
  "Engineering",
  "Business",
  "Medicine",
  "Law",
  "Social Sciences",
  "Natural Sciences",
  "Arts & Humanities",
  "Data Science",
  "Environmental Science",
];

const FUNDING_TYPES = [
  { value: "", label: "Any funding" },
  { value: "fully_funded", label: "Fully funded" },
  { value: "partially_funded", label: "Partially funded" },
  { value: "tuition_fee_waiver", label: "Tuition fee waiver" },
];

const SCHOLARSHIP_TYPES = [
  { value: "", label: "Any type" },
  { value: "merit-based", label: "Merit-based" },
  { value: "need-based", label: "Need-based" },
  { value: "international", label: "For international students" },
  { value: "women", label: "For women" },
  { value: "country-specific", label: "Country-specific" },
];

const SAMPLE_QUERIES = [
  "Computer Engineering scholarships",
  "Fully funded scholarships in Germany",
  "DAAD scholarships",
  "University of Melbourne scholarships",
  "Scholarships for Master's in AI",
];

interface PrefsRow {
  degree_levels: string[];
  destinations: string[];
  funding_preferences: string[];
  tuition_preference: string | null;
  ielts_status: string | null;
  ielts_band: number | null;
  preferred_field: string | null;
  max_tuition_budget: number | null;
  needs_application_fee_waiver: boolean;
  open_to_multiple_countries: boolean;
}

function toMatchPrefs(prefs: PrefsRow | null): MatchPreferences {
  return prefs
    ? {
        degree_levels: prefs.degree_levels ?? [],
        destinations: prefs.destinations ?? [],
        funding_preferences: prefs.funding_preferences ?? [],
        preferred_field: prefs.preferred_field,
        tuition_preference: prefs.tuition_preference,
        max_tuition_budget: prefs.max_tuition_budget,
        ielts_status: prefs.ielts_status,
        ielts_band: prefs.ielts_band,
        needs_application_fee_waiver: prefs.needs_application_fee_waiver ?? false,
        open_to_multiple_countries: prefs.open_to_multiple_countries ?? true,
      }
    : {
        degree_levels: [],
        destinations: [],
        funding_preferences: [],
        open_to_multiple_countries: true,
      };
}

async function runSearchRequest(payload: {
  query: string;
  filters: Record<string, unknown>;
  limit?: number;
  refresh?: boolean;
}): Promise<ScholarshipSearchResponse> {
  const res = await fetch("/api/scholarships/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Web search failed.",
    );
  }
  return data as ScholarshipSearchResponse;
}

const EMPTY_META: SearchMeta = {
  query: "",
  webQuery: "",
  searchedAt: "",
  sourceCount: 0,
  fetched: 0,
  extracted: 0,
  errors: [],
  fromCache: false,
};

export default function ScholarshipsPage() {
  const { user } = useRequireOnboarding();
  const setResults = useScholarshipResultsStore((s) => s.setResults);

  const [prefs, setPrefs] = useState<PrefsRow | null>(null);

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [degree, setDegree] = useState("");
  const [field, setField] = useState("");
  const [funding, setFunding] = useState("");
  const [scholarshipType, setScholarshipType] = useState("");

  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load preferences (used only for ranking/clarifying matches, never as a
  // default search query).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("preferences")
          .select("degree_levels, destinations, funding_preferences, tuition_preference, ielts_status, ielts_band, preferred_field, max_tuition_budget, needs_application_fee_waiver, open_to_multiple_countries")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data) setPrefs(data as PrefsRow);
      } catch {
        // best-effort — matching simply falls back to the query alone
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const hasCriteria = Boolean(query.trim() || country || degree || field || funding || scholarshipType);

  const searchNow = useCallback(
    async (opts: {
      q: string;
      c: string;
      d: string;
      f: string;
      fu: string;
      st: string;
      refresh: boolean;
      silent?: boolean;
    }) => {
      if (!opts.silent) setLoading(true);
      setError("");
      try {
        const payload = {
          query: opts.q,
          filters: {
            country: opts.c || null,
            degreeLevels: opts.d ? [opts.d] : [],
            field: opts.f || null,
            funding: opts.fu || null,
            scholarshipType: opts.st || null,
          },
          limit: 12,
          refresh: opts.refresh,
        };
        const res = await runSearchRequest(payload);
        setScholarships(res.results);
        setMeta(res.meta);
        setResults(res.results, res.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed.");
        setScholarships([]);
        setMeta(EMPTY_META);
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [setResults],
  );

  const fillAndSearch = useCallback(
    (overrides: {
      query?: string;
      country?: string;
      degree?: string;
      field?: string;
      funding?: string;
      scholarshipType?: string;
    }) => {
      const q = overrides.query ?? query;
      const c = overrides.country ?? country;
      const d = overrides.degree ?? degree;
      const f = overrides.field ?? field;
      const fu = overrides.funding ?? funding;
      const st = overrides.scholarshipType ?? scholarshipType;
      setQuery(q);
      setCountry(c);
      setDegree(d);
      setField(f);
      setFunding(fu);
      setScholarshipType(st);
      void searchNow({ q, c, d, f, fu, st, refresh: false });
    },
    [query, country, degree, field, funding, scholarshipType, searchNow],
  );

  const submit = () => {
    searchNow({
      q: query.trim(),
      c: country,
      d: degree,
      f: field,
      fu: funding,
      st: scholarshipType,
      refresh: false,
    });
  };

  const refresh = () => {
    searchNow({
      q: query.trim(),
      c: country,
      d: degree,
      f: field,
      fu: funding,
      st: scholarshipType,
      refresh: true,
    });
  };

  const matchPrefs = useMemo(() => toMatchPrefs(prefs), [prefs]);

  const matched = useMemo(
    () =>
      matchScholarships(
        scholarships,
        { field_of_study: user?.major ?? "" },
        matchPrefs,
      ),
    [scholarships, user?.major, matchPrefs],
  );

  const neverSearched = !loading && !error && matched.length === 0 && meta === null;
  const searchedWithNoResults =
    !loading && !error && matched.length === 0 && meta !== null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Discover scholarships
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
            Find real scholarships from official sources across the web.
          </p>
        </div>

        {/* Search */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  placeholder="Search by field, scholarship name, university, or country..."
                  className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-3 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5"
                />
              </div>
              <button
                onClick={submit}
                disabled={loading || !hasCriteria}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                {loading ? "Searching" : "Search"}
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700 outline-none transition-colors focus:border-gray-900"
              >
                <option value="">Any country</option>
                {DESTINATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700 outline-none transition-colors focus:border-gray-900"
              >
                <option value="">Any degree</option>
                {DEGREES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700 outline-none transition-colors focus:border-gray-900"
              >
                <option value="">Any field</option>
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                value={funding}
                onChange={(e) => setFunding(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700 outline-none transition-colors focus:border-gray-900"
              >
                {FUNDING_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={scholarshipType}
                onChange={(e) => setScholarshipType(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700 outline-none transition-colors focus:border-gray-900"
              >
                {SCHOLARSHIP_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() =>
                  fillAndSearch({
                    query:
                      prefs?.preferred_field?.trim() ||
                      user?.major?.trim() ||
                      "",
                    country: prefs?.destinations?.[0] ?? "",
                    degree: prefs?.degree_levels?.[0] ?? "",
                    funding:
                      (prefs?.funding_preferences ?? []).find(
                        (v) => v !== "any",
                      ) ?? "",
                  })
                }
                disabled={loading}
                className="ml-auto inline-flex items-center gap-1.5 px-2 py-2 text-[13px] font-medium text-gray-400 transition-colors hover:text-gray-900 disabled:opacity-40"
              >
                Use my profile
              </button>
            </div>

            {/* Suggestions */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-gray-400">Try:</span>
              {SAMPLE_QUERIES.map((sq) => (
                <button
                  key={sq}
                  onClick={() => fillAndSearch({ query: sq })}
                  disabled={loading}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 transition-colors hover:border-gray-900 hover:text-gray-900 disabled:opacity-40"
                >
                  {sq}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-52 animate-pulse rounded-2xl border border-gray-200 bg-gray-100"
              />
            ))}
          </div>
        ) : error ? (
          /* Error state */
          <div className="mx-auto mt-16 max-w-md text-center">
            <p className="text-sm font-medium text-gray-900">
              We couldn&apos;t complete that search.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
              {error}
            </p>
            <button
              onClick={submit}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : neverSearched ? (
          /* Prompt state — nothing searched yet */
          <div className="mx-auto mt-16 max-w-md text-center">
            <p className="text-sm leading-relaxed text-gray-500">
              Type a field, country, university, or scholarship name, then
              press Search.
            </p>
          </div>
        ) : searchedWithNoResults ? (
          /* Ran but nothing matched */
          <div className="mx-auto mt-16 max-w-md text-center">
            <p className="text-sm font-medium text-gray-900">
              No scholarships found.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
              Try a simpler query or fewer filters.
            </p>
          </div>
        ) : (
          <>
            {/* Results */}
            <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                {matched.length}{" "}
                {matched.length === 1 ? "scholarship" : "scholarships"}
              </h2>
              <div className="flex items-center gap-4">
                {meta && (
                  <p className="text-[11px] text-gray-400">
                    {meta.sourceCount} source
                    {meta.sourceCount === 1 ? "" : "s"}
                    {meta.fetched > 0 ? ` · ${meta.fetched} read` : ""}
                    {meta.extracted > 0 ? ` · ${meta.extracted} structured` : ""}
                    {meta.errors.length > 0
                      ? ` · ${meta.errors.length} skipped`
                      : ""}
                    {meta.fromCache ? " · cached" : ""}
                  </p>
                )}
                <button
                  onClick={refresh}
                  title="Run this search again, live"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-900"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {matched.map((m) => (
                <ScholarshipCard
                  key={m.scholarship.id}
                  scholarship={m.scholarship}
                  match={m}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}