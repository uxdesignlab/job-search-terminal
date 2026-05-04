"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { TABLE_SAVED_FILTER_STORAGE_KEYS } from "@/lib/table-saved-filter-storage-keys";
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
    applySortAndFilters,
    resetToDefault,
    setOpenFilterCol,
    activeFilterCount,
  } = useDataTableSortFilterState<SortCol>({ col: "company", dir: "asc" });
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

            <ScanRunSummaryBody
              summary={scanResult}
              onClose={() => setScanResult(null)}
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
