"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import type { PendingEmailJobCandidate } from "@/lib/db/types";

type PendingResponse = {
  count: number;
  candidates: PendingEmailJobCandidate[];
};

// "reviewing"  — normal candidate list
// "importing"  — approve API call in flight; show spinner
// "done"       — import finished; brief confirmation before navigating
type Phase = "reviewing" | "importing" | "done";

const POLL_INTERVAL_MS = 8_000;

export function EmailCandidateApprovalModal() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<PendingEmailJobCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("reviewing");
  const [importingCount, setImportingCount] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [dismissWorking, setDismissWorking] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Track IDs that have already received their default selection treatment so
  // subsequent polls never overwrite what the user manually changed.
  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/email-candidates");
      if (!res.ok) return;
      const data = (await res.json()) as PendingResponse;
      if (data.count > 0) {
        setCandidates(data.candidates);
        setOpen(true);
        // Only apply default selection to candidates we haven't seen before.
        const fresh = data.candidates.filter((c) => !seenIdsRef.current.has(c.id));
        if (fresh.length > 0) {
          fresh.forEach((c) => seenIdsRef.current.add(c.id));
          const freshDefaults = new Set(fresh.filter((c) => c.titleMatch !== "weak").map((c) => c.id));
          setSelected((prev) => {
            const next = new Set(prev);
            freshDefaults.forEach((id) => next.add(id));
            return next;
          });
        }
      } else if (data.count === 0) {
        setCandidates([]);
        setOpen(false);
        seenIdsRef.current.clear();
      }
    } catch {
      // Non-critical background poll — ignore
    }
  }, []); // stable — no state deps, so the effect interval never resets

  useEffect(() => {
    void fetchPending();
    const id = setInterval(() => void fetchPending(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchPending]);

  function toggleCandidate(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(candidates.map((c) => c.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleApprove(ids: string[]) {
    if (ids.length === 0) return;
    setPhase("importing");
    setImportingCount(ids.length);
    setStatusMsg("");
    try {
      const res = await fetch("/api/email-candidates/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", ids }),
      });
      const payload = (await res.json()) as { imported?: number };
      if (!res.ok) throw new Error("Request failed");

      const remaining = candidates.filter((c) => !ids.includes(c.id));
      setCandidates(remaining);
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setImportedCount(payload.imported ?? ids.length);
      setPhase("done");

      // Brief confirmation, then navigate to the jobs page.
      await new Promise<void>((r) => setTimeout(r, 1200));
      router.push("/jobs");
      setOpen(false);
      setPhase("reviewing");
    } catch {
      setPhase("reviewing");
      setStatusMsg("Something went wrong. Please try again.");
    }
  }

  async function handleDismiss(ids: string[]) {
    if (ids.length === 0) return;
    setDismissWorking(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/email-candidates/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", ids }),
      });
      if (!res.ok) throw new Error("Request failed");

      const remaining = candidates.filter((c) => !ids.includes(c.id));
      setCandidates(remaining);
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (remaining.length === 0) setOpen(false);
      else setStatusMsg(`${ids.length} candidate${ids.length !== 1 ? "s" : ""} dismissed.`);
    } catch {
      setStatusMsg("Something went wrong. Please try again.");
    } finally {
      setDismissWorking(false);
    }
  }

  async function handleDismissAll() {
    setDismissWorking(true);
    setStatusMsg("");
    try {
      await fetch("/api/email-candidates/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss-all" }),
      });
      setCandidates([]);
      setOpen(false);
      seenIdsRef.current.clear();
    } catch {
      setStatusMsg("Something went wrong. Please try again.");
    } finally {
      setDismissWorking(false);
    }
  }

  const selectedIds = [...selected];
  const selectedCount = selectedIds.length;
  const isImporting = phase === "importing" || phase === "done";

  return (
    <Modal
      open={open}
      onClose={isImporting ? undefined : () => setOpen(false)}
      title="Review email job leads"
      size="lg"
      description={
        isImporting ? undefined : (
          <span>
            {candidates.length} candidate{candidates.length !== 1 ? "s" : ""} extracted from your email alert
            {candidates[0]?.emailSubject ? ` · "${candidates[0].emailSubject}"` : ""}. Select which to add to your job list.
          </span>
        )
      }
      footer={
        isImporting ? undefined : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className="text-sm text-muted hover:text-danger disabled:opacity-50"
              disabled={dismissWorking}
              onClick={() => void handleDismissAll()}
              type="button"
            >
              Dismiss all
            </button>
            <div className="flex gap-2">
              <Button
                disabled={dismissWorking || selectedCount === 0}
                onClick={() => void handleDismiss(selectedIds)}
                type="button"
                variant="secondary"
              >
                {dismissWorking ? "Working…" : `Dismiss selected (${selectedCount})`}
              </Button>
              <Button
                disabled={dismissWorking || selectedCount === 0}
                onClick={() => void handleApprove(selectedIds)}
                type="button"
              >
                {`Add to jobs (${selectedCount})`}
              </Button>
            </div>
          </div>
        )
      }
    >
      {isImporting ? (
        <ImportingView phase={phase} count={phase === "done" ? importedCount : importingCount} />
      ) : (
        <div className="divide-y divide-border">
          {/* Select all / none row */}
          <div className="flex items-center gap-3 px-5 py-2 text-xs text-muted">
            <button className="hover:text-ink" disabled={dismissWorking} onClick={selectAll} type="button">
              Select all
            </button>
            <span>·</span>
            <button className="hover:text-ink" disabled={dismissWorking} onClick={selectNone} type="button">
              None
            </button>
            {statusMsg ? <span className="ml-auto font-medium text-success">{statusMsg}</span> : null}
          </div>

          {candidates.map((candidate) => (
            <label
              className="flex cursor-pointer gap-3 px-5 py-4 hover:bg-panel-hover"
              key={candidate.id}
            >
              <input
                checked={selected.has(candidate.id)}
                className="mt-0.5 shrink-0 accent-accent"
                disabled={dismissWorking}
                onChange={() => toggleCandidate(candidate.id)}
                type="checkbox"
              />
              <div className="min-w-0 flex-1 grid gap-1">
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                  <span className="font-medium text-ink text-sm">{candidate.position}</span>
                  <span className="text-sm text-muted">at {candidate.company}</span>
                </div>
                <p className="text-xs text-muted">{candidate.location}</p>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  <TitleMatchBadge match={candidate.titleMatch} />
                  <ConfidenceBadge confidence={candidate.confidence} />
                </div>
                {candidate.snippet ? (
                  <p className="text-xs text-muted mt-1 line-clamp-2">{candidate.snippet}</p>
                ) : null}
              </div>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ImportingView({ phase, count }: { phase: Phase; count: number }) {
  const label = count === 1 ? "1 job" : `${count} jobs`;
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 px-8 text-center">
      {phase === "importing" ? (
        <>
          <svg
            aria-hidden="true"
            className="h-9 w-9 animate-spin text-accent"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path
              className="opacity-80"
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
            />
          </svg>
          <div className="grid gap-1">
            <p className="text-sm font-medium text-ink">Adding {label}…</p>
            <p className="text-xs text-muted">Saving leads and fetching posting details</p>
          </div>
        </>
      ) : (
        <>
          <svg
            aria-hidden="true"
            className="h-9 w-9 text-success"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
            <path
              d="M7.5 12l3 3 6-6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <div className="grid gap-1">
            <p className="text-sm font-medium text-ink">{label} added</p>
            <p className="text-xs text-muted">Taking you to your job list…</p>
          </div>
        </>
      )}
    </div>
  );
}

function TitleMatchBadge({ match }: { match: PendingEmailJobCandidate["titleMatch"] }) {
  if (match === "good") return <Badge tone="success">Matches criteria</Badge>;
  if (match === "weak") return <Badge tone="warning">Off target</Badge>;
  return <Badge tone="neutral">No criteria set</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence: PendingEmailJobCandidate["confidence"] }) {
  if (confidence === "high") return <Badge tone="success">Direct link</Badge>;
  return <Badge tone="warning">No link found</Badge>;
}
