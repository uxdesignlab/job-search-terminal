import type { JobRecord } from "./db/types";

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

