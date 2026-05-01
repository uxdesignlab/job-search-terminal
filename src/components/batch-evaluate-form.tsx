"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { JobRecord } from "@/lib/db/types";

type JobRowStatus = "idle" | "loading" | "done" | "error";

type BatchEvaluateFormProps = {
  jobs: JobRecord[];
};

function toneForRecommendation(r: string) {
  if (r === "Priority apply" || r === "Strong apply") return "success" as const;
  if (r === "Skip") return "danger" as const;
  return "warning" as const;
}

export function BatchEvaluateForm({ jobs }: BatchEvaluateFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobStatus, setJobStatus] = useState<Record<string, JobRowStatus>>({});
  const [running, setRunning] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === jobs.length ? new Set() : new Set(jobs.map((j) => j.id))));

  const evaluate = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setRunning(true);

    for (const id of ids) {
      setJobStatus((s) => ({ ...s, [id]: "loading" }));
      try {
        const res = await fetch(`/api/evaluate/${id}`);
        if (!res.ok) throw new Error("Failed");
        // consume the SSE stream fully
        const reader = res.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let done = false;
          while (!done) {
            const chunk = await reader.read();
            done = chunk.done;
            const text = decoder.decode(chunk.value ?? new Uint8Array());
            if (text.includes('"done":true')) break;
          }
        }
        setJobStatus((s) => ({ ...s, [id]: "done" }));
      } catch {
        setJobStatus((s) => ({ ...s, [id]: "error" }));
      }
    }

    setRunning(false);
    setSelected(new Set());
    router.refresh();
  }, [selected, router]);

  const selectedCount = selected.size;

  return (
    <div className="relative">
      <div className="overflow-x-auto" role="region" aria-label="Jobs table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 pr-3 text-left">
                <input
                  aria-label="Select all jobs"
                  checked={selectedCount === jobs.length && jobs.length > 0}
                  className="h-4 w-4 rounded border-border"
                  onChange={toggleAll}
                  type="checkbox"
                />
              </th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Role</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Location</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Fit</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Status</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Action</th>
              <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Eval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.map((job) => {
              const status = jobStatus[job.id];
              return (
                <tr
                  key={job.id}
                  className={
                    selected.has(job.id)
                      ? "bg-accent/5"
                      : status === "done"
                        ? "bg-success/5"
                        : status === "error"
                          ? "bg-danger/5"
                          : undefined
                  }
                >
                  <td className="py-3 pr-3">
                    <input
                      aria-label={`Select ${job.title} at ${job.company}`}
                      checked={selected.has(job.id)}
                      className="h-4 w-4 rounded border-border"
                      disabled={running}
                      onChange={() => toggle(job.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                      {job.title}
                    </Link>
                    <p className="text-xs text-muted">{job.company}</p>
                  </td>
                  <td className="py-3 pr-4 text-muted">{job.location}</td>
                  <td className="py-3 pr-4">{job.fitScore}%</td>
                  <td className="py-3 pr-4 text-muted">{job.status}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={toneForRecommendation(job.recommendation)}>{job.recommendation}</Badge>
                  </td>
                  <td className="py-3">
                    {status === "loading" && <span className="animate-pulse text-xs text-muted">Evaluating…</span>}
                    {status === "done" && <span className="text-xs text-success">Done</span>}
                    {status === "error" && <span className="text-xs text-danger">Error</span>}
                    {!status && job.url && (
                      <a className="text-xs font-medium text-accent hover:underline" href={job.url} rel="noreferrer" target="_blank">
                        ↗
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedCount > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between rounded-panel border border-accent/40 bg-panel px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-ink">
            {selectedCount} job{selectedCount !== 1 ? "s" : ""} selected
          </p>
          <div className="flex gap-2">
            <Button disabled={running} onClick={evaluate} type="button">
              {running ? "Evaluating…" : `Evaluate ${selectedCount}`}
            </Button>
            <Button disabled={running} onClick={() => setSelected(new Set())} type="button" variant="quiet">
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
