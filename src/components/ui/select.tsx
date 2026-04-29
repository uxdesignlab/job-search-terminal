import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
};

export function Select({ className, id, label, hint, children, ...props }: SelectProps) {
  const selectId = id ?? props.name;
  const descriptionId = hint ? `${selectId}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink" htmlFor={selectId}>
        {label}
      </label>
      <select
        aria-describedby={descriptionId}
        className={cn(
          "min-h-11 w-full rounded-control border border-border bg-panel px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-55",
          className
        )}
        id={selectId}
        {...props}
      >
        {children}
      </select>
      {hint ? (
        <p className="text-xs leading-5 text-muted" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
