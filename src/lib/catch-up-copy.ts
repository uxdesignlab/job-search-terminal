/**
 * User-facing wording for the background check of rate-limited boards. Kept in
 * one place so the scan results dialog, the status line beside "Scan for new
 * jobs", and the Jobs page say the same thing in the same words.
 *
 * Plain language on purpose (see docs/help-writing.md): no "429", no "rate limit",
 * no "queue". The user needs to know three things — it is not their fault, the
 * work is still happening, and they do not need to do anything.
 */
import type { CatchUpStatus } from "@/lib/scanner/board-catch-up";
import type { ScanRateLimitSummary } from "@/lib/scan-result-types";

export function joinHosts(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "A job board";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export type RateLimitCardCopy = { title: string; paragraphs: string[] };

/** The info card at the top of the scan results dialog. */
export function rateLimitCardCopy(summary: ScanRateLimitSummary): RateLimitCardCopy {
  if (summary.deferredTotal === 0) {
    // Nothing new was refused; this scan only stepped around an earlier check.
    return {
      title: "Some boards are still being checked",
      paragraphs: [
        `${plural(summary.alreadyQueued, "board is", "boards are")} still being checked in the background from your last scan, so this scan left them alone.`,
        "New jobs from them will show up in your Jobs list as they're found. You can keep working.",
      ],
    };
  }

  const hosts = joinHosts(summary.hosts.map((h) => h.label));
  const hostBoards = summary.hosts.reduce((sum, h) => sum + h.total, 0);
  const later = summary.deferredTotal + summary.alreadyQueued;
  return {
    title: `${hosts} asked us to slow down`,
    paragraphs: [
      `${hosts} ${summary.hosts.length === 1 ? "runs" : "run"} the job boards for ${hostBoards.toLocaleString("en-US")} of the companies you track. Partway through this scan, it started limiting how fast the app could check them. This is on their side. Nothing is wrong with your setup or with these companies.`,
      `Everything else is done. The app will check the other ${plural(later, "board", "boards")} slowly while it's open, starting with companies you've already shown interest in. New jobs will show up in your Jobs list as they're found.`,
      "You can keep working. You don't need to disable anything.",
    ],
  };
}

/** One line for the status beside "Scan for new jobs" and on the Jobs page. Null when there is nothing to say. */
export function catchUpStatusText(status: CatchUpStatus): string | null {
  const hosts = joinHosts(status.hosts);
  const found =
    status.newJobsCount > 0 ? ` · ${plural(status.newJobsCount, "new job", "new jobs")} so far` : "";

  switch (status.state) {
    case "idle":
      return null;
    case "running":
      return `Checking ${plural(status.remaining, `more ${hosts} board`, `more ${hosts} boards`)} in the background${
        status.etaMinutes ? ` · about ${plural(status.etaMinutes, "minute", "minutes")} left` : ""
      }${found}`;
    case "paused": {
      const waitMin = status.pausedUntil
        ? Math.max(1, Math.ceil((new Date(status.pausedUntil).getTime() - Date.now()) / 60_000))
        : 1;
      return `${hosts} asked us to wait · ${plural(status.remaining, "board", "boards")} left, resuming in about ${plural(waitMin, "minute", "minutes")}${found}`;
    }
    case "finished":
      return status.newJobsCount > 0
        ? `Background check done · ${plural(status.newJobsCount, "new job", "new jobs")} added`
        : "Background check done · nothing new";
  }
}
