"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ExternalLink,
  GraduationCap,
  Search,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { displayStatus, appStatusPillClass } from "./status";
import { daysUntil, formatLongDate } from "@/lib/scholarship/format";
import {
  applicationJourneyUrl,
  applicationLink,
  UNSELECTED_PROGRAM,
} from "./scholarshipApps";

/**
 * Dashboard overview of every tracked application as an interactive card.
 * Everything renders from the live application rows — name, organization,
 * country, program, status, progress and deadline are never hardcoded.
 */
export default function ApplicationCards() {
  const { applications } = useAppStore();

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 p-6">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900">My Scholarship Applications</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Track each application from preparation to submission.
          </p>
        </div>
        <Link
          href="/applications"
          className="shrink-0 text-sm font-semibold text-gray-900 hover:underline"
        >
          View All
        </Link>
      </div>

      <div className="p-6">
        {applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-10 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400">
              <GraduationCap className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm font-semibold text-gray-900">
              No applications yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-gray-500">
              Open a scholarship and press{" "}
              <span className="font-semibold text-gray-900">
                &quot;I want to apply&quot;
              </span>{" "}
              to track it here.
            </p>
            <Link
              href="/scholarships"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 active:bg-gray-950"
            >
              <Search className="h-3.5 w-3.5" />
              Discover scholarships
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {applications.map((app) => {
              const programSelected = Boolean(
                app.program &&
                  app.program.trim() !== "" &&
                  app.program !== UNSELECTED_PROGRAM,
              );
              const progress = Math.max(0, Math.min(100, app.progress ?? 0));
              const days = daysUntil(app.deadline);
              const deadlinePassed = days !== null && days < 0;

              return (
                <article
                  key={app.id}
                  className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_16px_34px_-24px_rgba(0,0,0,0.45)] active:translate-y-0"
                >
                  {/* Name · organization · country · status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={applicationLink(app)}
                        className="block truncate text-[15px] font-semibold tracking-tight text-gray-900 hover:underline"
                      >
                        {app.university}
                      </Link>
                      <p className="mt-1 truncate text-[12px] text-gray-500">
                        {[app.organization, app.country]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${appStatusPillClass(app.status)}`}
                    >
                      {displayStatus(app.status)}
                    </span>
                  </div>

                  {/* Program */}
                  <div className="mt-4 flex items-center gap-2">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    {programSelected ? (
                      <p className="truncate text-[13px] font-medium text-gray-700">
                        {app.program}
                      </p>
                    ) : (
                      <p className="truncate text-[13px] italic text-gray-400">
                        Program not selected
                      </p>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">
                        Progress
                      </span>
                      <span className="text-xs font-semibold text-gray-700">
                        {progress}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gray-900 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Deadline */}
                  <div className="mt-4 flex items-center gap-1.5 text-[13px]">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="truncate text-gray-600">
                      {formatLongDate(app.deadline)}
                    </span>
                    {deadlinePassed ? (
                      <span className="shrink-0 text-[11px] font-medium text-gray-500">
                        · Passed
                      </span>
                    ) : days !== null ? (
                      <span className="shrink-0 text-[11px] text-gray-400">
                        ·{" "}
                        {days === 0
                          ? "today"
                          : `${days} day${days === 1 ? "" : "s"} left`}
                      </span>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
                    {app.official_url ? (
                      <a
                        href={app.official_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Official page
                      </a>
                    ) : (
                      <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-300">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Official page
                      </span>
                    )}
                    <Link
                      href={applicationJourneyUrl(app)}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-gray-800 active:bg-gray-950"
                    >
                      Continue application
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
