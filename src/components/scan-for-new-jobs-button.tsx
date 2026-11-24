"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScanRunSummaryBody } from "@/components/scan-run-summary-body";
import { disableScanSources } from "@/app/actions/scan-source-actions";
import type {
  JobDiscoveryProgressUpdate,
  JobDiscoveryScanStreamEvent,
  JobDiscoverySourceId,
  JobDiscoverySourceStatus,
} from "@/lib/scan-progress-types";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";
import { SCAN_FINISHED_EVENT, SCAN_STARTED_EVENT } from "@/components/board-catch-up-status";

const SOURCE_ORDER: JobDiscoverySourceId[] = ["career-sites", "adzuna", "dice"];

function formatSourceList(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "enabled career sources";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function sourceStatusLabel(status: JobDiscoverySourceStatus): string {
  switch (status) {
    case "pending":
      return "Waiting";
    case "running":
      return "Scanning now";
    case "completed":
      return "Complete";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Stopped";
  }
}

function SourceStatusIcon({ status }: { status: JobDiscoverySourceStatus }) {
  if (status === "running") {
    return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />;
  }

  if (status === "completed") {
    return (
      <svg aria-hidden className="h-4 w-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </svg>
    );
  }

  if (status === "failed") {
    return <span aria-hidden className="text-sm font-semibold text-danger">!</span>;
  }

  return <span aria-hidden className="h-2 w-2 rounded-full bg-border" />;
}

export function ScanForNewJobsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"running" | "done">("running");
  const [summary, setSummary] = useState<ScanJobResultSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceProgress, setSourceProgress] = useState<Partial<Record<JobDiscoverySourceId, JobDiscoveryProgressUpdate>>>({});
  /** True from click until the result (or an error) arrives, whether or not the dialog is open. */
  const [inFlight, setInFlight] = useState(false);
  /** The user closed the dialog mid-scan; the scan keeps going and a notice reports the end. */
  const [backgrounded, setBackgrounded] = useState(false);
  const backgroundedRef = useRef(false);
  const [finishedInBackground, setFinishedInBackground] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setFinishedInBackground(false);
    setSummary(null);
    setError(null);
    setSourceProgress({});
    setPhase("running");
  }, []);

  const keepWorking = useCallback(() => {
    backgroundedRef.current = true;
    setBackgrounded(true);
    setOpen(false);
  }, []);

  const reopen = useCallback(() => {
    backgroundedRef.current = false;
    setBackgrounded(false);
    setFinishedInBackground(false);
    setOpen(true);
  }, []);

  const startScan = useCallback(async () => {
    backgroundedRef.current = false;
    setBackgrounded(false);
    setFinishedInBackground(false);
    setInFlight(true);
    setOpen(true);
    setPhase("running");
    setSummary(null);
    setError(null);
    setSourceProgress({});
    try {
      const response = await fetch("/api/job-discovery/scan", { method: "POST" });
      window.dispatchEvent(new Event(SCAN_STARTED_EVENT));
      if (!response.ok) throw new Error(`Scan failed (HTTP ${response.status})`);
      if (!response.body) throw new Error("The scan did not return a progress stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resultReceived = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as JobDiscoveryScanStreamEvent;
        if (event.type === "progress") {
          setSourceProgress((current) => ({ ...current, [event.progress.sourceId]: event.progress }));
          return;
        }
        if (event.type === "error") throw new Error(event.message);
        resultReceived = true;
        setSummary(event.summary);
        setPhase("done");
        router.refresh();
        window.dispatchEvent(new Event(SCAN_FINISHED_EVENT));
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
        if (done) break;
      }
      processLine(buffer);
      if (!resultReceived) throw new Error("The scan ended before results were available");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setPhase("done");
    } finally {
      setInFlight(false);
      if (backgroundedRef.current) setFinishedInBackground(true);
    }
  }, [router]);

  const progressItems = SOURCE_ORDER.flatMap((sourceId) => {
    const update = sourceProgress[sourceId];
    return update ? [update] : [];
  });
  const activeSources = progressItems.filter((item) => item.status === "running");
  const pendingSources = progressItems.filter((item) => item.status === "pending");
  const currentActivity = activeSources.length > 0
    ? `Scanning ${formatSourceList(activeSources.map((item) => item.sourceLabel))}…`
    : pendingSources.length > 0
      ? "Preparing the next career sources…"
      : progressItems.length > 0
        ? "Finishing the scan…"
        : "Preparing enabled career sources…";

  return (
    <>
      {/* While a backgrounded scan runs, the button reopens its progress instead of starting another. */}
      <Button
        aria-label={inFlight && backgrounded ? "Scanning — show progress" : undefined}
        onClick={() => (inFlight && backgrounded ? reopen() : void startScan())}
        type="button"
      >
        {inFlight ? "Scanning…" : "Scan for new jobs"}
      </Button>

      {finishedInBackground && !open ? (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3 text-sm text-ink shadow-lg"
          role="status"
        >
          <span>
            {error
              ? "Your scan stopped before it finished."
              : `Your scan finished · ${summary?.newJobsCount ?? 0} new ${summary?.newJobsCount === 1 ? "job" : "jobs"}`}
          </span>
          <button className="font-medium text-accent hover:underline" onClick={reopen} type="button">
            View results
          </button>
          <button
            aria-label="Dismiss"
            className="text-muted hover:text-ink"
            onClick={() => {
              setFinishedInBackground(false);
              backgroundedRef.current = false;
              setBackgrounded(false);
            }}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}

      {open && (
        <div
          aria-busy={phase === "running"}
          aria-labelledby="scan-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-2xl bg-panel p-6 shadow-2xl">
            <div className="mb-4 shrink-0 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink" id="scan-dialog-title">
                {phase === "running" ? "Scan in progress" : "Scan results — All enabled sources"}
              </h2>
              {phase === "done" && (
                <button
                  aria-label="Close"
                  className="shrink-0 rounded-control p-1 text-muted hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={close}
                  type="button"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                  </svg>
                </button>
              )}
            </div>

            {phase === "running" && (
              <div className="flex min-h-0 shrink-0 flex-col items-center gap-4 overflow-y-auto py-6 sm:py-8">
                <div
                  aria-hidden
                  className="h-11 w-11 animate-spin rounded-full border-2 border-accent border-t-transparent"
                />
                <div className="w-full text-center">
                  <p aria-atomic="true" aria-live="polite" className="text-sm font-medium text-ink" role="status">
                    {currentActivity}
                  </p>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
                    Fetching job boards, applying your title and profile filters, and saving new listings. This can
                    take a minute if you track many companies.
                  </p>
                  <Button className="mt-4" onClick={keepWorking} type="button" variant="secondary">
                    Keep working while it scans
                  </Button>
                </div>

                {progressItems.length > 0 && (
                  <ul aria-label="Scan source progress" className="mt-2 grid w-full max-w-md gap-2">
                    {progressItems.map((item) => (
                      <li
                        className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2 text-left"
                        key={item.sourceId}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          <SourceStatusIcon status={item.status} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{item.sourceLabel}</span>
                          <span className="block truncate text-xs text-muted">{item.detail}</span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-muted">{sourceStatusLabel(item.status)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {phase === "done" && error && (
              <div className="grid gap-4">
                <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
                  {error}
                </p>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button onClick={close} type="button" variant="secondary">
                    Close
                  </Button>
                </div>
              </div>
            )}

            {phase === "done" && summary && (
              <ScanRunSummaryBody
                className="min-h-0 flex-1"
                showFooterClose={false}
                showJobsLink
                summary={summary}
                onClose={close}
                onDisableSources={async (names) => {
                  await disableScanSources(names);
                  router.refresh();
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
