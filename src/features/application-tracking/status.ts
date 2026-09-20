import type { Application } from "@/store/appStore";

export type ApplicationStatus = Application["status"];

// The applications table only allows Draft/In Review/Submitted/Action Required,
// so the journey's "Preparing" and "Applied" states are mapped to Draft and
// Submitted. These helpers keep that mapping in one place so the tracker, the
// journey, and the Dashboard all show the same labels.
export function displayStatus(status: ApplicationStatus | string): string {
  switch (status) {
    case "Draft":
      return "Preparing";
    case "Submitted":
      return "Applied";
    default:
      return status;
  }
}

export const appStatusPillClass: Record<ApplicationStatus, string> = {
  Submitted: "border-gray-900 bg-gray-900 text-white",
  "In Review": "border-gray-700 bg-gray-700 text-white",
  Draft: "border-gray-300 bg-white text-gray-700",
  "Action Required": "border-gray-300 bg-gray-100 text-gray-900",
};