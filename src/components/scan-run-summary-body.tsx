"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";

type Props = {
  summary: ScanJobResultSummary;
  onClose: () => void;
  /** When true, show a link to the Jobs page after new listings were added */
  showJobsLink?: boolean;
  /** When false, omit the bottom Close button (e.g. when the dialog already has a header close control). */
  showFooterClose?: boolean;
  /** Called with the source name when the user clicks "Disable" on an error row. */
  onDisableSource?: (company: string) => Promise<void>;
};

export function ScanRunSummaryBody({
  summary,
  onClose,
  showJobsLink,
  showFooterClose = true,
  onDisableSource,
}: Props) {
  const [disabledSources, setDisabledSources] = useState<Set<string>>(new Set());
  const [disabling, setDisabling] = useState<string | null>(null);

  const { companyName } = summary;
  const jobsShown = summary.jobs.length;
  const jobsTotal = summary.jobsTotal ?? jobsShown;
  const truncated = jobsTotal > jobsShown;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge
          tone={
            summary.status === "completed"
              ? "success"
              : summary.status === "failed"
                ? "danger"
                : "warning"
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
          <Badge tone="neutral">{summary.companiesScanned} source{summary.companiesScanned !== 1 ? "s" : ""} scanned</Badge>
        )}
        {summary.skippedCompanies > 0 && (
          <Badge tone="neutral">{summary.skippedCompanies} skipped</Badge>
        )}
        {summary.filteredCount > 0 && (
          <Badge tone="neutral">{summary.filteredCount} filtered by profile rules</Badge>
        )}
        {summary.duplicateCount > 0 && (
          <Badge tone="neutral">{summary.duplicateCount} duplicates skipped</Badge>
        )}
      </div>

      {summary.errors.length > 0 && (
        <ul className="mb-4 space-y-1.5 rounded-md border border-border bg-surface/50 p-3 text-sm text-danger">
          {summary.errors.map((e, i) => {
            const isDisabled = disabledSources.has(e.company);
            const isDisabling = disabling === e.company;
            return (
              <li className="flex items-start justify-between gap-2" key={`${e.company}-${i}`}>
                <span className="leading-5">
                  <span className="font-medium text-ink">{e.company}:</span> {e.error}
                </span>
                {onDisableSource && (
                  <button
                    className="shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50"
                    disabled={isDisabled || isDisabling}
                    onClick={async () => {
                      setDisabling(e.company);
                      await onDisableSource(e.company);
                      setDisabledSources((prev) => new Set([...prev, e.company]));
                      setDisabling(null);
                    }}
                    style={isDisabled ? { color: "var(--color-muted)" } : { color: "var(--color-danger)" }}
                    type="button"
                  >
                    {isDisabled ? "Disabled" : isDisabling ? "Disabling…" : "Disable"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
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
                {job.company !== companyName && (
                  <span className="text-muted"> — {job.company}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(showFooterClose || (showJobsLink && summary.newJobsCount > 0)) && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          {showJobsLink && summary.newJobsCount > 0 && (
            <Link
              className="text-sm font-medium text-accent hover:underline"
              href="/jobs"
            >
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
    </>
  );
}
