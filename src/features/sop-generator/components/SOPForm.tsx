import React from "react";
import Link from "next/link";
import {
  GraduationCap,
  FileText,
  MessageSquareText,
  UserRound,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Field, inputClass } from "@/features/onboarding/components/Field";
import type {
  ProfileSummaryRow,
  SOPFormValues,
} from "@/features/sop-generator/sopService";

interface SOPFormProps {
  formData: SOPFormValues;
  setFormData: React.Dispatch<React.SetStateAction<SOPFormValues>>;
  profileSummary: ProfileSummaryRow[];
  canSubmit: boolean;
  onSubmit: () => void;
}

function StepHeader({
  eyebrow,
  title,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
          {eyebrow}
        </p>
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">
          {title}
        </h2>
      </div>
    </div>
  );
}

function MiniRow({ label, value }: ProfileSummaryRow) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-gray-900">
        {value || <span className="font-normal text-gray-400">Not specified</span>}
      </p>
    </div>
  );
}

export default function SOPForm({
  formData,
  setFormData,
  profileSummary,
  canSubmit,
  onSubmit,
}: SOPFormProps) {
  const patch = <K extends keyof SOPFormValues>(key: K, value: SOPFormValues[K]) => {
    setFormData((f) => ({ ...f, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="space-y-6"
    >
      {/* Step 01 — Target */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <StepHeader
          eyebrow="Step 01"
          title="Target university & program"
          icon={GraduationCap}
        />
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <Field label="University" required id="university">
            <input
              id="university"
              value={formData.university}
              onChange={(e) => patch("university", e.target.value)}
              className={inputClass}
              placeholder="e.g. Technical University of Munich"
            />
          </Field>
          <Field label="Program" required id="program">
            <input
              id="program"
              value={formData.program}
              onChange={(e) => patch("program", e.target.value)}
              className={inputClass}
              placeholder="e.g. MSc Artificial Intelligence"
            />
          </Field>
        </div>
      </section>

      {/* Step 02 — Official requirements */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <StepHeader
          eyebrow="Step 02"
          title="Official SOP requirements"
          icon={FileText}
        />
        <div className="space-y-5 p-6">
          <div className="max-w-xs">
            <Field
              label="Word limit"
              hint="From the university's official prompt. Leave empty if not specified."
              id="wordLimit"
            >
              <input
                id="wordLimit"
                type="number"
                min={1}
                placeholder="e.g. 750"
                value={formData.wordLimit}
                onChange={(e) => patch("wordLimit", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field
            label="Requirements / prompt"
            hint="Paste the university's official SOP prompt, structure, and any instructions. We follow it exactly — nothing is invented."
            id="requirements"
          >
            <textarea
              id="requirements"
              rows={4}
              value={formData.requirements}
              onChange={(e) => patch("requirements", e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="e.g. Discuss your academic background, reasons for choosing this program, your career goals, and one challenge you have overcome..."
            ></textarea>
          </Field>
        </div>
      </section>

      {/* Step 03 — Your prompt */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <StepHeader eyebrow="Step 03" title="Your instructions" icon={MessageSquareText} />
        <div className="space-y-5 p-6">
          <Field
            label="What should the SOP focus on?"
            hint="Describe what to emphasize. We combine this with your profile — no facts are invented."
            id="prompt"
          >
            <textarea
              id="prompt"
              rows={4}
              value={formData.prompt}
              onChange={(e) => patch("prompt", e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder='e.g. Generate a 750-word SOP for MSc AI. Focus on my Computer Engineering background, AI projects, and career goals.'
            ></textarea>
          </Field>
          <Field
            label="Extra context (optional)"
            hint="Anything beyond your profile: specific projects, internships, publications, or reasons for this program."
            id="additionalInfo"
          >
            <textarea
              id="additionalInfo"
              rows={3}
              value={formData.additionalInfo}
              onChange={(e) => patch("additionalInfo", e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="e.g. Led a fraud-detection model with 40% fewer false positives; interned at X as a Data Science intern."
            ></textarea>
          </Field>
        </div>
      </section>

      {/* Profile summary — read-only */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                Your profile
              </p>
              <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">
                Personalization data
              </h2>
            </div>
            <Link
              href="/profile"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-900 hover:text-gray-900"
            >
              Edit in Profile
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {profileSummary.map((row) => (
            <MiniRow key={row.label} {...row} />
          ))}
        </div>
      </section>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-4 text-[15px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles className="h-4.5 w-4.5" />
        Generate SOP
      </button>
      {!canSubmit && (
        <p className="text-center text-xs text-gray-400">
          Enter a university and program to generate your SOP.
        </p>
      )}
    </form>
  );
}