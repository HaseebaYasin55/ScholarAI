"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { useAuthStore } from "@/store/authStore";
import { fetchScholarships } from "@/lib/scholarship/types";
import { matchScholarships } from "@/lib/scholarship/match";
import type { MatchPreferences } from "@/lib/scholarship/match";
import type { Scholarship } from "@/lib/scholarship/types";
import { useScholarshipResultsStore } from "@/store/scholarshipResultsStore";
import ScholarshipCard from "@/components/scholarships/ScholarshipCard";
import { verifiedOfficialUrl } from "@/features/application-tracking/scholarshipApps";

// Flagship programmes that should surface first when the catalog contains a
// real, verified row for them and the user's profile matches. These are never
// injected — if they are absent from the catalog they simply do not appear.
const PRIORITY_PROGRAMS = ["daad", "stipendium hungaricum", "erasmus mundus"];

function priorityRank(name: string): number {
  const n = name.toLowerCase();
  const rank = PRIORITY_PROGRAMS.findIndex((p) => n.includes(p));
  return rank === -1 ? PRIORITY_PROGRAMS.length : rank;
}

interface PreferencesRow {
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

function EmptyState({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
      <p className="text-[13px] font-medium text-gray-500">{title}</p>
      {lines.map((line, i) => (
        <p key={i} className="mt-1 text-xs text-gray-400">
          {line}
        </p>
      ))}
    </div>
  );
}

export default function RecommendationModules() {
  const { user } = useAuthStore();
  const setResults = useScholarshipResultsStore((s) => s.setResults);
  const [prefs, setPrefs] = useState<PreferencesRow | null>(null);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<Scholarship[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");

  useEffect(() => {
    if (!user) {
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;

    (async () => {
      const [prefsRes, schRes] = await Promise.all([
        supabase
          .from("preferences")
          .select("degree_levels, destinations, funding_preferences, tuition_preference, ielts_status, ielts_band, preferred_field, max_tuition_budget, needs_application_fee_waiver, open_to_multiple_countries")
          .eq("user_id", user.id)
          .maybeSingle(),
        // Recommend catalog rows that carry an official source URL. The
        // client-side `verifiedOfficialUrl` gate below then rejects blocked or
        // untrusted hosts, so real official rows are surfaced even when the
        // pipeline's verification timestamp is absent (or its column is missing).
        fetchScholarships(supabase, {
          limit: 60,
          filter: { hasOfficialUrl: true },
        }).catch((err) => {
          console.error("[recommendations] Catalog fetch failed:", err);
          return [];
        }),
      ]);

      if (cancelled) return;
      if (prefsRes.data) setPrefs(prefsRes.data as PreferencesRow);
      setScholarships(Array.isArray(schRes) ? schRes : []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Live discovery fallback — when the DB catalog is empty, actually search the
  // web using the user's preferences so the dashboard is never dead content.
  useEffect(() => {
    if (!user || loading || scholarships.length > 0) return;
    // Preferences may be missing (e.g. an incomplete row) — fall back to the
    // profile's major so real recommendations can still be discovered.
    const preferredField =
      prefs?.preferred_field?.trim() || user.major?.trim() || "";
    const destinations = prefs?.destinations ?? [];
    const degreeLevels = prefs?.degree_levels ?? [];
    if (!preferredField && destinations.length === 0 && degreeLevels.length === 0) {
      return;
    }

    // Defer state changes out of the synchronous effect body.
    const t = setTimeout(() => {
      setLiveLoading(true);
      setLiveError("");

      fetch("/api/scholarships/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: preferredField,
          // When we have a field to search on, let the client-side matcher rank
          // relevance instead of hard-filtering away real matches by the first
          // preferred country/degree. The API only needs country/degree when
          // there is no query at all.
          filters: preferredField
            ? {}
            : { country: destinations[0] ?? null, degreeLevels },
          limit: 3,
        }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((data: { results?: Scholarship[]; error?: string }) => {
          if (data.error) {
            setLiveError(data.error);
          } else if (data.results) {
            setLive(data.results);
            setResults(data.results, null);
          }
        })
        .catch(() => setLiveError("Live discovery failed."))
        .finally(() => setLiveLoading(false));
    }, 0);

    return () => clearTimeout(t);
  }, [user, loading, scholarships.length, prefs, setResults]);

  const matchPrefs: MatchPreferences = prefs
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

  // Client-side re-check on top of the server-side gates: anything without an
  // acceptable verified official URL is never recommended, period.
  const catalog = (scholarships.length > 0 ? scholarships : live).filter(
    (s) => verifiedOfficialUrl(s) !== null,
  );
  const liveActive = scholarships.length === 0 && live.length > 0;

  const matched = matchScholarships(
    catalog,
    { field_of_study: user?.major ?? "" },
    matchPrefs,
  );
  // Stable re-rank: flagship programmes first (only when they genuinely match),
  // then the existing transparent score order for everything else.
  const ranked = [...matched].sort(
    (a, b) => priorityRank(a.scholarship.name) - priorityRank(b.scholarship.name),
  );
  const topMatches = ranked.slice(0, 3);

  return (
    <div className="mb-8 space-y-6">
      {/* Recommended Scholarships */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-white">
              <BadgeCheck className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900">Recommended Scholarships</h3>
              <p className="text-xs text-gray-400">
                Ranked against your profile &amp; preferences
              </p>
            </div>
          </div>
          <Link
            href="/scholarships"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-gray-900 hover:underline"
          >
            Browse all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 rounded-2xl border border-gray-200 bg-gray-50 animate-pulse" />
            ))}
          </div>
        ) : scholarships.length === 0 ? (
          liveLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-44 rounded-2xl border border-gray-200 bg-gray-50 animate-pulse" />
              ))}
            </div>
          ) : liveError ? (
            <EmptyState
              title="Live discovery is temporarily unavailable."
              lines={[liveError, "Try the Discover page to search again."]}
            />
          ) : liveActive ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {topMatches.map((m) => (
                  <ScholarshipCard
                    key={m.scholarship.id}
                    scholarship={m.scholarship}
                    match={m}
                    cta="scholarship"
                  />
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-gray-400">
                Live discovery — matched from official sources just now. Profile Match is not an official eligibility decision.
              </p>
            </>
          ) : (
            <EmptyState
              title="Nothing in the scholarship catalog yet."
              lines={[
                "We looked for scholarships matching your profile but nothing could be matched right now.",
                "Try the Discover page with a search — or adjust your profile & preferences.",
              ]}
            />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {topMatches.map((m) => (
                <ScholarshipCard
                  key={m.scholarship.id}
                  scholarship={m.scholarship}
                  match={m}
                  cta="scholarship"
                />
              ))}
              {matched.length > 3 && (
                <Link
                  href="/scholarships"
                  className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 text-gray-400 transition-colors hover:border-gray-900 hover:text-gray-900"
                >
                  <span className="text-2xl font-bold text-gray-900">{matched.length - 3}+</span>
                  <span className="text-xs font-medium">more matches</span>
                </Link>
              )}
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-gray-400">
              Profile Match is a transparent fit estimate — not an official eligibility decision.
            </p>
          </>
        )}
      </section>
    </div>
  );
}