"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
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
import type { ApplicationRecord } from "@/lib/db/types";
import {
  TABLE_SAVED_FILTER_STORAGE_KEYS,
  TABLE_SORT_FILTER_STATE_STORAGE_KEYS,
} from "@/lib/table-saved-filter-storage-keys";

const TERMINAL_STATUSES = new Set(["Rejected", "Archived", "Skipped", "Offer"]);

export type ApplicationTableRow = ApplicationRecord & { jobExists: boolean };

type SortCol = "company" | "role" | "status" | "followUp" | "fit";

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "company", label: "Company" },
  { col: "role", label: "Role" },
  { col: "status", label: "Status" },
  { col: "followUp", label: "Follow-up" },
  { col: "fit", label: "Fit" },
];

function isOverdue(followUpDate: string, status: string, todayIso: string): boolean {
  if (TERMINAL_STATUSES.has(status) || !followUpDate) return false;
  return followUpDate < todayIso;
}

function daysDue(followUpDate: string, todayIso: string): number {
  const msPerDay = 86_400_000;
  return Math.floor(
    (new Date(todayIso).getTime() - new Date(followUpDate).getTime()) / msPerDay,
  );
}

function statusTone(status: string) {
  if (status === "Rejected") return "danger" as const;
  if (status === "Interviewing" || status === "Offer") return "success" as const;
  return "neutral" as const;
}

function getColValue(row: ApplicationTableRow, col: SortCol): string {
  switch (col) {
    case "company":
      return row.company;
    case "role":
      return row.role;
    case "status":
      return row.status;
    case "followUp":
      return row.followUpDate || "Not set";
    case "fit":
      return String(row.fitScore);
    default:
      return "";
  }
}

function getColOptions(rows: ApplicationTableRow[], col: SortCol): string[] {
  return [...new Set(rows.map((r) => getColValue(r, col)))].sort();
}

type Props = {
  rows: ApplicationTableRow[];
  todayIso: string;
};

export function ApplicationsTable({ rows, todayIso }: Props) {
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
    TABLE_SORT_FILTER_STATE_STORAGE_KEYS.applications,
  );

  const savedFiltersState = useDataTableSavedFilters<SortCol>(TABLE_SAVED_FILTER_STORAGE_KEYS.applications);
  const columnLabels = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col, label }) => [col, label])) as Record<SortCol, string>,
    [],
  );

  const colOptions = useMemo(
    () =>
      Object.fromEntries(COL_DEFS.map(({ col }) => [col, getColOptions(rows, col)])) as Record<
        SortCol,
        string[]
      >,
    [rows],
  );

  const displayRows = useMemo(() => {
    let result = rows;
    for (const [col, allowed] of Object.entries(filters) as [SortCol, Set<string>][]) {
      if (!allowed) continue;
      result = result.filter((r) => allowed.has(getColValue(r, col)));
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sort.col) {
        case "company":
          cmp = a.company.localeCompare(b.company);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "followUp":
          cmp = (a.followUpDate || "").localeCompare(b.followUpDate || "");
          break;
        case "fit":
          cmp = a.fitScore - b.fitScore;
          break;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, filters]);

  return (
    <div className="relative">
      {(activeFilterCount > 0 ||
        (savedFiltersState.ready && savedFiltersState.items.length > 0)) && (
        <DataTableActiveFiltersSummary
          entityLabel="applications"
          hasActiveFilters={activeFilterCount > 0}
          onClearAll={clearAllFilters}
          shown={displayRows.length}
          total={rows.length}
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

      <div className="w-full max-w-full" role="region" aria-label="Applications table">
        <table className={cn(dataTableClass, dataTableStickyHeadClass, "min-w-max")}>
            <thead>
              <tr>
                {COL_DEFS.map(({ col, label }) => (
                  <DataTableColHeader
                    key={col}
                    col={col}
                    filter={filters[col]}
                    isOpen={openFilterCol === col}
                    label={label}
                    onOpen={openFilter}
                    sort={sort}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayRows.map((application) => {
                const overdue = isOverdue(application.followUpDate, application.status, todayIso);
                const days = overdue ? daysDue(application.followUpDate, todayIso) : 0;

                return (
                  <tr key={application.id}>
                    <td className="py-3 pr-4 text-muted">{application.company}</td>
                    <td className="py-3 pr-4">
                      {application.jobExists ? (
                        <Link
                          className="font-medium text-accent hover:underline"
                          href={`/jobs/${application.jobId}`}
                        >
                          {application.role}
                        </Link>
                      ) : (
                        application.role
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={statusTone(application.status)}>{application.status}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={overdue ? "text-warning" : "text-ink"}>
                          {application.followUpDate || "Not set"}
                        </span>
                        {overdue && (
                          <Badge aria-label={`Overdue by ${days} day${days !== 1 ? "s" : ""}`} tone="warning">
                            Overdue {days}d
                          </Badge>
                        )}
                        {!overdue &&
                          application.followUpDate &&
                          application.followUpDate >= todayIso &&
                          !TERMINAL_STATUSES.has(application.status) && (
                            <Badge tone="neutral">Upcoming</Badge>
                          )}
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-medium">{application.fitScore}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      </div>

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
    </div>
  );
}
