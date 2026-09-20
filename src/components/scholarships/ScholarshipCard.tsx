"use client";

import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";
import type { Scholarship } from "@/lib/scholarship/types";
import type { ScholarshipMatch } from "@/lib/scholarship/match";
import { formatDate } from "@/lib/scholarship/format";

export default function ScholarshipCard({
  scholarship,
  match,
  href,
  compact = false,
}: {
  scholarship: Scholarship;
  match?: ScholarshipMatch;
  href?: string;
  compact?: boolean;
}) {
  const { id, name, university, country, deadline, description } = scholarship;

  const link = href ?? `/scholarships/${id}`;
  const officialUrl =
    scholarship.officialScholarshipUrl ?? scholarship.officialUniversityUrl;

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-28px_rgba(0,0,0,0.4)]">
      <Link href={link} className="focus:outline-none">
        <h4 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-gray-900 decoration-gray-300 underline-offset-2 group-hover:underline">
          {name}
        </h4>
      </Link>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="truncate text-[13px] text-gray-500">
          {university ?? "—"}
          {country ? ` · ${country}` : ""}
        </p>
        {typeof match?.score === "number" && (
          <span
            title={`Match score: ${match.score}%`}
            className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold tabular-nums tracking-tight text-gray-900"
          >
            {match.score}% match
          </span>
        )}
      </div>

      <div className="mt-4 inline-flex items-center gap-2 text-[13px]">
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-gray-400">Deadline</span>
        <span className="font-medium text-gray-900">
          {deadline ? formatDate(deadline) : "Not specified"}
        </span>
      </div>

      {!compact && description && (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
          {description}
        </p>
      )}

      {officialUrl && (
        <div className="mt-auto pt-4">
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-between rounded-xl border border-gray-900/15 bg-gray-50 px-4 py-2.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-100"
          >
            Visit Website
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      )}
    </article>
  );
}