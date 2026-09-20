import { countWords } from "@/features/sop-generator/sopService";

export type ClaimStatus =
  | "Supported"
  | "Needs verification"
  | "Potentially unsupported";

export interface ClaimCheck {
  text: string;
  status: ClaimStatus;
  evidence: string;
  suggestion?: string;
}

export interface SOPClaimCheckResponse {
  claims: ClaimCheck[];
  summary: {
    total: number;
    supported: number;
    needs_verification: number;
    potentially_unsupported: number;
  };
}

/**
 * sessionStorage key used to hand a generated SOP from the SOP Generator to
 * the Claim Checker without forcing the user to copy/paste.
 */
export const SOP_CHECK_SOURCE_KEY = "sopClaimSource";

export interface SOPCheckSource {
  content: string;
  university: string;
  program: string;
}

export async function checkSopClaims(request: {
  document: string;
  supportingContext?: string;
}): Promise<SOPClaimCheckResponse> {
  const res = await fetch("/api/check-claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document: request.document,
      supportingContext: request.supportingContext ?? "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Failed to analyze the claims. Please try again.",
    );
  }
  return data as SOPClaimCheckResponse;
}

export { countWords };