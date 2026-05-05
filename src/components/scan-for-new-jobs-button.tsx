"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScanRunSummaryBody } from "@/components/scan-run-summary-body";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";

type Props = {
  runScan: () => Promise<ScanJobResultSummary>;
};

export function ScanForNewJobsButton({ runScan }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"running" | "done">("running");
  const [summary, setSummary] = useState<ScanJobResultSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSummary(null);
    setError(null);
    setPhase("running");
  }, []);

  const startScan = useCallback(async () => {
    setOpen(true);
    setPhase("running");
    setSummary(null);
    setError(null);
    try {
      const result = await runScan();
      setSummary(result);
      setPhase("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setPhase("done");
    }
  }, [runScan, router]);

  return (
    <>
      <Button onClick={() => void startScan()} type="button">
        Scan for new jobs
      </Button>

      {open && (
        <div
          aria-busy={phase === "running"}
          aria-labelledby="scan-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-panel p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
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
              <div className="flex flex-col items-center gap-4 py-10">
                <div
                  aria-hidden
                  className="h-11 w-11 animate-spin rounded-full border-2 border-accent border-t-transparent"
                />
                <div className="text-center">
                  <p className="text-sm font-medium text-ink">Scanning enabled career sources…</p>
                  <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">
                    Fetching job boards, applying your title and profile filters, and saving new listings. This can
                    take a minute if you track many companies.
                  </p>
                </div>
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
                showFooterClose={false}
                showJobsLink
                summary={summary}
                onClose={close}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
