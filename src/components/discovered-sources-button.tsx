"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DataTableActiveFiltersSummary,
  DataTableColHeader,
  DataTableSavedFiltersBar,
  DataTableSortFilterDropdown,
  useDataTableSavedFilters,
  useDataTableSortFilterState,
} from "@/components/ui/data-table-sort-filter";
import { cn } from "@/lib/utils";
import {
  dataTableClass,
  dataTableStickyHeadClass,
  dataTableStickyModalClass,
} from "@/components/ui/table";
import { TABLE_SAVED_FILTER_STORAGE_KEYS } from "@/lib/table-saved-filter-storage-keys";

type DiscoveredEntry = {
  slug: string;
  provider: string;
  careersUrl: string;
  /** Pre-filled from discovery when AI classification ran */
  industry?: string | null;
};

type Props = {
  entries: DiscoveredEntry[];
  onImport: (formData: FormData) => Promise<void>;
};

type SortCol = "slug" | "ats";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function atsLabel(provider: string) {
  if (!provider) return "Unknown";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function entryKey(e: DiscoveredEntry) {
  return `${e.provider}::${e.slug}`;
}

function getColValue(entry: DiscoveredEntry, col: SortCol): string {
  return col === "slug" ? entry.slug : atsLabel(entry.provider);
}

function getColOptions(entries: DiscoveredEntry[], col: SortCol): string[] {
  return [...new Set(entries.map((e) => getColValue(e, col)))].sort();
}

// ─── COL_DEFS ─────────────────────────────────────────────────────────────────

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "slug", label: "Slug" },
  { col: "ats", label: "ATS" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function DiscoveredSourcesButton({ entries, onImport }: Props) {
  const [open, setOpen] = useState(false);
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
  } = useDataTableSortFilterState<SortCol>({ col: "slug", dir: "asc" });
  const savedFiltersState = useDataTableSavedFilters<SortCol>(
    TABLE_SAVED_FILTER_STORAGE_KEYS.discoveredSources,
  );
  const columnLabels = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col, label }) => [col, label])) as Record<SortCol, string>,
    [],
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(entries.map(entryKey))
  );
  const [industryMap, setIndustryMap] = useState<Map<string, string>>(() => new Map());
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const wasModalOpen = useRef(false);

  useEffect(() => {
    if (open && !wasModalOpen.current) {
      setIndustryMap(new Map(entries.map((e) => [entryKey(e), e.industry?.trim() ?? ""])));
    }
    wasModalOpen.current = open;
  }, [open, entries]);

  const count = entries.length;

  const colOptions = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col }) => [col, getColOptions(entries, col)])) as Record<SortCol, string[]>,
    [entries]
  );

  const displayEntries = useMemo(() => {
    let result = [...entries];
    for (const [col, allowed] of Object.entries(filters) as [SortCol, Set<string>][]) {
      if (!allowed) continue;
      result = result.filter((e) => allowed.has(getColValue(e, col)));
    }
    return result.sort((a, b) => {
      const cmp = getColValue(a, sort.col).localeCompare(getColValue(b, sort.col));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [entries, sort, filters]);

  const allDisplaySelected =
    displayEntries.length > 0 && displayEntries.every((e) => selectedKeys.has(entryKey(e)));
  const noneDisplaySelected =
    displayEntries.length === 0 || displayEntries.every((e) => !selectedKeys.has(entryKey(e)));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allDisplaySelected && !noneDisplaySelected;
    }
  }, [allDisplaySelected, noneDisplaySelected]);

  if (count === 0) return null;

  function handleToggleAll() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allDisplaySelected) {
        for (const e of displayEntries) next.delete(entryKey(e));
      } else {
        for (const e of displayEntries) next.add(entryKey(e));
      }
      return next;
    });
  }

  function handleToggleEntry(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const entry of entries) {
      if (selectedKeys.has(entryKey(entry))) {
        fd.set(`import_${entry.slug}`, "1");
        const industry = industryMap.get(entryKey(entry))?.trim();
        if (industry) fd.set(`industry_${entry.slug}`, industry);
      }
    }
    startTransition(async () => {
      await onImport(fd);
      setOpen(false);
    });
  }

  const selectedCount = entries.filter((e) => selectedKeys.has(entryKey(e))).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-control border border-border bg-panel px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent"
      >
        Discovered sources
        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-accent/15 px-1.5 py-px text-xs font-semibold text-accent">
          {count}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-panel border border-border bg-panel shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-ink">Discovered sources</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Found via Common Crawl and validated. Select which to add to your scan list.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-4 text-muted hover:text-ink"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Table */}
            <form onSubmit={handleImport} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 pt-4">
                {(activeFilterCount > 0 ||
                  (savedFiltersState.ready && savedFiltersState.items.length > 0)) && (
                  <DataTableActiveFiltersSummary
                    entityLabel="sources"
                    hasActiveFilters={activeFilterCount > 0}
                    onClearAll={clearAllFilters}
                    shown={displayEntries.length}
                    total={count}
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
                <table
                  className={cn(
                    dataTableClass,
                    dataTableStickyHeadClass,
                    dataTableStickyModalClass,
                    "min-w-max",
                  )}
                >
                  <thead>
                    <tr>
                      <th className="pb-3 pr-3 w-10">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          aria-label="Select all visible"
                          checked={allDisplaySelected}
                          onChange={handleToggleAll}
                          disabled={displayEntries.length === 0}
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
                      <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                        Industry
                      </th>
                      <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted w-12">
                        Link
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayEntries.map((entry) => {
                      const key = entryKey(entry);
                      return (
                        <tr key={key}>
                          <td className="py-3 pr-3">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(key)}
                              onChange={() => handleToggleEntry(key)}
                              className="h-4 w-4 rounded border-border"
                            />
                          </td>
                          <td className="py-3 pr-4 font-medium text-ink">{entry.slug}</td>
                          <td className="py-3 pr-4">
                            <Badge>{atsLabel(entry.provider)}</Badge>
                          </td>
                          <td className="py-3 pr-4">
                            <input
                              className="w-32 rounded border border-border bg-surface px-2 py-0.5 text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                              placeholder="—"
                              value={industryMap.get(key) ?? ""}
                              onChange={(e) =>
                                setIndustryMap((prev) => new Map(prev).set(key, e.target.value))
                              }
                            />
                          </td>
                          <td className="py-3">
                            <a
                              href={entry.careersUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-accent hover:underline"
                            >
                              ↗
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <span className="text-xs text-muted">
                  {selectedCount} of {count} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-control border border-border bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending || selectedCount === 0}
                    className="inline-flex items-center rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {pending ? "Importing…" : `Import ${selectedCount}`}
                  </button>
                </div>
              </div>
            </form>
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
          zIndex={1100}
          onSortAsc={() => handleSort(openFilterCol, "asc")}
          onSortDesc={() => handleSort(openFilterCol, "desc")}
          onFilter={(vals) => handleFilter(openFilterCol, vals)}
          onClose={() => setOpenFilterCol(null)}
        />
      )}
    </>
  );
}
