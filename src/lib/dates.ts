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

