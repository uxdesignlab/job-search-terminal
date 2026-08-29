import type { JobRecord } from "./db/types";

/** Returns YYYY-MM-DD in the user's local timezone — never UTC. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function formatPostedDate(job: JobRecord) {
  if (job.datePosted) {
    return formatDisplayDate(job.datePosted);
  }
  if (job.firstSeenDate) {
    return `Seen ${formatDisplayDate(job.firstSeenDate)}`;
  }
  return "Date unavailable";
}

/**
 * Parses the two timestamp shapes the app stores: full ISO datetimes and bare
 * `YYYY-MM-DD` dates. The bare form is built from parts so it lands on local
 * midnight — `new Date("2026-08-27")` parses as UTC and slips a day for anyone
 * west of Greenwich.
 */
export function parseStoredDate(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whole-day age of a timestamp: "today", "yesterday", "N days ago".
 *
 * Compares calendar days rather than elapsed hours, so a check at 11pm reads
 * "yesterday" the next morning instead of "today" — the point of the label is to
 * show staleness, and elapsed-hour rounding hides exactly the case that matters.
 * A future timestamp clamps to "today" rather than reporting negative days.
 */
export function formatDaysAgo(value: string | null | undefined, fallback = "never") {
  if (!value) {
    return fallback;
  }

  const date = parseStoredDate(value);
  if (!date) {
    return fallback;
  }

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / (24 * 60 * 60 * 1000));

  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}
