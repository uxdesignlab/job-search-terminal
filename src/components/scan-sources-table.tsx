"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disableScanSources } from "@/app/actions/scan-source-actions";
import { IndustryEditor } from "@/components/industry-editor";
import { ScanRunSummaryBody } from "@/components/scan-run-summary-body";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTableActiveFiltersSummary,
  DataTableColHeader,
  DataTableSavedFiltersBar,
  DataTableSortFilterDropdown,
  useDataTableSavedFilters,
  useDataTableSortFilterState,
} from "@/components/ui/data-table-sort-filter";
import { dataTableClass, dataTableStickyHeadClass } from "@/components/ui/table";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";
import type { SourceValidationResult } from "@/lib/scanner/source-validator";
import {
  TABLE_SAVED_FILTER_STORAGE_KEYS,
  TABLE_SORT_FILTER_STATE_STORAGE_KEYS,
} from "@/lib/table-saved-filter-storage-keys";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScanSource = {
  name: string;
  careersUrl: string;
  apiType: "greenhouse" | "ashby" | "lever" | null;
  enabled: boolean;
  removable: boolean;
  industry: string;
};

export type CompanyScanResultSummary = ScanJobResultSummary;

type Props = {
  sources: ScanSource[];
  onToggle: (name: string, enabled: boolean) => Promise<void>;
  onToggleAll?: (changes: Array<{ name: string; enabled: boolean }>) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onSaveIndustry: (name: string, industry: string) => Promise<void>;
  onScanCompany: (companyName: string) => Promise<CompanyScanResultSummary>;
  /** Full CareerOps pass for every enabled source (same engine as Dashboard ATS scan). */
  onScanAllEnabled?: () => Promise<CompanyScanResultSummary>;
  onValidateAll?: () => Promise<SourceValidationResult[]>;
};

type SortCol = "company" | "industry" | "ats" | "status" | "live";

type ValidationRow = { status: string; jobCount: number | null; error?: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function atsLabel(t: ScanSource["apiType"]) {
  if (!t) return "Unknown";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Display string for Live column (must match filter option values). */
function getLiveDisplayValue(source: ScanSource, validationMap: Map<string, ValidationRow>): string {
  const v = validationMap.get(source.name);
  if (!v) return "Not validated";
  if (v.status === "valid") return v.jobCount !== null ? `${v.jobCount} jobs` : "Live";
  if (v.status === "dead") return "Dead";
  return "Unknown";
}

/**
 * Sort key for Live: not validated & unknown first, then dead, then valid by job count (numeric).
 */
function getLiveSortKey(source: ScanSource, validationMap: Map<string, ValidationRow>): string {
  const v = validationMap.get(source.name);
  if (!v) return "0-not-validated";
  if (v.status === "unknown") return "1-unknown";
  if (v.status === "dead") return "2-dead";
  if (v.status === "valid") {
    const n = v.jobCount ?? 0;
    return `3-valid-${String(n).padStart(8, "0")}`;
  }
  return "1-unknown";
}

function getColValue(s: ScanSource, col: SortCol, validationMap: Map<string, ValidationRow>): string {
  switch (col) {
    case "company": return s.name;
    case "industry": return s.industry || "(none)";
    case "ats": return atsLabel(s.apiType);
    case "status": return s.enabled ? "Enabled" : "Disabled";
    case "live": return getLiveDisplayValue(s, validationMap);
  }
}

function getColOptions(sources: ScanSource[], col: SortCol, validationMap: Map<string, ValidationRow>): string[] {
  if (col === "status") return ["Enabled", "Disabled"];
  if (col === "live") {
    return [...new Set(sources.map((s) => getLiveDisplayValue(s, validationMap)))].sort();
  }
  return [...new Set(sources.map((s) => getColValue(s, col, validationMap)))].sort();
}

// ─── Main Component ───────────────────────────────────────────────────────────

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "company", label: "Company" },
  { col: "industry", label: "Industry" },
  { col: "ats", label: "ATS" },
  { col: "status", label: "Status" },
  { col: "live", label: "Live" },
];

/** Sentinel for `scanningName` while a full enabled-sources scan runs. */
const SCAN_ALL_ENABLED_SENTINEL = "__SCAN_ALL_ENABLED__";

export function ScanSourcesTable({
  sources,
  onToggle,
  onToggleAll,
  onRemove,
  onSaveIndustry,
  onScanCompany,
  onScanAllEnabled,
  onValidateAll,
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
    applySortAndFilters,
    resetToDefault,
    setOpenFilterCol,
    activeFilterCount,
  } = useDataTableSortFilterState<SortCol>(
    { col: "company", dir: "asc" },
    undefined,
    TABLE_SORT_FILTER_STATE_STORAGE_KEYS.scanSources,
  );
  const savedFiltersState = useDataTableSavedFilters<SortCol>(TABLE_SAVED_FILTER_STORAGE_KEYS.scanSources);
  const columnLabels = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col, label }) => [col, label])) as Record<SortCol, string>,
    [],
  );
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [pendingRemoves, setPendingRemoves] = useState<Set<string>>(new Set());
  const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [scanResult, setScanResult] = useState<ScanJobResultSummary | null>(null);
  const [scanningName, setScanningName] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [validationMap, setValidationMap] = useState<
    Map<string, { status: string; jobCount: number | null; error?: string }>
  >(new Map());
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [validatePhase, setValidatePhase] = useState<"running" | "done">("running");
  const [validateResults, setValidateResults] = useState<SourceValidationResult[] | null>(null);
  const [validateDialogError, setValidateDialogError] = useState<string | null>(null);

  const validateModalBusy = validateDialogOpen && validatePhase === "running";

  const closeValidateDialog = useCallback(() => {
    setValidateDialogOpen(false);
    setValidatePhase("running");
    setValidateResults(null);
    setValidateDialogError(null);
  }, []);

  const validationResultSummary = useMemo(() => {
    if (!validateResults) return null;
    let valid = 0;
    let dead = 0;
    let unknown = 0;
    for (const r of validateResults) {
      if (r.status === "valid") valid++;
      else if (r.status === "dead") dead++;
      else unknown++;
    }
    const issues = validateResults
      .filter((r) => r.status !== "valid")
      .sort((a, b) => a.name.localeCompare(b.name));
    return { valid, dead, unknown, issues, total: validateResults.length };
  }, [validateResults]);

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
    () =>
      Object.fromEntries(COL_DEFS.map(({ col }) => [col, getColOptions(sources, col, validationMap)])) as Record<
        SortCol,
        string[]
      >,
    [sources, validationMap],
  );

  const displaySources = useMemo(() => {
    const withOverrides = sources.map((s) => ({
      ...s,
      enabled: enabledOverrides.has(s.name) ? enabledOverrides.get(s.name)! : s.enabled,
    }));

    let result = withOverrides.filter((s) => !pendingRemoves.has(s.name));

    for (const [col, allowed] of Object.entries(filters) as [SortCol, Set<string>][]) {
      if (!allowed) continue;
      result = result.filter((s) => allowed.has(getColValue(s, col, validationMap)));
    }

    return [...result].sort((a, b) => {
      const cmp =
        sort.col === "live"
          ? getLiveSortKey(a, validationMap).localeCompare(getLiveSortKey(b, validationMap))
          : getColValue(a, sort.col, validationMap).localeCompare(getColValue(b, sort.col, validationMap));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [sources, sort, filters, enabledOverrides, pendingRemoves, validationMap]);

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

  async function handleValidateAll() {
    if (!onValidateAll) return;
    setValidateDialogOpen(true);
    setValidatePhase("running");
    setValidateResults(null);
    setValidateDialogError(null);
    try {
      const results = await onValidateAll();
      setValidationMap(new Map(results.map((r) => [r.name, { status: r.status, jobCount: r.jobCount, error: r.error }])));
      setValidateResults(results);
      setValidatePhase("done");
      router.refresh();
    } catch (err) {
      setValidateDialogError(err instanceof Error ? err.message : "Validation failed");
      setValidatePhase("done");
    }
  }

  const sourceListStats = useMemo(() => {
    const enabled = sources.filter((s) =>
      enabledOverrides.has(s.name) ? enabledOverrides.get(s.name)! : s.enabled,
    ).length;
    return { total: sources.length, enabled };
  }, [sources, enabledOverrides]);

  async function handleScanAllEnabled() {
    if (!onScanAllEnabled) return;
    setScanningName(SCAN_ALL_ENABLED_SENTINEL);
    setScanError(null);
    try {
      const summary = await onScanAllEnabled();
      setScanResult(summary);
      router.refresh();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanningName(null);
    }
  }

  return (
    <div className="relative">
      {(activeFilterCount > 0 ||
        (savedFiltersState.ready && savedFiltersState.items.length > 0)) && (
        <DataTableActiveFiltersSummary
          entityLabel="sources"
          hasActiveFilters={activeFilterCount > 0}
          onClearAll={clearAllFilters}
          shown={displaySources.length}
          total={sources.length}
          trailing={
            <DataTableSavedFiltersBar
              activeFilterCount={activeFilterCount}
              columnLabels={columnLabels}
              deleteById={savedFiltersState.deleteById}
              filters={filters}
              items={savedFiltersState.items}
              onApply={applySortAndFilters}
              onResetToDefault={resetToDefault}
              ready={savedFiltersState.ready}
              saveSnapshot={savedFiltersState.saveSnapshot}
              sort={sort}
            />
          }
        />
      )}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{sourceListStats.total}</span> sources total{" "}
          <span className="text-border" aria-hidden>
            |
          </span>{" "}
          <span className="font-medium text-ink">{sourceListStats.enabled}</span> enabled
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onScanAllEnabled ? (
            <Button
              className="min-h-8 text-xs"
              disabled={sourceListStats.enabled === 0 || scanningName !== null || validateModalBusy}
              onClick={() => void handleScanAllEnabled()}
              type="button"
              variant="secondary"
            >
              {scanningName === SCAN_ALL_ENABLED_SENTINEL ? "Scanning…" : "Scan all enabled"}
            </Button>
          ) : null}
          {onValidateAll ? (
            <button
              className="text-xs text-muted hover:text-ink disabled:opacity-50"
              disabled={scanningName !== null || validateModalBusy}
              onClick={() => void handleValidateAll()}
              type="button"
            >
              {validationMap.size > 0 ? "Re-validate sources" : "Validate sources"}
            </button>
          ) : null}
        </div>
      </div>

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
                    <span className="font-medium text-ink">{source.name}</span>
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
                    {(() => {
                      const v = validationMap.get(source.name);
                      if (!v) {
                        return <span className="text-xs text-muted">Not validated</span>;
                      }
                      if (v.status === "valid") {
                        return (
                          <Badge tone="success">{v.jobCount !== null ? `${v.jobCount} jobs` : "Live"}</Badge>
                        );
                      }
                      if (v.status === "dead") return <Badge tone="danger">Dead</Badge>;
                      return (
                        <Badge tone="neutral" title={v.error ? v.error : undefined}>
                          Unknown
                        </Badge>
                      );
                    })()}
                  </td>
                  <td className="py-3 pr-4">
                    <Button
                      aria-label={`Scan for new jobs at ${source.name}`}
                      className="min-h-8 px-2.5 py-1 text-xs"
                      disabled={scanningName !== null || validateModalBusy}
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
                    {source.removable ? (
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

      {validateDialogOpen && (
        <div
          aria-busy={validatePhase === "running"}
          aria-labelledby="validate-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-2xl bg-panel p-6 shadow-2xl">
            <div className="mb-4 shrink-0 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink" id="validate-dialog-title">
                {validatePhase === "running"
                  ? "Validation in progress"
                  : validateDialogError
                    ? "Validation failed"
                    : "Validation results"}
              </h2>
              <button
                aria-label={validatePhase === "running" ? "Dismiss (validation continues in background)" : "Close"}
                className="shrink-0 rounded-control p-1 text-muted hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={closeValidateDialog}
                type="button"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                </svg>
              </button>
            </div>

            {validatePhase === "running" && (
              <div className="flex shrink-0 flex-col items-center gap-4 py-10">
                <div
                  aria-hidden
                  className="h-11 w-11 animate-spin rounded-full border-2 border-accent border-t-transparent"
                />
                <div className="text-center">
                  <p className="text-sm font-medium text-ink">{"Checking each board's public ATS JSON endpoint…"}</p>
                  <p className="mt-2 max-w-md text-xs leading-relaxed text-muted">
                    This can take several minutes when you track hundreds of companies. When validation completes,
                    the Live column in the table updates automatically.
                  </p>
                </div>
              </div>
            )}

            {validatePhase === "done" && validateDialogError && (
              <div className="grid min-h-0 flex-1 gap-4">
                <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
                  {validateDialogError}
                </p>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button onClick={closeValidateDialog} type="button" variant="secondary">
                    Close
                  </Button>
                </div>
              </div>
            )}

            {validatePhase === "done" && !validateDialogError && validationResultSummary && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="mb-4 shrink-0 flex flex-wrap gap-2">
                  <Badge tone="success">
                    {validationResultSummary.valid} live
                  </Badge>
                  {validationResultSummary.dead > 0 ? (
                    <Badge tone="danger">{validationResultSummary.dead} dead</Badge>
                  ) : null}
                  {validationResultSummary.unknown > 0 ? (
                    <Badge tone="warning">{validationResultSummary.unknown} unknown</Badge>
                  ) : null}
                  <Badge tone="neutral">{validationResultSummary.total} checked</Badge>
                </div>

                {validationResultSummary.issues.length > 0 ? (
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-surface/50 p-3">
                    <p className="mb-2 text-xs font-medium text-muted">
                      Dead or unknown (hover Unknown in the table for the same detail)
                    </p>
                    <ul className="space-y-2 text-sm">
                      {validationResultSummary.issues.map((r) => (
                        <li className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0 last:pb-0" key={r.name}>
                          <span className="font-medium text-ink">{r.name}</span>
                          <span className={r.status === "dead" ? "text-danger" : "text-warning"}>
                            {r.status === "dead" ? "Dead" : "Unknown"}
                            {r.error ? ` — ${r.error}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Every tracked board responded with a live job list.</p>
                )}

                <div className="mt-6 flex shrink-0 justify-end border-t border-border pt-4">
                  <Button onClick={closeValidateDialog} type="button" variant="secondary">
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {scanResult && (
        <div
          aria-labelledby="scan-result-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-2xl bg-panel p-6 shadow-2xl">
            <div className="mb-4 shrink-0 flex items-start justify-between gap-3">
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

            <ScanRunSummaryBody
              className="min-h-0 flex-1"
              summary={scanResult}
              onClose={() => setScanResult(null)}
              onDisableSources={async (names) => {
                await disableScanSources(names);
                router.refresh();
              }}
            />
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
