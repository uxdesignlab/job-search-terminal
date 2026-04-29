import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Input({ className, id, label, hint, error, ...props }: InputProps) {
  const inputId = id ?? props.name;
  const descriptionId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink" htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          "min-h-11 w-full rounded-control border border-border bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-55",
          error && "border-danger",
          className
        )}
        id={inputId}
        {...props}
      />
      {hint ? (
        <p className="text-xs leading-5 text-muted" id={descriptionId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium leading-5 text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
