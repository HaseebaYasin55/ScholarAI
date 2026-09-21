"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { Application } from "@/store/appStore";
import Select from "@/components/Select";
import { daysUntil, formatLongDate } from "@/lib/scholarship/format";
import { hasMatchingSop } from "@/lib/scholarship/journey";
import {
  docMeets,
  documentsForApplication,
  isDocumentReady,
  validateDocumentFile,
} from "@/lib/scholarship/documents";
import { displayStatus, isAppliedLikeStatus } from "@/features/application-tracking/status";
import {
  officialApplicationUrl,
  UNSELECTED_PROGRAM,
} from "@/features/application-tracking/scholarshipApps";
import { SOP_PREFILL_KEY } from "@/features/sop-generator/sopService";

const NO_REQUIREMENTS_MESSAGE =
  "No official document requirements were found in the available scholarship information.";

function StepRail({
  index,
  title,
  subtitle,
  state,
}: {
  index: number;
  title: string;
  subtitle: string;
  state: "done" | "current" | "todo";
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${
          state === "done"
            ? "border-gray-900 bg-gray-900 text-white"
            : state === "current"
              ? "border-gray-900 bg-white text-gray-900"
              : "border-gray-200 bg-white text-gray-400"
        }`}
      >
        {state === "done" ? <Check className="h-4 w-4" /> : index}
      </div>
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold ${
            state === "done" ? "text-gray-900" : "text-gray-700"
          }`}
        >
          {title}
        </p>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function StepHeading({
  step,
  icon,
  title,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
        {icon}
      </span>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
          {step}
        </p>
        <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">
          {title}
        </h3>
      </div>
    </div>
  );
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (deadline && days !== null && days < 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700">Deadline passed</p>
        <p className="mt-1 text-sm text-red-600">{formatLongDate(deadline)}</p>
      </div>
    );
  }
  if (!deadline) return null;
  const urgent = days !== null && days <= 14;
  return (
    <div
      className={`rounded-xl border p-4 ${
        urgent ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <p className="text-sm font-semibold text-gray-700">Deadline</p>
      <p className="mt-1 text-[15px] font-medium text-gray-900">
        {formatLongDate(deadline)}
      </p>
      {days !== null && (
        <p
          className={`mt-1 text-[13px] font-medium ${
            urgent ? "text-amber-700" : "text-gray-500"
          }`}
        >
          {days === 0 ? "Today" : days === 1 ? "1 day remaining" : `${days} days remaining`}
        </p>
      )}
    </div>
  );
}

/**
 * The per-application preparation journey (My Applications → Continue
 * application → /applications/:id). Everything derives from the tracked
 * application row plus the user's existing documents and SOPs — nothing is
 * invented and no duplicate document/SOP storage is created.
 */
export default function ApplicationJourney({
  application,
}: {
  application: Application;
}) {
  const router = useRouter();
  const { documents, sops, updateApplication, addDocument, uploadDocumentFile } =
    useAppStore();

  const [programInput, setProgramInput] = useState(
    application.program && application.program !== UNSELECTED_PROGRAM
      ? application.program
      : "",
  );
  const [savingProgram, setSavingProgram] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshingPrograms, setRefreshingPrograms] = useState(false);
  const autoProgramCheck = useRef(false);

  // ── Derived journey state (straight from the store, nothing to sync) ──────
  const programEntered = Boolean(
    application.program &&
      application.program.trim() !== "" &&
      application.program !== UNSELECTED_PROGRAM,
  );
  const program = programEntered ? (application.program ?? "").trim() : "";

  // Scholarship-specific program list, snapshotted from the catalog's `fields`
  // when the scholarship was tracked. Only options actually associated with
  // THIS scholarship are offered — never a global list. Legacy applications
  // have an empty list, so they fall back to manual entry.
  const programOptions = useMemo(() => {
    const base = (application.fields ?? [])
      .map((f) => (f ?? "").trim())
      .filter(Boolean);
    const entered =
      programEntered && application.program !== UNSELECTED_PROGRAM
        ? (application.program ?? "").trim()
        : "";
    return entered && !base.includes(entered) ? [entered, ...base] : base;
  }, [application.fields, application.program, programEntered]);
  const hasProgramOptions = programOptions.length > 0;

  const requiredDocs = useMemo(
    () =>
      (application.required_documents ?? [])
        .map((d) => (d ?? "").trim())
        .filter(Boolean),
    [application.required_documents],
  );

  const docsCount = requiredDocs.length;

  const docStates = useMemo(
    () =>
      requiredDocs.map((required) => ({
        required,
        ready: isDocumentReady(documents, required, application),
      })),
    [requiredDocs, documents, application],
  );
  const docsReady = docStates.filter((d) => d.ready).length;
  const docsMissingCount = docsCount - docsReady;
  const docsFraction = docsCount === 0 ? 1 : docsReady / docsCount;

  const sopLinked = useMemo(
    () => sops.some((s) => s.application_id === application.id),
    [sops, application.id],
  );
  const sopReady =
    sopLinked ||
    hasMatchingSop(
      sops,
      { university: application.university },
      program || undefined,
    );

  const reviewed = Boolean(application.requirements_reviewed);
  const applied = isAppliedLikeStatus(application.status);

  // "Began preparation" — explicit start, or any sign they already worked on it
  // (chosen program, reviewed requirements, linked SOP). Never auto-advances a
  // status past Preparing.
  const began =
    application.status !== "Interested" || programEntered || reviewed || sopLinked;

  // Progress comes from the actual journey state (not hardcoded percentages):
  // want-to-apply, program, requirements review, documents, SOP — then Applied
  // overrides to 100%.
  const rawPct = useMemo(() => {
    if (applied) return 100;
    const occupied =
      (began ? 1 : 0) +
      (programEntered ? 1 : 0) +
      (reviewed ? 1 : 0) +
      docsFraction +
      (sopReady ? 1 : 0);
    return Math.round((occupied / 5) * 100);
  }, [applied, began, programEntered, reviewed, docsFraction, sopReady]);
  const effectivePct = began ? rawPct : 0;

  const officialUrl = officialApplicationUrl(application);

  const missingItems = useMemo(() => {
    const items: string[] = [];
    if (!programEntered) items.push("Program not selected");
    if (docsCount > 0 && docsMissingCount > 0) {
      for (const s of docStates) if (!s.ready) items.push(s.required);
    }
    if (!sopReady) items.push("Statement of purpose (SOP)");
    return items;
  }, [programEntered, docStates, docsCount, docsMissingCount, sopReady]);

  const finishLine =
    programEntered && reviewed && docsMissingCount === 0 && sopReady;

  // ── Persistence ────────────────────────────────────────────────────────────
  // Progress mirrors the journey state into the applications row (the same
  // column the My Applications cards already render).
  useEffect(() => {
    if (application.progress === effectivePct) return;
    updateApplication(application.id, { progress: effectivePct }).catch(() => {
      // best-effort — the journey should never block on the tracker
    });
  }, [effectivePct, application.id, application.progress, updateApplication]);

  // If an app already has a chosen program / reviewed requirements but is still
  // "Interested", they have clearly begun preparing — move it to Preparing once.
  useEffect(() => {
    if (application.status !== "Interested") return;
    if (!(programEntered || reviewed)) return;
    updateApplication(application.id, { status: "Preparing" }).catch(() => {
      // best-effort
    });
  }, [application.status, application.id, programEntered, reviewed, updateApplication]);

  const beginPreparation = async () => {
    setError("");
    setSuccess("");
    if (applied) return;
    setStarting(true);
    try {
      const updates: Partial<Application> = {
        ...(application.status === "Interested" ? { status: "Preparing" as const } : {}),
        progress: Math.max(effectivePct, 5),
      };
      await updateApplication(application.id, updates);
      setSuccess("Preparation started — this application now shows as Preparing.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the journey.");
    } finally {
      setStarting(false);
    }
  };

  const confirmProgram = async () => {
    const value = programInput.trim();
    if (!value) return;
    if (hasProgramOptions && !programOptions.includes(value)) {
      setError("Select a program offered by this scholarship.");
      return;
    }
    setError("");
    setSuccess("");
    setSavingProgram(true);
    try {
      const updates: Partial<Application> = { program: value };
      if (application.status === "Interested") {
        updates.status = "Preparing";
      }
      await updateApplication(application.id, updates);
      setSuccess(`Program saved — continuing with ${value}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the program.");
    } finally {
      setSavingProgram(false);
    }
  };

  /**
   * Re-read the application's own official page to recover the eligible
   * programs/fields when the saved snapshot has none (applications tracked
   * before the program snapshot existed). Values come only from the official
   * page; when it lists no concrete programs the fallback stays.
   */
  const refreshProgramOptions = useCallback(async () => {
    const url = application.official_url?.trim();
    if (!url) return;
    setRefreshingPrograms(true);
    try {
      const res = await fetch("/api/scholarships/program-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name: application.university }),
      });
      const data = (await res.json().catch(() => null)) as
        | { fields?: string[] }
        | null;
      const fields = (data?.fields ?? []).map((f) => f.trim()).filter(Boolean);
      if (fields.length > 0) {
        await updateApplication(application.id, { fields });
      }
    } catch {
      // best-effort — the manual fallback stays available
    } finally {
      setRefreshingPrograms(false);
    }
  }, [
    application.official_url,
    application.university,
    application.id,
    updateApplication,
  ]);

  // One automatic attempt per session for a tracked scholarship with no program
  // snapshot, so Step 2 can offer the dropdown without the user re-adding it.
  useEffect(() => {
    if (autoProgramCheck.current) return;
    if (applied || programEntered || hasProgramOptions) return;
    if (!application.official_url) return;
    const key = `program-options-checked:${application.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      // storage unavailable — fall through to the in-memory guard
    }
    autoProgramCheck.current = true;
    // Defer to a task so the refresh's setState does not run synchronously in
    // the effect body (avoids a cascading render). The one-shot guard means the
    // timer is scheduled at most once and is intentionally not cancelled, so
    // React Strict Mode's mount/unmount double-invoke cannot swallow it.
    setTimeout(() => {
      void refreshProgramOptions().finally(() => {
        try {
          window.sessionStorage.setItem(key, "1");
        } catch {
          // ignore
        }
      });
    }, 0);
  }, [
    applied,
    programEntered,
    hasProgramOptions,
    application.official_url,
    application.id,
    refreshProgramOptions,
  ]);

  const markRequirementsReviewed = async () => {
    setError("");
    setSuccess("");
    setMarkingReviewed(true);
    try {
      const updates: Partial<Application> = { requirements_reviewed: true };
      if (application.status === "Interested") {
        updates.status = "Preparing";
      }
      await updateApplication(application.id, updates);
      setSuccess("Requirements reviewed — marked complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setMarkingReviewed(false);
    }
  };

  const handleUploadRequired = async (required: string, file: File) => {
    setError("");
    setSuccess("");
    const validationError = validateDocumentFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setUploading(required);
    try {
      const scoped = documentsForApplication(documents, application).find((d) =>
        docMeets(d, required),
      );
      let docId: string;
      if (scoped) {
        docId = scoped.id;
      } else {
        docId = await addDocument({
          name: required,
          university: application.university,
          status: "Missing",
          deadline: application.deadline?.slice(0, 10) ?? "",
          description: `Required document for ${application.university}`,
        });
      }
      await uploadDocumentFile(docId, file);
      setSuccess(`${required} uploaded — marked ready for this application.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  const handleCreateSop = () => {
    setError("");
    try {
      const payload = {
        university: application.university,
        program: program || application.program || "",
        requirements: requiredDocs.join("; ").slice(0, 1200),
        application_id: application.id,
      };
      window.sessionStorage.setItem(SOP_PREFILL_KEY, JSON.stringify(payload));
    } catch {
      // if storage is unavailable the user can type into the form directly
    }
    router.push("/sop-generator");
  };

  const confirmSubmitted = async () => {
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await updateApplication(application.id, {
        status: "Applied",
        progress: 100,
      });
      setSuccess(
        "Marked as applied — this application now shows as Applied and 100% complete.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark as applied.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step rail states ───────────────────────────────────────────────────────
  const step1State: "done" | "current" | "todo" = applied
    ? "done"
    : began
      ? "done"
      : "current";
  const step2State: "done" | "current" | "todo" = programEntered
    ? "done"
    : began
      ? "current"
      : "todo";
  const step3State: "done" | "current" | "todo" = reviewed
    ? "done"
    : began
      ? "current"
      : "todo";
  const step5State: "done" | "current" | "todo" = sopReady
    ? "done"
    : began
      ? "current"
      : "todo";
  const step4State: "done" | "current" | "todo" =
    docsCount === 0
      ? docsMissingCount
        ? "current"
        : "done"
      : docsMissingCount === 0
        ? "done"
        : began
          ? "current"
          : "todo";
  const step6State: "done" | "current" | "todo" = finishLine
    ? "done"
    : began
      ? "current"
      : "todo";
  const step7State: "done" | "current" | "todo" = applied ? "done" : "current";

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/60 px-6 py-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
          Application preparation journey
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-gray-900">
              {application.university}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {[application.organization, application.country]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-3 py-1 text-[11px] font-semibold text-white">
            {displayStatus(application.status)}
          </span>
        </div>
        <p className="mt-2 text-[13px] text-gray-500">
          A step-by-step checklist for this specific application. The application
          itself always happens on the official website.
        </p>
      </div>

      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        {/* Left rail */}
        <div className="border-b border-gray-100 bg-gray-50/40 p-6 md:border-b-0 md:border-r">
          <div className="space-y-5">
            <StepRail
              index={1}
              title="Want to apply?"
              subtitle={applied ? "Applied" : began ? "Completed" : "In progress"}
              state={step1State}
            />
            <StepRail
              index={2}
              title="Choose your program"
              subtitle={programEntered ? program : "Not chosen"}
              state={step2State}
            />
            <StepRail
              index={3}
              title="Review requirements"
              subtitle={reviewed ? "Reviewed" : "Pending"}
              state={step3State}
            />
            <StepRail
              index={4}
              title="Your documents"
              subtitle={
                docsCount === 0
                  ? "No official list"
                  : `${docsReady} / ${docsCount} ready`
              }
              state={step4State}
            />
            <StepRail
              index={5}
              title="SOP"
              subtitle={sopReady ? "Ready" : "Missing"}
              state={step5State}
            />
            <StepRail
              index={6}
              title="Final review"
              subtitle={finishLine ? "Complete" : "Pending"}
              state={step6State}
            />
            <StepRail
              index={7}
              title="Apply on official website"
              subtitle={applied ? "Applied" : officialUrl ? "External website" : "No official link"}
              state={step7State}
            />
          </div>
        </div>

        {/* Main content */}
        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm text-gray-700">
              {success}
            </div>
          )}

          {applied ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-900 bg-gray-900 p-6 text-white">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                  Application completed
                </p>
                <h3 className="mt-2 text-xl font-bold tracking-tight">
                  Your application preparation journey is complete.
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-300">
                  Status: <span className="font-semibold text-white">Applied</span>. The
                  official application was submitted externally. Progress is set to 100%.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href="/applications"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Back to My Applications
                  </Link>
                  {officialUrl && (
                    <a
                      href={officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open official website
                    </a>
                  )}
                </div>
              </div>
              <DeadlineBadge deadline={application.deadline} />
            </div>
          ) : !began ? (
            /* Step 1 — Want to apply? (start gate) */
            <div className="space-y-5">
              <div>
                <StepHeading
                  step="Step 1"
                  icon={<GraduationCap className="h-4 w-4" />}
                  title="Want to apply?"
                />
                <p className="mt-3 text-[13px] text-gray-500">
                  This is the starting point. You&apos;re tracking this
                  scholarship — starting the journey moves it from{" "}
                  <span className="font-semibold text-gray-900">Interested</span>{" "}
                  to <span className="font-semibold text-gray-900">Preparing</span>.
                </p>
                <button
                  onClick={beginPreparation}
                  disabled={starting}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_rgba(0,0,0,0.25)] transition-all hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Start preparing your application
                </button>
              </div>
              <DeadlineBadge deadline={application.deadline} />
              {docsCount === 0 && (
                <p className="text-[13px] leading-relaxed text-gray-500">
                  {NO_REQUIREMENTS_MESSAGE}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {/* Step 1 — confirmed start */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Step 1 — Want to apply?
                  </p>
                  <p className="text-xs text-gray-500">
                    Preparation started — this application is being tracked.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  <Check className="h-3 w-3" />
                  Done
                </span>
              </div>

              {/* Step 2 — Choose your program */}
              <div>
                <StepHeading
                  step="Step 2"
                  icon={<GraduationCap className="h-4 w-4" />}
                  title="Choose your program"
                />
                <p className="mt-3 text-[13px] text-gray-500">
                  Select the program you want to apply for from the programs
                  offered by this scholarship.
                </p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Select
                    className="flex-1"
                    value={programInput}
                    onChange={setProgramInput}
                    options={programOptions.map((p) => ({ value: p, label: p }))}
                    placeholder={
                      refreshingPrograms
                        ? "Checking the official page…"
                        : hasProgramOptions
                          ? "Select a program"
                          : "No programs listed for this scholarship"
                    }
                    disabled={!hasProgramOptions || refreshingPrograms}
                    ariaLabel="Choose your program"
                  />
                  <button
                    onClick={confirmProgram}
                    disabled={
                      !hasProgramOptions ||
                      !programInput.trim() ||
                      programInput === program ||
                      savingProgram
                    }
                    className="shrink-0 rounded-xl border border-gray-900 px-5 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {savingProgram ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : programEntered ? (
                      "Saved"
                    ) : (
                      "Confirm"
                    )}
                  </button>
                </div>

                {!hasProgramOptions && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-xs text-gray-400">
                      {refreshingPrograms
                        ? "Checking the official page for program options…"
                        : "Program options aren't in the scholarship data yet."}
                    </p>
                    {!refreshingPrograms && application.official_url && (
                      <button
                        onClick={refreshProgramOptions}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors hover:decoration-gray-900"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Check official page
                      </button>
                    )}
                  </div>
                )}

                {programEntered && (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
                      <Check className="h-4 w-4" />
                      Program selected
                    </p>
                    <p className="mt-0.5 text-[13px] text-gray-600">{program}</p>
                  </div>
                )}
              </div>

              {/* Step 3 — Review requirements */}
              <div>
                <StepHeading
                  step="Step 3"
                  icon={<FileText className="h-4 w-4" />}
                  title="Review requirements"
                />
                {docsCount > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {docStates.map((s) => (
                      <li
                        key={s.required}
                        className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3"
                      >
                        <span className="text-sm text-gray-800">{s.required}</span>
                        <span
                          className={`shrink-0 text-[11px] font-semibold ${
                            s.ready ? "text-gray-900" : "text-gray-400"
                          }`}
                        >
                          {s.ready ? "Available" : "To match next"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-gray-500">
                    {NO_REQUIREMENTS_MESSAGE}
                  </p>
                )}
                <div className="mt-4">
                  {reviewed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-3 py-1 text-[11px] font-semibold text-white">
                      <Check className="h-3 w-3" />
                      Requirements reviewed
                    </span>
                  ) : (
                    <button
                      onClick={markRequirementsReviewed}
                      disabled={markingReviewed}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 px-3.5 py-2 text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-wait disabled:opacity-60"
                    >
                      {markingReviewed ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      I&apos;ve reviewed the requirements
                    </button>
                  )}
                </div>
              </div>

              {/* Step 4 — Your documents */}
              <div>
                <StepHeading
                  step="Step 4"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  title="Your documents"
                />
                {docsCount === 0 ? (
                  <p className="mt-3 text-sm leading-relaxed text-gray-500">
                    {NO_REQUIREMENTS_MESSAGE}
                  </p>
                ) : (
                  <>
                    <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                      {docStates.map((s) => (
                        <li
                          key={s.required}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0">{s.ready ? "✅" : "❌"}</span>
                            <span className="truncate text-sm text-gray-800">
                              {s.required}
                            </span>
                          </div>
                          {s.ready ? (
                            <span className="shrink-0 text-[11px] font-semibold text-gray-900">
                              Ready
                            </span>
                          ) : (
                            <label
                              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
                            >
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx"
                                disabled={uploading !== null}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) handleUploadRequired(s.required, file);
                                }}
                              />
                              {uploading === s.required ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                              Upload
                            </label>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[13px] font-semibold text-gray-900">
                      {docsReady} / {docsCount} documents ready
                      {docsMissingCount > 0 && (
                        <span className="font-normal text-gray-500">
                          {" "}
                          · {docsMissingCount} missing
                        </span>
                      )}
                    </p>
                  </>
                )}
              </div>

              {/* Step 5 — SOP */}
              <div>
                <StepHeading
                  step="Step 5"
                  icon={<Sparkles className="h-4 w-4" />}
                  title="SOP"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
                  {sopReady ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                      ✅ SOP Ready
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                        ❌ SOP Missing
                      </span>
                      <button
                        onClick={handleCreateSop}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Create SOP
                      </button>
                    </>
                  )}
                  <span className="text-xs text-gray-400">
                    {sopReady
                      ? "An SOP for this scholarship is saved in your SOP system."
                      : "Opens the existing SOP generator with this scholarship prefilled."}
                  </span>
                </div>
              </div>

              {/* Step 6 — Final review */}
              <div>
                <StepHeading
                  step="Step 6"
                  icon={<ClipboardList className="h-4 w-4" />}
                  title="Final review"
                />
                <ul className="mt-3 space-y-2">
                  <li className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-600">Program</span>
                    <span className={programEntered ? "font-medium text-gray-900" : "text-gray-400"}>
                      {programEntered ? `✅ ${program}` : "❌"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Requirements reviewed</span>
                    <span className={reviewed ? "text-gray-900" : "text-gray-400"}>
                      {reviewed ? "✅" : "❌"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Required documents</span>
                    <span className="text-gray-900">
                      {docsCount === 0 ? "—" : `${docsReady} / ${docsCount} ready`}
                    </span>
                  </li>
                  <li className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">SOP</span>
                    <span className={sopReady ? "text-gray-900" : "text-gray-400"}>
                      {sopReady ? "✅" : "❌"}
                    </span>
                  </li>
                </ul>

                {missingItems.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800">
                      Still missing before applying
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-amber-700">
                      {missingItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-amber-700">
                      The journey is intentionally not marked ready until these are
                      resolved. You can still submit externally and mark the
                      application as applied below if you choose.
                    </p>
                  </div>
                ) : (
                  docsCount > 0 && (
                    <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-700">
                      Everything is in place for this scholarship&apos;s known
                      requirements.
                    </p>
                  )
                )}
              </div>

              {/* Step 7 — Apply on the official website */}
              <div className="rounded-xl border border-gray-900 bg-gray-900 p-5 text-white">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                  Step 7
                </p>
                <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
                  Apply on official website
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DeadlineBadge deadline={application.deadline} />
                  {officialUrl ? (
                    <a
                      href={officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Apply on official website
                    </a>
                  ) : (
                    <p className="inline-flex items-center justify-center rounded-xl border border-gray-500 px-4 py-3 text-xs text-gray-300">
                      Official application link unavailable.
                    </p>
                  )}
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  Opens the scholarship provider&apos;s website and submit there. Opening
                  it does <span className="font-semibold text-white">not</span>{" "}
                  automatically mark the application as Applied — confirm below when
                  the real submission is done.
                </p>

                <div className="mt-4 rounded-xl border border-dashed border-gray-500/40 p-4">
                  <p className="text-[13px] font-semibold">I have submitted my application</p>
                  <p className="mt-1 text-xs text-gray-400">
                    We don&apos;t verify external submissions — only mark this after
                    you&apos;ve actually applied. It sets the status to Applied and the
                    journey to complete.
                  </p>
                  <button
                    onClick={confirmSubmitted}
                    disabled={submitting}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    I have submitted my application
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">Progress</p>
                  <p className="text-sm font-semibold text-gray-900">{effectivePct}%</p>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-gray-900 transition-all duration-500"
                    style={{ width: `${effectivePct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Reflects the actual state of this journey — program, requirements,
                  documents, and SOP — not a fixed estimate.
                </p>
                {missingItems.length > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Still missing: {missingItems.join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}