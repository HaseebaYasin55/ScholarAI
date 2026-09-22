"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { useRequireOnboarding } from "@/hooks/useRequireOnboarding";
import { matchScholarships } from "@/lib/scholarship/match";
import type { MatchPreferences } from "@/lib/scholarship/match";
import type { Scholarship } from "@/lib/scholarship/types";
import type {
  ScholarshipSearchResponse,
  SearchMeta,
  IntentInfo,
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
  "Fully funded Master's in Germany",
  "DAAD scholarships",
  "Fulbright program in the USA",
  "University of Melbourne scholarships",
];

/** A human-readable "what the search understood" line from the intent. */
function interpretingLine(i: IntentInfo | null, query: string): string | null {
  if (!i) return null;
  if (i.mode === "name" && i.namedScholarship) {
    return `Looking up "${i.namedScholarship}" from official sources.`;
  }
  if (i.mode !== "general") return null;
  const parts: string[] = [];
  if (i.displayField) parts.push(i.displayField);
  if (i.country) parts.push(i.country);
  if (i.degreeLevels.length) parts.push(i.degreeLevels.join(", "));
  if (i.funding) parts.push(i.funding);
  if (i.relatedFields.length) {
    return `Focused on ${parts.join(" · ") || `"${query}"`} — also checking related fields: ${i.relatedFields.join(", ")}.`;
  }
  return parts.length ? `Interpreting "${query}" as: ${parts.join(" · ")}.` : null;
}

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

async function runSearchRequest(
  payload: {
    query: string;
    filters: Record<string, unknown>;
    limit?: number;
    refresh?: boolean;
    citizenship?: string | null;
  },
  signal?: AbortSignal,
): Promise<ScholarshipSearchResponse> {
  const res = await fetch("/api/scholarships/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
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
  verifiedOfficial: 0,
  rejected: [],
  intent: null,
  errors: [],
  fromCache: false,
  transientFailure: false,
};

type FilterKey = "country" | "degree" | "field" | "funding" | "type";

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Client-side request control: identical payloads that are already running
  // are deduplicated (never fire a duplicate network call), a new search
  // cancels the previous in-flight one, and stale/aborted responses are
  // ignored so a superseded request can never repaint the results.
  const activeRequest = useRef<{ key: string; controller: AbortController } | null>(null);
  const requestSeq = useRef(0);

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

      // The profile `country` is the user's citizenship — the pipeline uses
      // it to filter scholarships whose official source explicitly excludes
      // that nationality.
      const citizenship = user?.country?.trim() || null;
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
        citizenship,
      };
      const dedupeKey = JSON.stringify(payload);

      // The exact same search is already running → do not launch a duplicate.
      if (activeRequest.current?.key === dedupeKey) return;

      const seq = ++requestSeq.current;
      activeRequest.current?.controller?.abort();
      const controller = new AbortController();
      activeRequest.current = { key: dedupeKey, controller };

      try {
        const res = await runSearchRequest(payload, controller.signal);
        if (seq !== requestSeq.current) return;
        setScholarships(res.results);
        setMeta(res.meta);
        setResults(res.results, res.meta);
      } catch (err) {
        // Superseded or aborted request — never paint its failure.
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Search failed.");
        setScholarships([]);
        setMeta(EMPTY_META);
      } finally {
        if (seq === requestSeq.current) {
          if (!opts.silent) setLoading(false);
        }
        if (activeRequest.current?.controller === controller) {
          activeRequest.current = null;
        }
      }
    },
    [setResults, user],
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
  const transientOutage = !loading && !error && meta?.transientFailure === true;

  // Selected filters as removable chips (labels, not raw codes).
  const fundingLabel =
    FUNDING_TYPES.find((f) => f.value === funding)?.label ?? funding;
  const typeLabel =
    SCHOLARSHIP_TYPES.find((t) => t.value === scholarshipType)?.label ??
    scholarshipType;
  const selectedFilters = [
    { key: "country" as FilterKey, value: country },
    { key: "degree" as FilterKey, value: degree },
    { key: "field" as FilterKey, value: field },
    { key: "funding" as FilterKey, value: fundingLabel },
    { key: "type" as FilterKey, value: typeLabel },
  ].filter((f) => f.value !== "");
  const activeCount = selectedFilters.length;

  const clearFilter = (key: FilterKey) => {
    if (key === "country") setCountry("");
    else if (key === "degree") setDegree("");
    else if (key === "field") setField("");
    else if (key === "funding") setFunding("");
    else if (key === "type") setScholarshipType("");
  };

  const clearAllFilters = () => {
    setCountry("");
    setDegree("");
    setField("");
    setFunding("");
    setScholarshipType("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <div className="mb-8 max-w-2xl sm:mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Discover scholarships
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Find real scholarships from official sources.
          </p>
        </div>

        {/* Search panel */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)] sm:p-6">
          {/* Search row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={submit}
                disabled={loading || !hasCriteria}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),0_10px_18px_-12px_rgba(0,0,0,0.5)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_14px_24px_-12px_rgba(0,0,0,0.45)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                {loading ? "Searching" : "Search"}
              </button>
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
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                Use my profile
              </button>
            </div>
          </div>

          {/* Filters toggle + selected chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
                filtersOpen
                  ? "border-gray-900 bg-gray-900 text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_16px_-12px_rgba(0,0,0,0.5)]"
                  : "border-gray-300 bg-white text-gray-700 hover:-translate-y-0.5 hover:border-gray-900 hover:text-gray-900"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    filtersOpen
                      ? "bg-white text-gray-900"
                      : "bg-gray-900 text-white"
                  }`}
                >
                  {activeCount}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}
              />
            </button>

            {selectedFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => clearFilter(f.key)}
                title={`Remove ${f.value}`}
                className="group inline-flex items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-gray-800"
              >
                <span className="max-w-[10rem] truncate">{f.value}</span>
                <X className="h-3 w-3 opacity-70 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>

          {/* Filters drawer */}
          {filtersOpen && (
            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Filter scholarships
                </p>
                {activeCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-900 hover:decoration-gray-900"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <FilterSelect
                  label="Country"
                  value={country}
                  onChange={(v) => setCountry(v)}
                  options={[
                    { value: "", label: "Any country" },
                    ...DESTINATIONS.map((c) => ({ value: c, label: c })),
                  ]}
                />
                <FilterSelect
                  label="Degree"
                  value={degree}
                  onChange={(v) => setDegree(v)}
                  options={[
                    { value: "", label: "Any degree" },
                    ...DEGREES.map((d) => ({ value: d, label: d })),
                  ]}
                />
                <FilterSelect
                  label="Field"
                  value={field}
                  onChange={(v) => setField(v)}
                  options={[
                    { value: "", label: "Any field" },
                    ...FIELDS.map((f) => ({ value: f, label: f })),
                  ]}
                />
                <FilterSelect
                  label="Funding"
                  value={funding}
                  onChange={(v) => setFunding(v)}
                  options={FUNDING_TYPES}
                />
                <FilterSelect
                  label="Type"
                  value={scholarshipType}
                  onChange={(v) => setScholarshipType(v)}
                  options={SCHOLARSHIP_TYPES}
                />
              </div>
            </div>
          )}

          {/* Popular searches */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
              Popular
            </span>
            {SAMPLE_QUERIES.slice(0, 5).map((sq) => (
              <button
                key={sq}
                onClick={() => fillAndSearch({ query: sq })}
                disabled={loading}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-900 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sq}
              </button>
            ))}
          </div>
        </section>

        {/* Loading */}
        {loading ? (
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-52 animate-pulse rounded-2xl border border-gray-200 bg-gray-100"
              />
            ))}
          </div>
        ) : error ? (
          /* Error state */
          <div className="mx-auto mt-20 max-w-md text-center">
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
        ) : transientOutage ? (
          /* Upstream web-search provider is temporarily unavailable */
          <div className="mx-auto mt-20 max-w-md text-center">
            <p className="text-sm font-medium text-gray-900">
              Web search is temporarily unavailable.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
              {meta?.errors?.[0] ??
                "The search provider is rate limiting us right now. This is temporary — wait a moment and try again."}
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
          /* Calm prompt state — nothing searched yet */
          <div className="mt-24 flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-400 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-24px_rgba(0,0,0,0.2)]">
              <Search className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[13px] text-gray-400">
              Verified scholarships from official sources.
            </p>
          </div>
        ) : searchedWithNoResults ? (
          /* Ran but nothing matched — smart, helpful empty state */
          <div className="mx-auto mt-16 max-w-md text-center">
            {meta?.intent?.mode === "name" && meta.intent.namedScholarship ? (
              <>
                <p className="text-sm font-medium text-gray-900">
                  No verified scholarships found for &ldquo;{meta.intent.namedScholarship}&rdquo; right now.
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
                  It may be late for the current cycle or applications may not
                  be open yet. Try again when it opens, or browse a related
                  programme below — every result is checked against its
                  official source.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900">
                  No verified scholarships found for this search right now.
                </p>
                {meta?.intent?.displayField ? (
                  <p className="mt-1 text-[13px] text-gray-500">
                    Searched broadly for {meta.intent.displayField} across
                    official university, government and organization sources.
                  </p>
                ) : null}
                {meta?.intent?.relatedFields?.length ? (
                  <>
                    <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
                      Try a broader related field:
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {meta.intent.relatedFields.map((rf) => (
                        <button
                          key={rf}
                          onClick={() => fillAndSearch({ query: rf, field: "" })}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 transition-colors hover:border-gray-900 hover:text-gray-900"
                        >
                          {rf}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
                    Try a simpler query or fewer filters.
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Results — clear separation from the search area */}
            <div className="mt-10 border-t border-gray-200 pt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  {matched.length}{" "}
                  {matched.length === 1 ? "scholarship" : "scholarships"}
                </h2>
                <div className="flex flex-wrap items-center gap-3">
                  {meta && (
                    <p className="text-[11px] text-gray-400">
                      {meta.sourceCount} source
                      {meta.sourceCount === 1 ? "" : "s"}
                      {meta.fetched > 0 ? ` · ${meta.fetched} read` : ""}
                      {meta.verifiedOfficial > 0
                        ? ` · ${meta.verifiedOfficial} official verified`
                        : ""}
                      {meta.errors.length > 0
                        ? ` · ${meta.errors.length} skipped`
                        : ""}
                      {meta.fromCache ? " · cached" : ""}
                    </p>
                  )}
                  <button
                    onClick={refresh}
                    title="Run this search again, live"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 transition-colors hover:border-gray-900 hover:text-gray-900"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>
                </div>
              </div>

              {meta?.intent ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
                  {interpretingLine(meta.intent, meta.query)}
                </p>
              ) : null}

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {matched.map((m) => (
                  <ScholarshipCard
                    key={m.scholarship.id}
                    scholarship={m.scholarship}
                    match={m}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}