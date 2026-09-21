"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { Scholarship } from "@/lib/scholarship/types";
import {
  applicationForScholarship,
  applicationPayloadFromScholarship,
  UNSELECTED_PROGRAM,
} from "./scholarshipApps";
import { appStatusPillClass, displayStatus } from "./status";

// Supabase errors are plain objects (PostgrestError), NOT `Error` instances —
// an `instanceof Error` check swallows the real message and leaves the UI
// stuck on a generic "Could not add the application.".
function apiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) return `Request failed (${code}).`;
  }
  return "Could not add the application.";
}

export default function AddToApplications({
  scholarship,
}: {
  scholarship: Scholarship;
}) {
  const { applications, addApplication } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState("");

  const existing = applicationForScholarship(applications, scholarship);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    setError("");
    try {
      await addApplication(
        applicationPayloadFromScholarship(scholarship, UNSELECTED_PROGRAM),
      );
      setJustAdded(true);
    } catch (err) {
      // Log the REAL Supabase error (code/message/details) so it is visible
      // in the browser console during development; the UI shows it too.
      console.error("[AddToApplications] addApplication failed:", err);
      setError(apiErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  if (existing || justAdded) {
    const status = existing?.status ?? "Interested";
    const label = justAdded
      ? "Added to My Scholarships"
      : "Already added to My Scholarships";
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="mt-1 text-xs text-gray-500">
                Status:{" "}
                <span
                  className={`ml-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${appStatusPillClass(status)}`}
                >
                  {displayStatus(status)}
                </span>
                {justAdded && (
                  <span className="ml-2 text-gray-500">
                    — you move it forward yourself as you progress.
                  </span>
                )}
              </p>
            </div>
          </div>
          <Link
            href="/applications"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            View in My Scholarships
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
        Track this scholarship
      </p>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-gray-600">
          Add it to your applications to track documents, deadlines and status
          from your Dashboard. Your status starts at{" "}
          <span className="font-semibold text-gray-900">Interested</span> — you
          move it forward yourself as you progress.
        </p>
        <button
          onClick={handleAdd}
          disabled={adding}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_rgba(0,0,0,0.25)] transition-all hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          I want to apply
        </button>
      </div>
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
    </div>
  );
}