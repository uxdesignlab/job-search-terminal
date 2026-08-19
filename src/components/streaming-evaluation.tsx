"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { EVALUATION_PHASES, EVALUATION_PHASE_LABELS } from "@/lib/evaluation/evaluation-phases";
import type { EvaluationPhase } from "@/lib/evaluation/evaluation-phases";

type CompleteEvent = {
  fitScore: number;
  scoreLabel: string;
  recommendation: string;
  confidence: string;
  roleArchetype: string;
  providerUsed: string;
  modelUsed: string;
  generationMs: number;
  completenessWarnings: string[];
};

type Props = {
  jobId: string;
  hasExistingEvaluation: boolean;
};

export function StreamingEvaluation({ jobId, hasExistingEvaluation }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [reached, setReached] = useState<EvaluationPhase[]>([]);
  const [summary, setSummary] = useState<CompleteEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeModel, setActiveModel] = useState<{ providerUsed: string; modelUsed: string } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  /**
   * One long generation replaced seven short ones, so there is no partial
   * progress to report while it runs. Elapsed time is the honest substitute —
   * it tells the user the request is alive without inventing a percentage.
   */
  useEffect(() => {
    if (!open || status !== "running") return;
    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(timer);
  }, [open, status]);

  function start() {
    setOpen(true);
    setStatus("running");
    setReached([]);
    setSummary(null);
    setErrorMsg("");
    setActiveModel(null);

    const es = new EventSource(`/api/evaluate/${jobId}`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as {
        phase: EvaluationPhase | "start" | "complete" | "error";
        message?: string;
        done: boolean;
        error?: string;
        failedPhase?: string;
      } & Partial<CompleteEvent>;

      // Bound to a const so the early returns below narrow it inside the
      // setReached closure — narrowing a property access does not survive one.
      const phase = data.phase;

      if (phase === "start") {
        setActiveModel({ providerUsed: data.providerUsed ?? "", modelUsed: data.modelUsed ?? "" });
        return;
      }

      if (phase === "error") {
        es.close();
        setStatus("error");
        setErrorMsg(data.error ?? "Evaluation failed");
        return;
      }

      if (phase === "complete") {
        es.close();
        setStatus("done");
        setSummary({
          fitScore: data.fitScore ?? 0,
          scoreLabel: data.scoreLabel ?? "",
          recommendation: data.recommendation ?? "",
          confidence: data.confidence ?? "",
          roleArchetype: data.roleArchetype ?? "",
          providerUsed: data.providerUsed ?? "",
          modelUsed: data.modelUsed ?? "",
          generationMs: data.generationMs ?? 0,
          completenessWarnings: data.completenessWarnings ?? [],
        });
        return;
      }

      if (data.providerUsed) {
        setActiveModel({ providerUsed: data.providerUsed, modelUsed: data.modelUsed ?? "" });
      }
      setReached((prev) => (prev.includes(phase) ? prev : [...prev, phase]));
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

  // The phase in flight is the last one announced — a phase is reported as it
  // begins, so everything before it is finished and it is still running.
  const activePhase = status === "running" ? reached[reached.length - 1] ?? null : null;

  function phaseState(phase: EvaluationPhase): "done" | "active" | "pending" {
    const index = reached.indexOf(phase);
    if (index === -1) return "pending";
    return phase === activePhase ? "active" : "done";
  }

  function renderChecklist(dim: boolean) {
    return (
      <ul className="grid gap-2.5">
        {EVALUATION_PHASES.map((phase) => {
          const state = phaseState(phase);
          return (
            <li
              key={phase}
              className={`flex items-center gap-3 text-sm transition-colors ${
                state === "pending" ? (dim ? "text-muted/40" : "text-muted/50") : "text-ink"
              }`}
            >
              <span className="w-4 shrink-0 text-center text-xs">
                {state === "done" ? (
                  <span className="text-success">✓</span>
                ) : state === "active" ? (
                  <span className="inline-block animate-spin text-accent">◌</span>
                ) : (
                  <span>○</span>
                )}
              </span>
              {EVALUATION_PHASE_LABELS[phase]}
            </li>
          );
        })}
      </ul>
    );
  }

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
                  {/* Indeterminate: the work is one call, so there is no fraction to fill. */}
                  <div
                    aria-hidden
                    className="mb-5 h-1 overflow-hidden rounded-full bg-border/60"
                  >
                    <div className="h-full w-1/3 animate-progress rounded-full bg-accent" />
                  </div>

                  <div aria-live="polite" className="sr-only">
                    {activePhase ? EVALUATION_PHASE_LABELS[activePhase] : "Starting evaluation"}
                  </div>

                  {renderChecklist(false)}

                  <p className="mt-4 text-xs font-mono text-muted/60">
                    {activeModel ? `${activeModel.modelUsed} · ${activeModel.providerUsed} · ` : ""}
                    {(elapsedMs / 1000).toFixed(1)}s elapsed
                  </p>

                  <button
                    className="mt-3 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
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
                    <p className="text-sm text-muted">
                      {summary.roleArchetype}
                      {summary.confidence ? ` · ${summary.confidence} confidence` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {summary.providerUsed} / {summary.modelUsed} · {(summary.generationMs / 1000).toFixed(1)}s
                    </p>
                    {summary.completenessWarnings.length > 0 && (
                      <p className="mt-2 text-xs text-warning">
                        {summary.completenessWarnings.length} field
                        {summary.completenessWarnings.length === 1 ? "" : "s"} came back incomplete — see the
                        evaluation details.
                      </p>
                    )}
                  </div>
                  <Button className="w-full justify-center" onClick={() => close(true)}>
                    View Results
                  </Button>
                </>
              )}

              {status === "error" && (
                <>
                  {/* Keep the phase progress visible so the user sees how far it got. */}
                  <div className="mb-4">{renderChecklist(true)}</div>
                  <p className="mb-4 text-sm text-danger">{errorMsg}</p>
                  <div className="flex gap-2">
                    <Button onClick={start}>Retry</Button>
                    <Button onClick={() => close(false)} variant="quiet">Close</Button>
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
