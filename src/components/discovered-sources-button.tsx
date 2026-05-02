"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";

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
type SortDir = "asc" | "desc";
type FiltersState = Partial<Record<SortCol, Set<string>>>;

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

// ─── Filter Dropdown ──────────────────────────────────────────────────────────

type FilterDropdownProps = {
  col: SortCol;
  label: string;
  options: string[];
  filter: Set<string> | undefined;
  isSortedAsc: boolean;
  isSortedDesc: boolean;
  pos: { top: number; left: number };
  onSortAsc: () => void;
  onSortDesc: () => void;
  onFilter: (values: Set<string> | undefined) => void;
  onClose: () => void;
};

function FilterDropdown({
  label, options, filter, isSortedAsc, isSortedDesc, pos,
  onSortAsc, onSortDesc, onFilter, onClose,
}: FilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  const activeValues: Set<string> = filter ?? new Set(options);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const visible = options.filter((o) => !search || o.toLowerCase().includes(search.toLowerCase()));
  const allChecked = visible.every((o) => activeValues.has(o));
  const isFiltered = filter !== undefined;

  function toggleAll() {
    const next = new Set(activeValues);
    if (allChecked) visible.forEach((o) => next.delete(o));
    else visible.forEach((o) => next.add(o));
    onFilter(options.every((o) => next.has(o)) ? undefined : next);
  }

  function toggleValue(val: string) {
    const next = new Set(activeValues);
    if (next.has(val)) next.delete(val); else next.add(val);
    onFilter(options.every((o) => next.has(o)) ? undefined : next);
  }

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1100 }}
      className="w-52 rounded-lg border border-border bg-panel shadow-xl"
    >
      <div className="border-b border-border p-1">
        <button
          className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-surface ${isSortedAsc ? "font-semibold text-accent" : "text-ink"}`}
          onClick={() => { onSortAsc(); onClose(); }}
          type="button"
        >
          <span className="w-3">↑</span> Sort A → Z
        </button>
        <button
          className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-surface ${isSortedDesc ? "font-semibold text-accent" : "text-ink"}`}
          onClick={() => { onSortDesc(); onClose(); }}
          type="button"
        >
          <span className="w-3">↓</span> Sort Z → A
        </button>
      </div>
      <div className="p-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Filter by {label}
        </p>
        {options.length > 7 && (
          <input
            autoFocus
            className="mb-2 w-full rounded border border-border bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            type="text"
            value={search}
          />
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-surface">
          <input
            checked={allChecked}
            className="h-3.5 w-3.5 accent-accent"
            onChange={toggleAll}
            type="checkbox"
          />
          <span className="font-medium text-ink">Select all</span>
        </label>
        <div className="mt-0.5 max-h-44 overflow-y-auto">
          {visible.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-surface">
              <input
                checked={activeValues.has(opt)}
                className="h-3.5 w-3.5 accent-accent"
                onChange={() => toggleValue(opt)}
                type="checkbox"
              />
              <span className="truncate text-ink">{opt}</span>
            </label>
          ))}
        </div>
        {isFiltered && (
          <button
            className="mt-1.5 w-full text-left text-xs text-muted underline underline-offset-2 hover:text-ink"
            onClick={() => { onFilter(undefined); onClose(); }}
            type="button"
          >
            Clear filter
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Column Header ────────────────────────────────────────────────────────────

function ColHeader({
  col, label, sort, filter, isOpen, onOpen, className,
}: {
  col: SortCol;
  label: string;
  sort: { col: SortCol; dir: SortDir };
  filter: Set<string> | undefined;
  isOpen: boolean;
  onOpen: (col: SortCol, btn: HTMLButtonElement) => void;
  className?: string;
}) {
  const isFiltered = filter !== undefined;
  const isSorted = sort.col === col;
  const active = isFiltered || isSorted;

  return (
    <th className={`pb-3 pr-4 text-left ${className ?? ""}`}>
      <button
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-ink ${active ? "text-accent" : "text-muted"}`}
        onClick={(e) => onOpen(col, e.currentTarget)}
        type="button"
      >
        {label}
        {isFiltered && <span className="text-[9px] leading-none text-accent">●</span>}
        {isSorted && <span className="text-[10px]">{sort.dir === "asc" ? "↑" : "↓"}</span>}
        <span className={`text-[10px] transition-transform duration-150 ${isOpen ? "rotate-180" : ""} ${active ? "opacity-70" : "opacity-40"}`}>▾</span>
      </button>
    </th>
  );
}

// ─── COL_DEFS ─────────────────────────────────────────────────────────────────

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "slug", label: "Slug" },
  { col: "ats", label: "ATS" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function DiscoveredSourcesButton({ entries, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "slug", dir: "asc" });
  const [filters, setFilters] = useState<FiltersState>({});
  const [openFilterCol, setOpenFilterCol] = useState<SortCol | null>(null);
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 });
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

  function openFilter(col: SortCol, btn: HTMLButtonElement) {
    if (openFilterCol === col) { setOpenFilterCol(null); return; }
    const rect = btn.getBoundingClientRect();
    setFilterPos({ top: rect.bottom + 4, left: rect.left });
    setOpenFilterCol(col);
  }

  function handleSort(col: SortCol, dir: SortDir) { setSort({ col, dir }); }

  function handleFilter(col: SortCol, values: Set<string> | undefined) {
    setFilters((prev) => {
      const next = { ...prev };
      if (values === undefined) delete next[col];
      else next[col] = values;
      return next;
    });
  }

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
  const activeFilterCount = Object.keys(filters).length;

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
                {activeFilterCount > 0 && (
                  <div className="mb-3 flex items-center gap-3 text-xs">
                    <span className="text-muted">
                      {displayEntries.length} of {count} sources
                    </span>
                    <button
                      className="text-accent underline underline-offset-2 hover:text-ink"
                      onClick={() => setFilters({})}
                      type="button"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 pr-3 w-10">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          aria-label="Select all visible"
                          checked={allDisplaySelected}
                          onChange={handleToggleAll}
                          disabled={displayEntries.length === 0}
                          className="h-4 w-4 rounded border-border accent-accent"
                        />
                      </th>
                      {COL_DEFS.map(({ col, label }) => (
                        <ColHeader
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
                              className="h-4 w-4 rounded border-border accent-accent"
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
        <FilterDropdown
          col={openFilterCol}
          label={COL_DEFS.find((c) => c.col === openFilterCol)?.label ?? ""}
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
    </>
  );
}
