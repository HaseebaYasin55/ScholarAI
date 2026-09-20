/**
 * Shared contracts for the scholarship discovery pipeline.
 *
 * These types are the interface between a scraper's parsed output and the
 * `scholarships` table in Supabase. Scrapers must emit `ScholarshipInput`
 * and the ingestion step persists it via `toScholarship` (@/lib/scholarship/types)
 * after passing the validation gates described in README.md.
 *
 * Phase 1 ships these contracts only. Scraper implementations are Phase 2 work
 * and MUST produce these shapes.
 */

export type DegreeLevel = "Bachelor" | "Master" | "PhD";

export type FundingType =
  | "fully_funded"
  | "partially_funded"
  | "tuition_fee_waiver"
  | "no_funding";

export type TuitionCoverage =
  | "full_tuition"
  | "partial_tuition"
  | "none";

/**
 * What a normalizer emits after parsing an official source page.
 * All optional fields default to `null` / `[]` — scrapers must never fabricate values.
 */
export interface ScholarshipInput {
  name: string;
  university: string | null;
  country: string | null;
  degreeLevels: DegreeLevel[];
  fields: string[];
  fundingType: FundingType | null;
  tuitionCoverage: TuitionCoverage | null;
  tuitionFee: number | null;
  stipendAmount: number | null;
  stipendFrequency: "monthly" | "yearly" | "one_time" | null;
  accommodationSupport: string | null;
  travelAllowance: string | null;
  healthInsurance: string | null;
  applicationFee: number | null;
  eligibilityRequirements: string | null;
  requiredDocuments: string[];
  ieltsRequirement: string | null;
  openingDate: string | null; // ISO YYYY-MM-DD
  deadline: string | null; // ISO YYYY-MM-DD
  officialScholarshipUrl: string | null;
  officialUniversityUrl: string | null;
  sourceUrl: string | null;
}

/**
 * The stable identity used for upserts. Re-runs of the same source record
 * must produce the same stable id.
 */
export function stableId(input: {
  name: string;
  university: string | null;
  country: string | null;
  deadline: string | null;
}): string {
  return [input.name, input.university, input.country, input.deadline]
    .map((p) => (p ?? "").toLowerCase().replace(/\s+/g, "-"))
    .join("__");
}

/**
 * Validation gates. Returns the reasons a record is rejected (empty = valid).
 * Every scraper output must pass `validateScholarshipInput` before ingestion.
 */
export function validateScholarshipInput(
  input: ScholarshipInput,
): string[] {
  const errors: string[] = [];

  if (!input.name) errors.push("name is required");
  if (!input.country) errors.push("country is required");
  if (
    input.officialScholarshipUrl &&
    !/^https?:\/\//.test(input.officialScholarshipUrl)
  )
    errors.push("officialScholarshipUrl must be http(s)");
  if (!input.officialScholarshipUrl && !input.officialUniversityUrl)
    errors.push("at least one of officialScholarshipUrl / officialUniversityUrl is required");
  if (input.sourceUrl && !/^https?:\/\//.test(input.sourceUrl))
    errors.push("sourceUrl must be http(s)");
  for (const d of [input.openingDate, input.deadline]) {
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d))
      errors.push("dates must be ISO YYYY-MM-DD");
  }
  for (const lvl of input.degreeLevels) {
    if (!["Bachelor", "Master", "PhD"].includes(lvl))
      errors.push(`unknown degree level: ${lvl}`);
  }
  if (
    input.fundingType &&
    !["fully_funded", "partially_funded", "tuition_fee_waiver", "no_funding"].includes(
      input.fundingType,
    )
  )
    errors.push("unknown funding type");

  return errors;
}