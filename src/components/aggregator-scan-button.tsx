"use client";

import { useState, useTransition } from "react";
import type { AggregatorScanResult } from "@/lib/scanner/aggregator-scanner";
import { ProgressModal } from "@/components/ui/progress-modal";

type Props = {
  onScan: () => Promise<AggregatorScanResult>;
  hasCredentials: boolean;
};

export function AggregatorScanButton({ onScan, hasCredentials }: Props) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<AggregatorScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleScan() {
    setResult(null);
    setError(null);
    setPhase("running");
    startTransition(async () => {
      try {
        const r = await onScan();
        setResult(r);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    });
  }

  function closeModal() {
    setPhase("idle");
    setError(null);
  }

  if (!hasCredentials) {
    return (
      <p className="text-xs text-muted">
        Add Adzuna credentials in the AI Provider tab to enable.
      </p>
    );
  }

  const resultText = result && result.status === "ok"
    ? `Found ${result.totalFound} listings — ${result.imported} new, ${result.duplicates} duplicates.`
    : result?.status === "no-credentials"
      ? "Adzuna credentials not configured."
      : result?.errors?.[0] ?? null;

  const isError = phase === "error" || result?.status === "error" || result?.status === "no-credentials";

  return (
    <>
      <button
        type="button"
        onClick={handleScan}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-control border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {isPending ? "Scanning…" : "Scan with Adzuna"}
      </button>

      <ProgressModal
        open={phase === "running" || phase === "done" || phase === "error"}
        phase={phase === "running" ? "running" : "done"}
        title="Scanning Adzuna"
        message="Searching job boards for new listings…"
        subtitle="Applying your title and location filters."
        error={isError ? (error ?? resultText ?? "Scan failed") : null}
        onClose={closeModal}
      >
        <p className="text-sm text-success">{resultText}</p>
      </ProgressModal>
    </>
  );
}
