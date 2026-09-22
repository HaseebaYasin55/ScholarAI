import { ShieldCheck, FileText, GraduationCap, Sparkles } from "lucide-react";
import { countWords } from "@/features/claim-checker/claimService";

interface ClaimInputProps {
  content: string;
  source: { university: string; program: string } | null;
  setContent: (content: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
}

export default function ClaimInput({
  content,
  source,
  setContent,
  onSubmit,
  canSubmit,
}: ClaimInputProps) {
  const count = countWords(content);

  return (
    <div className="space-y-5">
      {source && (source.university || source.program) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-deep text-white shadow-chip">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Loaded from your generated SOP
            </p>
            <p className="text-xs text-gray-500">
              {[source.program, source.university].filter(Boolean).join(" · ") || "Statement of Purpose"}
            </p>
          </div>
          <span className="ml-auto rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500">
            Edit and re-check
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/70 px-6 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <FileText className="h-4 w-4 text-gray-400" />
            Your document
          </span>
          <span className="text-xs font-medium text-gray-400">
            Edit directly — every change is re-analyzed.
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck
          className="min-h-[420px] w-full resize-none bg-white px-8 py-8 font-serif text-[15px] leading-7 text-gray-800 focus:outline-none md:px-12"
          placeholder={
            "Paste your Statement of Purpose here,\n\nor generate one in SOP Generator and choose “Check claims”."
          }
        ></textarea>
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/40 px-6 py-3 text-xs text-gray-400">
          <span>We only flag factual statements — never your goals or motivation.</span>
          <span className="font-mono">
            {count} {count === 1 ? "word" : "words"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-deep px-6 py-4 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(36,60,76,0.4),0_14px_26px_-14px_rgba(62,110,146,0.55)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-ink hover:shadow-[0_1px_2px_rgba(36,60,76,0.4),0_18px_32px_-14px_rgba(62,110,146,0.5)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        <Sparkles className="h-4.5 w-4.5" />
        Check Claims
      </button>
      {!canSubmit ? (
        <p className="text-center text-xs text-gray-400">
          Add your SOP to check it for unsupported claims.
        </p>
      ) : (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verifies claims against your profile and supporting documents. Nothing is invented.
        </p>
      )}
    </div>
  );
}