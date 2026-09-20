import type { Scholarship } from "@/lib/scholarship/types";
import type { Document, SOP } from "@/store/appStore";

// ─── Requirement classification ────────────────────────────────────────────
// Real scholarship data from the discovery pipeline is free text. We classify
// each required document against the user's actual documents/profile so the
// readiness estimate is honest — anything we can't verify is marked "confirm".

export type RequirementCategory =
  | "cv"
  | "transcript"
  | "sop"
  | "degree"
  | "recommendation"
  | "english"
  | "other";

export type RequirementStatus = "ready" | "missing" | "confirm";

export interface RequirementCheck {
  key: string;
  label: string;
  category: RequirementCategory;
  status: RequirementStatus;
  /** When status is "missing", the action the user can take. */
  action?: "upload-cv" | "upload-transcript" | "generate-sop" | "edit-profile";
  hint?: string;
}

const CATEGORY_KEYWORDS: Array<{ category: RequirementCategory; match: RegExp }> = [
  {
    category: "cv",
    match: /\b(cv|curriculum vitae|resume|resum[eé])\b/i,
  },
  {
    category: "transcript",
    match: /\b(transcript|academic record|marksheet|mark sheet|grade)\b/i,
  },
  {
    category: "sop",
    match: /\b(sop|statement of purpose|motivation letter|motivational letter|personal statement|letter of intent|personal essay)\b/i,
  },
  {
    category: "recommendation",
    match: /\b(recommendation|reference letter|letter of recommendation|referee)\b/i,
  },
  {
    category: "english",
    match: /\b(ielts|toefl|english|language proficiency|prowess)\b/i,
  },
  {
    category: "degree",
    match: /\b(degree|certificate|diploma|attested academic|equival(ency|ence))\b/i,
  },
];

export function classifyRequirement(text: string): RequirementCategory {
  for (const { category, match } of CATEGORY_KEYWORDS) {
    if (match.test(text)) return category;
  }
  return "other";
}

export const CATEGORY_LABEL: Record<RequirementCategory, string> = {
  cv: "CV / Resume",
  transcript: "Transcript",
  sop: "Statement of Purpose",
  degree: "Degree certificate",
  recommendation: "Recommendation letter",
  english: "English proficiency",
  other: "Other documents",
};

// ─── Readiness computation ─────────────────────────────────────────────────

export interface JourneyContext {
  scholarship: Scholarship;
  documents: Document[];
  sops: SOP[];
  /** User profile fields that might satisfy "degree"/"transcript"-style checks. */
  profile: {
    education_level?: string | null;
    university?: string | null;
    ielts_band?: number | null;
    ielts_status?: string | null;
  };
}

function hasSubmittedDoc(
  documents: Document[],
  name: string,
): { present: boolean; doc?: Document } {
  const doc = documents.find(
    (d) => d.university === "General" && d.name === name,
  );
  if (!doc) return { present: false };
  return { present: doc.status === "Submitted" && Boolean(doc.file_path), doc };
}

function hasMatchingSop(sops: SOP[], scholarship: Scholarship, program?: string): boolean {
  const uni = (scholarship.university ?? "").trim().toLowerCase();
  const prog = (program ?? "").trim().toLowerCase();
  return sops.some((s) => {
    if (!s.content) return false;
    const sameUni = uni && s.university.trim().toLowerCase() === uni;
    if (sameUni && prog && s.program.trim().toLowerCase() === prog) return true;
    return sameUni;
  });
}

/**
 * Build the requirement checklist for a scholarship from the official data.
 * Nothing is invented: categories come from the scholarship's own
 * `required_documents` + `ielts_requirement`. Items that can't be verified
 * against the user's real documents/profile are marked "confirm".
 */
export function buildRequirementChecks(
  ctx: JourneyContext,
  program?: string,
): RequirementCheck[] {
  const { scholarship, documents, sops, profile } = ctx;

  const raw: string[] = [];
  for (const doc of scholarship.requiredDocuments) {
    const t = (doc ?? "").trim();
    if (t) raw.push(t);
  }
  if (scholarship.ieltsRequirement) {
    const t = scholarship.ieltsRequirement.trim();
    if (t && !raw.some((r) => classifyRequirement(r) === "english")) {
      raw.push(t);
    }
  }

  const checks: RequirementCheck[] = raw.map((text, i) => {
    const category = classifyRequirement(text);

    switch (category) {
      case "cv": {
        const { present, doc } = hasSubmittedDoc(documents, CATEGORY_LABEL.cv);
        if (present)
          return {
            key: `cv-${i}`,
            label: text,
            category,
            status: "ready" as const,
            hint: doc?.file_path?.split("/").pop() ?? "Uploaded",
          };
        return {
          key: `cv-${i}`,
          label: text,
          category,
          status: "missing",
          action: "upload-cv",
          hint: `No submitted ${CATEGORY_LABEL.cv} found in your documents.`,
        };
      }
      case "transcript": {
        const { present, doc } = hasSubmittedDoc(documents, CATEGORY_LABEL.transcript);
        if (present) {
          return {
            key: `tr-${i}`,
            label: text,
            category,
            status: "ready" as const,
            hint: doc?.file_path?.split("/").pop() ?? "Uploaded",
          };
        }
        return {
          key: `tr-${i}`,
          label: text,
          category,
          status: "missing",
          action: "upload-transcript",
          hint: `No submitted ${CATEGORY_LABEL.transcript} found in your documents.`,
        };
      }
      case "sop":
        if (hasMatchingSop(sops, scholarship, program)) {
          return { key: `sop-${i}`, label: text, category, status: "ready" };
        }
        return {
          key: `sop-${i}`,
          label: text,
          category,
          status: "missing",
          action: "generate-sop",
          hint: "No saved SOP for this university found yet.",
        };
      case "english":
        if (profile.ielts_band && profile.ielts_band > 0) {
          return { key: `en-${i}`, label: text, category, status: "ready" };
        }
        if (profile.ielts_status) {
          return {
            key: `en-${i}`,
            label: text,
            category,
            status: "confirm",
            hint: "Your IELTS status is saved, but no band is confirmed.",
          };
        }
        return {
          key: `en-${i}`,
          label: text,
          category,
          status: "missing",
          action: "edit-profile",
          hint: "Add your IELTS result in Profile to confirm this.",
        };
      case "degree":
        if (profile.education_level) {
          return {
            key: `deg-${i}`,
            label: text,
            category,
            status: "confirm",
            hint: "Your education level is saved — verify the certificate requirement on the official page.",
          };
        }
        return {
          key: `deg-${i}`,
          label: text,
          category,
          status: "confirm",
          hint: "Confirm the degree requirement on the official application page.",
        };
      case "recommendation":
        return {
          key: `rec-${i}`,
          label: text,
          category,
          status: "confirm",
          hint: "Confirm on the official application page.",
        };
      default:
        return {
          key: `oth-${i}`,
          label: text,
          category,
          status: "confirm",
          hint: "Confirm on the official application page.",
        };
    }
  });

  return checks;
}

export interface ReadinessSummary {
  checks: RequirementCheck[];
  ready: number;
  total: number;
  pct: number;
}

export function summarizeReadiness(checks: RequirementCheck[]): ReadinessSummary {
  const total = checks.length;
  const ready = checks.filter((c) => c.status === "ready").length;
  return {
    checks,
    ready,
    total,
    pct: total === 0 ? 0 : Math.round((ready / total) * 100),
  };
}