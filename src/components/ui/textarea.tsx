import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Textarea({ className, id, label, hint, error, ...props }: TextareaProps) {
  const textareaId = id ?? props.name;
  const descriptionId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink" htmlFor={textareaId}>
        {label}
      </label>
      <textarea
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          "min-h-24 w-full rounded-control border border-border bg-panel px-3 py-2 text-sm leading-6 text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-55",
          error && "border-danger",
          className
        )}
        id={textareaId}
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
