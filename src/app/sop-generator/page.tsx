"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  Calendar,
  Check,
  Link2,
  Loader2,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";
import Header from "@/components/Header";
import SOPForm from "@/features/sop-generator/components/SOPForm";
import SOPResult from "@/features/sop-generator/components/SOPResult";
import {
  type ProfileSummaryRow,
  type SOPFormValues,
  type SOPProfileContext,
  type SOPRequest,
  type SOPResponse,
  type SOPPrefillSource,
  generateSOP,
  SOP_PREFILL_KEY,
} from "@/features/sop-generator/sopService";
import {
  type SOPCheckSource,
  SOP_CHECK_SOURCE_KEY,
} from "@/features/claim-checker/claimService";
import { downloadSopAsDocx } from "@/features/sop-generator/docx";
import { useAuthStore } from "@/store/authStore";
import { useAppStore, type SOP } from "@/store/appStore";
import { supabase } from "@/lib/supabase-browser";

interface PrefsRow {
  interests?: string[];
  funding_preferences?: string[];
  destinations?: string[];
  degree_levels?: string[];
  preferred_field?: string | null;
  ielts_status?: string | null;
  ielts_band?: number | null;
}

const EMPTY_FORM: SOPFormValues = {
  university: "",
  program: "",
  wordLimit: "",
  requirements: "",
};

const EMPTY_PREFILL: SOPPrefillSource = { university: "", program: "" };

function ProfileCard({ summary }: { summary: ProfileSummaryRow[] }) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_6px_12px_-8px_rgba(0,0,0,0.4)]">
            <UserRound className="h-4 w-4" />
          </span>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-400">
              Your profile
            </p>
            <h3 className="text-[14px] font-semibold tracking-tight text-gray-900">
              Personalization
            </h3>
          </div>
        </div>
        <Link
          href="/profile"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-900 hover:text-gray-900"
        >
          Edit
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="divide-y divide-gray-100 px-5">
        {summary.map((row) => (
          <li
            key={row.label}
            className="flex items-start justify-between gap-3 py-2.5"
          >
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
              {row.label}
            </span>
            <span className="min-w-0 text-right text-[13px] font-medium text-gray-800 sm:truncate">
              {row.value || (
                <span className="font-normal text-gray-400">Not specified</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-gray-100 bg-gray-50/40 px-5 py-3 text-[11px] text-gray-400">
        Your profile tailors each SOP — keep it up to date.
      </p>
    </aside>
  );
}

export default function SOPGeneratorPage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const { saveSOP } = useAppStore();
  const router = useRouter();

  const [prefs, setPrefs] = useState<PrefsRow | null>(null);
  // One-shot scholarship context handoff from the Scholarship Journey / the
  // application preparation journey. Read once via lazy initializers — the
  // application_id keeps a saved SOP linked to this tracked application.
  const [prefill] = useState<SOPPrefillSource>(() => {
    try {
      if (typeof window === "undefined") return EMPTY_PREFILL;
      const raw = window.sessionStorage.getItem(SOP_PREFILL_KEY);
      if (!raw) return EMPTY_PREFILL;
      const parsed = JSON.parse(raw) as SOPPrefillSource;
      if (!parsed?.university && !parsed?.program) return EMPTY_PREFILL;
      window.sessionStorage.removeItem(SOP_PREFILL_KEY);
      return parsed;
    } catch {
      return EMPTY_PREFILL;
    }
  });
  const [formData, setFormData] = useState<SOPFormValues>(() => ({
    ...EMPTY_FORM,
    university: prefill.university ?? "",
    program: prefill.program ?? "",
    requirements: prefill.requirements?.trim() ?? "",
  }));
  const [step, setStep] = useState<"form" | "generating" | "result">("form");
  const [result, setResult] = useState<SOPResponse | null>(null);
  const [error, setError] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const sops = useAppStore((s) => s.sops);
  const applications = useAppStore((s) => s.applications);
  const updateSOP = useAppStore((s) => s.updateSOP);
  const deleteSOP = useAppStore((s) => s.deleteSOP);

  // Saved SOPs library. The Application Journey deep-links here with
  // ?tab=saved&application_id=<id> so "Manage SOPs" opens the library and the
  // user can link an existing SOP straight back to a tracked application.
  const [openTab, setOpenTab] = useState<"generate" | "saved">(() => {
    try {
      if (typeof window === "undefined") return "generate";
      return new URLSearchParams(window.location.search).get("tab") === "saved"
        ? "saved"
        : "generate";
    } catch {
      return "generate";
    }
  });
  const [linkAppId] = useState<string | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      return (
        new URLSearchParams(window.location.search).get("application_id") ??
        prefill?.application_id ??
        null
      );
    } catch {
      return null;
    }
  });
  // When set, the editor is editing a previously saved SOP (Save updates it
  // instead of creating a brand-new one).
  const [editingSop, setEditingSop] = useState<SOP | null>(null);
  const [linkingSopId, setLinkingSopId] = useState<string | null>(null);
  const [deletingSopId, setDeletingSopId] = useState<string | null>(null);
  const savedSectionRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth");
    }
  }, [isLoading, isAuthenticated, router]);

  // Load preferences best-effort (used only to personalize the SOP, never as a
  // search query).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await supabase
          .from("preferences")
          .select(
            "interests, funding_preferences, destinations, degree_levels, preferred_field, ielts_status, ielts_band",
          )
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (res.data) setPrefs(res.data as PrefsRow);
      } catch {
        // best-effort — generation simply uses whatever profile data exists
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // When the Saved SOPs section is highlighted (deep link from the application
  // journey, or the header pill), bring it into view.
  useEffect(() => {
    if (openTab !== "saved") return;
    savedSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [openTab]);

  const profileContext: SOPProfileContext = useMemo(() => {
    const fullName =
      user?.full_name?.trim() ||
      [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    const location = [user?.city, user?.country].filter(Boolean).join(", ");
    return {
      fullName,
      location,
      educationLevel: user?.education_level ?? "",
      university: user?.university ?? "",
      major: user?.major ?? "",
      graduationYear: user?.graduation_year ?? null,
      gpa: user?.gpa ?? null,
      gpaScale: user?.gpa_scale ?? "",
      interests: prefs?.interests ?? [],
      preferredField: prefs?.preferred_field ?? "",
      ieltsStatus: prefs?.ielts_status ?? "",
      ieltsBand: prefs?.ielts_band ?? null,
      degreeLevels: prefs?.degree_levels ?? [],
      destinations: prefs?.destinations ?? [],
      fundingPreferences: prefs?.funding_preferences ?? [],
    };
  }, [user, prefs]);

  const profileSummary: ProfileSummaryRow[] = useMemo(() => {
    const gpa =
      profileContext.gpa != null
        ? `${profileContext.gpa}${profileContext.gpaScale ? ` / ${profileContext.gpaScale}` : ""}`
        : "";
    return [
      { label: "Name", value: profileContext.fullName },
      { label: "Education level", value: profileContext.educationLevel },
      { label: "University", value: profileContext.university },
      { label: "Field of study", value: profileContext.major },
      { label: "GPA", value: gpa },
      { label: "Interests", value: profileContext.interests.join(", ") },
      { label: "Preferred field", value: profileContext.preferredField },
      { label: "Location", value: profileContext.location },
    ];
  }, [profileContext]);

  const wordLimit = useMemo(() => {
    const n = Number(formData.wordLimit);
    return formData.wordLimit.trim() && Number.isFinite(n) && n > 0
      ? Math.round(n)
      : null;
  }, [formData.wordLimit]);

  const canSubmit = Boolean(formData.university.trim() && formData.program.trim());

  const buildRequest = (
    mode: SOPRequest["mode"],
    current?: { content: string; suggestions: string[] },
  ): SOPRequest => ({
    university: formData.university.trim(),
    program: formData.program.trim(),
    wordLimit,
    requirements: formData.requirements.trim(),
    profile: profileContext,
    mode,
    ...(current ? { currentContent: current.content, suggestions: current.suggestions } : {}),
  });

  const handleGenerate = async () => {
    setError("");
    setEditingSop(null);
    setStep("generating");
    try {
      const res = await generateSOP(buildRequest("generate"));
      setResult(res);
      setIsSaved(false);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong generating your SOP.");
      setStep(result ? "result" : "form");
    }
  };

  const handleRegenerate = async () => {
    setError("");
    setEditingSop(null);
    setStep("generating");
    try {
      const res = await generateSOP(buildRequest("generate"));
      setResult(res);
      setIsSaved(false);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong regenerating.");
      setStep("result");
    }
  };

  const handleImprove = async () => {
    if (!result) return;
    setError("");
    setIsImproving(true);
    try {
      const res = await generateSOP(
        buildRequest("improve", { content: result.content, suggestions: result.suggestions }),
      );
      setResult(res);
      setIsSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong improving the SOP.");
    } finally {
      setIsImproving(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 2000);
    } catch {
      setError("Failed to copy content.");
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setError("");
    setIsSaving(true);
    try {
      const university = formData.university.trim();
      const program = formData.program.trim();
      if (editingSop) {
        await updateSOP(editingSop.id, { university, program, content: result.content });
      } else {
        await saveSOP({
          application_id: linkAppId,
          university,
          program,
          content: result.content,
        });
      }
      setIsSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the SOP.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Saved SOPs library actions ────────────────────────────────────────────
  const openSavedSop = (sop: SOP) => {
    if (editingSop?.id === sop.id) {
      setOpenTab("generate");
      return;
    }
    setError("");
    setEditingSop(sop);
    setFormData({
      university: sop.university,
      program: sop.program,
      wordLimit: "",
      requirements: "",
    });
    setResult({ content: sop.content, suggestions: [] });
    setIsSaved(true);
    setStep("result");
    setOpenTab("generate");
  };

  const discardSavedEdit = () => {
    setEditingSop(null);
    setResult(null);
    setStep("form");
    setFormData({
      ...EMPTY_FORM,
      university: prefill.university ?? "",
      program: prefill.program ?? "",
    });
    setIsSaved(false);
  };

  const linkSopToApp = async (sop: SOP) => {
    if (!linkAppId) return;
    setLinkingSopId(sop.id);
    setError("");
    try {
      await updateSOP(sop.id, { application_id: linkAppId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link this SOP.");
    } finally {
      setLinkingSopId(null);
    }
  };

  const deleteSavedSop = async (sop: SOP) => {
    if (
      !window.confirm(
        `Delete the saved SOP for ${sop.university || "this university"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingSopId(sop.id);
    setError("");
    try {
      await deleteSOP(sop.id);
      if (editingSop?.id === sop.id) discardSavedEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this SOP.");
    } finally {
      setDeletingSopId(null);
    }
  };

  const linkApp = linkAppId ? applications.find((a) => a.id === linkAppId) : null;

  const formatDate = (iso: string | undefined | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const previewOf = (content: string) => {
    const clean = content.replace(/\s+/g, " ").trim();
    return clean.length > 130 ? `${clean.slice(0, 130)}…` : clean;
  };

  const handleDownloadWord = () => {
    if (!result) return;
    try {
      downloadSopAsDocx(result.content, formData.university.trim(), formData.program.trim());
    } catch {
      setError("Failed to generate the Word download.");
    }
  };

  const handleSetContent = (content: string) => {
    setResult((r) => (r ? { ...r, content } : r));
    setIsSaved(false);
  };

  const handleCheckClaims = () => {
    if (!result) return;
    try {
      const payload: SOPCheckSource = {
        content: result.content,
        university: formData.university.trim(),
        program: formData.program.trim(),
      };
      window.sessionStorage.setItem(SOP_CHECK_SOURCE_KEY, JSON.stringify(payload));
    } catch {
      // if storage is unavailable the user can paste manually in the checker
    }
    router.push("/claim-checker");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="flex-1">
        <Header />

        <div className="mx-auto max-w-6xl p-4 sm:p-8">
          {/* Page header */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                Application documents
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                SOP Generator
              </h1>
              <p className="mt-1 text-gray-500">
                A university-specific statement of purpose, built from your profile and
                your own instructions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenTab("saved")}
              aria-label="View saved SOPs"
              className={`group inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 ${
                openTab === "saved"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-900 hover:text-gray-900"
              }`}
            >
              <BookMarked className="h-4 w-4" />
              Saved SOPs
              {sops.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    openTab === "saved"
                      ? "bg-white text-gray-900"
                      : "bg-gray-900 text-white group-hover:bg-gray-800"
                  }`}
                >
                  {sops.length}
                </span>
              )}
            </button>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === "form" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SOPForm
                  formData={formData}
                  setFormData={setFormData}
                  canSubmit={canSubmit}
                  onSubmit={handleGenerate}
                />
              </div>
              <div className="lg:col-span-1">
                <div className="lg:sticky lg:top-6">
                  <ProfileCard summary={profileSummary} />
                </div>
              </div>
            </div>
          )}

          {step === "generating" && (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)]">
              <div className="flex items-start gap-4 p-6 sm:p-8">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-deep text-white shadow-[0_1px_2px_rgba(36,60,76,0.4),0_10px_18px_-12px_rgba(62,110,146,0.55)]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold tracking-tight text-gray-900">
                    Writing your {formData.program.trim() || "program"} SOP…
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                    Tailoring every paragraph for {formData.university.trim() || "your university"}{" "}
                    from your profile and instructions. This usually takes about a minute.
                  </p>
                  <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-6">
              {editingSop && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)]">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_6px_12px_-8px_rgba(0,0,0,0.4)]">
                      <Pencil className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900">
                        Editing a saved SOP
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-gray-500">
                        {editingSop.university || "University"} · {editingSop.program || "Program"}{" "}
                        — saved {formatDate(editingSop.created_at)}. Saving updates this saved
                        draft.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={discardSavedEdit}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
                  >
                    Start a new SOP
                  </button>
                </div>
              )}

              <SOPResult
                content={result.content}
                suggestions={result.suggestions}
                university={formData.university.trim()}
                program={formData.program.trim()}
                wordLimit={wordLimit}
                setContent={handleSetContent}
                onRegenerate={handleRegenerate}
                onImprove={handleImprove}
                onCopy={handleCopy}
                onSave={handleSave}
                onDownloadWord={handleDownloadWord}
                onCheckClaims={handleCheckClaims}
                isCopying={isCopying}
                isImproving={isImproving}
                isSaving={isSaving}
                isSaved={isSaved}
              />
            </div>
          )}

          {/* Saved SOPs panel */}
          <section
            ref={savedSectionRef}
            aria-label="Saved SOPs"
            className={`mt-10 scroll-mt-6 rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)] transition-colors duration-200 sm:p-6 ${
              openTab === "saved"
                ? "border-gray-900/40 ring-2 ring-gray-900/5"
                : "border-gray-200"
            }`}
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                  Your library
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                  Saved SOPs
                </h2>
                <p className="mt-1 text-[12px] text-gray-500">
                  Edit to keep writing, or link one to a tracked application.
                </p>
                {linkApp && (
                  <p className="mt-1.5 text-[12px] font-medium text-gray-700">
                    Linking to application — {linkApp.university}
                    {linkApp.program && linkApp.program !== "To be selected"
                      ? ` · ${linkApp.program}`
                      : ""}
                  </p>
                )}
              </div>
              {sops.length > 0 && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-gray-900 bg-gray-900 px-3 py-1 text-[11px] font-semibold text-white">
                  {sops.length} {sops.length === 1 ? "SOP" : "SOPs"}
                </span>
              )}
            </div>

            {linkApp && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary-tint/50 px-4 py-3 text-[13px] text-primary-ink">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Choose a saved SOP and press{" "}
                  <span className="font-semibold text-gray-900">Link</span> to attach it to this
                  application, then head back to your application journey.
                </p>
              </div>
            )}

            {sops.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/40 px-6 py-14 text-center">
                <BookMarked className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-gray-900">No saved SOPs yet</p>
                <p className="mt-1 text-[13px] text-gray-500">
                  Generate a statement of purpose and press Save SOP to build your library.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sops.map((sop) => {
                  const linkedHere = sop.application_id === linkAppId;
                  const linkedApp = sop.application_id
                    ? applications.find((a) => a.id === sop.application_id)
                    : null;
                  const isLinking = linkingSopId === sop.id;
                  const isDeleting = deletingSopId === sop.id;
                  return (
                    <div
                      key={sop.id}
                      className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-18px_rgba(0,0,0,0.4)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_28px_-18px_rgba(0,0,0,0.45)]"
                    >
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="min-w-0 truncate text-[14px] font-semibold tracking-tight text-gray-900">
                            {sop.university || "University"}
                          </h3>
                          {linkAppId && linkedHere ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-900 bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                              <Check className="h-3 w-3" />
                              Linked
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                              Saved
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[13px] font-medium text-gray-600">
                          {sop.program || "Program pending"}
                        </p>
                        <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-gray-500">
                          {previewOf(sop.content)}
                        </p>
                        {sop.application_id && !linkedHere && linkedApp && (
                          <p className="mt-2 text-[11px] text-gray-400">
                            Currently linked to {linkedApp.university}
                          </p>
                        )}
                      </div>
                      <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                            <Calendar className="h-3.5 w-3.5" />
                            Saved {formatDate(sop.created_at)}
                          </span>
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openSavedSop(sop)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900 sm:h-7"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                            {linkAppId && !linkedHere && (
                              <button
                                type="button"
                                onClick={() => linkSopToApp(sop)}
                                disabled={isLinking}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-900 bg-white px-2.5 text-[11px] font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:h-7"
                              >
                                {isLinking ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Link2 className="h-3 w-3" />
                                )}
                                Link
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteSavedSop(sop)}
                              disabled={isDeleting}
                              aria-label="Delete saved SOP"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 sm:h-7 sm:w-7"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}