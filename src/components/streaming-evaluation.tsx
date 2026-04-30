"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { BlockName } from "@/lib/evaluation/llm-evaluator";

type BlockState = {
  label: string;
  content: string[];
  done: boolean;
};

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

const BLOCK_ORDER: BlockName[] = ["a", "b", "c", "d", "e", "f", "g"];

type Props = {
  jobId: string;
  hasExistingEvaluation: boolean;
};

export function StreamingEvaluation({ jobId, hasExistingEvaluation }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [blocks, setBlocks] = useState<Partial<Record<BlockName, BlockState>>>({});
  const [currentBlock, setCurrentBlock] = useState<string>("");
  const [completeSummary, setCompleteSummary] = useState<CompleteEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const esRef = useRef<EventSource | null>(null);

  function start() {
    setStatus("running");
    setBlocks({});
    setCurrentBlock("Connecting…");
    setErrorMsg("");
    setCompleteSummary(null);

    const es = new EventSource(`/api/evaluate/${jobId}`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as {
        block: BlockName | "complete" | "error";
        label?: string;
        content?: string[];
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
        setCurrentBlock("");
        setCompleteSummary({
          fitScore: data.fitScore ?? 0,
          scoreLabel: data.scoreLabel ?? "",
          recommendation: data.recommendation ?? "",
          roleArchetype: data.roleArchetype ?? "",
          legitimacyLabel: data.legitimacyLabel ?? "",
          providerUsed: data.providerUsed ?? "",
          modelUsed: data.modelUsed ?? "",
          generationMs: data.generationMs ?? 0
        });
        // Refresh the server component to show persisted data
        setTimeout(() => router.refresh(), 800);
        return;
      }

      setCurrentBlock(data.label ?? data.block);
      setBlocks((prev) => ({
        ...prev,
        [data.block]: { label: data.label ?? data.block, content: data.content ?? [], done: true }
      }));
    };

    es.onerror = () => {
      es.close();
      setStatus("error");
      setErrorMsg("Connection lost. Check that an API key is configured in Settings.");
    };
  }

  function cancel() {
    esRef.current?.close();
    setStatus("idle");
    setBlocks({});
    setCurrentBlock("");
  }

  if (status === "idle") {
    return (
      <Button onClick={start} variant="primary">
        {hasExistingEvaluation ? "Re-evaluate with AI" : "Evaluate with AI"}
      </Button>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Progress header */}
      <div className="flex items-center justify-between rounded-control border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          {status === "running" && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
          )}
          {status === "done" && (
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)]" />
          )}
          {status === "error" && (
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-danger)]" />
          )}
          <span className="text-sm text-ink">
            {status === "running" && `Generating ${currentBlock}…`}
            {status === "done" && "Evaluation complete — refreshing…"}
            {status === "error" && errorMsg}
          </span>
        </div>
        {status === "running" && (
          <button className="text-xs text-muted hover:text-ink" onClick={cancel} type="button">
            Cancel
          </button>
        )}
      </div>

      {/* Complete summary */}
      {completeSummary && (
        <div className="rounded-control border border-border bg-surface px-4 py-3 grid gap-1">
          <p className="text-sm font-semibold text-ink">
            {completeSummary.roleArchetype} · {completeSummary.fitScore}% · {completeSummary.recommendation}
          </p>
          <p className="text-xs text-muted">
            {completeSummary.providerUsed} / {completeSummary.modelUsed} · {(completeSummary.generationMs / 1000).toFixed(1)}s
          </p>
        </div>
      )}

      {/* Streaming blocks */}
      <div className="grid gap-3 lg:grid-cols-2">
        {BLOCK_ORDER.map((blockKey) => {
          const block = blocks[blockKey];
          const isActive = status === "running" && !block && currentBlock !== "Connecting…";
          return (
            <div
              className={`rounded-control border bg-surface px-4 py-3 transition-opacity duration-300 ${block ? "border-border opacity-100" : "border-border/40 opacity-40"}`}
              key={blockKey}
            >
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                {block?.label ?? `Block ${blockKey.toUpperCase()}`}
                {isActive && !block && <span className="ml-2 animate-pulse">…</span>}
              </p>
              {block ? (
                <ul className="grid gap-1">
                  {block.content.slice(0, 6).map((line, i) => (
                    <li className="text-sm text-ink leading-5" key={i}>
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid gap-1">
                  {[...Array(3)].map((_, i) => (
                    <div className="h-3 rounded bg-border/60 animate-pulse" key={i} style={{ width: `${70 + (i % 3) * 10}%` }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
