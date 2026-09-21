import type { ApplicationStatus } from "@/store/appStore";

// The new application workflow. Users may move through these stages manually in
// any order — no stage is forced.
export const APPLICATION_STATUS_FLOW: ApplicationStatus[] = [
  "Interested",
  "Preparing",
  "Applied",
  "Under Review",
  "Interview",
  "Accepted",
  "Rejected",
];

const LEGACY_PILLS: Record<string, string> = {
  Draft: "border-gray-300 bg-white text-gray-700",
  "In Review": "border-gray-700 bg-gray-700 text-white",
  Submitted: "border-gray-900 bg-gray-900 text-white",
  "Action Required": "border-gray-300 bg-gray-100 text-gray-900",
};

const FLOW_PILLS: Record<string, string> = {
  Interested: "border-gray-200 bg-gray-50 text-gray-600",
  Preparing: "border-gray-300 bg-white text-gray-700",
  Applied: "border-gray-900 bg-gray-900 text-white",
  "Under Review": "border-gray-700 bg-gray-700 text-white",
  Interview: "border-gray-900 bg-gray-900 text-white",
  Accepted: "border-gray-900 bg-gray-900 text-white",
  Rejected: "border-gray-200 bg-gray-100 text-gray-400",
};

// Legacy rows predate the Interested…Rejected workflow. Draft means "Preparing"
// and Submitted means "Applied" in the Dashboard/tracker.
export function displayStatus(status: ApplicationStatus | string): string {
  if (status === "Draft") return "Preparing";
  if (status === "Submitted") return "Applied";
  return status;
}

export function appStatusPillClass(status: ApplicationStatus | string): string {
  return FLOW_PILLS[status] ?? LEGACY_PILLS[status] ?? "border-gray-300 bg-gray-100 text-gray-700";
}

export function isCompletedStatus(status: ApplicationStatus | string): boolean {
  return status === "Submitted" || status === "Applied" || status === "Accepted";
}

export function isAppliedLikeStatus(status: ApplicationStatus | string): boolean {
  return (
    status === "Applied" ||
    status === "Submitted" ||
    status === "Under Review" ||
    status === "Interview" ||
    status === "Accepted" ||
    status === "Rejected"
  );
}