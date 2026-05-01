"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { BlockName } from "@/lib/evaluation/llm-evaluator";

type CompleteEvent = {
  fitScore: number;
  scoreLabel: string;
  recommendation: string;
  roleArchetype: string;
  legitimacyLabel: string;
  providerUsed: string;
  modelUsed: string;
  generationMs: number;
};

type Props = {
  jobId: string;
  hasExistingEvaluation: boolean;
};

const BLOCK_ORDER: BlockName[] = ["a", "b", "c", "d", "e", "f", "g"];

const BLOCK_LABELS: Record<BlockName, string> = {
  a: "Role Analysis",
  b: "Skills Match",
  c: "Seniority Fit",
  d: "Compensation",
  e: "Profile Optimization",
  f: "Interview Stories",
  g: "Posting Legitimacy",
};

export function StreamingEvaluation({ jobId, hasExistingEvaluation }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [done, setDone] = useState<BlockName[]>([]);
  const [currentLabel, setCurrentLabel] = useState("Connecting…");
  const [summary, setSummary] = useState<CompleteEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const esRef = useRef<EventSource | null>(null);

  function start() {
    setOpen(true);
    setStatus("running");
    setDone([]);
    setCurrentLabel("Connecting…");
    setSummary(null);
    setErrorMsg("");

    const es = new EventSource(`/api/evaluate/${jobId}`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as {
        block: BlockName | "complete" | "error";
        label?: string;
        done: boolean;
        error?: string;
      } & Partial<CompleteEvent>;

      if (data.block === "error") {
        es.close();
        setStatus("error");
        setErrorMsg(data.error ?? "Evaluation failed");
        return;
      }

      if (data.block === "complete") {
        es.close();
        setStatus("done");
        setSummary({
          fitScore: data.fitScore ?? 0,
          scoreLabel: data.scoreLabel ?? "",
          recommendation: data.recommendation ?? "",
          roleArchetype: data.roleArchetype ?? "",
          legitimacyLabel: data.legitimacyLabel ?? "",
          providerUsed: data.providerUsed ?? "",
          modelUsed: data.modelUsed ?? "",
          generationMs: data.generationMs ?? 0,
        });
        return;
      }

      setCurrentLabel(data.label ?? BLOCK_LABELS[data.block as BlockName] ?? data.block);
      setDone((prev) => [...prev, data.block as BlockName]);
    };

    es.onerror = () => {
      es.close();
      setStatus("error");
      setErrorMsg("Connection lost. Check that an API key is configured in Settings.");
    };
  }

  function close(refresh = false) {
    esRef.current?.close();
    setOpen(false);
    if (refresh) router.refresh();
  }

  const progress = done.length / BLOCK_ORDER.length;
  // The active block is the first one not yet done
  const activeKey = status === "running"
    ? BLOCK_ORDER.find((k) => !done.includes(k)) ?? null
    : null;

  return (
    <>
      <Button onClick={start} variant="primary">
        {hasExistingEvaluation ? "Re-evaluate with AI" : "Evaluate with AI"}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            // Close on backdrop click only if not running
            if (e.target === e.currentTarget && status !== "running") close(status === "done");
          }}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-panel shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                {status === "running" && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                )}
                {status === "done" && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-xs text-success">✓</span>
                )}
                {status === "error" && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger/15 text-xs text-danger">✕</span>
                )}
                <h2 className="text-sm font-semibold text-ink">
                  {status === "running" && "Evaluating…"}
                  {status === "done" && "Evaluation complete"}
                  {status === "error" && "Evaluation failed"}
                </h2>
              </div>
              {status !== "running" && (
                <button
                  className="text-muted transition-colors hover:text-ink"
                  onClick={() => close(status === "done")}
                  type="button"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {status === "running" && (
                <>
                  {/* Progress bar */}
                  <div className="mb-5 overflow-hidden rounded-full bg-border/60 h-1">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(4, progress * 100)}%` }}
                    />
                  </div>

                  {/* Block checklist */}
                  <ul className="grid gap-2.5">
                    {BLOCK_ORDER.map((key) => {
                      const isDone = done.includes(key);
                      const isActive = activeKey === key;
                      return (
                        <li
                          key={key}
                          className={`flex items-center gap-3 text-sm transition-colors ${
                            isDone ? "text-ink" : isActive ? "text-ink" : "text-muted/50"
                          }`}
                        >
                          <span className="w-4 shrink-0 text-center text-xs">
                            {isDone ? (
                              <span className="text-success">✓</span>
                            ) : isActive ? (
                              <span className="inline-block animate-spin text-accent">◌</span>
                            ) : (
                              <span>○</span>
                            )}
                          </span>
                          {BLOCK_LABELS[key]}
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    className="mt-5 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                    onClick={() => close(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </>
              )}

              {status === "done" && summary && (
                <>
                  <div className="mb-5 rounded-control border border-border bg-surface px-4 py-3">
                    <p className="text-sm font-semibold text-ink">
                      {summary.fitScore}% fit · {summary.recommendation}
                    </p>
                    <p className="text-sm text-muted">{summary.roleArchetype}</p>
                    <p className="mt-1 text-xs text-muted">
                      {summary.providerUsed} / {summary.modelUsed} · {(summary.generationMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                  <Button className="w-full justify-center" onClick={() => close(true)}>
                    View Results
                  </Button>
                </>
              )}

              {status === "error" && (
                <>
                  <p className="mb-5 text-sm text-muted">{errorMsg}</p>
                  <div className="flex gap-2">
                    <Button onClick={start}>Retry</Button>
                    <Button onClick={() => close(false)} variant="quiet">
                      Close
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
