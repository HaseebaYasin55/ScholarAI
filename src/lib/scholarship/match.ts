import type { Scholarship } from "./types";

// ─── Input shapes for the matcher ────────────────────────────────────────────

export interface MatchProfile {
  education_level?: string | null;
  field_of_study?: string | null;
  gpa?: number | null;
}

export interface MatchPreferences {
  degree_levels: string[];
  destinations: string[];
  funding_preferences: string[];
  preferred_field?: string | null;
  tuition_preference?: string | null;
  max_tuition_budget?: number | null;
  ielts_status?: string | null;
  ielts_band?: number | null;
  preferred_intake?: string[];
  needs_application_fee_waiver?: boolean;
  open_to_multiple_countries?: boolean;
}

// ─── Match result shapes ─────────────────────────────────────────────────────

export interface ScholarshipMatch {
  score: number; // 0-100, purely a transparent fit heuristic
  reasons: string[];
  missing: string[];
}

export interface MatchedScholarship extends ScholarshipMatch {
  scholarship: Scholarship;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().trim();

function parseBand(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function isFullyFunded(s: Scholarship): boolean {
  return [norm(s.fundingType), norm(s.tuitionCoverage)].some(
    (v) => v.includes("full"),
  );
}

function isPartialFunded(s: Scholarship): boolean {
  return norm(s.fundingType).includes("partial");
}

function degreeOverlaps(scholarshipLevels: string[], userLevels: string[]): boolean {
  const s = new Set(scholarshipLevels.map(norm));
  return userLevels.some((l) => s.has(norm(l)));
}

function fieldOverlaps(scholarshipFields: string[], userFields: string[]): boolean {
  return scholarshipFields.some((sf) => {
    const ns = norm(sf);
    if (!ns) return false;
    return userFields.some((uf) => {
      const nu = norm(uf);
      if (!nu) return false;
      if (ns.includes(nu) || nu.includes(ns)) return true;
      const sfWords = new Set(ns.split(/[\s,\/\-&]+/));
      const ufWords = nu.split(/[\s,\/\-&]+/);
      return [...sfWords].some((w) => w.length > 2 && ufWords.includes(w));
    });
  });
}

// ─── Matching constants ──────────────────────────────────────────────────────
// Total = 100. Applied weights are renormalized when factors are not applicable
// to the particular record so the final score remains a meaningful 0-100%.

const WEIGHTS = {
  degree: 25,
  field: 25,
  destination: 20,
  funding: 15,
  ielts: 10,
  budget: 5,
} as const;

// ─── Core matcher ────────────────────────────────────────────────────────────

export function matchScholarship(
  scholarship: Scholarship,
  profile: MatchProfile,
  prefs: MatchPreferences,
): ScholarshipMatch {
  const reasons: string[] = [];
  const missing: string[] = [];
  let earned = 0;
  let applied = 0;

  const userFields = [prefs.preferred_field, profile.field_of_study].filter(
    (v): v is string => Boolean(norm(v)),
  );
  const degreeLevels = prefs.degree_levels ?? [];

  // ── Degree ────────────────────────────────────────────────────────────────
  if (scholarship.degreeLevels.length && degreeLevels.length) {
    applied += WEIGHTS.degree;
    if (degreeOverlaps(scholarship.degreeLevels, degreeLevels)) {
      earned += WEIGHTS.degree;
      reasons.push(
        `Covers your target degree level (${scholarship.degreeLevels.join(", ")}).`,
      );
    }
  }

  // ── Field / Major ─────────────────────────────────────────────────────────
  if (scholarship.fields.length && userFields.length) {
    applied += WEIGHTS.field;
    if (fieldOverlaps(scholarship.fields, userFields)) {
      earned += WEIGHTS.field;
      reasons.push(`Field overlaps with your ${userFields[0]}.`);
    }
  }

  // ── Destination / Country ─────────────────────────────────────────────────
  if (scholarship.country) {
    applied += WEIGHTS.destination;
    const inShortlist = (prefs.destinations ?? []).some(
      (d) => norm(d) === norm(scholarship.country),
    );
    if (inShortlist) {
      earned += WEIGHTS.destination;
      reasons.push(`In your preferred destinations — ${scholarship.country}.`);
    } else if (prefs.open_to_multiple_countries) {
      earned += Math.round(WEIGHTS.destination * 0.5);
      reasons.push(
        `${scholarship.country} — new destination (you are open to multiple countries).`,
      );
    }
  }

  // ── Funding preference ────────────────────────────────────────────────────
  if (prefs.funding_preferences?.length) {
    applied += WEIGHTS.funding;
    const fp = prefs.funding_preferences.map(norm);
    if (fp.includes("any")) {
      earned += WEIGHTS.funding;
      reasons.push("You are open to any funding type.");
    } else if (
      (isFullyFunded(scholarship) && fp.includes("fully_funded")) ||
      (isPartialFunded(scholarship) && fp.includes("partially_funded")) ||
      (fp.includes("tuition_fee_waiver") &&
        norm(scholarship.tuitionCoverage).includes("tuition"))
    ) {
      earned += WEIGHTS.funding;
      reasons.push(
        `Funding type (${scholarship.fundingType ?? scholarship.tuitionCoverage ?? "—"}) matches your preferences.`,
      );
    } else if (
      prefs.tuition_preference === "fully_funded_only" &&
      !isFullyFunded(scholarship)
    ) {
      missing.push(
        "You selected fully funded only — confirm the funding type on the official page.",
      );
    }
  }

  // ── IELTS / English ───────────────────────────────────────────────────────
  if (scholarship.ieltsRequirement) {
    applied += WEIGHTS.ielts;
    const req = parseBand(scholarship.ieltsRequirement);
    const userBand = prefs.ielts_band ?? null;
    const met =
      req == null || (userBand != null && userBand >= req);

    if (met && userBand != null) {
      earned += WEIGHTS.ielts;
      reasons.push(`IELTS on file — your band ${userBand} ${req != null ? `(≥ ${req})` : ""}.`);
    } else if (norm(prefs.ielts_status) === "not_required") {
      earned += WEIGHTS.ielts;
      reasons.push("No IELTS issue from your side.");
    } else {
      missing.push(
        `IELTS: ${scholarship.ieltsRequirement}${userBand != null ? ` — your band ${userBand}` : " — no band on file"}.`,
      );
    }
  }

  // ── Budget / Tuition / Application fee ────────────────────────────────────
  if (scholarship.tuitionFee != null || scholarship.applicationFee != null) {
    applied += WEIGHTS.budget;
    let passed = true;

    if (scholarship.tuitionFee != null && prefs.max_tuition_budget != null) {
      if (scholarship.tuitionFee <= prefs.max_tuition_budget) {
        earned += Math.round(WEIGHTS.budget * 0.7);
        reasons.push(
          `Tuition (${scholarship.tuitionFee.toLocaleString()}) is within your stated budget.`,
        );
      } else {
        passed = false;
        missing.push(
          `Tuition (~${scholarship.tuitionFee.toLocaleString()}) is above your stated budget.`,
        );
      }
    } else {
      earned += Math.round(WEIGHTS.budget * 0.7);
    }

    if (
      scholarship.applicationFee != null &&
      scholarship.applicationFee > 0 &&
      prefs.needs_application_fee_waiver
    ) {
      earned += Math.round(WEIGHTS.budget * 0.3);
      missing.push(
        "Application fee applies — you requested fee waivers. Verify on the official page.",
      );
    } else {
      earned += Math.round(WEIGHTS.budget * 0.3);
    }

    if (!passed) earned = Math.max(earned, Math.round(WEIGHTS.budget * 0.3));
  }

  const score =
    applied > 0 ? Math.max(0, Math.round((earned / applied) * 100)) : 0;
  return { score, reasons, missing };
}

// ─── Batch matcher ───────────────────────────────────────────────────────────

export function matchScholarships(
  scholarships: Scholarship[],
  profile: MatchProfile,
  prefs: MatchPreferences,
): MatchedScholarship[] {
  return scholarships
    .map((s) => ({ scholarship: s, ...matchScholarship(s, profile, prefs) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.scholarship.deadline ?? "9").localeCompare(
          b.scholarship.deadline ?? "9",
        ),
    );
}