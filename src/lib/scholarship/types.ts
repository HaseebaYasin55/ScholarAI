import type { SupabaseClient } from "@supabase/supabase-js";

// ─── DB row shape (snake_case, mirrors 007_scholarships_schema.sql) ─────────
export interface ScholarshipRow {
  id: string;
  name: string;
  university: string | null;
  country: string | null;
  degree_levels: string[];
  fields: string[];
  funding_type: string | null;
  tuition_coverage: string | null;
  tuition_fee: number | null;
  stipend_amount: number | null;
  stipend_frequency: string | null;
  accommodation_support: string | null;
  travel_allowance: string | null;
  health_insurance: string | null;
  application_fee: number | null;
  eligibility_requirements: string | null;
  required_documents: string[];
  ielts_requirement: string | null;
  opening_date: string | null;
  deadline: string | null;
  official_scholarship_url: string | null;
  official_university_url: string | null;
  source_url: string | null;
  last_updated: string | null;
  created_at: string | null;
  description: string | null;
  application_info: string | null;
}

// ─── Application-level scholarship model ─────────────────────────────────────
export interface Scholarship {
  id: string;
  name: string;
  university: string | null;
  country: string | null;
  degreeLevels: string[];
  fields: string[];
  fundingType: string | null;
  tuitionCoverage: string | null;
  tuitionFee: number | null;
  stipendAmount: number | null;
  stipendFrequency: string | null;
  accommodationSupport: string | null;
  travelAllowance: string | null;
  healthInsurance: string | null;
  applicationFee: number | null;
  eligibilityRequirements: string | null;
  requiredDocuments: string[];
  ieltsRequirement: string | null;
  openingDate: string | null;
  deadline: string | null;
  officialScholarshipUrl: string | null;
  officialUniversityUrl: string | null;
  sourceUrl: string | null;
  lastUpdated: string | null;
  description: string | null;
  applicationInfo: string | null;
}

export function toScholarship(row: ScholarshipRow): Scholarship {
  return {
    id: row.id,
    name: row.name,
    university: row.university,
    country: row.country,
    degreeLevels: row.degree_levels ?? [],
    fields: row.fields ?? [],
    fundingType: row.funding_type,
    tuitionCoverage: row.tuition_coverage,
    tuitionFee: row.tuition_fee,
    stipendAmount: row.stipend_amount,
    stipendFrequency: row.stipend_frequency,
    accommodationSupport: row.accommodation_support,
    travelAllowance: row.travel_allowance,
    healthInsurance: row.health_insurance,
    applicationFee: row.application_fee,
    eligibilityRequirements: row.eligibility_requirements,
    requiredDocuments: row.required_documents ?? [],
    ieltsRequirement: row.ielts_requirement,
    openingDate: row.opening_date,
    deadline: row.deadline,
    officialScholarshipUrl: row.official_scholarship_url,
    officialUniversityUrl: row.official_university_url,
    sourceUrl: row.source_url,
    lastUpdated: row.last_updated,
    description: row.description ?? null,
    applicationInfo: row.application_info ?? null,
  };
}

// ─── Filters for the data layer ──────────────────────────────────────────────
export interface ScholarshipFilter {
  country?: string | null;
  university?: string | null;
  degreeLevels?: string[];
  fields?: string[];
  fundingType?: string | null;
  tuitionCoverage?: string | null;
  requiresIelts?: boolean | null;
  deadlineAfter?: string | null;
  deadlineBefore?: string | null;
  openingBefore?: string | null;
  nameContains?: string | null;
}

// ─── Data layer ──────────────────────────────────────────────────────────────

// Structural view of the filter chain (PostgrestFilterBuilder shapes shift their
// generic parameters per call, so we describe the operations we use by shape).
interface Filterable {
  eq(column: string, value: unknown): Filterable;
  ilike(column: string, pattern: string): Filterable;
  overlaps(column: string, value: string[]): Filterable;
  not(column: string, op: string, value: unknown): Filterable;
  is(column: string, value: unknown): Filterable;
  gte(column: string, value: string): Filterable;
  lte(column: string, value: string): Filterable;
  order(column: string, options: { ascending: boolean; nullsFirst: boolean }): Transformable;
}

interface Transformable {
  order(column: string, options: { ascending: boolean; nullsFirst: boolean }): Transformable;
  limit(count: number): Transformable;
  range(from: number, to: number): Transformable;
}

function applyFilter(
  query: Filterable,
  filter: ScholarshipFilter | undefined,
): Filterable {
  if (!filter) return query;
  const f = filter;
  let q: Filterable = query;

  if (f.country) q = q.eq("country", f.country);
  if (f.university) q = q.ilike("university", `%${f.university}%`);
  if (f.nameContains) q = q.ilike("name", `%${f.nameContains}%`);
  if (f.degreeLevels?.length) q = q.overlaps("degree_levels", f.degreeLevels);
  if (f.fields?.length) q = q.overlaps("fields", f.fields);
  if (f.fundingType) q = q.ilike("funding_type", `%${f.fundingType}%`);
  if (f.tuitionCoverage) q = q.ilike("tuition_coverage", `%${f.tuitionCoverage}%`);
  if (f.requiresIelts === true) q = q.not("ielts_requirement", "is", null);
  if (f.requiresIelts === false) q = q.is("ielts_requirement", null);
  if (f.deadlineAfter) q = q.gte("deadline", f.deadlineAfter);
  if (f.deadlineBefore) q = q.lte("deadline", f.deadlineBefore);
  if (f.openingBefore) q = q.lte("opening_date", f.openingBefore);

  return q;
}

export interface FetchOptions {
  filter?: ScholarshipFilter;
  limit?: number;
  offset?: number;
  orderBy?: { column: string; ascending?: boolean };
}

export async function fetchScholarships(
  client: SupabaseClient,
  options: FetchOptions = {},
): Promise<Scholarship[]> {
  const base = client.from("scholarships").select("*");
  const filtered: Filterable = applyFilter(
    base as unknown as Filterable,
    options.filter,
  );

  let t: Transformable = filtered.order(
    options.orderBy?.column ?? "deadline",
    {
      ascending: options.orderBy?.ascending ?? true,
      nullsFirst: false,
    },
  );
  if (options.limit) t = t.limit(options.limit);
  if (options.offset) {
    t = t.range(options.offset, options.offset + (options.limit ?? 20) - 1);
  }

  const res = (await t) as unknown as {
    data: ScholarshipRow[] | null;
    error: unknown;
  };
  if (res.error) throw res.error;
  return (res.data ?? []).map(toScholarship);
}

export async function getScholarshipById(
  client: SupabaseClient,
  id: string,
): Promise<Scholarship | null> {
  const { data, error } = await client
    .from("scholarships")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toScholarship(data) : null;
}