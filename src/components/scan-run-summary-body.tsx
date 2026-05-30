"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";
import {
  classifyScanErrorMessage,
  scanErrorCategoryDescription,
  scanErrorCategoryLabel,
  type ScanErrorCategory,
} from "@/lib/scan-error-category";
import { cn } from "@/lib/utils";

/** Scan errors for aggregators are not per-company YAML sources — hide source disable. */
const NO_SOURCE_DISABLE_COMPANIES = new Set(["Adzuna"]);

type Props = {
  summary: ScanJobResultSummary;
  onClose: () => void;
  /** When true, show a link to the Jobs page after new listings were added */
  showJobsLink?: boolean;
  /** When false, omit the bottom Close button (e.g. when the dialog already has a header close control). */
  showFooterClose?: boolean;
  /** Disables one or more career sources (`scan_source_overrides`). */
  onDisableSources?: (names: string[]) => Promise<void>;
  className?: string;
};

function categoryTone(category: ScanErrorCategory): "neutral" | "success" | "warning" | "danger" {
  switch (category) {
    case "dead_or_unreachable":
      return "danger";
    case "timeout_or_slow":
      return "warning";
    default:
      return "neutral";
  }
}

function rowCanDisableSource(company: string): boolean {
  return !NO_SOURCE_DISABLE_COMPANIES.has(company);
}

export function ScanRunSummaryBody({
  summary,
  onClose,
  showJobsLink,
  showFooterClose = true,
  onDisableSources,
  className,
}: Props) {
  const [disabledSources, setDisabledSources] = useState<Set<string>>(new Set());
  const [pendingDisable, setPendingDisable] = useState<null | { type: "bulk"; count: number } | { type: "single"; company: string }>(
    null,
  );
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const { companyName } = summary;
  const jobsShown = summary.jobs.length;
  const jobsTotal = summary.jobsTotal ?? jobsShown;
  const truncated = jobsTotal > jobsShown;

  const errorRows = summary.errors;
  const categoryByIndex = useMemo(
    () => errorRows.map((e) => e.category ?? classifyScanErrorMessage(e.error)),
    [errorRows],
  );

  const categoryCounts = useMemo(() => {
    let dead = 0;
    let timeout = 0;
    let other = 0;
    for (const c of categoryByIndex) {
      if (c === "dead_or_unreachable") dead++;
      else if (c === "timeout_or_slow") timeout++;
      else other++;
    }
    return { dead, timeout, other };
  }, [categoryByIndex]);

  const disableEligibleIndices = useMemo(() => {
    const indices: number[] = [];
    errorRows.forEach((e, i) => {
      if (rowCanDisableSource(e.company) && !disabledSources.has(e.company)) {
        indices.push(i);
      }
    });
    return indices;
  }, [errorRows, disabledSources]);

  const selectedDisableCount = useMemo(() => {
    let n = 0;
    for (const i of selectedRows) {
      const e = errorRows[i];
      if (e && rowCanDisableSource(e.company) && !disabledSources.has(e.company)) n++;
    }
    return n;
  }, [selectedRows, errorRows, disabledSources]);

  const suggestedDisableCount = disableEligibleIndices.length;

  const toggleRowSelected = (index: number) => {
    const e = errorRows[index];
    if (!e || !rowCanDisableSource(e.company) || disabledSources.has(e.company)) return;
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllEligible = () => {
    setSelectedRows(new Set(disableEligibleIndices));
  };

  const clearSelection = () => setSelectedRows(new Set());

  const disableCompanies = async (names: string[]) => {
    if (!onDisableSources || names.length === 0) return;
    await onDisableSources(names);
    setDisabledSources((prev) => {
      const next = new Set(prev);
      for (const n of names) next.add(n);
      return next;
    });
    setSelectedRows((prev) => {
      const next = new Set(prev);
      const nameSet = new Set(names);
      for (let i = 0; i < errorRows.length; i++) {
        if (errorRows[i] && nameSet.has(errorRows[i].company)) next.delete(i);
      }
      return next;
    });
  };

  const handleBulkDisable = async () => {
    const names = [...selectedRows]
      .map((i) => errorRows[i]?.company)
      .filter((n): n is string => Boolean(n && rowCanDisableSource(n) && !disabledSources.has(n)));
    const unique = [...new Set(names)];
    if (unique.length === 0) return;
    setPendingDisable({ type: "bulk", count: unique.length });
    try {
      await disableCompanies(unique);
    } finally {
      setPendingDisable(null);
    }
  };

  const scrollableBody = (
    <>
      {errorRows.length > 0 && (
        <ul className="space-y-2 rounded-md border border-border bg-surface/50 p-3 text-sm">
          {errorRows.map((e, i) => {
            const category = categoryByIndex[i] ?? "other";
            const canDisableRow = rowCanDisableSource(e.company) && Boolean(onDisableSources);
            const isDisabled = disabledSources.has(e.company);
            const showCheckbox = canDisableRow && !isDisabled;
            const selected = selectedRows.has(i);
            const rowDisabling = pendingDisable?.type === "single" && pendingDisable.company === e.company;

            return (
              <li className="flex flex-col gap-1.5 border-b border-border/60 pb-2 last:border-0 last:pb-0" key={`${e.company}-${i}`}>
                <div className="flex items-start gap-2">
                  {showCheckbox ? (
                    <input
                      aria-label={`Select ${e.company} for bulk disable`}
                      checked={selected}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onChange={() => toggleRowSelected(i)}
                      type="checkbox"
                    />
                  ) : (
                    <span className="mt-1 w-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <span className="font-medium text-ink">{e.company}</span>
                      <Badge className="max-w-full truncate" title={scanErrorCategoryDescription(category)} tone={categoryTone(category)}>
                        {scanErrorCategoryLabel(category)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 leading-5 text-danger">{e.error}</p>
                  </div>
                  {onDisableSources && canDisableRow ? (
                    <button
                      className="shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50"
                      disabled={isDisabled || pendingDisable !== null}
                      onClick={async () => {
                        setPendingDisable({ type: "single", company: e.company });
                        try {
                          await disableCompanies([e.company]);
                        } finally {
                          setPendingDisable(null);
                        }
                      }}
                      style={isDisabled ? { color: "var(--color-muted)" } : { color: "var(--color-danger)" }}
                      type="button"
                    >
                      {isDisabled ? "Disabled" : rowDisabling ? "Disabling…" : "Disable"}
                    </button>
                  ) : null}
                </div>
                {!canDisableRow && e.company === "Adzuna" ? (
                  <p className="pl-6 text-xs text-muted">Adjust Adzuna under Settings → AI Provider → Discovery & Aggregators.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className={errorRows.length > 0 ? "mt-4" : ""}>
        {truncated && (
          <p className="mb-2 text-xs text-muted">
            Showing {jobsShown} of {jobsTotal} new listings below. Open Jobs for the full list.
          </p>
        )}
        {summary.jobs.length === 0 ? (
          <p className="text-sm text-muted">
            No new listings were added. Existing jobs and filtered listings are unchanged.
          </p>
        ) : (
          <ul className="space-y-2 pr-1">
            {summary.jobs.map((job) => (
              <li className="text-sm" key={job.url}>
                <a
                  className="font-medium text-accent hover:underline"
                  href={job.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {job.title}
                </a>
                {job.company !== companyName && <span className="text-muted"> — {job.company}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="mb-4 shrink-0 flex flex-wrap gap-2">
        <Badge
          tone={
            summary.status === "completed" ? "success" : summary.status === "failed" ? "danger" : "warning"
          }
        >
          {summary.status === "completed"
            ? "Completed"
            : summary.status === "failed"
              ? "Failed"
              : "Completed with issues"}
        </Badge>
        <Badge tone="neutral">{summary.newJobsCount} new in app</Badge>
        <Badge tone="neutral">{summary.totalJobsFound} found at source</Badge>
        {summary.companiesScanned > 0 && (
          <Badge tone="neutral">
            {summary.companiesScanned} source{summary.companiesScanned !== 1 ? "s" : ""} scanned
          </Badge>
        )}
        {summary.skippedCompanies > 0 && <Badge tone="neutral">{summary.skippedCompanies} skipped</Badge>}
        {summary.filteredCount > 0 && (
          <Badge tone="neutral">{summary.filteredCount} filtered by profile rules</Badge>
        )}
        {summary.duplicateCount > 0 && <Badge tone="neutral">{summary.duplicateCount} duplicates skipped</Badge>}
      </div>

      {errorRows.length > 0 && (
        <div className="mb-3 shrink-0 space-y-2 rounded-md border border-border bg-panel p-3 text-xs leading-relaxed text-muted">
          <p className="font-medium text-ink">
            {errorRows.length} source{errorRows.length !== 1 ? "s" : ""} reported an issue
            {suggestedDisableCount > 0 ? (
              <>
                {" "}
                — <span className="text-accent">{suggestedDisableCount}</span> can be disabled as career sources
              </>
            ) : null}
          </p>
          <p>
            <span className="text-danger">{categoryCounts.dead}</span>{" "}
            {categoryCounts.dead === 1 ? "dead or missing listing" : "dead or missing listings"} ·{" "}
            <span className="text-warning">{categoryCounts.timeout}</span> timed out (may still be live) ·{" "}
            <span className="text-ink">{categoryCounts.other}</span> other
          </p>
        </div>
      )}

      {errorRows.length > 0 && onDisableSources && suggestedDisableCount > 0 ? (
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <Button
            disabled={pendingDisable !== null || disableEligibleIndices.length === 0}
            onClick={selectAllEligible}
            type="button"
            variant="secondary"
          >
            Select all ({disableEligibleIndices.length})
          </Button>
          <Button
            disabled={pendingDisable !== null || selectedRows.size === 0}
            onClick={clearSelection}
            type="button"
            variant="secondary"
          >
            Clear selection
          </Button>
          <Button
            disabled={pendingDisable !== null || selectedDisableCount === 0}
            onClick={() => void handleBulkDisable()}
            type="button"
            variant="secondary"
          >
            {pendingDisable?.type === "bulk"
              ? `Disabling ${pendingDisable.count}…`
              : `Disable selected (${selectedDisableCount})`}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">{scrollableBody}</div>

      {(showFooterClose || (showJobsLink && summary.newJobsCount > 0)) && (
        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          {showJobsLink && summary.newJobsCount > 0 && (
            <Link className="text-sm font-medium text-accent hover:underline" href="/jobs">
              Open Jobs →
            </Link>
          )}
          {showFooterClose && (
            <Button onClick={onClose} type="button" variant="secondary">
              Close
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
