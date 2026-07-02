"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import type { ConsolidationCluster, ConsolidationPayload } from "@/lib/db/types";

type ClusterDraft = ConsolidationCluster & { approved: boolean };

type Props = {
  suggestionCount: number;
  initialRunId: string | null;
  initialPayload: ConsolidationPayload | null;
};

type Phase = "idle" | "analyzing" | "review" | "committing" | "done";

const STAR_FIELDS: Array<{ key: keyof ConsolidationCluster["canonical"]; label: string }> = [
  { key: "situation", label: "Situation" },
  { key: "task", label: "Task" },
  { key: "action", label: "Action" },
  { key: "result", label: "Result" },
  { key: "reflection", label: "Reflection" },
];

export function ConsolidationWizard({ suggestionCount, initialRunId, initialPayload }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(initialPayload ? "review" : "idle");
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [clusters, setClusters] = useState<ClusterDraft[]>(
    (initialPayload?.clusters ?? []).map((c) => ({ ...c, approved: true }))
  );
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ createdStories: number; removedSuggestions: number } | null>(null);

  const analyze = async () => {
    setPhase("analyzing");
    setError("");
    try {
      const res = await fetch("/api/interview/consolidate/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setRunId(data.runId);
      setClusters((data.payload as ConsolidationPayload).clusters.map((c) => ({ ...c, approved: true })));
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  };

  const updateCanonical = (idx: number, key: keyof ConsolidationCluster["canonical"], value: string) => {
    setClusters((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, canonical: { ...c.canonical, [key]: key === "tags" ? value.split(",").map((t) => t.trim()).filter(Boolean) : value } } : c))
    );
  };

  const toggleApproved = (idx: number) => {
    setClusters((prev) => prev.map((c, i) => (i === idx ? { ...c, approved: !c.approved } : c)));
  };

  const commit = async () => {
    if (!runId) return;
    setPhase("committing");
    setError("");
    try {
      const approved = clusters
        .filter((c) => c.approved)
        .map((c) => ({ canonical: c.canonical, memberIds: c.members.map((m) => m.id) }));
      const res = await fetch("/api/interview/consolidate/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Commit failed");
      setSummary({ createdStories: data.createdStories, removedSuggestions: data.removedSuggestions });
      setPhase("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("review");
    }
  };

  const approvedCount = clusters.filter((c) => c.approved).length;

  if (phase === "done" && summary) {
    return (
      <div className="rounded-control border border-success/40 bg-success/5 p-5">
        <p className="text-sm font-semibold text-ink">Consolidation complete</p>
        <p className="mt-1 text-sm text-muted">
          Created {summary.createdStories} core {summary.createdStories === 1 ? "story" : "stories"} and cleared{" "}
          {summary.removedSuggestions} generated {summary.removedSuggestions === 1 ? "suggestion" : "suggestions"} from the bank.
        </p>
        <a
          className="mt-3 inline-block rounded-control border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
          href="/interview-prep"
        >
          Back to Interview Prep
        </a>
      </div>
    );
  }

  if (phase === "idle" || phase === "analyzing") {
    return (
      <div className="grid gap-4">
        <div className="rounded-control border border-border bg-surface p-5">
          <p className="text-sm text-ink">
            You have <span className="font-semibold">{suggestionCount}</span> auto-generated interview suggestions. This wizard groups
            them into a small set of reusable core stories that you review and approve before anything changes. The generated
            suggestions are removed only after you commit.
          </p>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          <button
            className="mt-4 rounded-control border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            disabled={phase === "analyzing" || suggestionCount === 0}
            onClick={analyze}
            type="button"
          >
            {phase === "analyzing" ? "Analyzing… this can take a minute" : "Analyze suggestions"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-panel/95 px-4 py-3 backdrop-blur">
        <p className="text-sm text-ink">
          {clusters.length} proposed core {clusters.length === 1 ? "story" : "stories"} from {clusters.reduce((n, c) => n + c.members.length, 0)} suggestions ·{" "}
          <span className="font-semibold">{approvedCount} approved</span>
        </p>
        <button
          className="rounded-control border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          disabled={phase === "committing" || approvedCount === 0}
          onClick={commit}
          type="button"
        >
          {phase === "committing" ? "Committing…" : `Commit ${approvedCount} ${approvedCount === 1 ? "story" : "stories"}`}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {clusters.map((cluster, idx) => (
        <div
          className={`rounded-control border p-4 ${cluster.approved ? "border-accent/40 bg-surface" : "border-border bg-panel opacity-70"}`}
          key={cluster.key}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <label className="flex flex-1 items-center gap-2">
              <input checked={cluster.approved} onChange={() => toggleApproved(idx)} type="checkbox" />
              <input
                className="min-h-9 flex-1 rounded-control border border-border bg-panel px-2 text-sm font-semibold text-ink"
                onChange={(e) => updateCanonical(idx, "title", e.target.value)}
                value={cluster.canonical.title}
              />
            </label>
            <Badge tone="neutral">{cluster.members.length} merged</Badge>
          </div>

          <div className="grid gap-2">
            {STAR_FIELDS.map((field) => (
              <label className="grid gap-1" key={field.key}>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{field.label}</span>
                <textarea
                  className="min-h-16 rounded-control border border-border bg-panel px-2 py-1.5 text-sm text-ink"
                  onChange={(e) => updateCanonical(idx, field.key, e.target.value)}
                  value={String(cluster.canonical[field.key] ?? "")}
                />
              </label>
            ))}
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tags (comma-separated)</span>
              <input
                className="min-h-9 rounded-control border border-border bg-panel px-2 text-sm text-ink"
                onChange={(e) => updateCanonical(idx, "tags", e.target.value)}
                value={cluster.canonical.tags.join(", ")}
              />
            </label>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-medium text-muted">
              Merged from {cluster.members.length} job-specific {cluster.members.length === 1 ? "suggestion" : "suggestions"}
            </summary>
            <ul className="mt-2 grid gap-1">
              {cluster.members.map((m) => (
                <li className="truncate text-[11px] text-muted" key={m.id}>
                  {m.sourceJobTitle ? <span className="text-ink">{m.sourceJobTitle}: </span> : null}
                  {m.title}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}
