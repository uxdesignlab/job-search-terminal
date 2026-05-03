"use client";

import { LayoutGrid, Table2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ApplicationsKanban } from "./applications-kanban";
import { ApplicationsTable, type ApplicationTableRow } from "./applications-table";

type ViewMode = "kanban" | "table";

type Props = {
  rows: ApplicationTableRow[];
  todayIso: string;
};

export function ApplicationsView({ rows, todayIso }: Props) {
  const [mode, setMode] = useState<ViewMode>("kanban");

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">Tracked applications</h2>
          <p className="text-sm leading-6 text-muted">
            Current status, follow-up timing, and fit for active opportunities.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Kanban view"
            aria-pressed={mode === "kanban"}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-control border transition-colors",
              mode === "kanban"
                ? "border-accent bg-accent text-white"
                : "border-border bg-panel text-muted hover:border-accent hover:text-ink",
            )}
            onClick={() => setMode("kanban")}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            aria-label="Table view"
            aria-pressed={mode === "table"}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-control border transition-colors",
              mode === "table"
                ? "border-accent bg-accent text-white"
                : "border-border bg-panel text-muted hover:border-accent hover:text-ink",
            )}
            onClick={() => setMode("table")}
          >
            <Table2 size={15} />
          </button>
        </div>
      </div>

      {mode === "kanban" ? (
        <ApplicationsKanban rows={rows} todayIso={todayIso} />
      ) : (
        <ApplicationsTable rows={rows} todayIso={todayIso} />
      )}
    </div>
  );
}
