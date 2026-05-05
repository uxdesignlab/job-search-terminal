"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";

type LivenessJobSummary = {
  id: string;
  title: string;
  company: string;
  location: string;
  status: string;
  reason: string;
};

type LivenessSummary = {
  checked: number;
  active: number;
  uncertain: number;
  expiredUntouched: LivenessJobSummary[];
  expiredProtected: LivenessJobSummary[];
};

export function JobMaintenancePanel({ jobCount }: { jobCount: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [summary, setSummary] = useState<LivenessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verifyPostings() {
    setRunning(true);
    setError(null);
    setSummary(null);
    try {
      const response = await fetch("/api/jobs/liveness", { method: "POST" });
      const payload = await response.json() as LivenessSummary | { error?: string };
      if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Posting verification failed");
      setSummary(payload as LivenessSummary);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting verification failed");
    } finally {
      setRunning(false);
    }
  }

  async function deleteExpiredUntouched() {
    if (!summary?.expiredUntouched.length) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/jobs/liveness", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: summary.expiredUntouched.map((job) => job.id) }),
      });
      const payload = await response.json() as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Cleanup failed");
      setSummary((current) => current
        ? { ...current, expiredUntouched: [] }
        : current);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-panel border border-border bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Job list maintenance</h2>
          <p className="mt-1 text-xs text-muted">
            Verify active posting links and confirm cleanup for expired jobs with no user activity.
          </p>
        </div>
        <Button disabled={running || jobCount === 0} onClick={verifyPostings} type="button" variant="secondary">
          {running ? "Verifying..." : "Verify active postings"}
        </Button>
      </div>

      {error && (
        <p className="border-t border-border px-5 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {summary && (
        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{summary.checked} checked</Badge>
            <Badge tone="success">{summary.active} active</Badge>
            <Badge tone="warning">{summary.uncertain} uncertain</Badge>
            <Badge tone={summary.expiredUntouched.length > 0 ? "danger" : "neutral"}>
              {summary.expiredUntouched.length} expired untouched
            </Badge>
            <Badge tone={summary.expiredProtected.length > 0 ? "warning" : "neutral"}>
              {summary.expiredProtected.length} expired with activity
            </Badge>
          </div>

          {summary.expiredUntouched.length > 0 && (
            <div className="mt-4 rounded-control border border-danger/30 bg-danger/8 p-3">
              <p className="text-sm font-medium text-ink">
                Confirm deletion for {summary.expiredUntouched.length} expired job{summary.expiredUntouched.length !== 1 ? "s" : ""} with no user activity.
              </p>
              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-2 text-sm text-muted">
                {summary.expiredUntouched.slice(0, 12).map((job) => (
                  <li key={job.id}>
                    <span className="font-medium text-ink">{job.title}</span> — {job.company} · {job.location}
                  </li>
                ))}
                {summary.expiredUntouched.length > 12 && (
                  <li>+{summary.expiredUntouched.length - 12} more</li>
                )}
              </ul>
              <Button
                className="mt-3 border-danger/40 bg-danger/10 text-danger hover:bg-danger/15"
                disabled={deleting}
                onClick={deleteExpiredUntouched}
                type="button"
                variant="secondary"
              >
                {deleting ? "Deleting..." : "Delete expired untouched jobs"}
              </Button>
            </div>
          )}

          {summary.expiredProtected.length > 0 && (
            <div className="mt-4 rounded-control border border-warning/30 bg-warning/8 p-3">
              <p className="text-sm font-medium text-ink">
                Kept {summary.expiredProtected.length} expired job{summary.expiredProtected.length !== 1 ? "s" : ""} because user activity exists.
              </p>
              <p className="mt-1 text-xs text-muted">
                These can only be removed through an explicit selected-job delete action.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
