"use client";

import Link from "next/link";
import { ArrowRight, Calendar, Check } from "lucide-react";
import type { Scholarship } from "@/lib/scholarship/types";
import type { ScholarshipMatch } from "@/lib/scholarship/match";
import { deadlineLine, scholarshipStatus } from "@/lib/scholarship/scholarship-status";
import {
  isOfficialApproved,
  verifiedOfficialUrl,
} from "@/features/application-tracking/scholarshipApps";
import StatusBadge from "@/components/scholarships/StatusBadge";

const DEGREE_LABELS: Record<string, string> = {
  bachelor: "Bachelor's",
  master: "Master's",
  phd: "PhD",
  doctorate: "PhD",
  diploma: "Diploma",
};

function cardTags(s: Scholarship): string[] {
  const tags: string[] = [];
  if (s.fundingType) tags.push(s.fundingType);
  for (const d of s.degreeLevels.slice(0, 2)) {
    const label = DEGREE_LABELS[d.toLowerCase()] ?? d;
    if (!tags.includes(label)) tags.push(label);
  }
  if (s.fields.length) tags.push(s.fields.slice(0, 2).join(" / "));
  else if (s.openToAllDisciplines) tags.push("All academic disciplines");
  return tags.slice(0, 4);
}

export default function ScholarshipCard({
  scholarship,
  match,
  href,
  compact = false,
  cta = "official",
}: {
  scholarship: Scholarship;
  match?: ScholarshipMatch;
  href?: string;
  compact?: boolean;
  /** Bottom action: the external official page (default) or the detail page. */
  cta?: "official" | "scholarship";
}) {
  const { id, name, university, country, description } = scholarship;

  const link = href ?? `/scholarships/${id}`;
  const officialUrl = verifiedOfficialUrl(scholarship);
  const actionHref = cta === "scholarship" ? link : officialUrl;
  const actionLabel =
    cta === "scholarship" ? "View scholarship" : "View Official Scholarship";
  const actionClass =
    "flex w-full items-center justify-between rounded-xl border border-primary/20 bg-primary-tint/60 px-4 py-2.5 text-[13px] font-semibold text-primary-ink transition-colors hover:bg-primary/15 hover:border-primary/30";
  const official = isOfficialApproved(scholarship);
  const status = scholarshipStatus(scholarship);
  const dl = deadlineLine(scholarship);
  const tags = cardTags(scholarship);

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition-[box-shadow,transform] duration-250 ease-out hover:-translate-y-1 hover:border-gray-300/80 hover:shadow-card-hover">
      <Link href={link} className="focus:outline-none">
        <h4 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-gray-900 decoration-primary/40 underline-offset-2 group-hover:underline">
          {name}
        </h4>
      </Link>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="truncate text-[13px] text-gray-500">
          {university ?? "—"}
          {country ? ` · ${country}` : ""}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {official && (
            <span
              title="This scholarship was verified against its authoritative official source, current at last check"
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary-tint px-2.5 py-1 text-[11px] font-semibold tracking-tight text-primary-ink"
            >
              <Check className="h-3 w-3 text-primary" />
              Official
            </span>
          )}
          {typeof match?.score === "number" && (
            <span
              title={`Match score: ${match.score}%`}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold tabular-nums tracking-tight text-gray-900 shadow-chip"
            >
              {match.score}% match
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
        <StatusBadge status={status} />
        <span className="inline-flex items-center gap-1.5 text-gray-500">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span>
            {dl.kind === "opens" ? "Opens" : "Deadline"}{" "}
            <span className="font-medium text-gray-900">{dl.text}</span>
            {dl.suffix ? <span className="text-gray-400">{dl.suffix}</span> : null}
          </span>
        </span>
      </div>

      {!compact && description && (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
          {description}
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600 transition-colors group-hover:border-primary/20 group-hover:bg-primary-tint/40 group-hover:text-primary-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {actionHref && (
        <div className="mt-auto pt-4">
          {cta === "scholarship" ? (
            <Link href={actionHref} className={actionClass}>
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <a
              href={actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className={actionClass}
            >
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          )}
        </div>
      )}
    </article>
  );
}