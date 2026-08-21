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

/**
 * A chain announces the next provider before the call, which is the only moment
 * that is useful — but an auto setting ("latest", "latest-sonnet") only becomes a
 * concrete model id inside that call. Showing the sentinel would name a policy
 * where the reader expects a model, so it reads as pending until it resolves.
 */
function describeModel(model: string): string {
  return model.startsWith("latest") ? "resolving model…" : model;
}

export function StreamingEvaluation({ jobId, hasExistingEvaluation }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"running" | "done" | "error" | "cancelled">("running");
  const [reached, setReached] = useState<EvaluationPhase[]>([]);
  const [summary, setSummary] = useState<CompleteEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeModel, setActiveModel] = useState<{ providerUsed: string; modelUsed: string } | null>(null);
  // Offered after cancelling a local run: the models this machine already has.
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [switchTo, setSwitchTo] = useState("");
  const [switching, setSwitching] = useState(false);
  /** Providers that failed before the one now running, in order. */
  const [handovers, setHandovers] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  /**
   * Closing the stream is the only cancel signal the server gets, and unmounting
   * is a cancel the user never gets to click: navigating away mid-run left the
   * EventSource open, so the route's cancel callback never fired, the run was
   * never marked aborted, and the evaluation was saved onto a job the user had
   * already left — a chain would also walk on to the paid providers behind the
   * one that was running. Both close() paths need a click on a modal that no
   * longer exists, so the close on unmount has to happen here.
   */
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

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
    setHandovers([]);

    const es = new EventSource(`/api/evaluate/${jobId}`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as {
        phase: EvaluationPhase | "start" | "complete" | "error";
        message?: string;
        done: boolean;
        error?: string;
        failedPhase?: string;
        note?: string;
      } & Partial<CompleteEvent>;

      // Bound to a const so the early returns below narrow it inside the
      // setReached closure — narrowing a property access does not survive one.
      const phase = data.phase;

      if (phase === "start") {
        setActiveModel({ providerUsed: data.providerUsed ?? "", modelUsed: data.modelUsed ?? "" });
        return;
      }

      // A chain hands over mid-run. Following it is the difference between the
      // modal naming what is working now and naming what it started with.
      if (data.providerUsed) {
        setActiveModel({ providerUsed: data.providerUsed, modelUsed: data.modelUsed ?? "" });
      }
      if (data.note) {
        setHandovers((prev) => (prev.includes(data.note!) ? prev : [...prev, data.note!]));
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

  /**
   * Stop waiting. Closing the EventSource is what the server sees, and it stops
   * the save rather than the generation — a local model already mid-answer keeps
   * going on the machine, but its result is discarded rather than landing on a
   * job the user has moved on from.
   *
   * Cancelling usually means "this is taking too long", which is a question about
   * the model, so the answer offered here is the other models this machine has.
   */
  function cancel() {
    esRef.current?.close();
    setStatus("cancelled");
    if (activeModel?.providerUsed === "ollama") {
      fetch("/api/ai/ollama-models")
        .then((res) => res.json() as Promise<{ models?: string[] }>)
        .then((data) => {
          const others = (data.models ?? []).filter((m) => m !== activeModel.modelUsed);
          setLocalModels(others);
          setSwitchTo(others[0] ?? "");
        })
        .catch(() => setLocalModels([]));
    }
  }

  async function switchModelAndRetry() {
    if (!switchTo) return;
    setSwitching(true);
    try {
      await fetch("/api/ai/ollama-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: switchTo }),
      });
      router.refresh();
      start();
    } finally {
      setSwitching(false);
    }
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
                {status === "cancelled" && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-border text-xs text-muted">⏹</span>
                )}
                <h2 className="text-sm font-semibold text-ink">
                  {status === "running" && "Evaluating…"}
                  {status === "done" && "Evaluation complete"}
                  {status === "error" && "Evaluation failed"}
                  {status === "cancelled" && "Evaluation cancelled"}
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

                  {handovers.length > 0 && (
                    <ul className="mt-4 grid gap-1">
                      {handovers.map((note) => (
                        <li className="text-xs text-muted line-through decoration-muted/40" key={note}>{note}</li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-4 text-xs font-mono text-muted/60">
                    {activeModel ? `${describeModel(activeModel.modelUsed)} · ${activeModel.providerUsed} · ` : ""}
                    {(elapsedMs / 1000).toFixed(1)}s elapsed
                  </p>

                  <button
                    className="mt-3 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                    onClick={cancel}
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
                  {/* A chain failure is one line per provider, so newlines matter. */}
                  <p className="mb-4 whitespace-pre-line text-sm text-danger">{errorMsg}</p>
                  <div className="flex gap-2">
                    <Button onClick={start}>Retry</Button>
                    <Button onClick={() => close(false)} variant="quiet">Close</Button>
                  </div>
                </>
              )}

              {status === "cancelled" && (
                <>
                  <p className="mb-1 text-sm text-ink">
                    Stopped after {(elapsedMs / 1000).toFixed(1)}s. Nothing was saved.
                  </p>
                  <p className="mb-4 text-xs text-muted">
                    {activeModel
                      ? `${describeModel(activeModel.modelUsed)} may still be finishing ${
                          activeModel.providerUsed === "ollama" ? "on your machine" : `at ${activeModel.providerUsed}`
                        } — its answer is discarded.`
                      : "The run was stopped before a model answered."}
                  </p>

                  {/* Cancelling a local run is usually a verdict on the model's
                      speed, so the models this machine already has are the answer
                      worth offering — not a trip to Settings. */}
                  {localModels.length > 0 && (
                    <div className="mb-4 grid gap-2 rounded-control border border-border bg-surface px-3 py-3">
                      <label className="text-xs font-medium text-ink" htmlFor="switch-local-model">
                        Try a different local model
                      </label>
                      <select
                        className="rounded-control border border-border bg-panel px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                        id="switch-local-model"
                        onChange={(e) => setSwitchTo(e.target.value)}
                        value={switchTo}
                      >
                        {localModels.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                      <p className="text-xs text-muted">
                        Smaller models answer faster. This becomes your Ollama model in Settings.
                      </p>
                      <Button disabled={switching || !switchTo} onClick={switchModelAndRetry}>
                        {switching ? "Switching…" : "Switch and evaluate again"}
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={start} variant={localModels.length > 0 ? "quiet" : "primary"}>
                      Try again
                    </Button>
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
