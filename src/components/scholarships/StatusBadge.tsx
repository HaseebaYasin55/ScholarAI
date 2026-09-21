"use client";

import type { ScholarshipStatus } from "@/lib/scholarship/scholarship-status";

const TONES: Record<ScholarshipStatus["tone"], string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  gray: "border-gray-200 bg-gray-50 text-gray-500",
};

/** The application-status pill (OPEN / NOT OPEN YET / CLOSED / …). */
export default function StatusBadge({ status }: { status: ScholarshipStatus }) {
  return (
    <span
      title={status.detail}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight ${TONES[status.tone]}`}
    >
      {status.label}
    </span>
  );
}