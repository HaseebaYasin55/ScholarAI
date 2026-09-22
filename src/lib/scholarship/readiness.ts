/**
 * Server-safe application readiness computation.
 *
 * Mirrors the derived state in `ApplicationJourney` (the single source of truth
 * for how progress % and missing items are computed) so emails show exactly
 * what the user sees in the UI. Reuses the same shared helpers
 * (`isDocumentReady`, `hasMatchingSop`, `isAppliedLikeStatus`,
 * `UNSELECTED_PROGRAM`) instead of re-implementing them.
 */
import type { Application, Document, SOP } from "@/store/appStore";
import { isDocumentReady } from "@/lib/scholarship/documents";
import { hasMatchingSop } from "@/lib/scholarship/journey";
import { isAppliedLikeStatus } from "@/features/application-tracking/status";
import { UNSELECTED_PROGRAM } from "@/features/application-tracking/scholarshipApps";

export interface ApplicationReadiness {
  /** Whether any step was started (≠ plain "Interested" with nothing done). */
  begun: boolean;
  /** Already applied (or moved on / rejected) — reminders stop here. */
  applied: boolean;
  programEntered: boolean;
  reviewed: boolean;
  sopReady: boolean;
  /** 0..1 fraction of required documents that are actually uploaded. */
  docsFraction: number;
  /** The concrete items still missing, e.g. "Transcript", "Statement of purpose (SOP)". */
  missingItems: string[];
  /** Progress % exactly as the application journey would show it. */
  pct: number;
}

export function computeApplicationReadiness(
  application: Application,
  documents: Document[],
  sops: SOP[],
): ApplicationReadiness {
  const programRaw = (application.program ?? "").trim();
  const programEntered = Boolean(
    programRaw !== "" && programRaw !== UNSELECTED_PROGRAM,
  );
  const program = programEntered ? programRaw : "";

  const requiredDocs = (application.required_documents ?? [])
    .map((d) => (d ?? "").trim())
    .filter(Boolean);
  const docStates = requiredDocs.map((required) => ({
    required,
    ready: isDocumentReady(documents, required, application),
  }));
  const docsCount = requiredDocs.length;
  const docsReady = docStates.filter((d) => d.ready).length;
  const docsMissingCount = docsCount - docsReady;
  const docsFraction = docsCount === 0 ? 1 : docsReady / docsCount;

  const sopLinked = sops.some((s) => s.application_id === application.id);
  const sopReady =
    sopLinked ||
    hasMatchingSop(sops, { university: application.university }, program || undefined);

  const reviewed = Boolean(application.requirements_reviewed);
  const applied = isAppliedLikeStatus(application.status);
  const begun =
    application.status !== "Interested" || programEntered || reviewed || sopLinked;

  let rawPct = 100;
  if (!applied) {
    const occupied =
      (begun ? 1 : 0) +
      (programEntered ? 1 : 0) +
      (reviewed ? 1 : 0) +
      docsFraction +
      (sopReady ? 1 : 0);
    rawPct = Math.round((occupied / 5) * 100);
  }
  const pct = begun ? rawPct : 0;

  const missingItems: string[] = [];
  if (!programEntered) missingItems.push("Program not selected");
  if (docsCount > 0 && docsMissingCount > 0) {
    for (const s of docStates) if (!s.ready) missingItems.push(s.required);
  }
  if (!sopReady) missingItems.push("Statement of purpose (SOP)");

  return {
    begun,
    applied,
    programEntered,
    reviewed,
    sopReady,
    docsFraction,
    missingItems,
    pct,
  };
}