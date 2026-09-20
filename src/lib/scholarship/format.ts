/**
 * Formatting helpers for scholarship records.
 */

/** Format a date string — handles both "YYYY-MM-DD" (from DATE columns) and ISO timestamps. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const raw = /^\d{4}-\d{2}-\d{2}/.test(value) ? `${value.slice(0, 10)}T12:00:00Z` : value;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a number as currency (USD assumed — let scraper override via notes later). */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Compute days remaining to a deadline. */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  const now = new Date();
  now.setUTCHours(12, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

/** Format a date long-form, e.g. "15 December 2026". */
export function formatLongDate(value: string | null | undefined): string {
  if (!value) return "—";
  const raw = /^\d{4}-\d{2}-\d{2}/.test(value) ? `${value.slice(0, 10)}T12:00:00Z` : value;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}