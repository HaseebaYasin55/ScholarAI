"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  FilePlus2,
  FileText,
  Globe,
  Link2,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import Link from "next/link";

import Select from "@/components/Select";
import { useAppStore } from "@/store/appStore";
import type { Application } from "@/store/appStore";
import { UNSELECTED_PROGRAM, officialApplicationUrl } from "@/features/application-tracking/scholarshipApps";
import { displayStatus, isAppliedLikeStatus } from "@/features/application-tracking/status";
import { docMeets, documentsForApplication, isDocumentReady, validateDocumentFile } from "@/lib/scholarship/documents";
import { hasMatchingSop } from "@/lib/scholarship/journey";
import { SOP_PREFILL_KEY } from "@/features/sop-generator/sopService";

type StepState = "done" | "current" | "todo";

function StepIcon({ index, state }: { index: number; state: StepState }) {
  if (state === "done") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary-deep bg-primary-deep text-white shadow-[0_1px_2px_rgba(36,60,76,0.4),0_4px_8px_-4px_rgba(62,110,146,0.6)]">
        <Check className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (state === "current") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-white text-[11px] font-semibold text-primary-ink shadow-[0_0_0_3px_rgba(82,137,173,0.12)]">
        {index}
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-[11px] font-medium text-gray-400">
      {index}
    </div>
  );
}

function StepCard({
  index,
  title,
  subtitle,
  state,
  isOpen,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  state: StepState;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const statusLabel =
    state === "done" ? "Complete" : state === "current" ? "In Progress" : "Missing";
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5 sm:py-5"
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <StepIcon index={index} state={state} />
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-gray-900 sm:text-[15px]">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-0.5 truncate text-[12px] text-gray-500 sm:text-[13px]">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`hidden rounded-full border px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex ${
              state === "done"
                ? "border-primary-deep bg-primary-deep text-white shadow-chip"
                : state === "current"
                  ? "border-primary/25 bg-primary-tint/40 text-primary-ink"
                  : "border-gray-200 bg-gray-50 text-gray-500"
            }`}
          >
            {statusLabel}
          </span>
          <ArrowRight
            className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {isOpen ? (
        <div className="border-t border-gray-100 px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      ) : null}
    </div>
  );
}

export default function ApplicationJourney({
  application,
}: {
  application: Application;
}) {
  const router = useRouter();
  const { documents, sops, updateApplication, updateSOP, addDocument, uploadDocumentFile } =
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
  const [linkingSopId, setLinkingSopId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshingPrograms, setRefreshingPrograms] = useState(false);
  const [programFetchInfo, setProgramFetchInfo] = useState<{
    attempted: boolean;
    openToAll: boolean;
  }>({ attempted: false, openToAll: false });
  const autoProgramCheck = useRef(false);

  // ── Derived journey state (logic kept identical to the original flow) ─────
  const programEntered = Boolean(
    application.program &&
      application.program.trim() !== "" &&
      application.program !== UNSELECTED_PROGRAM,
  );
  const program = programEntered ? (application.program ?? "").trim() : "";

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
  const docStates = useMemo(
    () =>
      requiredDocs.map((required) => ({
        required,
        ready: isDocumentReady(documents, required, application),
      })),
    [requiredDocs, documents, application],
  );
  const docsCount = requiredDocs.length;
  const docsReady = docStates.filter((d) => d.ready).length;
  const docsMissingCount = docsCount - docsReady;
  const docsFraction = docsCount === 0 ? 1 : docsReady / docsCount;

  const sopLinked = useMemo(
    () => sops.some((s) => s.application_id === application.id),
    [sops, application.id],
  );
  const sopReady =
    sopLinked ||
    hasMatchingSop(sops, { university: application.university }, program || undefined);

  const reviewed = Boolean(application.requirements_reviewed);
  const applied = isAppliedLikeStatus(application.status);

  const began =
    application.status !== "Interested" || programEntered || reviewed || sopLinked;

  let rawPct = 100;
  if (!applied) {
    const occupied =
      (began ? 1 : 0) +
      (programEntered ? 1 : 0) +
      (reviewed ? 1 : 0) +
      docsFraction +
      (sopReady ? 1 : 0);
    rawPct = Math.round((occupied / 5) * 100);
  }
  const effectivePct = began ? rawPct : 0;

  const officialUrl = officialApplicationUrl(application);

  const missingItems: string[] = [];
  if (!programEntered) missingItems.push("Program not selected");
  if (docsCount > 0 && docsMissingCount > 0) {
    for (const s of docStates) if (!s.ready) missingItems.push(s.required);
  }
  if (!sopReady) missingItems.push("Statement of purpose (SOP)");

  const finishLine =
    programEntered && reviewed && docsMissingCount === 0 && sopReady;

  // Step states (identical rules to the original rail)
  const step1State: StepState = applied ? "done" : began ? "done" : "current";
  const step2State: StepState = programEntered ? "done" : began ? "current" : "todo";
  const step3State: StepState = reviewed ? "done" : began ? "current" : "todo";
  const step5State: StepState = sopReady ? "done" : began ? "current" : "todo";
  const step4State: StepState =
    docsCount === 0
      ? docsMissingCount
        ? "current"
        : "done"
      : docsMissingCount === 0
        ? "done"
        : began
          ? "current"
          : "todo";
  const step6State: StepState = finishLine ? "done" : began ? "current" : "todo";
  const step7State: StepState = applied ? "done" : "current";

  const currentStepIndex = useMemo(() => {
    if (step1State === "current") return 1;
    if (step2State === "current") return 2;
    if (step3State === "current") return 3;
    if (step4State === "current") return 4;
    if (step5State === "current") return 5;
    if (step6State === "current") return 6;
    if (step7State === "current") return 7;
    return 7;
  }, [step1State, step2State, step3State, step4State, step5State, step6State, step7State]);

  const [openStep, setOpenStep] = useState<number>(currentStepIndex);

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
        | { fields?: string[]; openToAllDisciplines?: boolean }
        | null;
      const fields = (data?.fields ?? []).map((f: string) => f.trim()).filter(Boolean);
      if (fields.length > 0) {
        await updateApplication(application.id, { fields });
      }
      setProgramFetchInfo({
        attempted: true,
        openToAll: data?.openToAllDisciplines === true,
      });
    } catch {
      setProgramFetchInfo((prev) => ({ ...prev, attempted: true }));
    } finally {
      setRefreshingPrograms(false);
    }
  }, [
    application.official_url,
    application.university,
    application.id,
    updateApplication,
  ]);

  // One automatic program-snapshot refresh per session (unchanged behavior)
  useEffect(() => {
    if (autoProgramCheck.current) return;
    if (applied || programEntered || hasProgramOptions) return;
    if (!application.official_url) return;
    const key = `program-options-checked:${application.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      // ignore
    }
    autoProgramCheck.current = true;
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
      // ignore
    }
    router.push("/sop-generator");
  };

  const linkSavedSop = async (sopId: string) => {
    setError("");
    setSuccess("");
    setLinkingSopId(sopId);
    try {
      await updateSOP(sopId, { application_id: application.id });
      setSuccess("SOP linked to this application.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link this SOP.");
    } finally {
      setLinkingSopId(null);
    }
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

  const steps: Array<{
    index: number;
    key: string;
    title: string;
    subtitle: string;
    state: StepState;
  }> = [
    {
      index: 1,
      key: "want-to-apply",
      title: "Want to apply?",
      subtitle: applied ? "Applied" : began ? "Complete" : "Start here",
      state: step1State,
    },
    {
      index: 2,
      key: "program",
      title: "Choose your program",
      subtitle: programEntered ? program : "Not chosen",
      state: step2State,
    },
    {
      index: 3,
      key: "requirements",
      title: "Review requirements",
      subtitle: reviewed ? "Reviewed" : "Pending",
      state: step3State,
    },
    {
      index: 4,
      key: "documents",
      title: "Your documents",
      subtitle:
        docsCount === 0 ? "No official list" : `${docsReady} / ${docsCount} ready`,
      state: step4State,
    },
    {
      index: 5,
      key: "sop",
      title: "SOP",
      subtitle: sopReady ? "Ready" : "Missing",
      state: step5State,
    },
    {
      index: 6,
      key: "review",
      title: "Final review",
      subtitle: finishLine ? "Complete" : "Pending",
      state: step6State,
    },
    {
      index: 7,
      key: "apply",
      title: "Apply on official website",
      subtitle: applied ? "Applied" : officialUrl ? "External website" : "No official link",
      state: step7State,
    },
  ];

  const renderStepContent = (index: number) => {
    switch (index) {
      case 1:
        return (
          <div>
            <p className="text-[13px] text-gray-500">
              Confirm you&apos;re preparing for this scholarship, then work through the
              steps below.
            </p>
            <div className="mt-4">
              <button
                onClick={async () => {
                  setError("");
                  setSuccess("");
                  setStarting(true);
                  try {
                    await updateApplication(application.id, {
                      status: application.status === "Interested" ? "Preparing" : application.status,
                    });
                    setSuccess("Started preparation.");
                    setOpenStep(2);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not start.");
                  } finally {
                    setStarting(false);
                  }
                }}
                disabled={began || starting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Start preparation
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        );
      case 2:
        return (
          <div>
            <p className="text-[13px] text-gray-500">Select the program you want to apply for.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {hasProgramOptions ? (
                <Select
                  className="flex-1"
                  value={programInput}
                  onChange={setProgramInput}
                  options={programOptions.map((p) => ({ value: p, label: p }))}
                  placeholder={
                    refreshingPrograms ? "Checking the official page…" : "Select a program"
                  }
                  disabled={refreshingPrograms}
                  ariaLabel="Choose your program"
                />
              ) : (
                <input
                  type="text"
                  value={programInput}
                  onChange={(e) => setProgramInput(e.target.value)}
                  placeholder={
                    refreshingPrograms
                      ? "Checking the official page…"
                      : programFetchInfo.openToAll
                        ? "Open to all disciplines — type your program"
                        : "Type the program you'll apply for"
                  }
                  disabled={refreshingPrograms}
                  aria-label="Choose your program"
                  className="flex w-full max-w-full items-center gap-3 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 sm:flex-1"
                />
              )}
              <button
                onClick={confirmProgram}
                disabled={!programInput.trim() || programInput === program || savingProgram}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-900 px-5 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingProgram ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : programEntered ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-xs text-gray-500">
                {refreshingPrograms
                  ? "Checking the official page for program options…"
                  : hasProgramOptions
                    ? `${programOptions.length} program${programOptions.length === 1 ? "" : "s"} listed on the official page.`
                    : programFetchInfo.openToAll
                      ? "This scholarship is open to all academic disciplines — type the program you'll apply for."
                      : programFetchInfo.attempted
                        ? "The official page lists no specific programs — type it manually or check again."
                        : "Select or type the program you want to apply for."}
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
            {programEntered && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
                  <Check className="h-4 w-4" />
                  Program selected
                </p>
                <p className="mt-0.5 text-[13px] text-gray-600">{program}</p>
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div>
            <p className="text-[13px] text-gray-500">
              Review the eligibility and document requirements.
            </p>
            {docsCount > 0 && (
              <ul className="mt-4 space-y-2">
                {docStates.map((d) => (
                  <li
                    key={d.required}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5"
                  >
                    <span className="min-w-0 truncate text-[13px] text-gray-700">
                      {d.required}
                    </span>
                    {d.ready ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-deep bg-primary-deep px-2 py-0.5 text-[11px] font-semibold text-white shadow-chip">
                        <Check className="h-3 w-3" />
                        Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        Missing
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <button
                onClick={markRequirementsReviewed}
                disabled={reviewed || markingReviewed}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {markingReviewed ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {reviewed ? "Reviewed" : "Mark as reviewed"}
                    <Check className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        );
      case 4:
        return (
          <div>
            {docsCount === 0 ? (
              <p className="text-[13px] text-gray-500">
                No required documents were listed on the official scholarship page
                for this application.
              </p>
            ) : (
              <div className="space-y-3">
                {docStates.map((d) => (
                  <div
                    key={d.required}
                    className="rounded-xl border border-gray-200 p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-900">{d.required}</p>
                        <p className="mt-0.5 text-[12px] text-gray-500">
                          {d.ready ? "Ready to submit" : "Not uploaded yet"}
                        </p>
                      </div>
                      {d.ready ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-deep bg-primary-deep px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-chip">
                          <Check className="h-3 w-3" />
                          Ready
                        </span>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-900 px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                          {uploading === d.required ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          Upload
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUploadRequired(d.required, f);
                              e.currentTarget.value = "";
                            }}
                            disabled={uploading === d.required}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 5:
        return (
          <div>
            <p className="text-[13px] text-gray-500">
              Create or link your Statement of Purpose for this application.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleCreateSop}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white"
              >
                <FilePlus2 className="h-4 w-4" />
                Create SOP
              </button>
              <Link
                href={`/sop-generator?tab=saved&application_id=${application.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50"
              >
                <FileText className="h-4 w-4" />
                Manage SOPs
              </Link>
            </div>

            {sops.length > 0 && (
              <div className="mt-5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Saved SOPs
                </p>
                <div className="mt-2 space-y-2">
                  {sops.slice(0, 4).map((sop) => {
                    const linkedHere = sop.application_id === application.id;
                    const linkedElsewhere = Boolean(sop.application_id) && !linkedHere;
                    return (
                      <div
                        key={sop.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-gray-900">
                            {sop.university || "University"}
                          </p>
                          <p className="truncate text-[12px] text-gray-500">
                            {sop.program || "Program pending"}
                          </p>
                        </div>
                        {linkedHere ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-deep bg-primary-deep px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-chip">
                            <Check className="h-3 w-3" />
                            Linked
                          </span>
                        ) : (
                          <button
                            onClick={() => linkSavedSop(sop.id)}
                            disabled={linkingSopId === sop.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-900 px-3 py-1.5 text-[12px] font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {linkingSopId === sop.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" />
                            )}
                            {linkedElsewhere ? "Link here" : "Link"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {sops.length > 4 && (
                  <Link
                    href={`/sop-generator?tab=saved&application_id=${application.id}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors hover:decoration-gray-900"
                  >
                    View all {sops.length} saved SOPs
                  </Link>
                )}
              </div>
            )}

            {sopReady && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
                  <Check className="h-4 w-4" />
                  SOP ready
                </p>
                <p className="mt-0.5 text-[12px] text-gray-600">
                  An SOP is linked to this application or matches this program and
                  university.
                </p>
              </div>
            )}
          </div>
        );
      case 6:
        return (
          <div>
            <p className="text-[13px] text-gray-500">Review your summary before applying.</p>
            <ul className="mt-4 space-y-2">
              {[
                { label: "Program selected", valid: programEntered },
                { label: "Requirements reviewed", valid: reviewed },
                {
                  label: "Documents ready",
                  valid: docsCount === 0 || docsMissingCount === 0,
                },
                { label: "Statement of Purpose (SOP)", valid: sopReady },
              ].map((item) => (
                <li
                  key={item.label}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-gray-200 px-3.5 py-2.5"
                >
                  <span className="min-w-0 text-[13px] text-gray-700">{item.label}</span>
                  {item.valid ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-deep bg-primary-deep px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-chip">
                      <Check className="h-3 w-3" />
                      Complete
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                      Missing
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {!finishLine && missingItems.length > 0 && (
              <p className="mt-3 text-[12px] text-gray-500">
                To continue: {missingItems.slice(0, 3).join(", ")}
                {missingItems.length > 3 ? "…" : ""}
              </p>
            )}
            {finishLine && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary-deep bg-primary-deep px-3 py-1 text-[11px] font-semibold text-white shadow-chip">
                <Check className="h-3 w-3" />
                Ready to apply
              </div>
            )}
          </div>
        );
      case 7:
        return (
          <div>
            <p className="text-[13px] text-gray-500">Submit your application on the official website.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {officialUrl && (
                <Link
                  href={officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white"
                >
                  <Globe className="h-4 w-4" />
                  Open official application
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={confirmSubmitted}
                disabled={applied || !finishLine || submitting}
                title={!finishLine ? "Complete the previous steps first" : undefined}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-900 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : applied ? (
                  "Applied"
                ) : (
                  <>
                    Mark as applied
                    <Check className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
            {!applied && !finishLine && (
              <p className="mt-2 text-[12px] text-gray-500">
                Complete the previous steps before marking as applied.
              </p>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
      {/* Header + progress */}
      <div className="border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
          Application preparation journey
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-gray-900 sm:text-lg">
              {application.university}
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-500 sm:text-[13px]">
              {[application.organization, application.country]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary-deep bg-primary-deep px-3 py-1 text-[11px] font-semibold text-white shadow-chip">
            {displayStatus(application.status)}
          </span>
        </div>

        {/* Compact progress bar + percentage */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-gray-700 sm:text-[13px]">Progress</span>
            <span className="tabular-nums text-[12px] font-semibold text-gray-900 sm:text-[13px]">
              {effectivePct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-primary-deep transition-[width] duration-200"
              style={{ width: `${Math.max(0, Math.min(100, effectivePct))}%` }}
            />
          </div>
        </div>

        {/* Horizontal stepper (desktop only — cards carry the flow on mobile) */}
        <div className="mt-5 hidden md:block">
          <div className="flex items-center">
            {steps.map((s, i) => (
              <React.Fragment key={s.key}>
                <button
                  type="button"
                  onClick={() => setOpenStep(s.index)}
                  className="flex min-w-0 flex-col items-center gap-1.5"
                  aria-label={s.title}
                  title={s.title}
                >
                  <StepIcon index={s.index} state={s.state} />
                  <span
                    className={`hidden truncate text-[10px] font-medium lg:inline ${
                      s.state === "done"
                        ? "text-gray-900"
                        : s.state === "current"
                          ? "text-gray-900"
                          : "text-gray-400"
                    }`}
                  >
                    {s.title}
                  </span>
                </button>
                {i < steps.length - 1 && (
                  <div className="h-px flex-1 bg-gray-200" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Step cards */}
      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-primary/20 bg-primary-tint/50 p-3.5 text-sm text-primary-ink">
            {success}
          </div>
        )}

        {applied ? (
          <div className="rounded-xl border border-primary-deep bg-primary-deep p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_30px_-20px_rgba(62,110,146,0.7)] sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-300">
              Application completed
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight sm:text-xl">
              Your application preparation journey is complete.
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-300">
              Status: <span className="font-semibold text-white">Applied</span>.
            </p>
            {officialUrl && (
              <div className="mt-4">
                <Link
                  href={officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100"
                >
                  Open official application
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {steps.map((s) => (
              <StepCard
                key={s.key}
                index={s.index}
                title={s.title}
                subtitle={s.subtitle}
                state={s.state}
                isOpen={openStep === s.index}
                onToggle={() => setOpenStep((cur) => (cur === s.index ? 0 : s.index))}
              >
                {renderStepContent(s.index)}
              </StepCard>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}