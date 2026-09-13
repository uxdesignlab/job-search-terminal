"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ResumeBuilderSection, ResumeBuilderVersionStatus, ResumeRecord, ResumeSectionMode, ResumeSectionModeInput } from "@/lib/db/types";

type StageName = "preparing" | "writing" | "checking" | "saving";

type StageState = {
  status: "pending" | "running" | "done";
  provider?: string;
  model?: string;
  detail?: string;
};

type StreamEvent =
  | { type: "stage"; stage: StageName; status: "started" | "done"; provider?: string; model?: string; detail?: string; notice?: string; elapsedMs: number }
  | { type: "complete"; documentId: string; notice?: string }
  | { type: "error"; error: string; code?: string };

const STAGE_ORDER: StageName[] = ["preparing", "writing", "checking", "saving"];

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  ollama: "your local model",
};

function stageLabel(stage: StageName, state: StageState): string {
  if (stage === "preparing") {
    if (state.detail === "reused") return "Used this job's saved posting analysis";
    if (state.detail === "unavailable") return "Posting analysis unavailable — using saved keywords";
    return state.status === "done" ? "Read the posting" : "Reading the posting";
  }
  if (stage === "writing") return state.status === "done" ? "Wrote the tailored sections" : "Writing the tailored sections";
  if (stage === "checking") return state.status === "done" ? "Checked claims and keywords" : "Checking claims and keywords";
  return state.status === "done" ? "Saved the draft" : "Saving the draft";
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

function initialStages(): Record<StageName, StageState> {
  return { preparing: { status: "pending" }, writing: { status: "pending" }, checking: { status: "pending" }, saving: { status: "pending" } };
}

type Props = {
  jobId: string;
  /** How long the last draft for this job took and on what, for an honest expectation. */
  lastGeneration?: { ms: number; provider: string };
  resumes: ResumeRecord[];
  recommendedResume: string;
  hasExistingDocument: boolean;
  resumeVersions: Record<string, {
    status: ResumeBuilderVersionStatus;
    sections: ResumeBuilderSection[];
  }>;
};

export function ResumeGeneratorModal({ jobId, resumes, recommendedResume, hasExistingDocument, resumeVersions, lastGeneration }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const rec = resumes.find((r) => r.name === recommendedResume);
    return rec?.id ?? resumes[0]?.id ?? "";
  });
  const [status, setStatus] = useState<"idle" | "generating" | "error">("idle");
  const [error, setError] = useState("");
  const [sectionModes, setSectionModes] = useState<Record<string, ResumeSectionMode>>({});
  const [stages, setStages] = useState<Record<StageName, StageState>>(initialStages);
  const [notice, setNotice] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A ticking clock, not a progress bar: each stage is one long call with nothing
  // partial to report, and a percentage would be invented.
  useEffect(() => {
    if (status !== "generating") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function openModal() {
    // Reset recommended selection in case resumes changed
    const rec = resumes.find((r) => r.name === recommendedResume);
    setSelectedId(rec?.id ?? resumes[0]?.id ?? "");
    setStatus("idle");
    setError("");
    setOpen(true);
  }

  function applyStage(event: Extract<StreamEvent, { type: "stage" }>) {
    setStages((prev) => {
      const next = { ...prev };
      // Starting a stage means every earlier one has finished, including one that
      // reported nothing because it had nothing to do.
      for (const earlier of STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(event.stage))) {
        if (next[earlier].status !== "done") next[earlier] = { ...next[earlier], status: "done" };
      }
      const current = next[event.stage];
      next[event.stage] = {
        status: event.status === "done" ? "done" : "running",
        provider: event.provider ?? current.provider,
        model: event.model ?? current.model,
        detail: event.detail ?? current.detail,
      };
      return next;
    });
    if (event.notice) setNotice(event.notice);
  }

  async function generate() {
    if (!selectedId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("generating");
    setError("");
    setNotice("");
    setStages(initialStages());
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const res = await fetch("/api/resume/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, resumeId: selectedId, sectionModes: buildSectionModes() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Generation failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as StreamEvent;
          if (event.type === "stage") applyStage(event);
          if (event.type === "complete") {
            router.push(`/generated-documents/${event.documentId}/edit`);
            return;
          }
          if (event.type === "error") {
            // The banner reads provider credit status on the server; refresh so it
            // appears now rather than on the next page load.
            if (event.code === "ai_credits_exhausted") router.refresh();
            throw new Error(event.error);
          }
        }
      }
      throw new Error("Generation stopped before it finished. Try again.");
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  if (resumes.length === 0) return null;

  const selectedVersion = selectedId ? resumeVersions[selectedId] : undefined;
  const selectedApproved = selectedVersion?.status === "approved";

  function defaultModeFor(section: ResumeBuilderSection): ResumeSectionMode {
    if (sectionModes[section.id]) return sectionModes[section.id];
    if (section.type === "summary" || section.type === "impact" || section.type === "experience") return "update";
    return "keep";
  }

  function buildSectionModes(): ResumeSectionModeInput[] {
    return (selectedVersion?.sections ?? []).map((section) => ({
      sectionId: section.id,
      mode: defaultModeFor(section)
    }));
  }

  return (
    <>
      <Button onClick={openModal} variant="secondary">
        {hasExistingDocument ? "Regenerate resume" : "Generate tailored resume"}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && status !== "generating") setOpen(false);
          }}
        >
          <div ref={dialogRef} className="w-full max-w-md rounded-2xl bg-panel shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
              <h2 className="text-sm font-semibold text-ink">{status === "generating" ? "Generating tailored resume" : "Select base resume"}</h2>
              {status !== "generating" && (
                <button
                  aria-label="Close"
                  className="text-muted transition-colors hover:text-ink"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {status === "generating" ? (
                <div aria-live="polite" className="grid gap-4 py-1" role="status">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-ink">Building your tailored resume</p>
                    {/* Out of the live region: a clock that changes every second would be read
                        aloud every second. The stages announce; the time is there to look at. */}
                    <p aria-live="off" className="text-xs tabular-nums text-muted">
                      <span className="sr-only">Elapsed </span>{formatElapsed(Math.max(0, now - startedAt))}
                    </p>
                  </div>
                  <ol className="grid gap-2">
                    {STAGE_ORDER.map((stage) => {
                      const state = stages[stage];
                      const who = state.provider
                        ? `${PROVIDER_LABELS[state.provider] ?? state.provider}${state.model ? ` · ${state.model}` : ""}`
                        : "";
                      return (
                        <li className="flex items-start gap-2 text-sm" key={stage}>
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              state.status === "done" ? "bg-success" : state.status === "running" ? "animate-pulse bg-accent" : "bg-border"
                            }`}
                          />
                          <span className={state.status === "pending" ? "text-muted" : "text-ink"}>
                            {stageLabel(stage, state)}
                            {state.status === "running" && stage === "writing" && state.detail ? (
                              <span className="block text-xs text-muted">{state.detail}</span>
                            ) : null}
                            {state.status === "running" && who ? (
                              <span className="block text-xs text-muted">with {who}</span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {notice ? (
                    <p className="rounded-lg border border-warning/35 bg-warning/10 p-3 text-xs text-warning">{notice}</p>
                  ) : null}
                  {lastGeneration && lastGeneration.ms > 0 ? (
                    <p className="text-xs text-muted">
                      The last draft for this job took {formatElapsed(lastGeneration.ms)}
                      {lastGeneration.provider ? ` with ${PROVIDER_LABELS[lastGeneration.provider] ?? lastGeneration.provider}` : ""}.
                    </p>
                  ) : null}
                  <p className="text-xs text-muted">
                    On a local model this can take a few minutes. A cloud model chosen under Settings → AI Provider → Resume writing is usually much faster.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted">
                    Choose which of your uploaded resumes to use as the starting point. The
                    recommended one is pre-selected based on the job evaluation.
                  </p>

                  <ul className="grid gap-2">
                    {resumes.map((resume) => {
                      const isRec = resume.name === recommendedResume;
                      const checked = selectedId === resume.id;
                      return (
                        <li key={resume.id}>
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                              checked
                                ? "border-accent bg-accent/5"
                                : "border-border bg-surface hover:border-accent/40"
                            }`}
                          >
                            <input
                              checked={checked}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--color-accent))]"
                              name="resume"
                              onChange={() => setSelectedId(resume.id)}
                              type="radio"
                              value={resume.id}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-ink">{resume.name}</span>
                                {isRec && (
                                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                                    Recommended
                                  </span>
                                )}
                              </div>
	                              <p className="mt-0.5 text-xs text-muted">
	                                {resume.wordCount > 0 ? `${resume.wordCount} words` : "Uploaded resume"}
	                                {resume.activeStatus ? "" : " · Inactive"}
	                                {resumeVersions[resume.id]?.status === "approved" ? " · Approved" : " · Needs builder review"}
	                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
	                  </ul>

	                  {hasExistingDocument && (
	                    <p className="mt-4 rounded-lg border border-warning/35 bg-warning/10 p-3 text-xs text-ink">
	                      This replaces the current draft for this job, including any edits you made to it. To change one
	                      section instead, open the draft and use ↻ Regenerate on that section.
	                    </p>
	                  )}

	                  {selectedVersion && selectedApproved ? (
	                    <div className="mt-5 rounded-lg border border-border bg-surface p-3">
	                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Sections for this resume</p>
	                      <div className="grid gap-2">
	                        {selectedVersion.sections.map((section) => (
	                          <label className="grid gap-1 text-xs text-muted sm:grid-cols-[1fr_8rem]" key={section.id}>
	                            <span className="min-w-0 truncate text-ink">{section.title}</span>
	                            <select
	                              className="rounded-control border border-border bg-panel px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
	                              disabled={section.type === "header"}
	                              onChange={(event) => setSectionModes((prev) => ({ ...prev, [section.id]: event.target.value as ResumeSectionMode }))}
	                              value={section.type === "header" ? "keep" : defaultModeFor(section)}
	                            >
	                              <option value="keep">Keep</option>
	                              <option value="update">AI update</option>
	                              <option value="hide">Hide</option>
	                            </select>
	                          </label>
	                        ))}
	                      </div>
	                    </div>
	                  ) : selectedId ? (
	                    <p className="mt-4 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-warning">
	                      Review and approve this resume lane in Profile before generating from it.
	                    </p>
	                  ) : null}

	                  {status === "error" && (
                    <p className="mt-3 text-sm text-danger">{error}</p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {status === "generating" && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
                <p className="text-xs text-muted">Stopping saves nothing.</p>
                <Button onClick={cancel} variant="quiet">
                  Stop
                </Button>
              </div>
            )}
            {status !== "generating" && (
              <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                <Button onClick={() => setOpen(false)} variant="quiet">
                  Cancel
                </Button>
	                <Button disabled={!selectedId || !selectedApproved} onClick={generate}>
	                  Generate
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
