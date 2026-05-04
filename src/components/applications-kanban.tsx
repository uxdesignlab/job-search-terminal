"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Archive, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { closeApplicationAction, moveApplicationAction } from "@/app/applications/actions";
import { Badge } from "@/components/ui/badge";
import {
  DataTableActiveFiltersSummary,
  DataTableSavedFiltersBar,
  DataTableSortFilterDropdown,
  useDataTableSavedFilters,
  useDataTableSortFilterState,
} from "@/components/ui/data-table-sort-filter";
import { TABLE_SAVED_FILTER_STORAGE_KEYS } from "@/lib/table-saved-filter-storage-keys";
import { cn } from "@/lib/utils";
import type { ApplicationTableRow } from "./applications-table";

// Active funnel columns — "Rejected" is the Closed rail, handled separately
const ACTIVE_COLUMNS = [
  { id: "Applied", label: "Applied", tone: "neutral" as const },
  { id: "Recruiter responded", label: "Recruiter Responded", tone: "neutral" as const },
  { id: "Interviewing", label: "Interviewing", tone: "success" as const },
  { id: "Offer", label: "Offer", tone: "success" as const },
] as const;

type ActiveColumnId = (typeof ACTIVE_COLUMNS)[number]["id"];
type ColumnId = ActiveColumnId | "Rejected";
type SortCol = "company" | "role" | "status" | "followUp" | "fit";

const COL_DEFS: Array<{ col: SortCol; label: string }> = [
  { col: "company", label: "Company" },
  { col: "role", label: "Role" },
  { col: "status", label: "Status" },
  { col: "followUp", label: "Follow-up" },
  { col: "fit", label: "Fit" },
];

const STATUS_TO_COLUMN: Record<string, ColumnId> = {
  Applied: "Applied",
  "Follow-up needed": "Applied",
  "Recruiter responded": "Recruiter responded",
  Interviewing: "Interviewing",
  Offer: "Offer",
  Rejected: "Rejected",
};

const TERMINAL_STATUSES = new Set(["Rejected", "Archived", "Skipped", "Offer"]);

const CLOSE_OUTCOMES = ["Rejected", "Role closed", "No response", "Withdrew", "Duplicate", "Other"];

function isOverdue(followUpDate: string, status: string, todayIso: string): boolean {
  if (TERMINAL_STATUSES.has(status) || !followUpDate) return false;
  return followUpDate < todayIso;
}

function daysDue(followUpDate: string, todayIso: string): number {
  return Math.floor(
    (new Date(todayIso).getTime() - new Date(followUpDate).getTime()) / 86_400_000,
  );
}

function statusTone(status: string) {
  if (status === "Interviewing" || status === "Offer") return "success" as const;
  if (status === "Follow-up needed") return "warning" as const;
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

// ─── Card ─────────────────────────────────────────────────────────────────────

function ApplicationCardInner({
  row,
  todayIso,
  ghost,
}: {
  row: ApplicationTableRow;
  todayIso: string;
  ghost?: boolean;
}) {
  const overdue = isOverdue(row.followUpDate, row.status, todayIso);
  const days = overdue ? daysDue(row.followUpDate, todayIso) : 0;

  return (
    <div
      className={cn(
        "rounded-panel border border-border bg-surface px-3 py-3 shadow-sm flex flex-col gap-2",
        ghost && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">{row.company}</p>
          {row.jobExists ? (
            <Link
              className="mt-0.5 block truncate text-sm font-medium text-accent hover:underline"
              href={`/jobs/${row.jobId}`}
            >
              {row.role}
            </Link>
          ) : (
            <p className="mt-0.5 truncate text-sm font-medium text-ink">{row.role}</p>
          )}
        </div>
        <span className="shrink-0 text-xs font-medium text-muted">{row.fitScore}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.status === "Follow-up needed" && (
          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        )}
        {row.followUpDate &&
          (overdue ? (
            <Badge tone="warning" aria-label={`Overdue by ${days} day${days !== 1 ? "s" : ""}`}>
              Overdue {days}d
            </Badge>
          ) : (
            <span className="text-xs text-muted">Follow-up {row.followUpDate}</span>
          ))}
      </div>
    </div>
  );
}

function DraggableCard({ row, todayIso }: { row: ApplicationTableRow; todayIso: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    data: { jobId: row.jobId, status: row.status },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-0")}
      role="button"
      aria-label={`${row.role} at ${row.company} — drag to change status`}
    >
      <ApplicationCardInner row={row} todayIso={todayIso} />
    </div>
  );
}

// ─── Active column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  columnId,
  label,
  tone,
  cards,
  todayIso,
  isOver,
}: {
  columnId: ActiveColumnId;
  label: string;
  tone: "neutral" | "success";
  cards: ApplicationTableRow[];
  todayIso: string;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: columnId });

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-xs text-muted">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-panel border border-dashed border-border p-2 transition-colors",
          isOver && "border-accent/60 bg-accent/5",
          cards.length === 0 && "min-h-24",
        )}
      >
        {cards.map((row) => (
          <DraggableCard key={row.id} row={row} todayIso={todayIso} />
        ))}
      </div>
    </div>
  );
}

// ─── Closed rail ───────────────────────────────────────────────────────────────

function ClosedColumn({
  count,
  isDragging,
  isOver,
}: {
  count: number;
  isDragging: boolean;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: "Rejected" });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex shrink-0 flex-col transition-all duration-200",
        isDragging ? "w-52" : "w-auto",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="neutral" className="gap-1.5">
          <Archive size={11} className="opacity-60" />
          Closed
        </Badge>
        {count > 0 && <span className="text-xs text-muted">{count}</span>}
      </div>

      {isDragging ? (
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed p-6 text-center min-h-28 transition-colors duration-150",
            isOver ? "border-muted/60 bg-surface" : "border-border/40",
          )}
        >
          <Archive
            size={18}
            className={cn("transition-colors duration-150", isOver ? "text-ink" : "text-muted opacity-40")}
          />
          <p className={cn("text-xs transition-colors duration-150", isOver ? "text-ink" : "text-muted opacity-50")}>
            {isOver ? "Release to close" : "Drop to close"}
          </p>
        </div>
      ) : (
        // Invisible spacer — keeps the droppable registered at a reasonable size
        <div className="min-h-8 w-16 rounded-panel border border-dashed border-border/25" />
      )}
    </div>
  );
}

// ─── Close application sheet ──────────────────────────────────────────────────

type ClosingCard = { jobId: string; company: string; role: string };

function CloseApplicationSheet({
  card,
  onDismiss,
}: {
  card: ClosingCard;
  onDismiss: () => void;
}) {
  const [outcome, setOutcome] = useState("Rejected");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    await closeApplicationAction(card.jobId, outcome, note);
    onDismiss();
  }

  return (
    // Click outside to dismiss
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-6"
      onClick={onDismiss}
    >
      <div
        className="w-80 rounded-panel border border-border bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Close application</h3>
            <p className="mt-0.5 text-xs text-muted">
              {card.role} · {card.company}
            </p>
          </div>
          <button
            aria-label="Dismiss"
            className="ml-2 text-muted transition-colors hover:text-ink"
            onClick={onDismiss}
          >
            <X size={15} />
          </button>
        </div>

        {/* Outcome */}
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Outcome</p>
        <div className="mb-4 space-y-2">
          {CLOSE_OUTCOMES.map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-2.5">
              <input
                checked={outcome === o}
                className="h-3.5 w-3.5 accent-[rgb(var(--color-accent))]"
                name="outcome"
                onChange={() => setOutcome(o)}
                type="radio"
                value={o}
              />
              <span className="text-sm text-ink">{o}</span>
            </label>
          ))}
        </div>

        {/* Note */}
        <textarea
          className="mb-4 w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you learn? (optional)"
          rows={3}
          value={note}
        />

        <button
          className="inline-flex w-full items-center justify-center rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={submitting}
          onClick={handleSubmit}
          type="button"
        >
          {submitting ? "Closing…" : "Close application"}
        </button>
      </div>
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────────

type Props = {
  rows: ApplicationTableRow[];
  todayIso: string;
};

export function ApplicationsKanban({ rows, todayIso }: Props) {
  const [cards, setCards] = useState<ApplicationTableRow[]>(rows);
  const [activeCard, setActiveCard] = useState<ApplicationTableRow | null>(null);
  const [overColumnId, setOverColumnId] = useState<ColumnId | null>(null);
  const [closingCard, setClosingCard] = useState<ClosingCard | null>(null);
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
  } = useDataTableSortFilterState<SortCol>({ col: "company", dir: "asc" });

  const savedFiltersState = useDataTableSavedFilters<SortCol>(TABLE_SAVED_FILTER_STORAGE_KEYS.applications);
  const columnLabels = useMemo(
    () => Object.fromEntries(COL_DEFS.map(({ col, label }) => [col, label])) as Record<SortCol, string>,
    [],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const colOptions = useMemo(
    () =>
      Object.fromEntries(COL_DEFS.map(({ col }) => [col, getColOptions(cards, col)])) as Record<
        SortCol,
        string[]
      >,
    [cards],
  );

  const displayCards = useMemo(() => {
    let result = cards;
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
  }, [cards, sort, filters]);

  const activeColumns = ACTIVE_COLUMNS.map((col) => ({
    ...col,
    cards: displayCards.filter((r) => STATUS_TO_COLUMN[r.status] === col.id),
  }));
  const closedCount = displayCards.filter((r) => STATUS_TO_COLUMN[r.status] === "Rejected").length;
  const isDragging = activeCard !== null;

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const card = cards.find((r) => r.id === event.active.id);
      setActiveCard(card ?? null);
    },
    [cards],
  );

  const handleDragOver = useCallback((event: { over: { id: unknown } | null }) => {
    setOverColumnId((event.over?.id as ColumnId) ?? null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCard(null);
      setOverColumnId(null);

      const { active, over } = event;
      if (!over) return;

      const newStatus = over.id as ColumnId;
      const card = cards.find((r) => r.id === active.id);
      if (!card || STATUS_TO_COLUMN[card.status] === newStatus) return;

      const prevCards = cards;
      setCards((prev) => prev.map((r) => (r.id === card.id ? { ...r, status: newStatus } : r)));

      // Show the close sheet when moving to Closed
      if (newStatus === "Rejected") {
        setClosingCard({ jobId: card.jobId, company: card.company, role: card.role });
      }

      try {
        await moveApplicationAction(card.jobId, newStatus);
      } catch {
        setCards(prevCards);
        setClosingCard(null);
      }
    },
    [cards],
  );

  return (
    <div className="relative">
      {(activeFilterCount > 0 ||
        (savedFiltersState.ready && savedFiltersState.items.length > 0)) && (
        <DataTableActiveFiltersSummary
          entityLabel="applications"
          hasActiveFilters={activeFilterCount > 0}
          onClearAll={clearAllFilters}
          shown={displayCards.length}
          total={cards.length}
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {COL_DEFS.map(({ col, label }) => {
          const isFiltered = filters[col] !== undefined;
          const isSorted = sort.col === col;
          const isOpen = openFilterCol === col;
          const active = isFiltered || isSorted;

          return (
            <button
              key={col}
              className={cn(
                "inline-flex items-center gap-1 rounded-control border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                active
                  ? "border-accent/40 bg-accent/5 text-accent"
                  : "border-border bg-panel text-muted hover:text-ink",
              )}
              onClick={(e) => openFilter(col, e.currentTarget)}
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
          );
        })}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activeColumns.map((col) => (
            <KanbanColumn
              key={col.id}
              columnId={col.id}
              label={col.label}
              tone={col.tone}
              cards={col.cards}
              todayIso={todayIso}
              isOver={overColumnId === col.id}
            />
          ))}
          <ClosedColumn
            count={closedCount}
            isDragging={isDragging}
            isOver={overColumnId === "Rejected"}
          />
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="w-52 rotate-2 shadow-lg">
              <ApplicationCardInner row={activeCard} todayIso={todayIso} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {closingCard && (
        <CloseApplicationSheet card={closingCard} onDismiss={() => setClosingCard(null)} />
      )}

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
