"use client";

import { useState } from "react";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui";

type TopGap = { gap: string; count: number };
type Supplement = { id: string; content: string; tags: string[] };

type GapState = {
  open: boolean;
  draft: string;
  saving: boolean;
  polishing: boolean;
  polishedText: string;
  supplementId: string | null;
  savedContent: string;
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

  async function handleSave(gap: string) {
    const s = states[gap];
    if (!s.draft.trim()) return;
    update(gap, { saving: true });

    try {
      if (s.supplementId) {
        await fetch(`/api/profile-supplements/${s.supplementId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: s.draft.trim(), tags: [gap] }),
        });
        setSupplements((prev) =>
          prev.map((sup) =>
            sup.id === s.supplementId ? { ...sup, content: s.draft.trim() } : sup
          )
        );
        update(gap, { saving: false, savedContent: s.draft.trim(), open: false });
      } else {
        const res = await fetch("/api/profile-supplements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: s.draft.trim(), tags: [gap] }),
        });
        const data = await res.json() as { id: string };
        const newSupplement = { id: data.id, content: s.draft.trim(), tags: [gap] };
        setSupplements((prev) => [newSupplement, ...prev]);
        update(gap, { saving: false, supplementId: data.id, savedContent: s.draft.trim(), open: false });
      }
    } catch {
      update(gap, { saving: false });
    }
  }

  async function handlePolish(gap: string) {
    const s = states[gap];
    if (!s.draft.trim()) return;
    update(gap, { polishing: true });
    try {
      const res = await fetch("/api/gaps/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText: gap, rawResponse: s.draft }),
      });
      const data = await res.json() as { polishedResponse: string };
      update(gap, { polishing: false, polishedText: data.polishedResponse || s.draft, draft: data.polishedResponse || s.draft });
    } catch {
      update(gap, { polishing: false });
    }
  }

  async function handleClear(gap: string) {
    const s = states[gap];
    if (!s.supplementId) return;
    await fetch(`/api/profile-supplements/${s.supplementId}`, { method: "DELETE" });
    setSupplements((prev) => prev.filter((sup) => sup.id !== s.supplementId));
    update(gap, { supplementId: null, savedContent: "", draft: "", open: false });
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
            const isAddressed = !!s.savedContent;
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

                    {isAddressed && (
                      <div className="rounded-control border border-success/30 bg-success/5 px-3 py-2">
                        <p className="text-[11px] font-semibold text-success mb-1 uppercase tracking-wide">Current response</p>
                        <p className="text-sm text-ink leading-6">{s.savedContent}</p>
                      </div>
                    )}

                    <textarea
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
