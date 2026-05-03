"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { TABLE_SAVED_FILTER_STORAGE_KEY_SET } from "@/lib/table-saved-filter-storage-keys";
import {
  loadTableSavedFiltersAction,
  persistTableSavedFiltersAction,
} from "@/lib/table-saved-filters-actions";
import { cn } from "@/lib/utils";

const MAX_SAVED_TABLE_FILTERS = 5;
const SAVED_FILTERS_STORAGE_VERSION = 1;
const MAX_SAVED_FILTER_NAME_LENGTH = 60;

export type DataTableSortDir = "asc" | "desc";

export type DataTableSortFilterSnapshot<T extends string> = {
  sort: { col: T; dir: DataTableSortDir };
  filters: Partial<Record<T, string[]>>;
};

export type DataTableSavedFilterEntry<T extends string> = {
  id: string;
  label: string;
  snapshot: DataTableSortFilterSnapshot<T>;
};

const checkboxClass = "h-3.5 w-3.5 accent-[rgb(var(--color-accent))]";

export function toSortFilterSnapshot<T extends string>(
  sort: { col: T; dir: DataTableSortDir },
  filters: Partial<Record<T, Set<string>>>,
): DataTableSortFilterSnapshot<T> {
  const filtersOut: Partial<Record<T, string[]>> = {};
  for (const [k, set] of Object.entries(filters) as [T, Set<string> | undefined][]) {
    if (set && set.size > 0) filtersOut[k] = [...set];
  }
  return { sort: { col: sort.col, dir: sort.dir }, filters: filtersOut };
}

export function snapshotToFilterSets<T extends string>(
  snapshot: DataTableSortFilterSnapshot<T>,
): Partial<Record<T, Set<string>>> {
  const next: Partial<Record<T, Set<string>>> = {};
  for (const [k, arr] of Object.entries(snapshot.filters) as [T, string[] | undefined][]) {
    if (arr?.length) next[k] = new Set(arr);
  }
  return next;
}

function buildSavedFilterLabel<T extends string>(
  snapshot: DataTableSortFilterSnapshot<T>,
  columnLabels: Partial<Record<T, string>>,
): string {
  const cols = Object.keys(snapshot.filters).sort() as T[];
  if (cols.length === 0) return "Saved view";
  const names = cols.map((c) => columnLabels[c] ?? c);
  const first = names[0] ?? "Saved view";
  if (names.length === 1) return first;
  if (names.length === 2) return `${first} · ${names[1] ?? ""}`;
  return `${first} · +${names.length - 1}`;
}

function snapshotsEqual<T extends string>(a: DataTableSortFilterSnapshot<T>, b: DataTableSortFilterSnapshot<T>): boolean {
  if (a.sort.col !== b.sort.col || a.sort.dir !== b.sort.dir) return false;
  const keysA = Object.keys(a.filters).sort();
  const keysB = Object.keys(b.filters).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
  }
  for (const k of keysA) {
    const key = k as T;
    const va = [...(a.filters[key] ?? [])].sort();
    const vb = [...(b.filters[key] ?? [])].sort();
    if (va.length !== vb.length) return false;
    for (let j = 0; j < va.length; j++) if (va[j] !== vb[j]) return false;
  }
  return true;
}

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

export function useDataTableSortFilterState<T extends string>(
  initialSort: { col: T; dir: DataTableSortDir },
  initialFilters?: Partial<Record<T, Set<string>>>,
) {
  const [sort, setSort] = useState(initialSort);
  const [filters, setFilters] = useState<Partial<Record<T, Set<string>>>>(initialFilters ?? {});
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

  const applySortAndFilters = useCallback((snapshot: DataTableSortFilterSnapshot<T>) => {
    setSort(snapshot.sort);
    setFilters(snapshotToFilterSets(snapshot));
  }, []);

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
    applySortAndFilters,
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
  /** When false, hides "Clear all filters" (e.g. toolbar visible for saved presets only). Defaults to true. */
  hasActiveFilters?: boolean;
  /** Renders on the right (saved filter chips, save action). */
  trailing?: ReactNode;
};

/** Toolbar above filtered tables: counts, clear, optional saved filters on the right. */
export function DataTableActiveFiltersSummary({
  shown,
  total,
  entityLabel,
  onClearAll,
  className,
  hasActiveFilters = true,
  trailing,
}: DataTableActiveFiltersSummaryProps) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="text-muted">
          {shown} of {total} {entityLabel}
        </span>
        {hasActiveFilters && (
          <button
            className="shrink-0 text-accent underline underline-offset-2 hover:text-ink"
            onClick={onClearAll}
            type="button"
          >
            Clear all filters
          </button>
        )}
      </div>
      {trailing ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{trailing}</div> : null}
    </div>
  );
}

type PersistedSavedFiltersPayload<T extends string> = {
  v: number;
  items: DataTableSavedFilterEntry<T>[];
};

function parseSavedFiltersPayload<T extends string>(
  raw: string,
): DataTableSavedFilterEntry<T>[] {
  const parsed = JSON.parse(raw) as PersistedSavedFiltersPayload<T>;
  if (parsed?.v !== SAVED_FILTERS_STORAGE_VERSION || !Array.isArray(parsed.items)) {
    return [];
  }
  return parsed.items
    .slice(0, MAX_SAVED_TABLE_FILTERS)
    .filter(
      (row) =>
        row &&
        typeof row.id === "string" &&
        typeof row.label === "string" &&
        row.snapshot?.sort?.col &&
        (row.snapshot.sort.dir === "asc" || row.snapshot.sort.dir === "desc") &&
        row.snapshot.filters &&
        typeof row.snapshot.filters === "object",
    ) as DataTableSavedFilterEntry<T>[];
}

/** Persisted column-filter presets in app SQLite (max five per table). Falls back to localStorage if persist fails. */
export function useDataTableSavedFilters<T extends string>(storageKey: string) {
  const [items, setItems] = useState<DataTableSavedFilterEntry<T>[]>([]);
  const [ready, setReady] = useState(false);

  const persistItems = useCallback(
    async (next: DataTableSavedFilterEntry<T>[]) => {
      if (!TABLE_SAVED_FILTER_STORAGE_KEY_SET.has(storageKey)) return;
      const payload: PersistedSavedFiltersPayload<T> = {
        v: SAVED_FILTERS_STORAGE_VERSION,
        items: next.slice(0, MAX_SAVED_TABLE_FILTERS),
      };
      const json = JSON.stringify(payload);
      try {
        await persistTableSavedFiltersAction(storageKey, json);
      } catch {
        try {
          localStorage.setItem(storageKey, json);
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey],
  );

  useEffect(() => {
    if (!TABLE_SAVED_FILTER_STORAGE_KEY_SET.has(storageKey)) {
      setItems([]);
      setReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        let raw = await loadTableSavedFiltersAction(storageKey);
        if (!raw && typeof window !== "undefined") {
          const fromLs = localStorage.getItem(storageKey);
          if (fromLs) {
            try {
              JSON.parse(fromLs);
              raw = fromLs;
              await persistTableSavedFiltersAction(storageKey, fromLs);
              localStorage.removeItem(storageKey);
            } catch {
              localStorage.removeItem(storageKey);
            }
          }
        }
        if (cancelled) return;
        if (!raw) {
          setItems([]);
          return;
        }
        setItems(parseSavedFiltersPayload<T>(raw));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const saveSnapshot = useCallback(
    (snapshot: DataTableSortFilterSnapshot<T>, label: string) => {
      if (Object.keys(snapshot.filters).length === 0) return;
      setItems((prev) => {
        if (prev.some((p) => snapshotsEqual(p.snapshot, snapshot))) return prev;
        if (prev.length >= MAX_SAVED_TABLE_FILTERS) return prev;
        const entry: DataTableSavedFilterEntry<T> = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label,
          snapshot,
        };
        const next = [...prev, entry];
        void persistItems(next);
        return next;
      });
    },
    [persistItems],
  );

  const deleteById = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((p) => p.id !== id);
        void persistItems(next);
        return next;
      });
    },
    [persistItems],
  );

  return { items, ready, saveSnapshot, deleteById };
}

export type DataTableSavedFiltersBarProps<T extends string> = {
  items: DataTableSavedFilterEntry<T>[];
  ready: boolean;
  saveSnapshot: (snapshot: DataTableSortFilterSnapshot<T>, label: string) => void;
  deleteById: (id: string) => void;
  sort: { col: T; dir: DataTableSortDir };
  filters: Partial<Record<T, Set<string>>>;
  activeFilterCount: number;
  onApply: (snapshot: DataTableSortFilterSnapshot<T>) => void;
  columnLabels: Partial<Record<T, string>>;
};

/** Chips + save action; use with `useDataTableSavedFilters` in the parent (single hook per table). */
export function DataTableSavedFiltersBar<T extends string>({
  items,
  ready,
  saveSnapshot,
  deleteById,
  sort,
  filters,
  activeFilterCount,
  onApply,
  columnLabels,
}: DataTableSavedFiltersBarProps<T>) {
  const nameFieldId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [saveNameDraft, setSaveNameDraft] = useState("");

  const canSaveMore = items.length < MAX_SAVED_TABLE_FILTERS;
  const snapshotNow = useMemo(() => toSortFilterSnapshot(sort, filters), [sort, filters]);
  const duplicate = useMemo(
    () => items.some((p) => snapshotsEqual(p.snapshot, snapshotNow)),
    [items, snapshotNow],
  );
  const saveDisabled =
    activeFilterCount === 0 || !canSaveMore || duplicate || Object.keys(snapshotNow.filters).length === 0;

  const suggestedLabel = useMemo(
    () => buildSavedFilterLabel(snapshotNow, columnLabels),
    [snapshotNow, columnLabels],
  );

  const openSavePanel = useCallback(() => {
    setSaveNameDraft(suggestedLabel);
    setSavePanelOpen(true);
  }, [suggestedLabel]);

  const closeSavePanel = useCallback(() => {
    setSavePanelOpen(false);
    setSaveNameDraft("");
  }, []);

  const commitSave = useCallback(() => {
    if (duplicate || Object.keys(snapshotNow.filters).length === 0) {
      closeSavePanel();
      return;
    }
    const trimmed = saveNameDraft.trim();
    const label =
      trimmed.length > 0
        ? trimmed.slice(0, MAX_SAVED_FILTER_NAME_LENGTH)
        : suggestedLabel;
    saveSnapshot(snapshotNow, label);
    closeSavePanel();
  }, [closeSavePanel, duplicate, saveNameDraft, saveSnapshot, snapshotNow, suggestedLabel]);

  useEffect(() => {
    if (savePanelOpen) nameInputRef.current?.focus();
  }, [savePanelOpen]);

  useEffect(() => {
    if (saveDisabled && savePanelOpen) closeSavePanel();
  }, [saveDisabled, savePanelOpen, closeSavePanel]);

  if (!ready) return null;

  return (
    <>
      {items.map((entry) => (
        <span
          key={entry.id}
          className="inline-flex max-w-[14rem] items-stretch overflow-hidden rounded border border-border bg-surface text-[11px] leading-tight text-ink shadow-sm"
        >
          <button
            className="min-w-0 flex-1 truncate px-2 py-1 text-left transition-colors hover:bg-panel"
            onClick={() => onApply(entry.snapshot)}
            title={`Apply “${entry.label}”`}
            type="button"
          >
            {entry.label}
          </button>
          <button
            aria-label={`Remove saved filter ${entry.label}`}
            className="shrink-0 border-l border-border px-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            onClick={(e) => {
              e.stopPropagation();
              deleteById(entry.id);
            }}
            type="button"
          >
            ×
          </button>
        </span>
      ))}
      {savePanelOpen ? (
        <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded border border-border bg-panel px-2 py-1.5 shadow-sm">
          <label className="sr-only" htmlFor={nameFieldId}>
            Name for saved filter
          </label>
          <input
            ref={nameInputRef}
            autoComplete="off"
            className="min-w-[9rem] max-w-[14rem] flex-1 rounded border border-border bg-surface px-2 py-1 text-[11px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            id={nameFieldId}
            maxLength={MAX_SAVED_FILTER_NAME_LENGTH}
            onChange={(e) => setSaveNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSave();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                closeSavePanel();
              }
            }}
            placeholder="Filter name"
            type="text"
            value={saveNameDraft}
          />
          <button
            className="shrink-0 rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:bg-panel"
            onClick={commitSave}
            type="button"
          >
            Save
          </button>
          <button
            className="shrink-0 rounded px-2 py-1 text-[11px] text-muted hover:bg-surface hover:text-ink"
            onClick={closeSavePanel}
            type="button"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          className="shrink-0 text-accent underline underline-offset-2 hover:text-ink disabled:cursor-not-allowed disabled:no-underline disabled:opacity-45"
          disabled={saveDisabled}
          onClick={openSavePanel}
          title={
            duplicate
              ? "This filter is already saved"
              : !canSaveMore
                ? `You can save up to ${MAX_SAVED_TABLE_FILTERS} filters`
                : activeFilterCount === 0
                  ? "Adjust column filters first"
                  : "Name and save current column filters and sort"
          }
          type="button"
        >
          Save filter
        </button>
      )}
    </>
  );
}
