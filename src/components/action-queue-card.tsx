import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import type { ActionQueueData } from "@/lib/db/types";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  Applied: "neutral",
  "Follow-up needed": "warning",
  "Recruiter responded": "success",
  Interviewing: "success",
  Offer: "success",
};

export function ApplyNextCard({ data }: { data: ActionQueueData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply next</CardTitle>
        <CardDescription>Priority matches ready for you.</CardDescription>
      </CardHeader>
      {data.toApply.length === 0 ? (
        <EmptyState
          description="Run a scan and evaluate jobs to surface priority matches."
          title="No priority matches"
        />
      ) : (
        <ul className="grid gap-2">
          {data.toApply.map((job) => (
            <li
              className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2.5"
              key={job.id}
            >
              <div className="min-w-0 flex-1">
                <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                  {job.title}
                </Link>
                <p className="truncate text-xs text-muted">{job.company}</p>
              </div>
              <Badge tone={job.fitScore >= 80 ? "success" : "warning"}>{job.fitScore}%</Badge>
              <Link
                className="whitespace-nowrap text-xs font-medium text-accent hover:underline"
                href={`/jobs/${job.id}`}
              >
                Review →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function InFlightCard({ data }: { data: ActionQueueData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>In flight</CardTitle>
        <CardDescription>Applications you've already submitted.</CardDescription>
      </CardHeader>
      {data.recentlyApplied.length === 0 ? (
        <EmptyState
          description="Applications you submit will appear here."
          title="No active applications"
        />
      ) : (
        <ul className="grid gap-2">
          {data.recentlyApplied.map((app) => (
            <li
              className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2.5"
              key={app.id}
            >
              <div className="min-w-0 flex-1">
                <Link className="font-medium text-accent hover:underline" href={`/jobs/${app.jobId}`}>
                  {app.role}
                </Link>
                <p className="truncate text-xs text-muted">{app.company}</p>
              </div>
              <Badge tone={STATUS_TONE[app.status] ?? "neutral"}>{app.status}</Badge>
              {app.appliedDate && (
                <span className="whitespace-nowrap text-xs text-muted">{daysAgo(app.appliedDate)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}
