"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dataTableClass, dataTableStickyHeadClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { JobRecord } from "@/lib/db/types";

type JobRowStatus = "loading" | "done" | "error";
type SortCol = "title" | "company" | "location" | "fit" | "status" | "recommendation" | "posted" | "scanned";
type SortDir = "asc" | "desc";
// undefined = no filter (show all); Set<string> = show only these values
type FiltersState = Partial<Record<SortCol, Set<string>>>;

const FIT_BUCKETS = ["80–100%", "60–79%", "40–59%", "20–39%", "0–19%"] as const;

function fitBucket(score: number): string {
  if (score >= 80) return "80–100%";
  if (score >= 60) return "60–79%";
  if (score >= 40) return "40–59%";
  if (score >= 20) return "20–39%";
  return "0–19%";
}

function getColValue(job: JobRecord, col: SortCol): string {
  switch (col) {
    case "title": return job.title;
    case "company": return job.company;
    case "location": return job.location;
    case "fit": return fitBucket(job.fitScore);
    case "status": return job.status;
    case "recommendation": return job.recommendation;
    case "posted": return job.datePosted ? "Has date" : "No date";
    case "scanned": return job.firstSeenDate ? "Has date" : "No date";
  }
}

function getColOptions(jobs: JobRecord[], col: SortCol): string[] {
  if (col === "fit") return [...FIT_BUCKETS];
  if (col === "posted" || col === "scanned") return ["Has date", "No date"];
  return [...new Set(jobs.map((j) => getColValue(j, col)))].sort();
}

function toneForRecommendation(r: string) {
  if (r === "Priority apply" || r === "Strong apply") return "success" as const;
  if (r === "Skip") return "danger" as const;
  return "warning" as const;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, day] = iso.slice(0, 10).split("-");
  return `${m}/${day}/${y?.slice(2)}`;
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
    if (allChecked) {
      visible.forEach((o) => next.delete(o));
    } else {
      visible.forEach((o) => next.add(o));
    }
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
      {/* Sort */}
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

      {/* Filter */}
      <div className="p-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Filter by {label}
        </p>
        {options.length > 7 && (
          <input
            autoFocus
            className="mb-2 w-full rounded border border-border bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search…`}
            type="text"
            value={search}
          />
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-surface">
          <input
            checked={allChecked}
            className="h-3.5 w-3.5 accent-[rgb(var(--color-accent))]"
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
                className="h-3.5 w-3.5 accent-[rgb(var(--color-accent))]"
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
    <th className={cn("pb-3 pr-4 text-left", className)}>
      <button
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-ink ${active ? "text-accent" : "text-muted"}`}
        onClick={(e) => onOpen(col, e.currentTarget)}
        type="button"
      >
        {label}
        {isFiltered && <span className="text-[9px] leading-none text-accent">●</span>}
        {isSorted && (
          <span className="text-[10px]">{sort.dir === "asc" ? "↑" : "↓"}</span>
        )}
        <span className={`text-[10px] transition-transform duration-150 ${isOpen ? "rotate-180" : ""} ${active ? "opacity-70" : "opacity-40"}`}>
          ▾
        </span>
      </button>
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export type BatchEvaluateFormProps = {
  jobs: JobRecord[];
};

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "title", label: "Role" },
  { col: "company", label: "Company" },
  { col: "location", label: "Location" },
  { col: "fit", label: "Fit" },
  { col: "status", label: "Status" },
  { col: "recommendation", label: "Action" },
  { col: "posted", label: "Posted" },
  { col: "scanned", label: "Added" },
];

export function BatchEvaluateForm({ jobs }: BatchEvaluateFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobStatus, setJobStatus] = useState<Record<string, JobRowStatus>>({});
  const [running, setRunning] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "fit", dir: "desc" });
  const [filters, setFilters] = useState<FiltersState>({});
  const [openFilterCol, setOpenFilterCol] = useState<SortCol | null>(null);
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 });

  const isRunning = running || bulkRunning;

  function openFilter(col: SortCol, btn: HTMLButtonElement) {
    if (openFilterCol === col) { setOpenFilterCol(null); return; }
    const rect = btn.getBoundingClientRect();
    setFilterPos({ top: rect.bottom + 4, left: rect.left });
    setOpenFilterCol(col);
  }

  const handleSort = (col: SortCol, dir: SortDir) => setSort({ col, dir });

  const handleFilter = (col: SortCol, values: Set<string> | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (values === undefined) delete next[col];
      else next[col] = values;
      return next;
    });
  };

  const colOptions = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col }) => [col, getColOptions(jobs, col)])) as Record<SortCol, string[]>,
    [jobs]
  );

  const displayJobs = useMemo(() => {
    let result = jobs;
    for (const [col, allowed] of Object.entries(filters) as [SortCol, Set<string>][]) {
      if (!allowed) continue;
      result = result.filter((j) => allowed.has(getColValue(j, col)));
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sort.col) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "company": cmp = a.company.localeCompare(b.company); break;
        case "location": cmp = a.location.localeCompare(b.location); break;
        case "fit": cmp = a.fitScore - b.fitScore; break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "recommendation": cmp = a.recommendation.localeCompare(b.recommendation); break;
        case "posted": cmp = (a.datePosted ?? "").localeCompare(b.datePosted ?? ""); break;
        case "scanned": cmp = (a.firstSeenDate ?? "").localeCompare(b.firstSeenDate ?? ""); break;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [jobs, sort, filters]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === displayJobs.length ? new Set() : new Set(displayJobs.map((j) => j.id))
    );

  const evaluate = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setRunning(true);
    for (const id of ids) {
      setJobStatus((s) => ({ ...s, [id]: "loading" }));
      try {
        const res = await fetch(`/api/evaluate/${id}`);
        if (!res.ok) throw new Error("Failed");
        const reader = res.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let done = false;
          while (!done) {
            const chunk = await reader.read();
            done = chunk.done;
            if (decoder.decode(chunk.value ?? new Uint8Array()).includes('"done":true')) break;
          }
        }
        setJobStatus((s) => ({ ...s, [id]: "done" }));
      } catch {
        setJobStatus((s) => ({ ...s, [id]: "error" }));
      }
    }
    setRunning(false);
    setSelected(new Set());
    router.refresh();
  }, [selected, router]);

  const bulkAction = useCallback(async (action: "skip" | "archive" | "delete") => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkRunning(true);
    try {
      if (action === "delete") {
        await fetch("/api/jobs/bulk", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      } else {
        await fetch("/api/jobs/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, status: action === "skip" ? "Skipped" : "Archived" }),
        });
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkRunning(false);
    }
  }, [selected, router]);

  const selectedCount = selected.size;
  const activeFilterCount = Object.keys(filters).length;

  return (
    <div className="relative">
      <Card>
        {activeFilterCount > 0 && (
          <div className="mb-4 flex items-center gap-3 text-xs">
            <span className="text-muted">
              {displayJobs.length} of {jobs.length} jobs
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

        <div className="w-full max-w-full" role="region" aria-label="Jobs table">
          <table className={cn(dataTableClass, dataTableStickyHeadClass)}>
            <thead>
              <tr>
                <th className="pb-3 pr-3 text-left">
                  <input
                    aria-label="Select all jobs"
                    checked={selectedCount === displayJobs.length && displayJobs.length > 0}
                    className="h-4 w-4 rounded border-border"
                    onChange={toggleAll}
                    type="checkbox"
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
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayJobs.map((job) => {
                const rowStatus = jobStatus[job.id];
                return (
                  <tr
                    key={job.id}
                    className={
                      selected.has(job.id)
                        ? "bg-accent/5"
                        : rowStatus === "done"
                          ? "bg-success/5"
                          : rowStatus === "error"
                            ? "bg-danger/5"
                            : undefined
                    }
                  >
                    <td className="py-3 pr-3">
                      <input
                        aria-label={`Select ${job.title} at ${job.company}`}
                        checked={selected.has(job.id)}
                        className="h-4 w-4 rounded border-border"
                        disabled={isRunning}
                        onChange={() => toggle(job.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                        {job.title}
                      </Link>
                      {rowStatus === "loading" && (
                        <span className="ml-2 animate-pulse text-xs text-muted">Evaluating…</span>
                      )}
                      {rowStatus === "done" && (
                        <span className="ml-2 text-xs text-success">✓ Done</span>
                      )}
                      {rowStatus === "error" && (
                        <span className="ml-2 text-xs text-danger">Error</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted">{job.company}</td>
                    <td className="py-3 pr-4 text-muted">{job.location}</td>
                    <td className="py-3 pr-4 font-medium">{job.fitScore}%</td>
                    <td className="py-3 pr-4 text-muted">{job.status}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={toneForRecommendation(job.recommendation)}>
                        {job.recommendation}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-muted">{fmtDate(job.datePosted)}</td>
                    <td className="py-3 pr-4 tabular-nums text-muted">{fmtDate(job.firstSeenDate)}</td>
                    <td className="py-3">
                      {job.url && (
                        <a
                          className="text-xs font-medium text-accent hover:underline"
                          href={job.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          ↗
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Filter dropdown — rendered outside overflow wrapper so it isn't clipped */}
      {openFilterCol && (
        <FilterDropdown
          col={openFilterCol}
          label={COL_DEFS.find((d) => d.col === openFilterCol)?.label.toLowerCase() ?? openFilterCol}
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

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between rounded-panel border border-accent/40 bg-panel px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-ink">
            {selectedCount} job{selectedCount !== 1 ? "s" : ""} selected
          </p>
          <div className="flex gap-2">
            <Button disabled={isRunning} onClick={evaluate} type="button">
              {running ? "Evaluating…" : `Evaluate ${selectedCount}`}
            </Button>
            <Button
              disabled={isRunning}
              onClick={() => bulkAction("skip")}
              type="button"
              variant="quiet"
            >
              Skip
            </Button>
            <Button
              disabled={isRunning}
              onClick={() => bulkAction("archive")}
              type="button"
              variant="quiet"
            >
              Archive
            </Button>
            <Button
              className="text-danger hover:bg-danger/8 hover:text-danger"
              disabled={isRunning}
              onClick={() => bulkAction("delete")}
              type="button"
              variant="quiet"
            >
              Delete
            </Button>
            <Button
              disabled={isRunning}
              onClick={() => setSelected(new Set())}
              type="button"
              variant="quiet"
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
