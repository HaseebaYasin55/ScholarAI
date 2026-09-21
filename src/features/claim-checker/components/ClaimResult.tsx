import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  Lightbulb,
  PencilLine,
  RotateCcw,
} from "lucide-react";
import type {
  ClaimCheck,
  ClaimStatus,
} from "@/features/claim-checker/claimService";

interface ClaimResultProps {
  claims: ClaimCheck[];
  summary: {
    total: number;
    supported: number;
    needs_verification: number;
    potentially_unsupported: number;
  };
  onEdit: () => void;
  onRecheck: () => void;
  isRechecking?: boolean;
}

const STATUS_CONFIG: Record<
  ClaimStatus,
  { icon: typeof CheckCircle2; label: string; chip: string }
> = {
  Supported: {
    icon: CheckCircle2,
    label: "Supported",
    chip: "border-gray-900 bg-gray-900 text-white",
  },
  "Needs verification": {
    icon: HelpCircle,
    label: "Needs verification",
    chip: "border-gray-300 bg-white text-gray-700",
  },
  "Potentially unsupported": {
    icon: AlertTriangle,
    label: "Potentially unsupported",
    chip: "border-2 border-gray-900 bg-white text-gray-900",
  },
};

const SUMMARY_ITEMS: {
  count: "supported" | "needs_verification" | "potentially_unsupported";
  label: ClaimStatus;
  chip: string;
}[] = [
  {
    count: "supported",
    label: "Supported",
    chip: "border-gray-900 bg-gray-900 text-white",
  },
  {
    count: "needs_verification",
    label: "Needs verification",
    chip: "border-gray-300 bg-white text-gray-700",
  },
  {
    count: "potentially_unsupported",
    label: "Potentially unsupported",
    chip: "border-2 border-gray-900 bg-white text-gray-900",
  },
];

export default function ClaimResult({
  claims,
  summary,
  onEdit,
  onRecheck,
  isRechecking,
}: ClaimResultProps) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{summary.total}</span>{" "}
          {summary.total === 1 ? "claim" : "claims"} found in your SOP
        </p>
        <div className="flex flex-wrap gap-2">
          {SUMMARY_ITEMS.map((item) => {
            const { icon: Icon } = STATUS_CONFIG[item.label];
            return (
              <span
                key={item.count}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${item.chip}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {summary[item.count]}
                <span className="font-normal opacity-80">· {item.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Claims list */}
      {claims.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-900">No claims found.</p>
          <p className="mt-1 text-[13px] text-gray-400">
            Nothing obviously factual was detected in this document.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim, index) => {
            const config = STATUS_CONFIG[claim.status];
            const Icon = config.icon;
            return (
              <div key={index} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4">
                  <p className="flex-1 text-[15px] leading-relaxed text-gray-900">
                    {claim.text}
                  </p>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${config.chip}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {config.label}
                  </span>
                </div>
                <div className="space-y-2.5 border-t border-gray-100 px-5 py-4">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <p className="text-[13px] leading-relaxed text-gray-600">
                      <span className="font-semibold text-gray-700">Evidence:</span>{" "}
                      {claim.evidence}
                    </p>
                  </div>
                  {claim.suggestion && (
                    <div className="flex items-start gap-2">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <p className="text-[13px] leading-relaxed text-gray-600">
                        <span className="font-semibold text-gray-700">Suggestion:</span>{" "}
                        {claim.suggestion}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-[13px] font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
        >
          <PencilLine className="h-3.5 w-3.5" />
          Edit document
        </button>
        <button
          type="button"
          onClick={onRecheck}
          disabled={isRechecking}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${isRechecking ? "animate-spin" : ""}`} />
          {isRechecking ? "Checking…" : "Re-check"}
        </button>
        <p className="ml-auto max-w-xs text-right text-[11px] leading-relaxed text-gray-400">
          {summary.potentially_unsupported > 0
            ? "Potentially unsupported claims are the ones admissions committees question first — reword or add proof."
            : summary.needs_verification > 0
              ? "Add evidence for the claims that still need verification — receipts, transcripts, or references."
              : "Every claim is supported. Strong, honest statement of purpose."}
        </p>
      </div>
    </div>
  );
}