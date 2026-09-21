"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import {
  ArrowLeft,
  Calendar,
  Check,
  ExternalLink,
  Globe2,
  FileText,
  AlertTriangle,
  RefreshCw,
  MapPin,
} from "lucide-react";
import { supabase } from "@/lib/supabase-browser";
import { useRequireOnboarding } from "@/hooks/useRequireOnboarding";
import { getScholarshipById } from "@/lib/scholarship/types";
import type { Scholarship } from "@/lib/scholarship/types";
import { useScholarshipResultsStore } from "@/store/scholarshipResultsStore";
import { matchScholarship } from "@/lib/scholarship/match";
import type { MatchPreferences } from "@/lib/scholarship/match";
import { daysUntil, formatDate, formatLongDate } from "@/lib/scholarship/format";
import { scholarshipStatus } from "@/lib/scholarship/scholarship-status";
import StatusBadge from "@/components/scholarships/StatusBadge";
import AddToApplications from "@/features/application-tracking/AddToApplications";
import { verifiedOfficialUrl } from "@/features/application-tracking/scholarshipApps";
import { isOfficialApproved } from "@/features/application-tracking/scholarshipApps";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <h3 className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm not-last:border-b not-last:border-gray-100">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{String(value)}</span>
    </div>
  );
}

function DocumentChip({ doc }: { doc: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      {doc}
    </span>
  );
}

export default function ScholarshipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, user } = useRequireOnboarding();
  const [scholarship, setScholarship] = useState<Scholarship | null>(null);
  const [prefs, setPrefs] = useState<MatchPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const ephemeral = id.startsWith("web_");
      const storeHit = ephemeral
        ? useScholarshipResultsStore.getState().getById(id)
        : null;

      const prefsRes = await supabase
        .from("preferences")
        .select("degree_levels, destinations, funding_preferences, tuition_preference, ielts_status, ielts_band, preferred_field, max_tuition_budget, needs_application_fee_waiver, open_to_multiple_countries")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (cancelled) return;
      if (prefsRes.data) {
        const d = prefsRes.data;
        setPrefs({
          degree_levels: d.degree_levels ?? [],
          destinations: d.destinations ?? [],
          funding_preferences: d.funding_preferences ?? [],
          preferred_field: d.preferred_field,
          tuition_preference: d.tuition_preference,
          max_tuition_budget: d.max_tuition_budget,
          ielts_status: d.ielts_status,
          ielts_band: d.ielts_band,
          needs_application_fee_waiver: d.needs_application_fee_waiver ?? false,
          open_to_multiple_countries: d.open_to_multiple_countries ?? true,
        });
      }

      let found = storeHit
        ? storeHit
        : await getScholarshipById(supabase, id).catch(() => null);

      // Catalog rows must clear the official-source gate: a persisted scholarship
      // with no acceptable official URL (blocked/aggregator/unverified) is not
      // worth opening — treat it as not found like any other stale record.
      if (found && !ephemeral && verifiedOfficialUrl(found) === null) {
        found = null;
      }

      if (cancelled) return;
      setScholarship(found);
      if (!found) {
        setError(
          ephemeral
            ? "This live result has expired — run the search again to re-discover it."
            : "Scholarship not found.",
        );
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ready, id, user]);

  const matchPrefs = useMemo<MatchPreferences>(
    () => prefs ?? { degree_levels: [], destinations: [], funding_preferences: [], open_to_multiple_countries: true },
    [prefs],
  );

  const match = useMemo(
    () => (scholarship ? matchScholarship(scholarship, { field_of_study: user?.major ?? "" }, matchPrefs) : null),
    [scholarship, user?.major, matchPrefs],
  );

  if (loading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (error || !scholarship) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-3xl px-6 py-10">
          <Link href="/scholarships" className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> All scholarships
          </Link>
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-gray-600">{error || "Scholarship not found."}</p>
            <Link href="/scholarships" className="mt-3 inline-block text-[13px] font-semibold text-gray-900 hover:underline">
              Browse all scholarships
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const s = scholarship;
  const officialUrl = verifiedOfficialUrl(s);
  const official = isOfficialApproved(s);
  const daysToDeadline = daysUntil(s.deadline);

  // Unified current-status derivation: verifier verdict first, then
  // deadline/opening-date heuristics ("Deadline not announced" never guesses).
  const status = scholarshipStatus(s);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/scholarships" className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> All scholarships
        </Link>

        {/* Header */}
        <header className="mb-6">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
            <MapPin className="h-3.5 w-3.5" /> {s.country ?? "—"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{s.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{s.university ?? "—"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {official && (
              <span
                title="Verified against the authoritative official source"
                className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-0.5 text-[11px] font-semibold tracking-tight text-white"
              >
                <Check className="h-3 w-3" />
                Official
              </span>
            )}
<StatusBadge status={status} />
            {id.startsWith("web_") && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-gray-400">
                <RefreshCw className="h-3 w-3" />
                Live discovery result
              </span>
            )}
          </div>
        </header>

        {/* Deadline banner */}
        {s.deadline && (
          <div className="mb-6 flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Calendar className="h-8 w-8 shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                Deadline
              </p>
              <p className="text-base font-bold text-gray-900">
                {formatLongDate(s.deadline)}
              </p>
            </div>
            <div
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                daysToDeadline !== null && daysToDeadline < 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : daysToDeadline !== null && daysToDeadline <= 14
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-gray-200 bg-gray-50 text-gray-700"
              }`}
            >
              {daysToDeadline === null
                ? "—"
                : daysToDeadline < 0
                  ? "Deadline passed"
                  : daysToDeadline === 0
                    ? "Due today"
                    : daysToDeadline === 1
                      ? "1 day remaining"
                      : `${daysToDeadline} days remaining`}
            </div>
          </div>
        )}

        {/* Official Page */}
        {officialUrl && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Globe2 className="h-8 w-8 shrink-0 text-gray-400" />
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                  Official Page
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {s.university ?? s.name}
                </p>
              </div>
            </div>
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-900/15 bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800"
            >
              Open Official Website
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}

        {/* Add to my applications */}
        <div className="mb-6">
          <AddToApplications scholarship={s} />
        </div>

        {/* Profile Match */}
        {match && (
          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold tabular-nums text-gray-900">{match.score}%</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Profile Match</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gray-400">
                    Transparent fit estimate
                  </p>
                </div>
              </div>
              {match.missing.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                  <AlertTriangle className="h-3 w-3 text-gray-400" />
                  {match.missing.length} item{match.missing.length > 1 ? "s" : ""} to confirm
                </span>
              )}
            </div>
            {match.reasons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {match.reasons.map((r) => (
                  <span key={r} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">{r}</span>
                ))}
              </div>
            )}
            {match.missing.length > 0 && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-[13px] leading-relaxed text-gray-600">
                <p className="mb-1 font-semibold text-gray-700">Confirm before applying</p>
                <ul className="list-disc pl-5 space-y-0.5 text-gray-500">
                  {match.missing.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-3 font-mono text-[10px] text-gray-400">
              Profile Match is NOT an official eligibility decision — always verify with the official provider.
            </p>
          </section>
        )}

        <div className="space-y-5">
          {/* Requirements */}
          {(s.requiredDocuments.length > 0 || s.ieltsRequirement) && (
            <Section title="Requirements">
              {s.ieltsRequirement && <Row label="IELTS / English" value={s.ieltsRequirement} />}
              {s.requiredDocuments.length > 0 && (
                <div className="mt-2">
                  <p className="mb-2 text-sm text-gray-500">Required documents</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.requiredDocuments.map((doc) => <DocumentChip key={doc} doc={doc} />)}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Deadline */}
          <Section title="Deadline">
            <div className="flex items-center gap-4">
              <Calendar className="h-10 w-10 text-gray-400" />
              <div>
                <p className="text-xl font-bold text-gray-900">{formatDate(s.deadline)}</p>
                <p className="text-xs text-gray-400">Application deadline</p>
              </div>
            </div>
          </Section>

          {/* Source / freshness */}
          <Section title="Source &amp; freshness">
            <div className="space-y-2 text-[13px] text-gray-600">
              {s.sourceUrl && (
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-gray-900"
                >
                  <FileText className="h-3.5 w-3.5" /> Source page
                </a>
              )}
              <p className="flex items-center gap-1.5 text-gray-500">
                <RefreshCw className="h-3.5 w-3.5" />
                Last updated {formatDate(s.lastUpdated)}
              </p>
              <p className="text-xs text-gray-400">
                Data is sourced from official university and government scholarship pages by our discovery pipeline.
                Always verify details on the official application page.
              </p>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}