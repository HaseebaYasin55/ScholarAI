"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  FileUp,
} from "lucide-react";
import { useAppStore, APPLICATION_STATUSES } from "@/store/appStore";
import type { ApplicationStatus, Document } from "@/store/appStore";
import { useRequireOnboarding } from "@/hooks/useRequireOnboarding";
import Header from "@/components/Header";
import { formatLongDate, daysUntil } from "@/lib/scholarship/format";
import { displayStatus, appStatusPillClass } from "@/features/application-tracking/status";
import { docMeets } from "@/lib/scholarship/documents";
import {
  applicationJourneyUrl,
  applicationLink,
} from "@/features/application-tracking/scholarshipApps";

const UNSELECTED = "To be selected";

function RequiredDocumentRow({
  required,
  uploaded,
  onUpload,
}: {
  required: string;
  uploaded: Document | undefined;
  onUpload: (doc: string, file: File) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await onUpload(required, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 not-last:border-b not-last:border-gray-100">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-gray-900">
          {required}
        </p>
        {uploaded ? (
          <p className="mt-0.5 truncate text-[11px] text-gray-400">
            {uploaded.file_path
              ? decodeURIComponent(uploaded.file_path.split("/").pop() ?? "")
              : uploaded.name}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-gray-400">Not uploaded</p>
        )}
      </div>
      {uploaded ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-900 bg-gray-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">
          <Check className="h-3 w-3" />
          Uploaded
        </span>
      ) : (
        <div className="shrink-0 text-right">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            <FileUp className="h-3 w-3" />
            Upload
          </button>
          {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      )}
    </div>
  );
}

function ApplicationCard() {
  const { applications, documents, addDocument, uploadDocumentFile, updateApplication } =
    useAppStore();

  return (
    <>
      {applications.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-gray-900">
            No applications yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-gray-500">
            Open a scholarship and press{" "}
            <span className="font-semibold text-gray-900">&quot;I want to apply&quot;</span>{" "}
            to start tracking it here.
          </p>
          <Link
            href="/scholarships"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            Discover scholarships
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {applications.map((app) => {
            const days = daysUntil(app.deadline);
            const deadlinePassed = days !== null && days < 0;

            const appDocs = documents.filter(
              (d) =>
                d.university === "General" || d.university === app.university,
            );

            const requiredDocs = app.required_documents ?? [];

            const handleUpload = async (required: string, file: File) => {
              const existing = appDocs.find((d) => docMeets(d, required));
              if (existing) {
                await uploadDocumentFile(existing.id, file);
                return;
              }
              const docId = await addDocument({
                name: required,
                university: app.university,
                status: "Missing",
                deadline: app.deadline ?? "",
                description: `Required document for ${app.university}`,
              });
              await uploadDocumentFile(docId, file);
            };

            const changeStatus = async (status: ApplicationStatus) => {
              try {
                await updateApplication(app.id, { status });
              } catch {
                // keep local state as-is; error surfaces on next load
              }
            };

            return (
              <div
                key={app.id}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">
                      {app.organization ?? "Application"}
                      {app.country ? ` · ${app.country}` : ""}
                    </p>
                    <Link
                      href={applicationLink(app)}
                      className="mt-1.5 block text-[15px] font-semibold leading-snug text-gray-900 hover:underline"
                    >
                      {app.university}
                    </Link>
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      {app.program === UNSELECTED
                        ? "Program to be selected"
                        : app.program}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-gray-900 bg-gray-900 px-3 py-1 text-[11px] font-semibold text-white">
                    In My Applications
                  </span>
                </div>

                {app.description && (
                  <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
                    {app.description}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-gray-100 py-3">
                  <label className="flex items-center gap-2 text-[13px] text-gray-500">
                    Status
                    <select
                      value={app.status}
                      onChange={(e) =>
                        changeStatus(e.target.value as ApplicationStatus)
                      }
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-gray-900 focus:border-gray-400 focus:outline-none"
                    >
                      {APPLICATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {displayStatus(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${appStatusPillClass(app.status)}`}
                  >
                    {displayStatus(app.status)}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gray-900"
                        style={{ width: `${app.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600">
                      {app.progress}%
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      deadlinePassed ? "text-red-600" : "text-gray-600"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {formatLongDate(app.deadline)}
                    {deadlinePassed && " · Deadline passed"}
                  </span>
                  {app.official_url && (
                    <a
                      href={app.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-gray-500 hover:text-gray-900"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Official page
                    </a>
                  )}
                </div>

                <div className="mt-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Required documents
                  </p>
                  {requiredDocs.length > 0 ? (
                    <div className="mt-1 divide-y divide-gray-100 border-b border-gray-100">
                      {requiredDocs.map((doc) => (
                        <RequiredDocumentRow
                          key={doc}
                          required={doc}
                          uploaded={appDocs.find((d) => docMeets(d, doc))}
                          onUpload={handleUpload}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-gray-500">
                      Required documents not specified on the available official
                      information.
                    </p>
                  )}
                </div>

                <div className="mt-auto pt-5">
                  <Link
                    href={applicationJourneyUrl(app)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 hover:underline"
                  >
                    Continue application
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function ApplicationsPage() {
  const { ready } = useRequireOnboarding();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            My Applications
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Applications you explicitly chose to track. Update status manually —
            nothing here changes automatically.
          </p>
        </header>

        <ApplicationCard />
      </main>
    </div>
  );
}