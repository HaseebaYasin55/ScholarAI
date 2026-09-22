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

// Layered elevation: a crisp contact shadow plus a wider diffusible one. Cards
// rise slightly on hover and press back down on click — no flashes, no glows.
const CARD_ELEVATION =
  "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-22px_rgba(0,0,0,0.28)]";
const CARD_ELEVATION_HOVER =
  "hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_22px_44px_-24px_rgba(0,0,0,0.4)]";
const BTN_PRIMARY_ELEVATION =
  "shadow-[0_1px_2px_rgba(36,60,76,0.4),0_10px_18px_-12px_rgba(62,110,146,0.55)] hover:shadow-[0_1px_2px_rgba(36,60,76,0.4),0_14px_24px_-12px_rgba(62,110,146,0.5)]";
const EMPTY_ELEVATION =
  "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-24px_rgba(0,0,0,0.25)]";

/**
 * Dashboard overview of every tracked application as an interactive card.
 * Everything renders from the live application rows — name, organization,
 * country, program, status, progress and deadline are never hardcoded.
 */
export default function ApplicationCards() {
  const { applications } = useAppStore();

  return (
    <section>
      {/* Section header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400">
            Preparation → submission
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
            My Scholarship Applications
          </h3>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Pick up where you left off, or open the official page to apply.
          </p>
        </div>
        <Link
          href="/applications"
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_16px_-12px_rgba(0,0,0,0.2)] transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-900 hover:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_20px_-12px_rgba(0,0,0,0.25)] active:translate-y-0"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {applications.length === 0 ? (
        <div
          className={`rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center ${EMPTY_ELEVATION}`}
        >
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-500 shadow-chip">
            <GraduationCap className="h-5 w-5" />
          </span>
          <p className="mt-4 text-[15px] font-bold tracking-tight text-gray-900">
            No applications yet
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-gray-500">
            Open a scholarship and press{" "}
            <span className="font-semibold text-gray-900">
              &quot;I want to apply&quot;
            </span>{" "}
            to track it here.
          </p>
          <Link
            href="/scholarships"
            className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary-deep px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(36,60,76,0.4),0_10px_18px_-12px_rgba(62,110,146,0.55)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-ink hover:shadow-[0_1px_2px_rgba(36,60,76,0.4),0_14px_24px_-12px_rgba(62,110,146,0.5)] active:translate-y-0"
          >
            <Search className="h-4 w-4" />
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
            const urgent = days !== null && days >= 0 && days <= 7;

            return (
              <article
                key={app.id}
                className={`group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-150 hover:-translate-y-1 hover:border-gray-300 active:translate-y-0 ${CARD_ELEVATION} ${CARD_ELEVATION_HOVER}`}
              >
                {/* Scholarship · organization · country · status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={applicationLink(app)}
                      className="block truncate text-[15px] font-bold tracking-tight text-gray-900 hover:underline"
                      title={app.university}
                    >
                      {app.university}
                    </Link>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-gray-500">
                      <span className="truncate">
                        {[app.organization, app.country]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${appStatusPillClass(app.status)}`}
                  >
                    {displayStatus(app.status)}
                  </span>
                </div>

                {/* Program + deadline in a layered detail panel */}
                <div className="mt-4 space-y-2.5 rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    {programSelected ? (
                      <p
                        className="min-w-0 truncate text-[13px] font-medium text-gray-800"
                        title={app.program}
                      >
                        {app.program}
                      </p>
                    ) : (
                      <p className="min-w-0 text-[13px] text-gray-400">
                        Program not selected
                      </p>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    {app.deadline ? (
                      <p className="min-w-0 truncate text-[13px] font-medium text-gray-800">
                        {formatLongDate(app.deadline)}
                      </p>
                    ) : (
                      <p className="min-w-0 text-[13px] text-gray-400">
                        No deadline set
                      </p>
                    )}
                    {deadlinePassed ? (
                      <span className="shrink-0 text-[11px] font-medium text-gray-500">
                        Passed
                      </span>
                    ) : days !== null ? (
                      <span
                        className={`shrink-0 text-[11px] ${
                          urgent
                            ? "font-bold text-gray-900"
                            : "font-medium text-gray-400"
                        }`}
                      >
                        {days === 0
                          ? "Due today"
                          : `${days} day${days === 1 ? "" : "s"} left`}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-gray-500">Progress</span>
                    <span className="font-semibold tabular-nums text-gray-900">
                      {progress}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                    <div
                      className="h-full rounded-full bg-primary-deep transition-[width] duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Actions — primary action highlighted */}
                <div className="mt-auto pt-5">
                  <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                    {app.official_url ? (
                      <a
                        href={app.official_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the official page in a new tab"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-900 hover:text-gray-900 active:translate-y-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Official page
                      </a>
                    ) : (
                      <span
                        aria-disabled
                        title="No official link available yet"
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-400"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Official page
                      </span>
                    )}
                    <Link
                      href={applicationJourneyUrl(app)}
                      className={`ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary-deep px-4 py-2 text-[12px] font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-ink active:translate-y-0 ${BTN_PRIMARY_ELEVATION}`}
                    >
                      Continue application
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}