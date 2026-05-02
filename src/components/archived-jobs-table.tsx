"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DataTableActiveFiltersSummary,
  DataTableColHeader,
  DataTableSortFilterDropdown,
  useDataTableSortFilterState,
} from "@/components/ui/data-table-sort-filter";
import {
  dataTableClass,
  dataTableStickyHeadClass,
  dataTableStickySurfaceClass,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatPostedDate } from "@/lib/dates";
import type { JobRecord } from "@/lib/db/types";
import {
  type ArchivedJobsSortCol,
  getArchivedJobColOptions,
  getArchivedJobColValue,
} from "@/lib/job-table-helpers";

const COL_DEFS: Array<{ col: ArchivedJobsSortCol; label: string }> = [
  { col: "title", label: "Role" },
  { col: "company", label: "Company" },
  { col: "score", label: "Score" },
  { col: "archiveStatus", label: "Status" },
  { col: "posted", label: "Posted" },
  { col: "reason", label: "Reason" },
];

type Props = {
  jobs: JobRecord[];
  unarchiveAction: (formData: FormData) => Promise<void>;
  deleteArchivedAction: (formData: FormData) => Promise<void>;
};

export function ArchivedJobsTable({ jobs, unarchiveAction, deleteArchivedAction }: Props) {
  const {
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
  } = useDataTableSortFilterState<ArchivedJobsSortCol>({ col: "score", dir: "desc" });

  const colOptions = useMemo(
    () =>
      Object.fromEntries(COL_DEFS.map(({ col }) => [col, getArchivedJobColOptions(jobs, col)])) as Record<
        ArchivedJobsSortCol,
        string[]
      >,
    [jobs],
  );

  const displayJobs = useMemo(() => {
    let result = jobs;
    for (const [col, allowed] of Object.entries(filters) as [ArchivedJobsSortCol, Set<string>][]) {
      if (!allowed) continue;
      result = result.filter((j) => allowed.has(getArchivedJobColValue(j, col)));
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sort.col) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "company":
          cmp = a.company.localeCompare(b.company);
          break;
        case "score":
          cmp = a.fitScore - b.fitScore;
          break;
        case "archiveStatus":
          cmp = getArchivedJobColValue(a, "archiveStatus").localeCompare(getArchivedJobColValue(b, "archiveStatus"));
          break;
        case "posted":
          cmp = (a.datePosted ?? "").localeCompare(b.datePosted ?? "");
          break;
        case "reason":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [jobs, sort, filters]);

  return (
    <div className="relative">
      {activeFilterCount > 0 && (
        <DataTableActiveFiltersSummary
          entityLabel="archived jobs"
          onClearAll={clearAllFilters}
          shown={displayJobs.length}
          total={jobs.length}
        />
      )}

      <div className="hidden w-full max-w-full rounded-panel border border-border lg:block">
        <table
          className={cn(
            dataTableClass,
            dataTableStickyHeadClass,
            dataTableStickySurfaceClass,
            "min-w-max",
          )}
        >
          <thead>
            <tr>
              {COL_DEFS.map(({ col, label }) => (
                <DataTableColHeader
                  key={col}
                  className="px-4 py-3"
                  col={col}
                  filter={filters[col]}
                  isOpen={openFilterCol === col}
                  label={label}
                  onOpen={openFilter}
                  sort={sort}
                />
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayJobs.map((job) => (
              <tr className="hover:bg-surface/50" key={job.id}>
                <td className="px-4 py-3">
                  <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                    {job.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{job.company}</td>
                <td className="px-4 py-3">
                  <Badge tone={job.fitScore >= 80 ? "success" : job.fitScore >= 60 ? "neutral" : "warning"}>
                    {job.fitScore}%
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {job.livenessStatus === "expired" ? (
                    <Badge tone="danger">Expired</Badge>
                  ) : (
                    <Badge tone="neutral">Manually archived</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{formatPostedDate(job)}</td>
                <td className="px-4 py-3 text-xs text-muted">{job.status}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <form action={unarchiveAction}>
                      <input name="id" type="hidden" value={job.id} />
                      <button
                        className="rounded-control border border-border px-3 py-1 text-xs font-medium text-muted hover:text-ink"
                        type="submit"
                      >
                        Restore
                      </button>
                    </form>
                    <form action={deleteArchivedAction}>
                      <input name="id" type="hidden" value={job.id} />
                      <button
                        className="rounded-control border border-danger/40 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/8"
                        type="submit"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
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
