"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import type { GapEvidenceEntry, GapEvidenceStatus } from "@/lib/db/types";
import { gapAsQuestion } from "@/lib/gaps/gap-text";

type Filter = "needs_work" | "addressed" | "all";

/** Mirrors RECURRING_GAP_MIN_ROLES — gaps below this stay on their job page. */
const RECURRING_MIN_ROLES = 2;

type DraftState = {
  loading: boolean;
  text: string;
  basedOn: string[];
  questions: string[];
  draftedBy: "ai" | "heuristic" | null;
};

type EntryState = {
  open: boolean;
  draft: string;
  status: GapEvidenceStatus;
  content: string;
  followUpQuestions: string[];
  rationale: string;
  saving: boolean;
  polishing: boolean;
  justSaved: boolean;
  aiDraft: DraftState;
  /** Set once the user accepts an AI draft, so provenance survives editing. */
  fromAIDraft: boolean;
};

const EMPTY_DRAFT: DraftState = { loading: false, text: "", basedOn: [], questions: [], draftedBy: null };

function initialState(entry: GapEvidenceEntry): EntryState {
  return {
    open: false,
    draft: entry.content,
    status: entry.status,
    content: entry.content,
    followUpQuestions: entry.followUpQuestions,
    rationale: "",
    saving: false,
    polishing: false,
    justSaved: false,
    aiDraft: EMPTY_DRAFT,
    fromAIDraft: false,
  };
}

const STATUS_LABEL: Record<GapEvidenceStatus, string> = {
  addressed: "Answered",
  needs_followup: "Needs detail",
  unanswered: "Not started",
};

const STATUS_TONE: Record<GapEvidenceStatus, "success" | "warning" | "neutral"> = {
  addressed: "success",
  needs_followup: "warning",
  unanswered: "neutral",
};

/* Gap-sentence reduction is shared with the assessor and drafter so the question
   in the panel and the questions the AI asks are derived the same way. */

export function EvidenceBankPanel({ entries }: { entries: GapEvidenceEntry[] }) {
  const [filter, setFilter] = useState<Filter>("needs_work");
  const [states, setStates] = useState<Record<string, EntryState>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.gapText, initialState(entry)]))
  );

  const visible = useMemo(() => {
    return entries.filter((entry) => {
      const status = states[entry.gapText]?.status ?? entry.status;
      if (filter === "all") return true;
      if (filter === "addressed") return status === "addressed";
      // "Needs work" is the finishable list: answers already started, plus
      // untouched gaps that more than one role raised. One-off unanswered gaps
      // are noise here — they belong on the job page that raised them.
      if (status === "needs_followup") return true;
      return status === "unanswered" && entry.jobs.length >= RECURRING_MIN_ROLES;
    });
  }, [entries, filter, states]);

  function update(gapText: string, patch: Partial<EntryState>) {
    setStates((prev) => ({ ...prev, [gapText]: { ...prev[gapText], ...patch } }));
  }

  async function handleDraft(gapText: string) {
    const state = states[gapText];
    update(gapText, { aiDraft: { ...state.aiDraft, loading: true } });
    try {
      const res = await fetch("/api/gaps/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText }),
      });
      const data = await res.json() as {
        draft: string; basedOn: string[]; questions: string[]; draftedBy: "ai" | "heuristic";
      };
      update(gapText, {
        aiDraft: {
          loading: false,
          text: data.draft ?? "",
          basedOn: data.basedOn ?? [],
          questions: data.questions ?? [],
          draftedBy: data.draftedBy,
        },
      });
    } catch {
      update(gapText, { aiDraft: { ...EMPTY_DRAFT, questions: ["Could not reach the AI provider — write the answer yourself, or check Settings → AI Providers."] } });
    }
  }

  function acceptDraft(gapText: string) {
    const state = states[gapText];
    if (!state.aiDraft.text) return;
    update(gapText, {
      draft: state.draft.trim()
        ? `${state.draft.trim()}\n\n${state.aiDraft.text}`
        : state.aiDraft.text,
      aiDraft: EMPTY_DRAFT,
      fromAIDraft: true,
    });
  }

  async function handlePolish(gapText: string) {
    const state = states[gapText];
    if (!state.draft.trim()) return;
    update(gapText, { polishing: true });
    try {
      const res = await fetch("/api/gaps/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText, rawResponse: state.draft }),
      });
      const data = await res.json() as { polishedResponse: string };
      update(gapText, { polishing: false, draft: data.polishedResponse || state.draft });
    } catch {
      update(gapText, { polishing: false });
    }
  }

  async function handleSave(gapText: string) {
    const state = states[gapText];
    const content = state.draft.trim();
    if (!content) return;
    update(gapText, { saving: true });
    try {
      const res = await fetch("/api/gap-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText, content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        qualityStatus: GapEvidenceStatus;
        followUpQuestion: string;
        followUpQuestions?: string[];
        rationale: string;
      };
      update(gapText, {
        saving: false,
        content,
        status: data.qualityStatus,
        followUpQuestions: data.followUpQuestions?.length
          ? data.followUpQuestions
          : (data.followUpQuestion ? [data.followUpQuestion] : []),
        rationale: data.rationale ?? "",
        // A fresh assessment supersedes any draft-time questions still on screen.
        aiDraft: EMPTY_DRAFT,
        justSaved: true,
        // Answered items collapse; ones still short on detail stay open with the
        // follow-up question visible so the next step is obvious.
        open: data.qualityStatus !== "addressed",
      });
      setTimeout(() => update(gapText, { justSaved: false }), 3000);
    } catch {
      update(gapText, { saving: false });
    }
  }

  async function handleClear(gapText: string) {
    update(gapText, { saving: true });
    try {
      const res = await fetch("/api/gap-evidence", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      update(gapText, {
        saving: false, content: "", draft: "", status: "unanswered",
        followUpQuestions: [], rationale: "", aiDraft: EMPTY_DRAFT, fromAIDraft: false,
      });
    } catch {
      update(gapText, { saving: false });
    }
  }

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          description="Gaps and red flags appear here once you evaluate a job. Answer each one once and every future application reuses it."
          title="No gaps identified yet"
        />
      </Card>
    );
  }

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "needs_work", label: "Needs work" },
    { key: "addressed", label: "Answered" },
    { key: "all", label: `Every gap (${entries.length})` },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your gaps and red flags</CardTitle>
        <CardDescription>
          Answer a gap once and every application reuses it. <strong>Needs work</strong> lists answers you
          started plus gaps more than one role raised — gaps a single role raised are better answered on that
          job page.
        </CardDescription>
      </CardHeader>

      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter gaps by status">
        {filters.map(({ key, label }) => (
          <button
            aria-selected={filter === key}
            className={`h-8 rounded-control border px-3 text-xs font-medium transition-colors ${
              filter === key
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-ink"
            }`}
            key={key}
            onClick={() => setFilter(key)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          description="Nothing in this view. Switch filters to see the rest of your gaps."
          title="All clear"
        />
      ) : (
        <ul className="grid gap-2">
          {visible.map((entry) => {
            const state = states[entry.gapText];
            const { status } = state;
            return (
              <li className="rounded-control border border-border bg-surface overflow-hidden" key={entry.gapText}>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-ink">{entry.gapText}</p>
                    {entry.jobs.length > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        Raised in{" "}
                        {entry.jobs.slice(0, 2).map((job, index) => (
                          <span key={job.id}>
                            {index > 0 && ", "}
                            <Link className="text-accent hover:underline" href={`/jobs/${job.id}`}>
                              {job.position} · {job.company}
                            </Link>
                          </span>
                        ))}
                        {entry.jobs.length > 2 && ` and ${entry.jobs.length - 2} more`}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    {state.justSaved && (
                      <span className="text-[11px] font-medium text-success">✓ Saved</span>
                    )}
                    <Badge className="text-[11px] px-2 min-h-0 py-0.5" tone={STATUS_TONE[status]}>
                      {STATUS_LABEL[status]}
                    </Badge>
                    <button
                      className="text-xs text-accent hover:underline whitespace-nowrap"
                      onClick={() => update(entry.gapText, { open: !state.open })}
                      type="button"
                    >
                      {state.open ? "Close" : status === "addressed" ? "Edit" : status === "needs_followup" ? "Add detail" : "Answer"}
                    </button>
                  </div>
                </div>

                {state.open && (
                  <div className="grid gap-3 border-t border-border bg-panel/50 px-3 py-3">
                    <p className="text-sm font-medium text-ink">{gapAsQuestion(entry.gapText)}</p>

                    {/* The single source of open questions. Persisted with the
                        answer and re-read, so it does not change between visits. */}
                    {status === "needs_followup" && state.followUpQuestions.length > 0 && (
                      <div className="rounded-control border border-warning/35 bg-warning/10 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">
                          {state.followUpQuestions.length === 1
                            ? "One thing left"
                            : `${state.followUpQuestions.length} things left`}
                        </p>
                        {state.followUpQuestions.length === 1 ? (
                          <p className="mt-1 text-sm leading-6 text-ink">{state.followUpQuestions[0]}</p>
                        ) : (
                          <ul className="mt-1 grid gap-1 pl-4">
                            {state.followUpQuestions.map((question, index) => (
                              <li className="list-disc text-sm leading-6 text-ink" key={index}>{question}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* ── AI draft ─────────────────────────────────────── */}
                    {state.aiDraft.draftedBy && !state.aiDraft.loading && (
                      <div className="rounded-control border border-accent/40 bg-accent/5 px-3 py-2.5">
                        {state.aiDraft.text ? (
                          <>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                              ✨ AI draft — from your resume, review before saving
                            </p>
                            <p className="mt-1 text-sm leading-6 text-ink">{state.aiDraft.text}</p>
                            {state.aiDraft.basedOn.length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-[11px] font-medium text-muted hover:text-ink">
                                  Based on {state.aiDraft.basedOn.length} item{state.aiDraft.basedOn.length !== 1 ? "s" : ""} from your evidence
                                </summary>
                                <ul className="mt-1.5 grid gap-1 pl-4">
                                  {state.aiDraft.basedOn.map((source, index) => (
                                    <li className="list-disc text-xs leading-5 text-muted" key={index}>{source}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                            <div className="mt-2 flex gap-2">
                              <button
                                className="h-8 rounded-control border border-accent bg-accent px-3 text-xs font-medium text-white hover:bg-[rgb(var(--color-accent-strong))]"
                                onClick={() => acceptDraft(entry.gapText)}
                                type="button"
                              >
                                Use this draft
                              </button>
                              <button
                                className="h-8 rounded-control border border-border bg-surface px-3 text-xs font-medium text-muted hover:text-ink"
                                onClick={() => update(entry.gapText, { aiDraft: EMPTY_DRAFT })}
                                type="button"
                              >
                                Dismiss
                              </button>
                            </div>
                          </>
                        ) : state.followUpQuestions.length > 0 ? (
                          /* Questions already stand above — repeating them here is
                             what made this feel like an interrogation. */
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                            Nothing in your resume covers this yet — answer the question above.
                          </p>
                        ) : (
                          <>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                              Your resume doesn&apos;t cover this yet
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted">
                              {state.aiDraft.questions.length === 1 ? "Answer this and the gap is closed:" : "Answer these and the gap is closed:"}
                            </p>
                            <ul className="mt-1.5 grid gap-1 pl-4">
                              {state.aiDraft.questions.map((question, index) => (
                                <li className="list-disc text-sm leading-6 text-ink" key={index}>{question}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}

                    <textarea
                      aria-label={`Your answer for: ${entry.gapText}`}
                      className="min-h-24 w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      onChange={(event) => update(entry.gapText, { draft: event.target.value })}
                      placeholder="Where did this happen, what did you personally do, at what scale, and what was the result?"
                      value={state.draft}
                    />

                    {state.fromAIDraft && (
                      <p className="text-[11px] text-muted">
                        Contains an AI draft built from your resume — check every claim is true before saving.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-8 h-8 px-3 text-xs"
                        disabled={state.saving || state.polishing || !state.draft.trim()}
                        onClick={() => handleSave(entry.gapText)}
                      >
                        {state.saving ? "Saving…" : "Save to profile"}
                      </Button>
                      <button
                        className="h-8 rounded-control border border-accent/50 bg-accent/5 px-3 text-xs font-medium text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={state.aiDraft.loading || state.saving}
                        onClick={() => handleDraft(entry.gapText)}
                        type="button"
                      >
                        {state.aiDraft.loading ? "Reading your resume…" : "Draft with AI"}
                      </button>
                      <button
                        className="h-8 rounded-control border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={state.polishing || state.saving || !state.draft.trim()}
                        onClick={() => handlePolish(entry.gapText)}
                        type="button"
                      >
                        {state.polishing ? "Polishing…" : "Polish wording"}
                      </button>
                      {state.content && (
                        <button
                          className="h-8 rounded-control border border-danger/30 px-3 text-xs font-medium text-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={state.saving}
                          onClick={() => handleClear(entry.gapText)}
                          type="button"
                        >
                          Clear everywhere
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-muted">
                      Saved answers are reused across every application — including future ones that raise this same gap.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
