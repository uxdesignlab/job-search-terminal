"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DataTableActiveFiltersSummary,
  DataTableColHeader,
  DataTableSavedFiltersBar,
  DataTableSortFilterDropdown,
  useDataTableSavedFilters,
  useDataTableSortFilterState,
} from "@/components/ui/data-table-sort-filter";
import { dataTableClass, dataTableStickyHeadClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  MATCHES_PREFERENCES_LABEL,
  type MainJobTableRecord,
  type MainJobsSortCol,
  getMainJobColOptions,
  getMainJobColValue,
} from "@/lib/job-table-helpers";
import { TABLE_SAVED_FILTER_STORAGE_KEYS } from "@/lib/table-saved-filter-storage-keys";

type JobRowStatus = "loading" | "done" | "error";
type SortCol = MainJobsSortCol;

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

// ─── Main Component ───────────────────────────────────────────────────────────

export type BatchEvaluateFormProps = {
  jobs: MainJobTableRecord[];
};

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "title", label: "Role" },
  { col: "company", label: "Company" },
  { col: "location", label: "Location" },
  { col: "preference", label: "Preference" },
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
  // Build default filter: exclude non-actionable statuses unless the user clears it
  const statusOptions = getMainJobColOptions(jobs, "status");
  const hiddenStatuses = new Set(["Applied", "Rejected", "Skipped"]);
  const visibleStatuses = statusOptions.filter((status) => !hiddenStatuses.has(status));
  const defaultFilters =
    visibleStatuses.length !== statusOptions.length
      ? ({ status: new Set(visibleStatuses) } as Partial<Record<SortCol, Set<string>>>)
      : undefined;

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
  } = useDataTableSortFilterState<SortCol>({ col: "fit", dir: "desc" }, defaultFilters);

  const savedFiltersState = useDataTableSavedFilters<SortCol>(TABLE_SAVED_FILTER_STORAGE_KEYS.mainJobs);
  const columnLabels = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col, label }) => [col, label])) as Record<SortCol, string>,
    [],
  );

  const isRunning = running || bulkRunning;

  const colOptions = useMemo(
    () =>
      Object.fromEntries(COL_DEFS.map(({ col }) => [col, getMainJobColOptions(jobs, col)])) as Record<
        SortCol,
        string[]
      >,
    [jobs],
  );

  const displayJobs = useMemo(() => {
    let result = jobs;
    for (const [col, allowed] of Object.entries(filters) as [SortCol, Set<string>][]) {
      if (!allowed) continue;
      result = result.filter((j) => allowed.has(getMainJobColValue(j, col)));
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sort.col) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "company": cmp = a.company.localeCompare(b.company); break;
        case "location": cmp = a.location.localeCompare(b.location); break;
        case "preference": cmp = getMainJobColValue(a, "preference").localeCompare(getMainJobColValue(b, "preference")); break;
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
    if (action === "delete") {
      const protectedCount = jobs.filter((job) => selected.has(job.id) && job.removalProtected).length;
      const message = protectedCount > 0
        ? `${protectedCount} selected job${protectedCount !== 1 ? "s have" : " has"} user activity. Delete selected jobs anyway?`
        : `Delete ${ids.length} selected job${ids.length !== 1 ? "s" : ""}?`;
      if (!window.confirm(message)) return;
    }
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
  }, [jobs, selected, router]);

  const selectedCount = selected.size;

  return (
    <div className="relative">
      <Card>
        {(activeFilterCount > 0 ||
          (savedFiltersState.ready && savedFiltersState.items.length > 0)) && (
          <DataTableActiveFiltersSummary
            entityLabel="jobs"
            hasActiveFilters={activeFilterCount > 0}
            onClearAll={clearAllFilters}
            shown={displayJobs.length}
            total={jobs.length}
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
                    <td className="py-3 pr-4">
                      {job.preferenceLabel ? (
                        <Badge tone="warning">{job.preferenceLabel}</Badge>
                      ) : (
                        <Badge tone="success">{MATCHES_PREFERENCES_LABEL}</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-medium">{job.fitScore}%</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-muted">{job.status}</span>
                        {job.livenessStatus === "expired" ? <Badge tone="danger">Posting expired</Badge> : null}
                      </div>
                    </td>
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
        <DataTableSortFilterDropdown
          filterByLabel={COL_DEFS.find((d) => d.col === openFilterCol)?.label.toLowerCase() ?? openFilterCol}
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
