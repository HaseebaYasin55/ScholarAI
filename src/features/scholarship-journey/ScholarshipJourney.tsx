"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Calendar,
  Upload,
  Loader2,
  Sparkles,
  GraduationCap,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { Document } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import type { Scholarship } from "@/lib/scholarship/types";
import type { MatchPreferences } from "@/lib/scholarship/match";
import { daysUntil, formatLongDate } from "@/lib/scholarship/format";
import { buildRequirementChecks, summarizeReadiness } from "@/lib/scholarship/journey";
import type { RequirementCheck } from "@/lib/scholarship/journey";
import { SOP_PREFILL_KEY } from "@/features/sop-generator/sopService";
import { displayStatus } from "@/features/application-tracking/status";

type AuthUser = ReturnType<typeof useAuthStore.getState>["user"];

const DOC_TYPE_CV = "CV / Resume";
const DOC_TYPE_TRANSCRIPT = "Transcript";

function validateDocumentFile(file: File): string | null {
  const allowedExtensions = ["pdf", "doc", "docx"];
  const fileExt = file.name.split(".").pop()?.toLowerCase();
  if (!fileExt || !allowedExtensions.includes(fileExt)) {
    return "Invalid file format. Please upload PDF, DOC, or DOCX.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "File size exceeds the 5MB limit.";
  }
  return null;
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (!deadline) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-semibold text-gray-700">Deadline</p>
        <p className="mt-1 text-sm text-gray-500">Not specified</p>
      </div>
    );
  }
  if (days !== null && days < 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700">Deadline passed</p>
        <p className="mt-1 text-sm text-red-600">{formatLongDate(deadline)}</p>
      </div>
    );
  }
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
          className={`mt-1 inline-flex items-center gap-1 text-[13px] font-medium ${
            urgent ? "text-amber-700" : "text-gray-500"
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          {days === 0
            ? "Today"
            : days === 1
              ? "1 day remaining"
              : `${days} days remaining`}
        </p>
      )}
    </div>
  );
}

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

function StatusPill({
  status,
  label,
  hint,
}: {
  status: RequirementCheck["status"];
  label: string;
  hint?: string;
}) {
  const styles: Record<
    RequirementCheck["status"],
    { text: string; pill: string; mark: React.ReactNode }
  > = {
    ready: {
      text: "text-gray-900",
      pill: "bg-gray-900 text-white",
      mark: <Check className="h-3 w-3" />,
    },
    missing: {
      text: "text-gray-600",
      pill: "bg-gray-50 border border-gray-200 text-gray-600",
      mark: <Circle className="h-3 w-3" />,
    },
    confirm: {
      text: "text-gray-500",
      pill: "bg-gray-50 border border-gray-200 text-amber-700",
      mark: <AlertTriangle className="h-3 w-3 text-amber-500" />,
    },
  };
  const s = styles[status];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.pill}`}
      >
        {s.mark}
        {status === "ready" ? "Ready" : status === "missing" ? "Missing" : "Confirm"}
      </span>
      <span className={`text-[13px] ${s.text}`}>{label}</span>
      {hint && <span className="w-full text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

export default function ScholarshipJourney({
  scholarship,
  user,
  prefs,
}: {
  scholarship: Scholarship;
  user: AuthUser;
  prefs: MatchPreferences | null;
}) {
  const router = useRouter();
  const {
    documents,
    sops,
    applications,
    addDocument,
    uploadDocumentFile,
    addApplication,
    updateApplication,
  } = useAppStore();

  const [wantToApply, setWantToApply] = useState(false);
  const [programInput, setProgramInput] = useState("");
  const [confirmedProgram, setConfirmedProgram] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"cv" | "transcript" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const days = daysUntil(scholarship.deadline);
  const deadlinePassed = days !== null && days < 0;

  // ── Restored journey (Draft = Preparing, Submitted = Applied) ─────────────
  // Derived straight from the store rather than copied into state, so there's
  // nothing to synchronize when applications finish loading. Both Draft and
  // Submitted rows are restored so reopening an already-applied scholarship
  // keeps its Applied state instead of creating a duplicate.
  const universityKey = scholarship.name;
  const restoredJourney = useMemo(
    () =>
      applications.find(
        (a) =>
          a.university === universityKey &&
          (a.status === "Draft" || a.status === "Submitted"),
      ),
    [applications, universityKey],
  );

  const establishedProgram =
    confirmedProgram ?? (programInput.trim() || restoredJourney?.program || "");

  // An application row that already exists for this university + program.
  const existingApplication = useMemo(
    () =>
      applications.find(
        (a) =>
          a.university === universityKey && a.program === establishedProgram,
      ),
    [applications, universityKey, establishedProgram],
  );

  // Applied only becomes true via the explicit "I've submitted my application"
  // confirmation — never just from opening the official website.
  const applied = useMemo(
    () =>
      Boolean(restoredJourney && restoredJourney.status === "Submitted") ||
      Boolean(existingApplication && existingApplication.status === "Submitted"),
    [restoredJourney, existingApplication],
  );

  // An already-applied journey is always restored, even once the deadline
  // passes, so the user can reopen the scholarship and see its Applied state.
  const started =
    (wantToApply || Boolean(restoredJourney)) && (!deadlinePassed || applied);
  const canApply = started && establishedProgram.length > 0;

  const context = useMemo(
    () => ({
      scholarship,
      documents,
      sops,
      profile: {
        education_level: user?.education_level ?? null,
        university: user?.university ?? null,
        ielts_band: prefs?.ielts_band ?? null,
        ielts_status: prefs?.ielts_status ?? null,
      },
    }),
    [scholarship, documents, sops, user, prefs],
  );

  const checks = useMemo(
    () => buildRequirementChecks(context, establishedProgram),
    [context, establishedProgram],
  );
  const readiness = useMemo(() => summarizeReadiness(checks), [checks]);

  const missingActions = useMemo(
    () => checks.filter((c) => c.status === "missing"),
    [checks],
  );

  // ── Persist the journey in the applications table ─────────────────────────
  // A "preparing" application is a Draft row (displayed as "Preparing" in the
  // Dashboard) and an applied one is Submitted (displayed as "Applied"). The
  // applications table has no scholarship column, so the scholarship name is
  // stored in `university` and the row is keyed by name + program. It's only
  // written once the user starts with a confirmed program, and the update
  // branch never touches `status`, so marking a row Applied is preserved.
  useEffect(() => {
    if (!canApply || !establishedProgram) return;
    if (existingApplication) {
      if (existingApplication.progress !== readiness.pct) {
        updateApplication(existingApplication.id, {
          progress: readiness.pct,
          ...(scholarship.deadline ? { deadline: scholarship.deadline } : {}),
        }).catch(() => {
          // best-effort — the tracker should never block the journey
        });
      }
      return;
    }
    const payload: Record<string, unknown> = {
      university: universityKey,
      program: establishedProgram,
      status: "Draft",
      progress: readiness.pct,
    };
    if (scholarship.deadline) payload.deadline = scholarship.deadline;
    addApplication(payload as Parameters<typeof addApplication>[0]).catch(
      () => {
        // best-effort — the tracker should never block the journey
      },
    );
  }, [
    canApply,
    establishedProgram,
    existingApplication,
    addApplication,
    updateApplication,
    universityKey,
    readiness.pct,
    scholarship.deadline,
  ]);

  const handleStart = () => {
    setError("");
    setSuccess("");
    setWantToApply(true);
  };

  const handleProgramChange = (value: string) => {
    setProgramInput(value);
    setConfirmedProgram(null);
  };

  const applyProgram = () => {
    if (!establishedProgram) return;
    setConfirmedProgram(establishedProgram);
    setSuccess(`Preparing application for ${establishedProgram}.`);
  };

  const confirmSubmitted = async () => {
    if (!canApply) return;
    setError("");
    setSuccess("");
    const appId = existingApplication?.id ?? restoredJourney?.id;
    if (!appId) {
      setError(
        "No tracked application found yet — confirm your program and try again.",
      );
      return;
    }
    setConfirming(true);
    try {
      await updateApplication(appId, { status: "Submitted" });
      setSuccess(
        "Marked as applied — this scholarship now shows as Applied in your Dashboard.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the application.",
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: "cv" | "transcript",
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateDocumentFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSuccess("");
    setUploading(docType);
    const type = docType === "cv" ? DOC_TYPE_CV : DOC_TYPE_TRANSCRIPT;
    try {
      const existing = documents.find(
        (d) => d.university === "General" && d.name === type,
      );
      let docId: string;
      if (existing) {
        docId = existing.id;
      } else {
        docId = await addDocument({
          name: type,
          university: "General",
          status: "Pending",
          description: "Global Profile Document",
          deadline: "",
        });
      }
      await uploadDocumentFile(docId, file);
      setSuccess(`${type} uploaded — marked ready.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  const handleGenerateSop = () => {
    if (!canApply) return;
    try {
      const payload = {
        university: scholarship.university ?? scholarship.name,
        program: establishedProgram,
        requirements: [
          ...scholarship.requiredDocuments,
          ...(scholarship.ieltsRequirement ? [scholarship.ieltsRequirement] : []),
        ]
          .join("; ")
          .slice(0, 1200),
      };
      window.sessionStorage.setItem(SOP_PREFILL_KEY, JSON.stringify(payload));
    } catch {
      // if storage is unavailable the user can type into the form directly
    }
    router.push("/sop-generator");
  };

  const officialApplyUrl =
    scholarship.officialScholarshipUrl ?? scholarship.officialUniversityUrl;

  const readyToApply =
    canApply && readiness.total > 0 && missingActions.length === 0;

  const ftBadge = (docRow: Document | undefined) =>
    docRow?.status === "Submitted" && docRow.file_path
      ? docRow.file_path.split("/").pop()
      : undefined;

  const cvRow = documents.find(
    (d) => d.university === "General" && d.name === DOC_TYPE_CV,
  );
  const transcriptRow = documents.find(
    (d) => d.university === "General" && d.name === DOC_TYPE_TRANSCRIPT,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/60 px-6 py-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
          Application preparation journey
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-gray-900">
          From scholarship to application
        </h2>
        <p className="mt-1 text-[13px] text-gray-500">
          A guided walkthrough of what this scholarship needs before you apply
          on the official website. It&apos;s a preparation estimate — not an
          official eligibility decision.
        </p>
      </div>

      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        {/* Left rail: progress steps */}
        <div className="border-b border-gray-100 bg-gray-50/40 p-6 md:border-b-0 md:border-r">
          <div className="space-y-5">
            <StepRail
              index={1}
              title="Want to apply?"
              subtitle={
                started ? (applied ? "Applied" : "In progress") : "Not started"
              }
              state={started ? "done" : "current"}
            />
            <StepRail
              index={2}
              title="Choose program"
              subtitle={establishedProgram ? establishedProgram : "Not chosen"}
              state={establishedProgram ? "done" : started ? "current" : "todo"}
            />
            <StepRail
              index={3}
              title="Review requirements"
              subtitle={
                `${readiness.total} official item${readiness.total === 1 ? "" : "s"}`
              }
              state={canApply ? "done" : "todo"}
            />
            <StepRail
              index={4}
              title="Your documents"
              subtitle={`${readiness.ready} / ${readiness.total} ready`}
              state={readyToApply ? "done" : canApply ? "current" : "todo"}
            />
            <StepRail
              index={5}
              title="Apply officially"
              subtitle={
                applied
                  ? "Applied"
                  : officialApplyUrl
                    ? "External website"
                    : "No official link"
              }
              state={applied ? "done" : readyToApply ? "current" : "todo"}
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

          {!started ? (
            <div className="space-y-5">
              <DeadlineBadge deadline={scholarship.deadline} />
              <div>
                <p className="text-sm leading-relaxed text-gray-600">
                  Ready to prepare this application? Start the in-app walkthrough
                  to check your documents and keep your place. Application itself
                  always happens on the official website.
                </p>
                <button
                  onClick={handleStart}
                  disabled={deadlinePassed}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_rgba(0,0,0,0.25)] transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deadlinePassed ? (
                    "Deadline passed"
                  ) : (
                    <>
                      I want to apply
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Step 2 — Choose program */}
              <div>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                    <GraduationCap className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                      Step 2
                    </p>
                    <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">
                      Choose your program
                    </h3>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={establishedProgram}
                    onChange={(e) => handleProgramChange(e.target.value)}
                    placeholder="e.g. MSc Computer Science"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5"
                  />
                  <button
                    onClick={applyProgram}
                    disabled={!establishedProgram || Boolean(confirmedProgram)}
                    className="shrink-0 rounded-xl border border-gray-900 px-5 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {confirmedProgram ? "Saved" : "Confirm"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Official program lists aren&apos;t part of our scholarship data
                  yet — enter the program exactly as shown on the official
                  application page.
                </p>
              </div>

              {canApply && (
                <>
                  {/* Step 3 — Requirements */}
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                          Step 3
                        </p>
                        <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">
                          Official requirements
                        </h3>
                      </div>
                    </div>
                    {readiness.total === 0 ? (
                      <p className="mt-3 text-sm leading-relaxed text-gray-500">
                        We don&apos;t have a structured requirement list for this
                        scholarship yet —{" "}
                        <a
                          href={officialApplyUrl ?? "#"}
                          target={officialApplyUrl ? "_blank" : undefined}
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2"
                        >
                          confirm the requirements on the official application page
                        </a>
                        .
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {checks.map((c) => (
                          <li
                            key={c.key}
                            className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3"
                          >
                            <StatusPill
                              status={c.status}
                              label={c.label}
                              hint={c.hint}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Step 4 — Your documents + missing actions */}
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                          Step 4
                        </p>
                        <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">
                          Your documents
                        </h3>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
                          CV / Resume
                        </p>
                        <p
                          className={`mt-1 text-sm font-semibold ${
                            ftBadge(cvRow) ? "text-gray-900" : "text-amber-600"
                          }`}
                        >
                          {ftBadge(cvRow) ?? "Not uploaded"}
                        </p>
                        <label
                          className={`mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 transition-colors ${
                            uploading === "cv"
                              ? "cursor-wait opacity-60"
                              : "cursor-pointer hover:border-gray-900 hover:text-gray-900"
                          }`}
                        >
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                            disabled={uploading === "cv"}
                            onChange={(e) => handleUpload(e, "cv")}
                          />
                          {uploading === "cv" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {ftBadge(cvRow) ? "Replace" : "Upload"}
                        </label>
                      </div>

                      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
                          Transcript
                        </p>
                        <p
                          className={`mt-1 text-sm font-semibold ${
                            ftBadge(transcriptRow)
                              ? "text-gray-900"
                              : "text-amber-600"
                          }`}
                        >
                          {ftBadge(transcriptRow) ?? "Not uploaded"}
                        </p>
                        <label
                          className={`mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 transition-colors ${
                            uploading === "transcript"
                              ? "cursor-wait opacity-60"
                              : "cursor-pointer hover:border-gray-900 hover:text-gray-900"
                          }`}
                        >
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                            disabled={uploading === "transcript"}
                            onChange={(e) => handleUpload(e, "transcript")}
                          />
                          {uploading === "transcript" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {ftBadge(transcriptRow) ? "Replace" : "Upload"}
                        </label>
                      </div>
                    </div>

                    {missingActions.length > 0 && (
                      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-sm font-semibold text-gray-900">
                          Actions to complete
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {missingActions.map((c) => {
                            if (c.action === "upload-cv")
                              return (
                                <label
                                  key={c.key}
                                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  Upload CV
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.doc,.docx"
                                    onChange={(e) => handleUpload(e, "cv")}
                                  />
                                </label>
                              );
                            if (c.action === "upload-transcript")
                              return (
                                <label
                                  key={c.key}
                                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  Upload Transcript
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.doc,.docx"
                                    onChange={(e) =>
                                      handleUpload(e, "transcript")
                                    }
                                  />
                                </label>
                              );
                            if (c.action === "generate-sop")
                              return (
                                <button
                                  key={c.key}
                                  onClick={handleGenerateSop}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                  Generate SOP
                                </button>
                              );
                            if (c.action === "edit-profile")
                              return (
                                <Link
                                  key={c.key}
                                  href="/profile"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
                                >
                                  Add IELTS in Profile
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              );
                            return null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Readiness */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Readiness estimate
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {readiness.ready} / {readiness.total} ready
                      </p>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-gray-900 transition-all duration-500"
                        style={{ width: `${readiness.pct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      A preparation estimate based on your documents and profile,
                      not an official eligibility decision.
                    </p>
                  </div>

                  {/* Step 5 — Ready to apply */}
                  {applied ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-500">
                        Step 5
                      </p>
                      <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-emerald-900">
                        Application marked as applied
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-emerald-700">
                        You confirmed your submission on the provider&apos;s
                        website. This scholarship now shows as{" "}
                        <span className="font-semibold">
                          {displayStatus("Submitted")}
                        </span>{" "}
                        in your Dashboard tracker.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <DeadlineBadge deadline={scholarship.deadline} />
                        {officialApplyUrl ? (
                          <a
                            href={officialApplyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-800 transition-all hover:bg-emerald-100"
                          >
                            Open Official Website
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <p className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-3 text-xs text-emerald-700">
                            No official application link available yet.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`rounded-xl border p-5 ${
                        readyToApply
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                        Step 5
                      </p>
                      <h3
                        className={`mt-1 text-[15px] font-semibold tracking-tight ${
                          readyToApply ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {readyToApply ? "You're ready to apply" : "Keep preparing"}
                      </h3>
                      <p
                        className={`mt-1 text-[13px] leading-relaxed ${
                          readyToApply ? "text-gray-300" : "text-gray-500"
                        }`}
                      >
                        {readyToApply
                          ? `Your documents cover the official requirements. The application is submitted on the provider's website before the deadline.`
                          : "Complete the missing actions above to finalize your preparation."}
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <DeadlineBadge deadline={scholarship.deadline} />
                        {officialApplyUrl ? (
                          <a
                            href={officialApplyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                              readyToApply
                                ? "bg-white text-gray-900 hover:bg-gray-100"
                                : "bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
                            }`}
                          >
                            Apply on Official Website
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <p className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                            No official application link available yet.
                          </p>
                        )}
                      </div>

                      {readyToApply && (
                        <div className="mt-4 rounded-xl border border-dashed border-gray-500/30 p-4">
                          <p
                            className={`text-[13px] font-semibold ${
                              readyToApply ? "text-white" : "text-gray-900"
                            }`}
                          >
                            Did you submit on the official website?
                          </p>
                          <p
                            className={`mt-1 text-xs ${
                              readyToApply ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            We don&apos;t verify external submissions — only mark
                            this after you&apos;ve actually applied. It updates
                            your Dashboard to Applied.
                          </p>
                          <button
                            onClick={confirmSubmitted}
                            disabled={confirming}
                            className={`mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:cursor-wait disabled:opacity-60 ${
                              readyToApply
                                ? "bg-white text-gray-900 hover:bg-gray-100"
                                : "bg-gray-900 text-white hover:bg-gray-800"
                            }`}
                          >
                            {confirming ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            I&apos;ve submitted my application
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}