"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  phase: "running" | "done";
  /** Dialog heading */
  title: string;
  /** Primary message shown while running */
  message: string;
  /** Smaller secondary text shown below message while running */
  subtitle?: string;
  /** Animated current-step text shown below message while running */
  statusLine?: string;
  error?: string | null;
  /** Content shown in done state when there is no error */
  children?: ReactNode;
  onClose: () => void;
};

export function ProgressModal({
  open,
  phase,
  title,
  message,
  subtitle,
  statusLine,
  error,
  children,
  onClose,
}: Props) {
  if (!open) return null;

  const isDone = phase === "done";

  return (
    <div
      aria-busy={!isDone}
      aria-labelledby="progress-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={isDone ? onClose : undefined}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink" id="progress-modal-title">
            {title}
          </h2>
          {isDone && (
            <button
              aria-label="Close"
              className="shrink-0 rounded-control p-1 text-muted hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={onClose}
              type="button"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M6 18L18 6M6 6l12 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
            </button>
          )}
        </div>

        {/* Running state */}
        {!isDone && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              aria-hidden
              className="h-11 w-11 animate-spin rounded-full border-2 border-accent border-t-transparent"
            />
            <div className="text-center">
              <p className="text-sm font-medium text-ink">{message}</p>
              {statusLine && (
                <p className="mt-1 animate-pulse text-xs text-accent">{statusLine}</p>
              )}
              {subtitle && (
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">{subtitle}</p>
              )}
            </div>
          </div>
        )}

        {/* Done state */}
        {isDone && (
          <div className="grid gap-4">
            {error ? (
              <p
                className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
                role="alert"
              >
                {error}
              </p>
            ) : (
              children
            )}
            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={onClose} type="button" variant="secondary">
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
