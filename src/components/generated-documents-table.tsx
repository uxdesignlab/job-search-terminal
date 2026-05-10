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
import { TABLE_SAVED_FILTER_STORAGE_KEYS } from "@/lib/table-saved-filter-storage-keys";
import { cn } from "@/lib/utils";

export type GeneratedDocumentTableRow = {
  id: string;
  company: string;
  role: string;
  postedLabel: string;
  baseResume: string;
  generatedDate: string;
  keywordCoverage: number;
  status: string;
  hasContent: boolean;
  hasPdf: boolean;
  jobUrl: string | null;
  editHref: string;
  jobHref: string | null;
  hasDraft: boolean;
};

type SortCol = "target" | "posted" | "baseResume" | "generated" | "coverage" | "status";

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "target", label: "Target" },
  { col: "posted", label: "Posted" },
  { col: "baseResume", label: "Base resume" },
  { col: "generated", label: "Generated" },
  { col: "coverage", label: "Coverage" },
  { col: "status", label: "Status" },
];

function getColValue(row: GeneratedDocumentTableRow, col: SortCol): string {
  switch (col) {
    case "target":
      return row.role;
    case "posted":
      return row.postedLabel;
    case "baseResume":
      return row.baseResume;
    case "generated":
      return row.generatedDate;
    case "coverage":
      return String(row.keywordCoverage);
    case "status":
      return row.status;
    default:
      return "";
  }
}

function getColOptions(rows: GeneratedDocumentTableRow[], col: SortCol): string[] {
  return [...new Set(rows.map((r) => getColValue(r, col)))].sort();
}

type Props = {
  rows: GeneratedDocumentTableRow[];
};

export function GeneratedDocumentsTable({ rows }: Props) {
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
  } = useDataTableSortFilterState<SortCol>({ col: "generated", dir: "desc" });

  const savedFiltersState = useDataTableSavedFilters<SortCol>(TABLE_SAVED_FILTER_STORAGE_KEYS.generatedDocs);
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
        case "target":
          cmp = a.role.localeCompare(b.role);
          break;
        case "posted":
          cmp = a.postedLabel.localeCompare(b.postedLabel);
          break;
        case "baseResume":
          cmp = a.baseResume.localeCompare(b.baseResume);
          break;
        case "generated":
          cmp = a.generatedDate.localeCompare(b.generatedDate);
          break;
        case "coverage":
          cmp = a.keywordCoverage - b.keywordCoverage;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
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
          entityLabel="documents"
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

      <div className="w-full overflow-x-auto" role="region" aria-label="Generated documents table">
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
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  Output
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayRows.map((document) => (
                <tr key={document.id}>
                  <td className="w-48 py-3 pr-4">
                    {document.hasDraft ? (
                      <Link className="font-medium text-accent hover:underline" href={document.editHref}>
                        {document.role}
                      </Link>
                    ) : document.jobHref ? (
                      <Link className="font-medium text-accent hover:underline" href={document.jobHref}>
                        {document.role}
                      </Link>
                    ) : (
                      document.role
                    )}
                    <p className="text-xs text-muted">{document.company}</p>
                  </td>
                  <td className="py-3 pr-4 text-muted">{document.postedLabel}</td>
                  <td className="py-3 pr-4 text-muted">{document.baseResume}</td>
                  <td className="py-3 pr-4 tabular-nums text-muted">{document.generatedDate}</td>
                  <td className="py-3 pr-4 font-medium">{document.keywordCoverage}%</td>
                  <td className="py-3 pr-4">
                    <Badge>{document.status}</Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {document.hasContent ? (
                        <a
                          className="font-medium text-accent hover:underline"
                          href={`/generated-documents/${document.id}/preview`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Preview
                        </a>
                      ) : (
                        <span className="text-xs text-muted">Preview pending</span>
                      )}
                      {document.hasPdf ? (
                        <a
                          className="font-medium text-accent hover:underline"
                          href={`/generated-documents/${document.id}/pdf`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          PDF
                        </a>
                      ) : null}
                      {document.jobUrl ? (
                        <a
                          className="font-medium text-accent hover:underline"
                          href={document.jobUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Job posting ↗
                        </a>
                      ) : null}
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
