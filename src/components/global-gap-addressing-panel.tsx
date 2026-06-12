"use client";

import { useState } from "react";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, Modal } from "@/components/ui";

type TopGap = { gap: string; count: number };
type QualityStatus = "addressed" | "needs_followup";
type Supplement = {
  id: string;
  content: string;
  tags: string[];
  qualityStatus: QualityStatus;
  followUpQuestion: string;
};

type GapState = {
  open: boolean;
  draft: string;
  saving: boolean;
  polishing: boolean;
  polishedText: string;
  supplementId: string | null;
  savedContent: string;
  qualityStatus: QualityStatus;
  followUpQuestion: string;
  followUpOpen: boolean;
  followUpDraft: string;
};

type Props = {
  topGaps: TopGap[];
  initialSupplements: Supplement[];
};

function suggestedPromptFor(gapText: string): string {
  const cleaned = gapText
    .replace(/^(no\s+explicit\s+(evidence|proof)\s+of|no\s+direct\s+evidence\s+of|no\s+evidence\s+of|no\s+|lacks?\s+|missing\s+|limited\s+|lack\s+of\s+)/i, "")
    .replace(/\.$/, "")
    .toLowerCase();
  return `What experience do you have with ${cleaned}?`;
}

function findSupplementForGap(supplements: Supplement[], gapText: string): Supplement | undefined {
  return supplements.find((s) => s.tags.includes(gapText));
}

export function GlobalGapAddressingPanel({ topGaps, initialSupplements }: Props) {
  const [, setSupplements] = useState<Supplement[]>(initialSupplements);
  const [states, setStates] = useState<Record<string, GapState>>(() =>
    Object.fromEntries(
      topGaps.map(({ gap }) => {
        const existing = findSupplementForGap(initialSupplements, gap);
        return [
          gap,
          {
            open: false,
            draft: existing?.content ?? "",
            saving: false,
            polishing: false,
            polishedText: "",
            supplementId: existing?.id ?? null,
            savedContent: existing?.content ?? "",
            qualityStatus: existing?.qualityStatus ?? "addressed",
            followUpQuestion: existing?.followUpQuestion ?? "",
            followUpOpen: false,
            followUpDraft: "",
          },
        ];
      })
    )
  );

  function update(gap: string, patch: Partial<GapState>) {
    setStates((prev) => ({ ...prev, [gap]: { ...prev[gap], ...patch } }));
  }

  function toggleOpen(gap: string) {
    update(gap, { open: !states[gap].open });
  }

  async function saveSupplement(gap: string, content: string) {
    const s = states[gap];
    if (s.supplementId) {
      const res = await fetch(`/api/profile-supplements/${s.supplementId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, tags: [gap] }),
        });
      const data = await res.json() as { qualityStatus: QualityStatus; followUpQuestion: string };
      return { id: s.supplementId, ...data };
    }

    const res = await fetch("/api/profile-supplements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, tags: [gap] }),
        });
    return await res.json() as { id: string; qualityStatus: QualityStatus; followUpQuestion: string };
  }

  async function handleSave(gap: string) {
    const s = states[gap];
    if (!s.draft.trim()) return;
    update(gap, { saving: true });

    try {
      const content = s.draft.trim();
      const data = await saveSupplement(gap, content);
      const nextSupplement = {
        id: data.id,
        content,
        tags: [gap],
        qualityStatus: data.qualityStatus,
        followUpQuestion: data.followUpQuestion,
      };
      setSupplements((prev) =>
        prev.some((sup) => sup.id === data.id)
          ? prev.map((sup) => (sup.id === data.id ? nextSupplement : sup))
          : [nextSupplement, ...prev]
      );
      update(gap, {
        saving: false,
        supplementId: data.id,
        savedContent: content,
        qualityStatus: data.qualityStatus,
        followUpQuestion: data.followUpQuestion,
        followUpOpen: data.qualityStatus === "needs_followup",
        open: data.qualityStatus === "needs_followup",
      });
    } catch {
      update(gap, { saving: false });
    }
  }

  async function handleFollowUpSave(gap: string) {
    const s = states[gap];
    if (!s.followUpDraft.trim()) return;
    const combined = `${(s.savedContent || s.draft).trim()}\n\nAdditional detail: ${s.followUpDraft.trim()}`;
    update(gap, { saving: true });
    try {
      const data = await saveSupplement(gap, combined);
      update(gap, {
        saving: false,
        draft: combined,
        savedContent: combined,
        supplementId: data.id,
        qualityStatus: data.qualityStatus,
        followUpQuestion: data.followUpQuestion,
        followUpOpen: data.qualityStatus === "needs_followup",
        followUpDraft: "",
        open: data.qualityStatus === "needs_followup",
      });
    } catch {
      update(gap, { saving: false });
    }
  }

  async function handlePolish(gap: string) {
    const s = states[gap];
    if (!s.draft.trim()) return;
    update(gap, { polishing: true });
    try {
      const assessment = await saveSupplement(gap, s.draft.trim());
      if (assessment.qualityStatus === "needs_followup") {
        update(gap, {
          polishing: false,
          supplementId: assessment.id,
          savedContent: s.draft.trim(),
          qualityStatus: assessment.qualityStatus,
          followUpQuestion: assessment.followUpQuestion,
          followUpOpen: true,
        });
        return;
      }
      const res = await fetch("/api/gaps/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText: gap, rawResponse: s.draft }),
      });
      const data = await res.json() as { polishedResponse: string };
      const polished = data.polishedResponse || s.draft;
      await saveSupplement(gap, polished);
      update(gap, {
        polishing: false,
        polishedText: polished,
        draft: polished,
        savedContent: polished,
        qualityStatus: "addressed",
        followUpQuestion: "",
      });
    } catch {
      update(gap, { polishing: false });
    }
  }

  async function handleClear(gap: string) {
    const s = states[gap];
    if (!s.supplementId) return;
    await fetch(`/api/profile-supplements/${s.supplementId}`, { method: "DELETE" });
    setSupplements((prev) => prev.filter((sup) => sup.id !== s.supplementId));
    update(gap, {
      supplementId: null,
      savedContent: "",
      draft: "",
      qualityStatus: "addressed",
      followUpQuestion: "",
      followUpOpen: false,
      followUpDraft: "",
      open: false,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top gap patterns</CardTitle>
        <CardDescription>Most common skill gaps across evaluated roles.</CardDescription>
      </CardHeader>
      {topGaps.length > 0 ? (
        <ol className="grid gap-2">
          {topGaps.map(({ gap, count }, i) => {
            const s = states[gap];
            const isAddressed = !!s.savedContent && s.qualityStatus === "addressed";
            const needsDetail = !!s.savedContent && s.qualityStatus === "needs_followup";
            return (
              <li key={i} className="rounded-control border border-border bg-surface overflow-hidden">
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <span className="mt-0.5 shrink-0 text-xs font-bold text-muted">{i + 1}</span>
                  <p className="min-w-0 flex-1 text-sm leading-snug text-ink">{gap}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {count > 1 && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        ×{count}
                      </span>
                    )}
                    {isAddressed && (
                      <Badge tone="success" className="text-[11px] px-2 min-h-0 py-0.5">Addressed</Badge>
                    )}
                    {needsDetail && (
                      <Badge tone="warning" className="text-[11px] px-2 min-h-0 py-0.5">Needs detail</Badge>
                    )}
                    <button
                      className="text-xs text-accent hover:underline whitespace-nowrap"
                      onClick={() => toggleOpen(gap)}
                      type="button"
                    >
                      {s.open ? "Close" : isAddressed ? "Edit" : "Address"}
                    </button>
                  </div>
                </div>

                {s.open && (
                  <div className="border-t border-border px-3 py-3 grid gap-3 bg-panel/50">
                    <p className="text-xs text-muted italic">{suggestedPromptFor(gap)}</p>
                    <p className="text-xs text-muted">
                      This will be saved to your profile and used across all job resume generations.
                    </p>
                    {needsDetail && s.followUpQuestion && (
                      <p className="rounded-control border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
                        {s.followUpQuestion}
                      </p>
                    )}

                    {isAddressed && (
                      <div className="rounded-control border border-success/30 bg-success/5 px-3 py-2">
                        <p className="text-[11px] font-semibold text-success mb-1 uppercase tracking-wide">Current response</p>
                        <p className="text-sm text-ink leading-6">{s.savedContent}</p>
                      </div>
                    )}

                    <textarea
                      aria-label={`Profile supplement for ${gap}`}
                      className="min-h-20 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder={isAddressed ? "Update your response…" : "Describe your relevant experience…"}
                      value={s.draft}
                      onChange={(e) => update(gap, { draft: e.target.value })}
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
                        onClick={() => handleSave(gap)}
                        disabled={s.saving || s.polishing || !s.draft.trim()}
                        type="button"
                      >
                        {s.saving ? "Saving…" : "Save to profile"}
                      </button>
                      <button
                        className="h-8 rounded-control border border-accent/50 bg-accent/5 px-3 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handlePolish(gap)}
                        disabled={s.polishing || s.saving || !s.draft.trim()}
                        type="button"
                      >
                        {s.polishing ? "Polishing…" : "Polish with AI"}
                      </button>
                      {needsDetail && (
                        <button
                          className="h-8 rounded-control border border-warning/40 bg-warning/10 px-3 text-xs font-medium text-warning hover:bg-warning/15"
                          onClick={() => update(gap, { followUpOpen: true })}
                          type="button"
                        >
                          Add detail
                        </button>
                      )}
                      {isAddressed && (
                        <button
                          className="h-8 rounded-control border border-danger/30 px-3 text-xs font-medium text-danger hover:bg-danger/5"
                          onClick={() => handleClear(gap)}
                          type="button"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <Modal
                  open={s.followUpOpen}
                  onClose={() => update(gap, { followUpOpen: false, followUpDraft: "" })}
                  title="Add evidence detail"
                  description={s.followUpQuestion || suggestedPromptFor(gap)}
                  size="md"
                  footer={
                    <div className="flex justify-end gap-2">
                      <button
                        className="h-9 rounded-control border border-transparent px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
                        onClick={() => update(gap, { followUpOpen: false, followUpDraft: "" })}
                        type="button"
                      >
                        Later
                      </button>
                      <button
                        className="h-9 rounded-control border border-accent bg-accent px-3 text-sm font-medium text-white hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={s.saving || !s.followUpDraft.trim()}
                        onClick={() => handleFollowUpSave(gap)}
                        type="button"
                      >
                        {s.saving ? "Saving…" : "Save detail"}
                      </button>
                    </div>
                  }
                >
                  <div className="grid gap-3 px-5 py-4">
                    <div className="rounded-control border border-border bg-surface px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Saved draft</p>
                      <p className="mt-1 text-sm leading-6 text-ink">{s.savedContent || s.draft}</p>
                    </div>
                    <textarea
                      aria-label="Follow-up detail"
                      autoFocus
                      className="min-h-24 w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      onChange={(event) => update(gap, { followUpDraft: event.target.value })}
                      placeholder="Add the role, project, your action, and the result..."
                      value={s.followUpDraft}
                    />
                  </div>
                </Modal>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState description="Gap patterns are extracted from job evaluations." title="No gap data yet" />
      )}
    </Card>
  );
}
