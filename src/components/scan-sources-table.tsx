"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IndustryEditor } from "@/components/industry-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTableActiveFiltersSummary,
  DataTableColHeader,
  DataTableSortFilterDropdown,
  useDataTableSortFilterState,
} from "@/components/ui/data-table-sort-filter";
import { dataTableClass, dataTableStickyHeadClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScanSource = {
  name: string;
  careersUrl: string;
  apiType: "greenhouse" | "ashby" | "lever" | null;
  enabled: boolean;
  isCustom: boolean;
  industry: string;
};

export type CompanyScanResultSummary = {
  companyName: string;
  status: "completed" | "completed_with_errors" | "failed";
  newJobsCount: number;
  totalJobsFound: number;
  filteredCount: number;
  duplicateCount: number;
  companiesScanned: number;
  skippedCompanies: number;
  errors: Array<{ company: string; error: string }>;
  jobs: Array<{ title: string; url: string; company: string }>;
};

type Props = {
  sources: ScanSource[];
  onToggle: (name: string, enabled: boolean) => Promise<void>;
  onToggleAll?: (changes: Array<{ name: string; enabled: boolean }>) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onSaveIndustry: (name: string, industry: string) => Promise<void>;
  onScanCompany: (companyName: string) => Promise<CompanyScanResultSummary>;
};

type SortCol = "company" | "industry" | "ats" | "status";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function atsLabel(t: ScanSource["apiType"]) {
  if (!t) return "Unknown";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function getColValue(s: ScanSource, col: SortCol): string {
  switch (col) {
    case "company": return s.name;
    case "industry": return s.industry || "(none)";
    case "ats": return atsLabel(s.apiType);
    case "status": return s.enabled ? "Enabled" : "Disabled";
  }
}

function getColOptions(sources: ScanSource[], col: SortCol): string[] {
  if (col === "status") return ["Enabled", "Disabled"];
  return [...new Set(sources.map((s) => getColValue(s, col)))].sort();
}

// ─── Main Component ───────────────────────────────────────────────────────────

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "company", label: "Company" },
  { col: "industry", label: "Industry" },
  { col: "ats", label: "ATS" },
  { col: "status", label: "Status" },
];

export function ScanSourcesTable({
  sources,
  onToggle,
  onToggleAll,
  onRemove,
  onSaveIndustry,
  onScanCompany,
}: Props) {
  const router = useRouter();
  const {
    sort,
    filters,
    openFilterCol,
    filterPos,
    openFilter,
    handleSort,
    handleFilter,
    clearAllFilters,
    setOpenFilterCol,
    activeFilterCount,
  } = useDataTableSortFilterState<SortCol>({ col: "company", dir: "asc" });
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [pendingRemoves, setPendingRemoves] = useState<Set<string>>(new Set());
  const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [scanResult, setScanResult] = useState<CompanyScanResultSummary | null>(null);
  const [scanningName, setScanningName] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  function handleToggle(name: string) {
    const currentEnabled = enabledOverrides.has(name)
      ? enabledOverrides.get(name)!
      : (sources.find((s) => s.name === name)?.enabled ?? true);
    const newEnabled = !currentEnabled;
    setEnabledOverrides((prev) => new Map(prev).set(name, newEnabled));
    setPendingToggles((prev) => new Set(prev).add(name));
    startTransition(async () => {
      await onToggle(name, newEnabled);
      setPendingToggles((prev) => { const next = new Set(prev); next.delete(name); return next; });
    });
  }

  function handleRemove(name: string) {
    setPendingRemoves((prev) => new Set(prev).add(name));
    startTransition(async () => {
      await onRemove(name);
    });
  }

  function getEffectiveEnabled(name: string, fallback: boolean) {
    return enabledOverrides.has(name) ? enabledOverrides.get(name)! : fallback;
  }

  const colOptions = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col }) => [col, getColOptions(sources, col)])) as Record<SortCol, string[]>,
    [sources]
  );

  const displaySources = useMemo(() => {
    // Apply optimistic enabled overrides for filtering
    const withOverrides = sources.map((s) => ({
      ...s,
      enabled: enabledOverrides.has(s.name) ? enabledOverrides.get(s.name)! : s.enabled,
    }));

    let result = withOverrides.filter((s) => !pendingRemoves.has(s.name));

    for (const [col, allowed] of Object.entries(filters) as [SortCol, Set<string>][]) {
      if (!allowed) continue;
      result = result.filter((s) => allowed.has(getColValue(s, col)));
    }

    return [...result].sort((a, b) => {
      const cmp = getColValue(a, sort.col).localeCompare(getColValue(b, sort.col));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [sources, sort, filters, enabledOverrides, pendingRemoves]);

  const allVisibleEnabled =
    displaySources.length > 0 && displaySources.every((s) => getEffectiveEnabled(s.name, s.enabled));
  const noneVisibleEnabled =
    displaySources.length === 0 || displaySources.every((s) => !getEffectiveEnabled(s.name, s.enabled));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allVisibleEnabled && !noneVisibleEnabled;
    }
  }, [allVisibleEnabled, noneVisibleEnabled]);

  async function handleScanCompany(name: string) {
    setScanningName(name);
    setScanError(null);
    try {
      const summary = await onScanCompany(name);
      setScanResult(summary);
      router.refresh();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanningName(null);
    }
  }

  function handleToggleAll() {
    const toEnable = !allVisibleEnabled;
    const changes = displaySources
      .filter((s) => getEffectiveEnabled(s.name, s.enabled) !== toEnable)
      .map((s) => ({ name: s.name, enabled: toEnable }));
    if (changes.length === 0) return;
    setEnabledOverrides((prev) => {
      const next = new Map(prev);
      for (const { name, enabled } of changes) next.set(name, enabled);
      return next;
    });
    startTransition(async () => {
      await onToggleAll?.(changes);
    });
  }

  return (
    <div className="relative">
      {activeFilterCount > 0 && (
        <DataTableActiveFiltersSummary
          entityLabel="sources"
          onClearAll={clearAllFilters}
          shown={displaySources.length}
          total={sources.length}
        />
      )}

      <div className="w-full max-w-full" role="region" aria-label="Scan sources table">
        <table className={cn(dataTableClass, dataTableStickyHeadClass, "min-w-max")}>
          <thead>
            <tr>
              <th className="pb-3 pr-3 w-10">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Toggle all visible sources"
                  checked={allVisibleEnabled}
                  onChange={handleToggleAll}
                  disabled={displaySources.length === 0}
                  className="h-4 w-4 rounded border-border"
                />
              </th>
              {COL_DEFS.map(({ col, label }) => (
                <DataTableColHeader
                  key={col}
                  col={col}
                  label={label}
                  sort={sort}
                  filter={filters[col]}
                  isOpen={openFilterCol === col}
                  onOpen={openFilter}
                />
              ))}
              <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted w-28">
                Scan
              </th>
              <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted w-20">
                Careers
              </th>
              <th className="pb-3 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displaySources.map((source) => {
              const isEnabled = enabledOverrides.has(source.name)
                ? enabledOverrides.get(source.name)!
                : source.enabled;
              const isTogglePending = pendingToggles.has(source.name);

              return (
                <tr key={source.name} className={isEnabled ? undefined : "opacity-50"}>
                  <td className="py-3 pr-3">
                    <input
                      aria-label={`${isEnabled ? "Disable" : "Enable"} ${source.name}`}
                      checked={isEnabled}
                      className="h-4 w-4 rounded border-border"
                      disabled={isTogglePending}
                      onChange={() => handleToggle(source.name)}
                      type="checkbox"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">{source.name}</span>
                      {source.isCustom && <Badge tone="warning">Custom</Badge>}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <IndustryEditor
                      initialIndustry={source.industry}
                      name={source.name}
                      onSave={onSaveIndustry}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    {source.apiType ? (
                      <Badge>{atsLabel(source.apiType)}</Badge>
                    ) : (
                      <Badge tone="danger">Unknown</Badge>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={isEnabled ? "success" : "neutral"}>
                      {isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Button
                      aria-label={`Scan for new jobs at ${source.name}`}
                      className="min-h-8 px-2.5 py-1 text-xs"
                      disabled={scanningName !== null}
                      onClick={() => void handleScanCompany(source.name)}
                      type="button"
                      variant="secondary"
                    >
                      {scanningName === source.name ? "Scanning…" : "Scan jobs"}
                    </Button>
                  </td>
                  <td className="py-3 pr-4">
                    {source.careersUrl ? (
                      <a
                        className="text-xs text-accent hover:underline"
                        href={source.careersUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        ↗
                      </a>
                    ) : null}
                  </td>
                  <td className="py-3">
                    {source.isCustom ? (
                      <button
                        className="text-xs text-muted hover:text-danger"
                        onClick={() => handleRemove(source.name)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {scanResult && (
        <div
          aria-labelledby="scan-result-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-panel p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink" id="scan-result-title">
                Scan results — {scanResult.companyName}
              </h2>
              <button
                aria-label="Close"
                className="shrink-0 rounded-control p-1 text-muted hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => setScanResult(null)}
                type="button"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                </svg>
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <Badge
                tone={
                  scanResult.status === "completed"
                    ? "success"
                    : scanResult.status === "failed"
                      ? "danger"
                      : "warning"
                }
              >
                {scanResult.status === "completed"
                  ? "Completed"
                  : scanResult.status === "failed"
                    ? "Failed"
                    : "Completed with issues"}
              </Badge>
              <Badge tone="neutral">{scanResult.newJobsCount} new in app</Badge>
              <Badge tone="neutral">{scanResult.totalJobsFound} found at source</Badge>
              {scanResult.filteredCount > 0 && (
                <Badge tone="neutral">{scanResult.filteredCount} filtered by title rules</Badge>
              )}
              {scanResult.duplicateCount > 0 && (
                <Badge tone="neutral">{scanResult.duplicateCount} duplicates skipped</Badge>
              )}
            </div>

            {scanResult.errors.length > 0 && (
              <ul className="mb-4 list-inside list-disc space-y-1 rounded-md border border-border bg-surface/50 p-3 text-sm text-danger">
                {scanResult.errors.map((e, i) => (
                  <li key={`${e.company}-${i}`}>
                    <span className="font-medium text-ink">{e.company}:</span> {e.error}
                  </li>
                ))}
              </ul>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {scanResult.jobs.length === 0 ? (
                <p className="text-sm text-muted">No new listings were added. Existing jobs and filtered titles are unchanged.</p>
              ) : (
                <ul className="space-y-2 pr-1">
                  {scanResult.jobs.map((job) => (
                    <li className="text-sm" key={job.url}>
                      <a
                        className="font-medium text-accent hover:underline"
                        href={job.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {job.title}
                      </a>
                      {job.company !== scanResult.companyName && (
                        <span className="text-muted"> — {job.company}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Button onClick={() => setScanResult(null)} type="button" variant="secondary">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {scanError && (
        <div
          aria-live="assertive"
          className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border border-danger/30 bg-panel px-4 py-3 text-sm text-danger shadow-lg"
          role="alert"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{scanError}</span>
            <button
              className="shrink-0 text-muted hover:text-ink"
              onClick={() => setScanError(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {openFilterCol && (
        <DataTableSortFilterDropdown
          filterByLabel={COL_DEFS.find((c) => c.col === openFilterCol)?.label.toLowerCase() ?? openFilterCol}
          options={colOptions[openFilterCol]}
          filter={filters[openFilterCol]}
          isSortedAsc={sort.col === openFilterCol && sort.dir === "asc"}
          isSortedDesc={sort.col === openFilterCol && sort.dir === "desc"}
          pos={filterPos}
          onSortAsc={() => handleSort(openFilterCol, "asc")}
          onSortDesc={() => handleSort(openFilterCol, "desc")}
          onFilter={(vals) => handleFilter(openFilterCol, vals)}
          onClose={() => setOpenFilterCol(null)}
        />
      )}
    </div>
  );
}
