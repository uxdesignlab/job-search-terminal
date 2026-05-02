"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type DataTableSortDir = "asc" | "desc";

const checkboxClass = "h-3.5 w-3.5 accent-[rgb(var(--color-accent))]";

export type DataTableSortFilterDropdownProps = {
  filterByLabel: string;
  options: string[];
  filter: Set<string> | undefined;
  isSortedAsc: boolean;
  isSortedDesc: boolean;
  pos: { top: number; left: number };
  onSortAsc: () => void;
  onSortDesc: () => void;
  onFilter: (values: Set<string> | undefined) => void;
  onClose: () => void;
  /** Use higher z-index when the table sits inside a modal (e.g. 1100). */
  zIndex?: number;
};

export function DataTableSortFilterDropdown({
  filterByLabel,
  options,
  filter,
  isSortedAsc,
  isSortedDesc,
  pos,
  onSortAsc,
  onSortDesc,
  onFilter,
  onClose,
  zIndex = 1000,
}: DataTableSortFilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  const activeValues: Set<string> = filter ?? new Set(options);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
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
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onFilter(options.every((o) => next.has(o)) ? undefined : next);
  }

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex }}
      className="w-52 rounded-lg border border-border bg-panel shadow-xl"
    >
      <div className="border-b border-border p-1">
        <button
          className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-surface ${isSortedAsc ? "font-semibold text-accent" : "text-ink"}`}
          onClick={() => {
            onSortAsc();
            onClose();
          }}
          type="button"
        >
          <span className="w-3">↑</span> Sort A → Z
        </button>
        <button
          className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs transition-colors hover:bg-surface ${isSortedDesc ? "font-semibold text-accent" : "text-ink"}`}
          onClick={() => {
            onSortDesc();
            onClose();
          }}
          type="button"
        >
          <span className="w-3">↓</span> Sort Z → A
        </button>
      </div>
      <div className="p-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Filter by {filterByLabel}
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
          <input checked={allChecked} className={checkboxClass} onChange={toggleAll} type="checkbox" />
          <span className="font-medium text-ink">Select all</span>
        </label>
        <div className="mt-0.5 max-h-44 overflow-y-auto">
          {visible.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-surface"
            >
              <input
                checked={activeValues.has(opt)}
                className={checkboxClass}
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
            onClick={() => {
              onFilter(undefined);
              onClose();
            }}
            type="button"
          >
            Clear filter
          </button>
        )}
      </div>
    </div>
  );
}

export type DataTableColHeaderProps<T extends string> = {
  col: T;
  label: string;
  sort: { col: T; dir: DataTableSortDir };
  filter: Set<string> | undefined;
  isOpen: boolean;
  onOpen: (col: T, btn: HTMLButtonElement) => void;
  className?: string;
};

export function DataTableColHeader<T extends string>({
  col,
  label,
  sort,
  filter,
  isOpen,
  onOpen,
  className,
}: DataTableColHeaderProps<T>) {
  const isFiltered = filter !== undefined;
  const isSorted = sort.col === col;
  const active = isFiltered || isSorted;

  return (
    <th className={cn("pb-3 pr-4 text-left", className)}>
      <button
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-ink ${active ? "text-accent" : "text-muted"}`}
        onClick={(e) => onOpen(col, e.currentTarget)}
        type="button"
      >
        {label}
        {isFiltered && <span className="text-[9px] leading-none text-accent">●</span>}
        {isSorted && <span className="text-[10px]">{sort.dir === "asc" ? "↑" : "↓"}</span>}
        <span
          className={`text-[10px] transition-transform duration-150 ${isOpen ? "rotate-180" : ""} ${active ? "opacity-70" : "opacity-40"}`}
        >
          ▾
        </span>
      </button>
    </th>
  );
}

export function useDataTableSortFilterState<T extends string>(initialSort: {
  col: T;
  dir: DataTableSortDir;
}) {
  const [sort, setSort] = useState(initialSort);
  const [filters, setFilters] = useState<Partial<Record<T, Set<string>>>>({});
  const [openFilterCol, setOpenFilterCol] = useState<T | null>(null);
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 });

  const openFilter = useCallback(
    (col: T, btn: HTMLButtonElement) => {
      if (openFilterCol === col) {
        setOpenFilterCol(null);
        return;
      }
      const rect = btn.getBoundingClientRect();
      setFilterPos({ top: rect.bottom + 4, left: rect.left });
      setOpenFilterCol(col);
    },
    [openFilterCol],
  );

  const handleSort = useCallback((col: T, dir: DataTableSortDir) => {
    setSort({ col, dir });
  }, []);

  const handleFilter = useCallback((col: T, values: Set<string> | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (values === undefined) delete next[col];
      else next[col] = values;
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => setFilters({}), []);

  const activeFilterCount = Object.keys(filters).length;

  return {
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
  };
}

export type DataTableActiveFiltersSummaryProps = {
  shown: number;
  total: number;
  /** Lowercase noun for the sentence, e.g. "jobs", "sources". */
  entityLabel: string;
  onClearAll: () => void;
  className?: string;
};

/** Shown when at least one column filter is active (matches main jobs table spacing). */
export function DataTableActiveFiltersSummary({
  shown,
  total,
  entityLabel,
  onClearAll,
  className,
}: DataTableActiveFiltersSummaryProps) {
  return (
    <div className={cn("mb-4 flex items-center gap-3 text-xs", className)}>
      <span className="text-muted">
        {shown} of {total} {entityLabel}
      </span>
      <button
        className="text-accent underline underline-offset-2 hover:text-ink"
        onClick={onClearAll}
        type="button"
      >
        Clear all filters
      </button>
    </div>
  );
}
