import React from "react";
import { Check, FileText, GraduationCap, Sparkles } from "lucide-react";
import { Field, inputClass } from "@/features/onboarding/components/Field";
import type { SOPFormValues } from "@/features/sop-generator/sopService";

interface SOPFormProps {
  formData: SOPFormValues;
  setFormData: React.Dispatch<React.SetStateAction<SOPFormValues>>;
  canSubmit: boolean;
  onSubmit: () => void;
}

function StepNode({
  done,
  number,
  label,
}: {
  done: boolean;
  number: string;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-200 ${
          done
            ? "bg-gray-900 text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_14px_-8px_rgba(0,0,0,0.5)]"
            : "border border-gray-300 bg-white text-gray-500"
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : number}
      </span>
      <span
        className={`hidden text-[13px] font-semibold sm:block ${
          done ? "text-gray-900" : "text-gray-500"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepHeader({
  number,
  title,
  icon: Icon,
  done,
}: {
  number: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_6px_12px_-8px_rgba(0,0,0,0.4)] transition-colors duration-200 ${
          done ? "bg-gray-900" : "bg-gray-500"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
          Step {number}
        </p>
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">
          {title}
        </h2>
      </div>
    </div>
  );
}

export default function SOPForm({
  formData,
  setFormData,
  canSubmit,
  onSubmit,
}: SOPFormProps) {
  const patch = <K extends keyof SOPFormValues>(key: K, value: SOPFormValues[K]) => {
    setFormData((f) => ({ ...f, [key]: value }));
  };

  const step1Done = Boolean(formData.university.trim() && formData.program.trim());
  const wordInput = formData.wordLimit.trim();
  const wordValid =
    Boolean(wordInput) && Number.isFinite(Number(wordInput)) && Number(wordInput) > 0;
  const step2Done = wordValid || Boolean(formData.requirements.trim());
  const pct = (step1Done ? 50 : 0) + (step2Done ? 50 : 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="space-y-6"
    >
      {/* Stepper progress */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)] sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <StepNode done={step1Done} number="01" label="Target" />
          <div className="relative h-px flex-1 bg-gray-200">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gray-900 transition-all duration-500"
              style={{ width: `${step1Done ? 100 : 0}%` }}
            />
          </div>
          <StepNode done={step2Done} number="02" label="Requirements" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="text-[11px] text-gray-400">
            Step 01 — university &amp; program · Step 02 — official requirements
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              pct === 100
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {pct === 100 ? (
              <>
                <Check className="h-3 w-3" />
                Ready to generate
              </>
            ) : (
              `${pct}% complete`
            )}
          </span>
        </div>
      </div>

      {/* Step 01 — Target */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)]">
        <StepHeader
          number="01"
          title="Target university & program"
          icon={GraduationCap}
          done={step1Done}
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
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_30px_-26px_rgba(0,0,0,0.3)]">
        <StepHeader
          number="02"
          title="Official SOP requirements"
          icon={FileText}
          done={step2Done}
        />
        <div className="space-y-5 p-6">
          <div className="max-w-xs">
            <Field
              label="Word limit"
              hint="From the university's official prompt. Leave empty if not specified."
              id="wordLimit"
            >
              <div className="flex items-center rounded-xl border border-gray-300 bg-white transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/10">
                <input
                  id="wordLimit"
                  type="number"
                  min={1}
                  placeholder="e.g. 750"
                  value={formData.wordLimit}
                  onChange={(e) => patch("wordLimit", e.target.value)}
                  className="w-full bg-transparent px-4 py-3 font-mono text-[15px] text-gray-900 outline-none placeholder:font-sans placeholder:text-gray-400"
                />
                <span className="shrink-0 pr-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  max words
                </span>
              </div>
            </Field>
          </div>

          <Field
            label="Requirements / prompt"
            hint="Paste the university's official SOP prompt, structure, and any instructions. We follow it exactly — nothing is invented."
            id="requirements"
          >
            <div className="relative">
              <textarea
                id="requirements"
                rows={6}
                value={formData.requirements}
                onChange={(e) => patch("requirements", e.target.value)}
                className={`${inputClass} resize-none pb-8 leading-relaxed`}
                placeholder="e.g. Discuss your academic background, reasons for choosing this program, your career goals, and one challenge you have overcome..."
              ></textarea>
              <span className="pointer-events-none absolute bottom-2.5 right-3.5 font-mono text-[10px] text-gray-400">
                {formData.requirements.length} characters
              </span>
            </div>
          </Field>
        </div>
      </section>

      <button
        type="submit"
        disabled={!canSubmit}
        className="group w-full rounded-2xl bg-gray-900 px-6 py-4 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),0_14px_26px_-14px_rgba(0,0,0,0.5)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_32px_-14px_rgba(0,0,0,0.45)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Sparkles className="h-4.5 w-4.5" />
          Generate SOP
        </span>
      </button>
      {!canSubmit && (
        <p className="text-center text-xs text-gray-400">
          Enter a university and program to generate your SOP.
        </p>
      )}
    </form>
  );
}