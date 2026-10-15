import Link from "next/link";
import { approveReviewAction, dismissReviewAction } from "@/app/jobs/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ReviewQueueJob } from "@/lib/db/queries";

/**
 * The Jobs page review queue: imports the app could not trust on their own —
 * a short or missing description, or a board-only posting not yet traced to the
 * employer. Collapsed by default so it never pushes the table down; each row can
 * be opened, kept (clears the flag), or archived (restorable from Archived).
 */
export function ReviewQueuePanel({ jobs }: { jobs: ReviewQueueJob[] }) {
  if (jobs.length === 0) return null;
  const count = jobs.length;

  return (
    <details className="group rounded-panel border border-warning/40 bg-warning/8 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-ink">
          {count} job{count !== 1 ? "s" : ""} need{count === 1 ? "s" : ""} review — the app could not fully read {count === 1 ? "it" : "them"}
        </span>
        <span className="text-xs font-medium text-accent">
          <span className="group-open:hidden">Review jobs</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="border-t border-warning/30 px-4 py-3">
        <p className="mb-3 text-xs text-muted">
          Open a job to add the missing detail — saving a full description clears it from this list. Keep marks it
          reviewed as it is and protects it from Cleanup. Archive moves it to Archived, where you can restore it.
        </p>
        <ul className="grid gap-2" aria-label="Jobs waiting for review">
          {jobs.map((job) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-panel px-3 py-2"
              key={job.id}
            >
              <div className="min-w-0">
                <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                  {job.title || "Untitled role"}
                </Link>
                <p className="text-xs text-muted">
                  {job.company || "Unknown company"} · {job.reason}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form action={approveReviewAction.bind(null, job.id)}>
                  <SubmitButton label="Keep" pendingLabel="Keeping…" savedLabel="Kept" variant="secondary" />
                </form>
                <form action={dismissReviewAction.bind(null, job.id)}>
                  <SubmitButton label="Archive" pendingLabel="Archiving…" savedLabel="Archived" variant="secondary" />
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
