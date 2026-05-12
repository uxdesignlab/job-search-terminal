"use client";

import { useEffect, useState } from "react";
import { Badge, Card, CardHeader, CardTitle } from "@/components/ui";

type GapResponse = {
  rawResponse: string;
  polishedResponse: string;
  qualityStatus: "addressed" | "needs_followup";
  followUpQuestion: string;
};

type GapState = {
  open: boolean;
  draft: string;
  saving: boolean;
  polishing: boolean;
  polishedText: string;
  savedResponse: string;
  qualityStatus: "addressed" | "needs_followup";
  followUpQuestion: string;
  followUpOpen: boolean;
  followUpDraft: string;
};

type Props = {
  jobId: string;
  items: string[];
  initialResponses: Record<string, GapResponse>;
};

function buildGapState(item: string, initialResponses: Record<string, GapResponse>): GapState {
  return {
    open: false,
    draft: initialResponses[item]?.rawResponse ?? "",
    saving: false,
    polishing: false,
    polishedText: initialResponses[item]?.polishedResponse ?? "",
    savedResponse: initialResponses[item]?.rawResponse ?? "",
    qualityStatus: initialResponses[item]?.qualityStatus ?? "addressed",
    followUpQuestion: initialResponses[item]?.followUpQuestion ?? "",
    followUpOpen: false,
    followUpDraft: "",
  };
}

function suggestedPromptFor(gapText: string): string {
  const cleaned = gapText
    .replace(/^(no\s+explicit\s+(evidence|proof)\s+of|no\s+direct\s+evidence\s+of|no\s+evidence\s+of|no\s+|lacks?\s+|missing\s+|limited\s+|lack\s+of\s+)/i, "")
    .replace(/\.$/, "")
    .toLowerCase();
  return `What experience do you have with ${cleaned}?`;
}

export function GapAddressingPanel({ jobId, items, initialResponses }: Props) {
  const [states, setStates] = useState<Record<string, GapState>>(() =>
    Object.fromEntries(items.map((item) => [item, buildGapState(item, initialResponses)]))
  );

  useEffect(() => {
    setStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of items) {
        if (!next[item]) {
          next[item] = buildGapState(item, initialResponses);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items, initialResponses]);

  function update(gapText: string, patch: Partial<GapState>) {
    setStates((prev) => ({
      ...prev,
      [gapText]: { ...(prev[gapText] ?? buildGapState(gapText, initialResponses)), ...patch },
    }));
  }

  function toggleOpen(gapText: string) {
    const current = states[gapText] ?? buildGapState(gapText, initialResponses);
    update(gapText, { open: !current.open });
  }

  async function submitGapAnswer(gapText: string, rawResponse: string, polish: boolean) {
    if (!rawResponse.trim()) return null;
    try {
      const res = await fetch(`/api/gaps/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText, rawResponse, polish }),
      });
      return await res.json() as {
        polishedResponse: string;
        qualityStatus: "addressed" | "needs_followup";
        followUpQuestion: string;
      };
    } catch {
      return null;
    }
  }

  async function handleSave(gapText: string) {
    const s = states[gapText] ?? buildGapState(gapText, initialResponses);
    if (!s.draft.trim()) return;
    update(gapText, { saving: true });
    const data = await submitGapAnswer(gapText, s.draft, false);
    if (!data) {
      update(gapText, { saving: false });
      return;
    }
    if (data.qualityStatus === "needs_followup") {
      update(gapText, {
        saving: false,
        savedResponse: s.draft,
        qualityStatus: data.qualityStatus,
        followUpQuestion: data.followUpQuestion,
        followUpOpen: true,
      });
    } else {
      update(gapText, {
        saving: false,
        savedResponse: s.draft,
        qualityStatus: data.qualityStatus,
        followUpQuestion: "",
        followUpOpen: false,
        followUpDraft: "",
        open: false,
      });
    }
  }

  async function handleFollowUpSave(gapText: string) {
    const s = states[gapText] ?? buildGapState(gapText, initialResponses);
    if (!s.followUpDraft.trim()) return;
    const base = s.savedResponse || s.draft;
    const combined = `${base.trim()}\n\nAdditional detail: ${s.followUpDraft.trim()}`;
    update(gapText, { saving: true });
    const data = await submitGapAnswer(gapText, combined, false);
    if (!data) {
      update(gapText, { saving: false });
      return;
    }
    update(gapText, {
      saving: false,
      draft: combined,
      savedResponse: combined,
      qualityStatus: data.qualityStatus,
      followUpQuestion: data.followUpQuestion,
      followUpOpen: data.qualityStatus === "needs_followup",
      followUpDraft: "",
      open: data.qualityStatus === "needs_followup",
    });
  }

  function closeFollowUp(gapText: string) {
    update(gapText, { followUpOpen: false, followUpDraft: "" });
  }

  async function handlePolishAndSave(gapText: string) {
    const s = states[gapText] ?? buildGapState(gapText, initialResponses);
    if (!s.draft.trim()) return;
    update(gapText, { polishing: true });
    const data = await submitGapAnswer(gapText, s.draft, true);
    if (!data) {
      update(gapText, { polishing: false });
      return;
    }
    if (data.qualityStatus === "needs_followup") {
      update(gapText, {
        polishing: false,
        savedResponse: s.draft,
        qualityStatus: data.qualityStatus,
        followUpQuestion: data.followUpQuestion,
        followUpOpen: true,
      });
    } else {
      update(gapText, {
        polishing: false,
        polishedText: data.polishedResponse || s.draft,
        savedResponse: s.draft,
        qualityStatus: data.qualityStatus,
        followUpQuestion: "",
        followUpOpen: false,
        followUpDraft: "",
      });
    }
  }

  async function handleClear(gapText: string) {
    await fetch(`/api/gaps/${jobId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gapText }),
    });
    update(gapText, {
      savedResponse: "",
      draft: "",
      polishedText: "",
      qualityStatus: "addressed",
      followUpQuestion: "",
      followUpOpen: false,
      followUpDraft: "",
      open: false,
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gaps and red flags</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted">No gaps or red flags identified.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gaps and red flags</CardTitle>
      </CardHeader>
      <ul className="grid gap-2">
        {items.map((item) => {
          const s = states[item] ?? buildGapState(item, initialResponses);
          const isAddressed = !!s.savedResponse && s.qualityStatus === "addressed";
          const needsDetail = !!s.savedResponse && s.qualityStatus === "needs_followup";
          return (
            <li key={item} className="rounded-control border border-border bg-surface overflow-hidden">
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="flex-1 text-sm text-ink leading-6">{item}</span>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  {isAddressed && (
                    <Badge tone="success" className="text-[11px] px-2 min-h-0 py-0.5">Addressed</Badge>
                  )}
                  {needsDetail && (
                    <Badge tone="warning" className="text-[11px] px-2 min-h-0 py-0.5">Needs detail</Badge>
                  )}
                  <button
                    className="text-xs text-accent hover:underline whitespace-nowrap"
                    onClick={() => toggleOpen(item)}
                    type="button"
                  >
                    {s.open ? "Close" : isAddressed ? "Edit" : "Address"}
                  </button>
                </div>
              </div>

              {s.open && (
                <div className="border-t border-border px-3 py-3 grid gap-3 bg-panel/50">
                  <p className="text-xs text-muted italic">{suggestedPromptFor(item)}</p>
                  {needsDetail && s.followUpQuestion && (
                    <p className="rounded-control border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
                      {s.followUpQuestion}
                    </p>
                  )}

                  <textarea
                    aria-label={`Response for ${item}`}
                    className="min-h-20 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="Describe your relevant experience, even briefly..."
                    value={s.draft}
                    onChange={(e) => update(item, { draft: e.target.value })}
                  />

                  {s.polishedText && (
                    <div className="rounded-control border border-success/30 bg-success/5 px-3 py-2">
                      <p className="text-[11px] font-semibold text-success mb-1 uppercase tracking-wide">Polished version</p>
                      <p className="text-sm text-ink leading-6">{s.polishedText}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="h-8 rounded-control border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-panel disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleSave(item)}
                      disabled={s.saving || s.polishing || !s.draft.trim()}
                      type="button"
                    >
                      {s.saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="h-8 rounded-control border border-accent/50 bg-accent/5 px-3 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handlePolishAndSave(item)}
                      disabled={s.polishing || s.saving || !s.draft.trim()}
                      type="button"
                    >
                      {s.polishing ? "Polishing…" : "Polish with AI"}
                    </button>
                    {needsDetail && (
                      <button
                        className="h-8 rounded-control border border-warning/40 bg-warning/10 px-3 text-xs font-medium text-warning hover:bg-warning/15"
                        onClick={() => update(item, { followUpOpen: true })}
                        type="button"
                      >
                        Add detail
                      </button>
                    )}
                    {isAddressed && (
                      <button
                        className="h-8 rounded-control border border-danger/30 px-3 text-xs font-medium text-danger hover:bg-danger/5"
                        onClick={() => handleClear(item)}
                        type="button"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
              {s.followUpOpen && (
                <div
                  aria-modal="true"
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                  role="dialog"
                >
                  <div className="w-full max-w-lg rounded-panel bg-panel shadow-2xl">
                    <div className="border-b border-border px-5 py-4">
                      <h3 className="text-sm font-semibold text-ink">Add evidence detail</h3>
                      <p className="mt-1 text-sm text-muted">{s.followUpQuestion || suggestedPromptFor(item)}</p>
                    </div>
                    <div className="grid gap-3 px-5 py-4">
                      <div className="rounded-control border border-border bg-surface px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Saved draft</p>
                        <p className="mt-1 text-sm leading-6 text-ink">{s.savedResponse || s.draft}</p>
                      </div>
                      <textarea
                        aria-label="Follow-up detail"
                        autoFocus
                        className="min-h-24 w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                        onChange={(event) => update(item, { followUpDraft: event.target.value })}
                        placeholder="Add the role, project, your action, and the result..."
                        value={s.followUpDraft}
                      />
                    </div>
                    <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                      <button
                        className="h-9 rounded-control border border-transparent px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
                        onClick={() => closeFollowUp(item)}
                        type="button"
                      >
                        Later
                      </button>
                      <button
                        className="h-9 rounded-control border border-accent bg-accent px-3 text-sm font-medium text-white hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={s.saving || !s.followUpDraft.trim()}
                        onClick={() => handleFollowUpSave(item)}
                        type="button"
                      >
                        {s.saving ? "Saving…" : "Save detail"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
