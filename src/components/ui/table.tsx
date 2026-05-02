import type { TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Standard collapsed-border table layout (normal CSS table grid). */
export const dataTableClass = "w-full border-collapse text-left text-sm";

/** Sticky thead row clears Shell nav via globals.css (`.data-table-sticky-head`). */
export const dataTableStickyHeadClass = "data-table-sticky-head";

/** Archived-style header background (pairs with `data-table-sticky-head`). */
export const dataTableStickySurfaceClass = "data-table-sticky-surface";

/** Sticky offset `top: 0` inside a local scroll container (e.g. modal). */
export const dataTableStickyModalClass = "data-table-sticky-modal";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="rounded-panel border border-border bg-panel">
      <table className={cn(dataTableClass, dataTableStickyHeadClass, className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-4 py-3 text-xs font-semibold uppercase text-muted align-top", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-4 py-3 text-ink", className)} {...props} />;
}
