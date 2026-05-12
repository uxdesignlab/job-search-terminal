"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RecentImport = {
  hasRecent: boolean;
  sourceLabel?: string;
  newJobsCount?: number;
  duplicateCount?: number;
  completedAt?: string;
};

const POLL_INTERVAL_MS = 30_000;

export function LinkedInImportNotification() {
  const router = useRouter();
  const [state, setState] = useState<RecentImport | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/job-board/recent");
      if (!res.ok) return;
      const data = (await res.json()) as RecentImport;
      if (data.hasRecent && !dismissed) {
        setState(data);
        router.refresh();
      } else if (!data.hasRecent) {
        setState(null);
      }
    } catch {
      // Ignore — non-critical background check
    }
  }, [dismissed, router]);

  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [check]);

  if (!state?.hasRecent || dismissed) return null;

  const count = state.newJobsCount ?? 0;
  const dupeCount = state.duplicateCount ?? 0;
  const sourceLabel = state.sourceLabel ?? "Job board";
  const jobLabel = `${count} new job${count !== 1 ? "s" : ""}`;
  const dupeLabel = dupeCount > 0 ? ` · ${dupeCount} possible duplicate${dupeCount !== 1 ? "s" : ""} flagged` : "";

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border border-success/30 bg-panel px-4 py-3 text-sm text-ink shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <span>
          {sourceLabel} scan imported {jobLabel}
          {dupeLabel}.
        </span>
        <button
          aria-label="Dismiss"
          className="shrink-0 text-muted hover:text-ink"
          onClick={() => setDismissed(true)}
          type="button"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
