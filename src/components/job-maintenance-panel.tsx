"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { ProgressModal } from "@/components/ui/progress-modal";

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
  outOfScope: LivenessJobSummary[];
};

const UNTOUCHED_STATUS = "Found";

export function JobMaintenancePanel({ jobCount }: { jobCount: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [verifyPhase, setVerifyPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [deleting, setDeleting] = useState(false);
  const [deletingOutOfScope, setDeletingOutOfScope] = useState(false);
  const [summary, setSummary] = useState<LivenessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verifyPostings() {
    setRunning(true);
    setVerifyPhase("running");
    setError(null);
    setSummary(null);
    try {
      const response = await fetch("/api/jobs/liveness", { method: "POST" });
      const payload = await response.json() as LivenessSummary | { error?: string };
      if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Posting verification failed");
      setSummary(payload as LivenessSummary);
      setVerifyPhase("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posting verification failed");
      setVerifyPhase("error");
    } finally {
      setRunning(false);
    }
  }

  async function deleteOutOfScope() {
    const deletable = summary?.outOfScope.filter((job) => job.status === UNTOUCHED_STATUS) ?? [];
    if (deletable.length === 0) return;
    setDeletingOutOfScope(true);
    setError(null);
    try {
      const response = await fetch("/api/jobs/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deletable.map((job) => job.id) }),
      });
      const payload = await response.json() as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Deletion failed");
      setSummary((current) => current
        ? {
          ...current,
          outOfScope: current.outOfScope.filter((job) => job.status !== UNTOUCHED_STATUS),
        }
        : current);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setDeletingOutOfScope(false);
    }
  }

  function dismissOutOfScope() {
    setSummary((current) => current ? { ...current, outOfScope: [] } : current);
  }

  const outOfScopeUntouched = summary?.outOfScope.filter((job) => job.status === UNTOUCHED_STATUS) ?? [];
  const outOfScopeProtected = summary?.outOfScope.filter((job) => job.status !== UNTOUCHED_STATUS) ?? [];

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

  const verifyModalOpen = verifyPhase === "running" || verifyPhase === "done" || verifyPhase === "error";

  return (
    <>
    <ProgressModal
      open={verifyModalOpen}
      phase={verifyPhase === "running" ? "running" : "done"}
      title="Verifying active postings"
      message="Checking each posting link for liveness…"
      subtitle="This may take a minute for large job lists."
      error={verifyPhase === "error" ? (error ?? "Verification failed") : null}
      onClose={() => setVerifyPhase("idle")}
    >
      {summary && (
        <div className="grid gap-3">
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
            <Badge tone={summary.outOfScope.length > 0 ? "warning" : "neutral"}>
              {summary.outOfScope.length} out of scope
            </Badge>
          </div>
          {(summary.expiredUntouched.length > 0 || summary.outOfScope.length > 0) && (
            <p className="text-xs text-muted">Close to review and take action on expired or out-of-scope jobs below.</p>
          )}
        </div>
      )}
    </ProgressModal>

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
            <Badge tone={summary.outOfScope.length > 0 ? "warning" : "neutral"}>
              {summary.outOfScope.length} out of scope
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

          {summary.outOfScope.length > 0 && (
            <div className="mt-4 rounded-control border border-warning/30 bg-warning/8 p-3">
              <p className="text-sm font-medium text-ink">
                {summary.outOfScope.length} job{summary.outOfScope.length !== 1 ? "s" : ""} labeled &ldquo;Out of scope&rdquo; — title doesn&apos;t match your title filters.
              </p>
              {outOfScopeUntouched.length > 0 && (
                <>
                  <p className="mt-2 text-xs font-medium text-muted">
                    Untouched jobs can be deleted here.
                  </p>
                  <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-2 text-sm text-muted">
                    {outOfScopeUntouched.slice(0, 12).map((job) => (
                      <li key={job.id}>
                        <span className="font-medium text-ink">{job.title}</span> — {job.company} · {job.location}
                      </li>
                    ))}
                    {outOfScopeUntouched.length > 12 && (
                      <li>+{outOfScopeUntouched.length - 12} more</li>
                    )}
                  </ul>
                </>
              )}
              {outOfScopeProtected.length > 0 && (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Kept {outOfScopeProtected.length} out-of-scope job{outOfScopeProtected.length !== 1 ? "s" : ""} with user activity.
                  Remove them from the Jobs table if you decide they should be deleted.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  className="border-danger/40 bg-danger/10 text-danger hover:bg-danger/15"
                  disabled={deletingOutOfScope || outOfScopeUntouched.length === 0}
                  onClick={deleteOutOfScope}
                  type="button"
                  variant="secondary"
                >
                  {deletingOutOfScope ? "Deleting..." : `Delete ${outOfScopeUntouched.length} untouched`}
                </Button>
                <Button disabled={deletingOutOfScope} onClick={dismissOutOfScope} type="button" variant="secondary">
                  Keep &amp; dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
    </>
  );
}
