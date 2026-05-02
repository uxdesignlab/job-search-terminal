"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { IndustryEditor } from "@/components/industry-editor";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScanSource = {
  name: string;
  careersUrl: string;
  apiType: "greenhouse" | "ashby" | "lever" | null;
  enabled: boolean;
  isCustom: boolean;
  industry: string;
};

type Props = {
  sources: ScanSource[];
  onToggle: (name: string, enabled: boolean) => Promise<void>;
  onToggleAll?: (changes: Array<{ name: string; enabled: boolean }>) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onSaveIndustry: (name: string, industry: string) => Promise<void>;
};

type SortCol = "company" | "industry" | "ats" | "status";
type SortDir = "asc" | "desc";
type FiltersState = Partial<Record<SortCol, Set<string>>>;

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
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 }}
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

// ─── Main Component ───────────────────────────────────────────────────────────

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "company", label: "Company" },
  { col: "industry", label: "Industry" },
  { col: "ats", label: "ATS" },
  { col: "status", label: "Status" },
];

export function ScanSourcesTable({ sources, onToggle, onToggleAll, onRemove, onSaveIndustry }: Props) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "company", dir: "asc" });
  const [filters, setFilters] = useState<FiltersState>({});
  const [openFilterCol, setOpenFilterCol] = useState<SortCol | null>(null);
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 });
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [pendingRemoves, setPendingRemoves] = useState<Set<string>>(new Set());
  const [enabledOverrides, setEnabledOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

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

  const activeFilterCount = Object.keys(filters).length;

  return (
    <div className="relative">
      {activeFilterCount > 0 && (
        <div className="mb-3 flex items-center gap-3 text-xs">
          <span className="text-muted">
            {displaySources.length} of {sources.length} sources
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

      <div className="overflow-x-auto" role="region" aria-label="Scan sources table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 pr-3 w-10">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Toggle all visible sources"
                  checked={allVisibleEnabled}
                  onChange={handleToggleAll}
                  disabled={displaySources.length === 0}
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
                      className="h-4 w-4 rounded border-border accent-accent"
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
    </div>
  );
}
