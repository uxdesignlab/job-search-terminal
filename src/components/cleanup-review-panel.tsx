"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { RemoveAllCleanupButton } from "@/components/remove-all-cleanup-button";
import {
  SOURCE_PROBLEM_LABELS,
  SOURCE_PROBLEM_ORDER,
  type SourceProblem,
  type SourceProblemKind,
} from "@/lib/scanner/source-problem";
import { cn } from "@/lib/utils";

export type CleanupReviewRow = {
  name: string;
  careersUrl: string;
  /** False for an unsupported URL — there is nothing to check. */
  canCheck: boolean;
  problem: SourceProblem;
};

export type CleanupRecheckSummary = {
  checked: number;
  responds: number;
  notFound: number;
  stillFailing: number;
};

type Props = {
  rows: CleanupReviewRow[];
  onRecheck: (names: string[]) => Promise<CleanupRecheckSummary>;
  onReenable: (names: string[]) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onRemoveAll: (confirmedNames: string[]) => Promise<void>;
};

type Filter = SourceProblemKind | "all";

const BADGE_TONE: Record<SourceProblemKind, "neutral" | "success" | "warning" | "danger"> = {
  responds: "success",
  temporary: "warning",
  "app-error": "warning",
  refused: "warning",
  "not-found": "danger",
  malformed: "danger",
  other: "neutral",
  manual: "neutral",
};

/** Measured: about 1.2 s per source at the validator's pacing (5 at a time, ~0.9 s pause). */
function estimateMinutes(count: number): number {
  return Math.max(1, Math.round((count * 1.2) / 60));
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/**
 * Settings → Cleanup. Every row says why the source is here and what to do about
 * it; nothing is switched on, switched off, or removed unless the user clicks.
 */
export function CleanupReviewPanel({ rows, onRecheck, onReenable, onRemove, onRemoveAll }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [checking, startChecking] = useTransition();
  const [busy, startBusy] = useTransition();
  const [checkingCount, setCheckingCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = new Map<SourceProblemKind, number>();
    for (const row of rows) c.set(row.problem.kind, (c.get(row.problem.kind) ?? 0) + 1);
    return c;
  }, [rows]);

  const kindsPresent = SOURCE_PROBLEM_ORDER.filter((k) => (counts.get(k) ?? 0) > 0);
  const activeFilter: Filter = filter !== "all" && !counts.get(filter) ? "all" : filter;
  const visible = useMemo(() => {
    const list = activeFilter === "all" ? rows : rows.filter((r) => r.problem.kind === activeFilter);
    const rank = new Map(SOURCE_PROBLEM_ORDER.map((k, i) => [k, i]));
    return [...list].sort(
      (a, b) =>
        (rank.get(a.problem.kind) ?? 0) - (rank.get(b.problem.kind) ?? 0) || a.name.localeCompare(b.name),
    );
  }, [rows, activeFilter]);

  const checkable = visible.filter((r) => r.canCheck).map((r) => r.name);
  const working = visible.filter((r) => r.problem.kind === "responds").map((r) => r.name);
  const scopeLabel = activeFilter === "all" ? "" : ` ${SOURCE_PROBLEM_LABELS[activeFilter].toLowerCase()}`;

  function runRecheck(names: string[]) {
    setError(null);
    setStatus(null);
    setCheckingCount(names.length);
    startChecking(async () => {
      try {
        const s = await onRecheck(names);
        const parts = [`${s.responds} work again`, `${s.notFound} not found`, `${s.stillFailing} still failing`];
        setStatus(
          `Checked ${s.checked} source${s.checked === 1 ? "" : "s"}: ${parts.join(", ")}.` +
            (s.responds > 0 ? " Nothing was turned on — use Re-enable for the ones you want back." : ""),
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The check failed. Try again.");
      }
    });
  }

  function runReenable(names: string[]) {
    setError(null);
    startBusy(async () => {
      try {
        await onReenable(names);
        setStatus(`Turned on ${names.length} source${names.length === 1 ? "" : "s"}. They are included in the next scan.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not turn the source on.");
      }
    });
  }

  function runRemove(name: string) {
    setError(null);
    startBusy(async () => {
      try {
        await onRemove(name);
        setStatus(`Removed ${name}.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove the source.");
      }
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No user-added sources need cleanup review.</p>;
  }

  return (
    <div className="grid gap-4">
      {/* Filters double as the summary: what kinds of problems there are, and how many. */}
      <div aria-label="Filter by reason" className="flex flex-wrap gap-2" role="group">
        {(["all", ...kindsPresent] as Filter[]).map((k) => {
          const count = k === "all" ? rows.length : counts.get(k) ?? 0;
          const label = k === "all" ? "All" : SOURCE_PROBLEM_LABELS[k];
          const pressed = activeFilter === k;
          return (
            <button
              aria-pressed={pressed}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-control border px-3 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                pressed ? "border-ink bg-ink text-panel" : "border-border bg-panel text-ink hover:bg-surface",
              )}
              key={k}
              onClick={() => setFilter(k)}
              type="button"
            >
              {label}
              <span className={pressed ? "opacity-80" : "text-muted"}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface px-3 py-2">
        <Button
          disabled={checking || busy || checkable.length === 0}
          onClick={() => runRecheck(checkable)}
          variant="secondary"
        >
          {checking ? `Checking ${checkingCount}…` : `Re-check${scopeLabel} (${checkable.length})`}
        </Button>
        {working.length > 0 && (
          <Button disabled={checking || busy} onClick={() => runReenable(working)}>
            Re-enable {working.length} that work
          </Button>
        )}
        <div className="ml-auto">
          <RemoveAllCleanupButton
            label={activeFilter === "all" ? undefined : `Remove${scopeLabel}`}
            names={visible.map((r) => r.name)}
            onRemoveAll={async (names) => {
              await onRemoveAll(names);
              router.refresh();
            }}
          />
        </div>
      </div>

      <div aria-live="polite" className="grid gap-1 text-sm">
        {checking && (
          <p className="text-muted">
            Asking each board whether it still answers. This takes about {estimateMinutes(checkingCount)} minute
            {estimateMinutes(checkingCount) === 1 ? "" : "s"} for {checkingCount} sources — keep this page open. Nothing is
            turned on or removed by the check.
          </p>
        )}
        {status && !checking && <p className="text-ink">{status}</p>}
        {error && (
          <p className="text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <ul className="grid gap-2">
        {visible.map((row) => {
          const when = formatDate(row.problem.evidenceAt);
          const whenText = when
            ? row.problem.evidenceSource === "check"
              ? `Checked ${when}`
              : `Last failed in a scan on ${when}`
            : null;
          const suggestReenable = row.problem.suggestion === "re-enable";
          return (
            <li
              className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2.5"
              key={row.name}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{row.name}</p>
                  <Badge tone={BADGE_TONE[row.problem.kind]}>{row.problem.label}</Badge>
                </div>
                <p className="text-xs text-muted [overflow-wrap:anywhere]">{hostOf(row.careersUrl)}</p>
                <p className="text-sm text-ink">{row.problem.explanation}</p>
                {(whenText || row.problem.detail) && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer select-none">
                      {whenText ?? "Details"}
                    </summary>
                    {row.problem.detail && (
                      <p className="mt-1 font-mono [overflow-wrap:anywhere]">{row.problem.detail}</p>
                    )}
                  </details>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {row.canCheck && (
                  <Button
                    disabled={checking || busy}
                    onClick={() => runRecheck([row.name])}
                    variant="quiet"
                  >
                    Re-check
                  </Button>
                )}
                {row.canCheck && (
                  <Button
                    disabled={checking || busy}
                    onClick={() => runReenable([row.name])}
                    variant={suggestReenable ? "primary" : "secondary"}
                  >
                    Re-enable
                  </Button>
                )}
                <Button
                  disabled={checking || busy}
                  onClick={() => runRemove(row.name)}
                  variant="secondary"
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
