export interface SOPProfileContext {
  fullName: string;
  location: string;
  educationLevel: string;
  university: string;
  major: string;
  graduationYear: number | null;
  gpa: number | null;
  gpaScale: string;
  interests: string[];
  preferredField: string;
  ieltsStatus: string;
  ieltsBand: number | null;
  degreeLevels: string[];
  destinations: string[];
  fundingPreferences: string[];
}

export interface SOPRequest {
  university: string;
  program: string;
  wordLimit: number | null;
  requirements: string;
  prompt: string;
  additionalInfo: string;
  profile: SOPProfileContext;
  mode: "generate" | "improve";
  currentContent?: string;
  suggestions?: string[];
}

export interface SOPFormValues {
  university: string;
  program: string;
  wordLimit: string;
  requirements: string;
  prompt: string;
  additionalInfo: string;
}

export interface ProfileSummaryRow {
  label: string;
  value: string;
}

export interface SOPResponse {
  content: string;
  suggestions: string[];
}

/**
 * sessionStorage key used to hand scholarship context from the Scholarship
 * Detail journey into the SOP Generator so the form opens prefilled.
 */
export const SOP_PREFILL_KEY = "sopPrefillSource";

export interface SOPPrefillSource {
  university: string;
  program: string;
  requirements?: string;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export async function generateSOP(request: SOPRequest): Promise<SOPResponse> {
  const res = await fetch("/api/generate-sop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Failed to generate the SOP. Please try again.",
    );
  }
  return data as SOPResponse;
}