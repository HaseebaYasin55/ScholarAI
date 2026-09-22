"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import ClaimInput from "@/features/claim-checker/components/ClaimInput";
import ClaimResult from "@/features/claim-checker/components/ClaimResult";
import {
  type SOPClaimCheckResponse,
  type SOPCheckSource,
  SOP_CHECK_SOURCE_KEY,
  checkSopClaims,
} from "@/features/claim-checker/claimService";
import { useAuthStore } from "@/store/authStore";
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

export default function ClaimCheckerPage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  const [step, setStep] = useState<"edit" | "checking" | "results">("edit");
  const [content, setContent] = useState("");
  const [source, setSource] = useState<{ university: string; program: string } | null>(null);
  const [result, setResult] = useState<SOPClaimCheckResponse | null>(null);
  const [isRechecking, setIsRechecking] = useState(false);
  const [error, setError] = useState("");
  const [prefs, setPrefs] = useState<PrefsRow | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth");
    }
  }, [isLoading, isAuthenticated, router]);

  // Load a SOP handed over from the SOP Generator (no copy/paste needed).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SOP_CHECK_SOURCE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SOPCheckSource>;
        if (parsed?.content) {
          const loaded = { content: parsed.content, university: parsed.university ?? "", program: parsed.program ?? "" };
          queueMicrotask(() => {
            setContent(loaded.content);
            setSource({ university: loaded.university, program: loaded.program });
          });
        }
        window.sessionStorage.removeItem(SOP_CHECK_SOURCE_KEY);
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Load preferences to build a supporting context for verification.
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
        // best-effort — checking works with an empty context
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const supportingContext = useMemo(() => {
    const lines: string[] = [];
    if (!user) return "";
    if (user.full_name) lines.push(`Name: ${user.full_name}`);
    if (user.city || user.country)
      lines.push(`Location: ${[user.city, user.country].filter(Boolean).join(", ")}`);
    if (user.education_level) lines.push(`Education level: ${user.education_level}`);
    if (user.university) lines.push(`University: ${user.university}`);
    if (user.major) lines.push(`Field of study / major: ${user.major}`);
    if (user.graduation_year) lines.push(`Graduation year: ${user.graduation_year}`);
    if (user.gpa != null)
      lines.push(`GPA: ${user.gpa}${user.gpa_scale ? ` / ${user.gpa_scale}` : ""}`);
    if (prefs?.interests?.length) lines.push(`Areas of interest: ${prefs.interests.join(", ")}`);
    if (prefs?.preferred_field) lines.push(`Preferred field: ${prefs.preferred_field}`);
    if (prefs?.degree_levels?.length)
      lines.push(`Degree levels: ${prefs.degree_levels.join(", ")}`);
    if (prefs?.destinations?.length)
      lines.push(`Destinations: ${prefs.destinations.join(", ")}`);
    if (prefs?.funding_preferences?.length)
      lines.push(`Funding preferences: ${prefs.funding_preferences.join(", ")}`);
    if (prefs?.ielts_status)
      lines.push(
        `English proficiency: ${prefs.ielts_status}${prefs.ielts_band ? ` · Band ${prefs.ielts_band}` : ""}`,
      );
    return lines.join("\n");
  }, [user, prefs]);

  const canSubmit = Boolean(content.trim());

  const handleCheck = async () => {
    if (!canSubmit) return;
    setError("");
    setStep("checking");
    try {
      const res = await checkSopClaims({
        document: content,
        supportingContext,
      });
      setResult(res);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze the claims.");
      setStep("edit");
    }
  };

  const handleRecheck = async () => {
    if (!result) return;
    setError("");
    setIsRechecking(true);
    try {
      const res = await checkSopClaims({
        document: content,
        supportingContext,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze the claims.");
    } finally {
      setIsRechecking(false);
    }
  };

  const handleEdit = () => setStep("edit");

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
          <div className="mb-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
              Application documents · Quality check
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-1">
              Claim Checker
            </h1>
            <p className="text-gray-500 mt-2 max-w-2xl">
              We scan the statements in your SOP and flag the ones that would need
              proof — so you never submit a claim you can&apos;t back up.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === "edit" && (
            <ClaimInput
              content={content}
              setContent={setContent}
              source={source}
              canSubmit={canSubmit}
              onSubmit={handleCheck}
            />
          )}

          {step === "checking" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-24 shadow-card">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-gray-900">
                Analyzing claims…
              </h3>
              <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
                Extracting each factual statement and verifying it against your
                profile and supporting documents.
              </p>
            </div>
          )}

          {step === "results" && result && (
            <ClaimResult
              claims={result.claims}
              summary={result.summary}
              onEdit={handleEdit}
              onRecheck={handleRecheck}
              isRechecking={isRechecking}
            />
          )}
        </div>
      </main>
    </div>
  );
}