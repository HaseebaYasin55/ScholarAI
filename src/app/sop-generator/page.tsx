"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useAppStore } from "@/store/appStore";
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
      await saveSOP({
        application_id: prefill?.application_id ?? null,
        university: formData.university.trim(),
        program: formData.program.trim(),
        content: result.content,
      });
      setIsSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the SOP.");
    } finally {
      setIsSaving(false);
    }
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
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="flex-1">
        <Header />

        <div className="p-8 max-w-6xl mx-auto">
          {/* Page header */}
          <div className="mb-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
              Application documents
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-1">
              SOP Generator
            </h1>
            <p className="text-gray-500 mt-1">
              A university-specific statement of purpose, built from your profile and
              your own instructions.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === "form" && (
            <SOPForm
              formData={formData}
              setFormData={setFormData}
              profileSummary={profileSummary}
              canSubmit={canSubmit}
              onSubmit={handleGenerate}
            />
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-24 shadow-sm">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-gray-900">
                Writing your SOP…
              </h3>
              <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
                Tailoring a {formData.program || "program"} statement for{" "}
                {formData.university || "your university"} from your profile and
                instructions.
              </p>
            </div>
          )}

          {step === "result" && result && (
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
          )}
        </div>
      </main>
    </div>
  );
}