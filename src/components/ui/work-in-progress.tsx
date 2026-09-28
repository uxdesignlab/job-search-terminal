"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type WorkInProgressProps = {
  /** What is happening, in the present tense: "Looking up Dana's work email…" */
  title: string;
  /** What to expect: roughly how long, and what happens when it ends. */
  detail?: string;
  className?: string;
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * The panel shown while a slow request runs: spinner, moving bar, and a
 * running clock.
 *
 * The bar is indeterminate on purpose. Clay and the AI provider report no
 * progress, so a filling bar would be a guess dressed up as a measurement. The
 * clock is what proves the app has not frozen — and it is the one signal left
 * when reduced motion stops the spinner and the bar.
 */
export function WorkInProgress({ title, detail, className }: WorkInProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      aria-live="polite"
      className={cn("rounded-control border border-accent/35 bg-accent/5 px-3 py-2 text-sm text-ink", className)}
      role="status"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-medium">{title}</p>
            {/* Hidden from the live region so it is not announced every second. */}
            <span aria-hidden className="text-xs tabular-nums text-muted">
              {formatElapsed(elapsed)}
            </span>
          </div>
          {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
          <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-border/60">
            <div className="h-full w-1/3 animate-progress rounded-full bg-accent motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * WorkInProgress for a plain server-action form: appears while the form is
 * submitting and disappears when the page reloads with the result. Must be
 * rendered inside the <form>.
 */
export function FormWorkInProgress(props: WorkInProgressProps) {
  const { pending } = useFormStatus();
  return pending ? <WorkInProgress {...props} /> : null;
}
