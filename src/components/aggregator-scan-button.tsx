"use client";

import { useState, useTransition } from "react";
import type { AggregatorScanResult } from "@/lib/scanner/aggregator-scanner";

type Props = {
  onScan: () => Promise<AggregatorScanResult>;
  hasCredentials: boolean;
};

export function AggregatorScanButton({ onScan, hasCredentials }: Props) {
  const [result, setResult] = useState<AggregatorScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleScan() {
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const r = await onScan();
        setResult(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (!hasCredentials) {
    return (
      <p className="text-xs text-muted">
        Add Adzuna credentials in the AI Provider tab to enable.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleScan}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-control border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {isPending ? "Scanning…" : "Scan with Adzuna"}
      </button>
      {result && result.status !== "no-credentials" && (
        <p className="text-xs text-muted">
          {result.status === "ok"
            ? `Done — ${result.imported} new, ${result.duplicates} duplicates (${result.totalFound} found)`
            : `Error: ${result.errors[0] ?? "Unknown error"}`}
        </p>
      )}
      {result?.status === "no-credentials" && (
        <p className="text-xs text-danger">Adzuna credentials not configured.</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
