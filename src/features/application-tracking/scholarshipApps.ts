import type { Application } from "@/store/appStore";
import type { Scholarship } from "@/lib/scholarship/types";
import { domainTrust, isBlockedSourceUrl } from "@/lib/scholarship/web";

// `program` is NOT NULL but is chosen later inside the preparation journey, so
// an "I want to apply" record starts with a placeholder the user replaces.
export const UNSELECTED_PROGRAM = "To be selected";

/**
 * The verified, officially-sourced scholarship/program URL, or null when no
 * acceptable official URL exists.
 *
 * STRICT OFFICIAL-SOURCE RULE: a URL that is a blocked source (aggregator,
 * blog, news, SEO site, third-party) is NEVER surfaced — the badge and any
 * "official" link must only ever point at the scholarship's authoritative
 * source. Rows that passed the pipeline's official-source verification
 * (`officialSourceVerified`) are accepted as-is; everything else must also
 * clear the domain-trust bar.
 */
export function verifiedOfficialUrl(scholarship: Scholarship): string | null {
  const url =
    scholarship.officialScholarshipUrl ?? scholarship.officialUniversityUrl;
  if (!url) return null;
  if (isBlockedSourceUrl(url)) return null;
  if (scholarship.officialSourceVerified === true) return url;
  return domainTrust(url) >= 2 ? url : null;
}

/**
 * Whether the scholarship may carry the "✓ Official" badge: it must have an
 * official URL that is not blocked. Only rows that passed official-source
 * verification — or a source with clearly authoritative trust — qualify. The
 * badge is never shown for unverified/aggregator-derived results.
 */
export function isOfficialApproved(scholarship: Scholarship): boolean {
  const url = verifiedOfficialUrl(scholarship);
  if (!url) return false;
  return (
    scholarship.officialSourceVerified === true || domainTrust(url) >= 3
  );
}

/** Build the application snapshot row for a scholarship the user picked. */
export function applicationPayloadFromScholarship(
  scholarship: Scholarship,
  program: string,
): Omit<Application, "id"> {
  return {
    university: scholarship.name,
    program,
    status: "Interested",
    progress: 0,
    deadline: scholarship.deadline ?? null,
    scholarship_id: scholarship.id,
    organization: scholarship.university,
    country: scholarship.country,
    official_url: verifiedOfficialUrl(scholarship),
    degree_levels: scholarship.degreeLevels ?? [],
    fields: scholarship.fields ?? [],
    required_documents: scholarship.requiredDocuments ?? [],
    description: scholarship.description,
    application_info: scholarship.applicationInfo,
    opening_date: scholarship.openingDate,
  };
}

/** Find an existing application for a scholarship (idempotency guard). */
export function applicationForScholarship(
  applications: Application[],
  scholarship: Scholarship | string,
): Application | undefined {
  const id = typeof scholarship === "string" ? scholarship : scholarship.id;
  const name = typeof scholarship === "string" ? null : scholarship.name;
  return applications.find(
    (a) =>
      (a.scholarship_id !== null &&
        a.scholarship_id !== undefined &&
        a.scholarship_id === id) ||
      (name !== null && a.university === name),
  );
}

/** Where a tracked scholarship's name opens. Persisted scholarships open their
 * own detail page (incl. its preparation journey); ephemeral web_ results fall
 * back to the tracking page. */
export function applicationLink(application: Application): string {
  if (
    application.scholarship_id &&
    !application.scholarship_id.startsWith("web_")
  ) {
    return `/scholarships/${application.scholarship_id}`;
  }
  return "/applications";
}

/**
 * The stored official application URL for "Apply on the official website", or
 * null when the scholarship carried no verified official URL. Never fabricates
 * a URL — when this is null the UI renders a non-link fallback instead.
 */
export function officialApplicationUrl(
  application: Application,
): string | null {
  return application.official_url && application.official_url.trim() !== ""
    ? application.official_url
    : null;
}

/** Where "Continue application" opens: the per-application preparation journey. */
export function applicationJourneyUrl(application: {
  id: string;
}): string {
  return `/applications/${application.id}`;
}