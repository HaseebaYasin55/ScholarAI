import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { countWords } from "@/features/sop-generator/sopService";

interface SOPResultProps {
  content: string;
  suggestions: string[];
  university: string;
  program: string;
  wordLimit: number | null;
  setContent: (content: string) => void;
  onRegenerate: () => void;
  onImprove: () => void;
  onCopy: () => void;
  onSave: () => void;
  onDownloadWord: () => void;
  onCheckClaims: () => void;
  isCopying: boolean;
  isImproving: boolean;
  isSaving: boolean;
  isSaved: boolean;
}

function ActionButton({
  onClick,
  disabled,
  children,
  primary,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const base =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const style = primary
    ? "bg-primary-deep text-white hover:bg-primary-ink shadow-chip"
    : "border border-gray-200 bg-white text-gray-700 hover:border-gray-900 hover:text-gray-900";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

export default function SOPResult({
  content,
  suggestions,
  university,
  program,
  wordLimit,
  setContent,
  onRegenerate,
  onImprove,
  onCopy,
  onSave,
  onDownloadWord,
  onCheckClaims,
  isCopying,
  isImproving,
  isSaving,
  isSaved,
}: SOPResultProps) {
  const count = countWords(content);
  const over = wordLimit != null ? count - wordLimit : null;
  const isOver = over != null && over > 0;

  return (
    <div className="space-y-6">
      {/* Document header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
            Generated document
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
            Statement of Purpose
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {program} · {university}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${
              isOver
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-gray-200 bg-gray-50 text-gray-600"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            {count} {count === 1 ? "word" : "words"}
            {wordLimit != null ? ` / ${wordLimit}` : ""}
          </span>
          <ActionButton
            onClick={onSave}
            disabled={isSaving || isSaved}
          >
            {isSaved ? (
              <>
                <Check className="h-3.5 w-3.5" /> Saved
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Save SOP
              </>
            )}
          </ActionButton>
          <ActionButton onClick={onCopy} disabled={isCopying}>
            {isCopying ? (
              <>
                <Check className="h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy
              </>
            )}
          </ActionButton>
          <ActionButton onClick={onDownloadWord}>
            <>
              <Download className="h-3.5 w-3.5" /> Download Word
            </>
          </ActionButton>
          <ActionButton onClick={onRegenerate} disabled={isImproving}>
            <RotateCcw className="h-3.5 w-3.5" /> Regenerate
          </ActionButton>
          <ActionButton onClick={onImprove} disabled={isImproving} primary>
            {isImproving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Improving…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Improve
              </>
            )}
          </ActionButton>
        </div>
      </div>

      {/* Over-limit warning */}
      {isOver && wordLimit != null && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Your SOP is <span className="font-semibold">{over} words over</span> the{" "}
            {wordLimit}-word limit. Shorten it before submitting.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Editor */}
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div
              className={`flex items-center justify-between border-b px-6 py-4 ${
                isOver ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-gray-50/70"
              }`}
            >
              <span className="text-sm font-semibold text-gray-700">SOP editor</span>
              <span className="text-xs font-medium text-gray-400">
                Edit directly — the word count updates live.
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck
              className={`w-full min-h-[560px] resize-none bg-white px-8 py-8 font-serif text-[15px] leading-7 text-gray-800 focus:outline-none md:px-12 ${
                isOver ? "text-red-900/60" : ""
              }`}
            />
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/40 px-6 py-3 text-xs text-gray-400">
              <span>Paragraphs are separated by blank lines.</span>
              <span className="font-mono">
                {count} {count === 1 ? "word" : "words"}
                {wordLimit != null ? ` / ${wordLimit}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div className="space-y-5 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-gray-900">AI suggestions</h3>
            </div>
            <div className="space-y-3 p-5">
              {suggestions.length === 0 ? (
                <p className="text-[13px] text-gray-400">No suggestions yet.</p>
              ) : (
                suggestions.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-relaxed text-gray-600">{s}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Before you submit</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
              Check each claim in this SOP against your supporting documents so you
              never submit something you can&apos;t back up.
            </p>
            <button
              type="button"
              onClick={onCheckClaims}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-deep px-3.5 text-[13px] font-semibold text-white shadow-chip transition-colors hover:bg-primary-ink"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Check claims
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}