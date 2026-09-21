// ─── Scholarship application status (pure, client-safe) ─────────────────────
// Derives the CURRENT application status of a scholarship from the official
// page's verified `currentStatus` plus the extracted opening/deadline dates.
//
// Precedence (authoritative official statements first, date heuristics as
// fallback — a closed scholarship is never shown as open, and a deadline is
// never invented):
//   1. official source states closed / expired        → CLOSED
//   2. official source states upcoming                → NOT OPEN YET
//   3. extracted deadline has already passed          → DEADLINE PASSED
//   4. official source states open, or a future deadline is on file → OPEN
//   5. an opening date is set, still in the future    → NOT OPEN YET
//   6. nothing usable                                → STATUS UNKNOWN
//
// Used by both the server assembly (which decides what to surface per query
// type) and the UI (which renders the badge + deadline/opens line).

import type { Scholarship } from "./types";
import { formatLongDate } from "./format";

export type ScholarshipStatusId =
  | "open"
  | "upcoming"
  | "closed"
  | "deadlinePassed"
  | "unknown";

export type ScholarshipStatusTone = "green" | "amber" | "red" | "gray";

export interface ScholarshipStatus {
  id: ScholarshipStatusId;
  /** Short human label, e.g. "OPEN", "NOT OPEN YET", "DEADLINE PASSED". */
  label: string;
  /** Longer explanatory copy for the status badge's title tooltip. */
  detail: string;
  tone: ScholarshipStatusTone;
}

function atNoon(dateStr: string): Date | null {
  if (/\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** The current application status of a scholarship. */
export function scholarshipStatus(s: Scholarship): ScholarshipStatus {
  const now = new Date();
  now.setUTCHours(12, 0, 0, 0);

  const deadline = s.deadline ? atNoon(s.deadline) : null;
  const opening = s.openingDate ? atNoon(s.openingDate) : null;

  const cs = s.currentStatus;
  const deadlinePassed = deadline !== null && deadline < now;
  const openingFuture = opening !== null && opening > now;

  // 1. The official source explicitly says closed/expired → CLOSED.
  if (cs === "closed" || cs === "expired") {
    return {
      id: "closed",
      label: "CLOSED",
      detail:
        cs === "expired"
          ? "The official source states this programme has ended."
          : "The official source states applications are currently closed.",
      tone: "red",
    };
  }

  // 2. The official source explicitly says the next cycle will open later.
  if (cs === "upcoming") {
    return {
      id: "upcoming",
      label: "NOT OPEN YET",
      detail: openingFuture
        ? `Not open yet — opens ${s.openingDate!}.`
        : "The official source states applications have not opened yet.",
      tone: "amber",
    };
  }

  // 3. The extracted deadline has passed → DEADLINE PASSED.
  if (deadlinePassed) {
    return {
      id: "deadlinePassed",
      label: "DEADLINE PASSED",
      detail: `The application deadline (${s.deadline}) has passed.`,
      tone: "red",
    };
  }

  // 4. Official statement says open — even when the date fields are sparse,
  //    an explicit "applications open" statement is authoritative.
  if (cs === "open") {
    return {
      id: "open",
      label: "OPEN",
      detail: "The official source states applications are currently open.",
      tone: "green",
    };
  }

  // 4b. No explicit statement, but a deadline is on file and still ahead.
  if (deadline !== null) {
    return {
      id: "open",
      label: "OPEN",
      detail: `Applications are open — deadline ${s.deadline} has not passed yet.`,
      tone: "green",
    };
  }

  // 5. No deadline, but an opening date is set in the future.
  if (openingFuture) {
    return {
      id: "upcoming",
      label: "NOT OPEN YET",
      detail: `Not open yet — opens ${s.openingDate!}.`,
      tone: "amber",
    };
  }

  // 6. Nothing usable.
  return {
    id: "unknown",
    label: "STATUS UNKNOWN",
    detail:
      "Status could not be confirmed from the official source; no deadline is announced.",
    tone: "gray",
  };
}

/** True when the scholarship is currently open for applications. */
export function isOpen(s: Scholarship): boolean {
  return scholarshipStatus(s).id === "open";
}

// ─── Deadline / opens line for cards ─────────────────────────────────────────

export interface DeadlineLine {
  kind: "deadline" | "opens" | "notAnnounced";
  /** Main text, e.g. "Deadline: 15 October 2026" or "Opens: January 2027". */
  text: string;
  /** Optional detail suffix (e.g. the cycle the date refers to). */
  suffix: string | null;
}

/** Render the current deadline/opens line straight from official data. */
export function deadlineLine(s: Scholarship): DeadlineLine {
  const st = scholarshipStatus(s);

  const suffix = () => (s.cycle ? `${s.cycle}` : null);

  if (s.deadline) {
    return {
      kind: "deadline",
      text: formatLongDate(s.deadline),
      suffix: suffix(),
    };
  }
  if (st.id === "upcoming" && s.openingDate) {
    return {
      kind: "opens",
      text: `Opens: ${formatShort(s.openingDate)}`,
      suffix: suffix(),
    };
  }
  return { kind: "notAnnounced", text: "Deadline: Not announced", suffix: null };
}

function formatShort(value: string): string {
  const raw = /^\d{4}-\d{2}-\d{2}/.test(value)
    ? `${value.slice(0, 10)}T12:00:00Z`
    : value;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}