"use client";

import { useEffect, useState } from "react";
import { Badge, Card, CardHeader, CardTitle } from "@/components/ui";

type GapResponse = {
  rawResponse: string;
  polishedResponse: string;
};

type GapState = {
  open: boolean;
  draft: string;
  saving: boolean;
  polishing: boolean;
  polishedText: string;
  savedResponse: string;
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

  async function handleSave(gapText: string) {
    const s = states[gapText] ?? buildGapState(gapText, initialResponses);
    if (!s.draft.trim()) return;
    update(gapText, { saving: true });
    try {
      await fetch(`/api/gaps/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText, rawResponse: s.draft, polish: false }),
      });
      update(gapText, { saving: false, savedResponse: s.draft, open: false });
    } catch {
      update(gapText, { saving: false });
    }
  }

  async function handlePolishAndSave(gapText: string) {
    const s = states[gapText] ?? buildGapState(gapText, initialResponses);
    if (!s.draft.trim()) return;
    update(gapText, { polishing: true });
    try {
      const res = await fetch(`/api/gaps/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText, rawResponse: s.draft, polish: true }),
      });
      const data = await res.json() as { polishedResponse: string };
      update(gapText, {
        polishing: false,
        polishedText: data.polishedResponse || s.draft,
        savedResponse: s.draft,
      });
    } catch {
      update(gapText, { polishing: false });
    }
  }

  async function handleClear(gapText: string) {
    await fetch(`/api/gaps/${jobId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gapText }),
    });
    update(gapText, { savedResponse: "", draft: "", polishedText: "", open: false });
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
          const isAddressed = !!s.savedResponse;
          return (
            <li key={item} className="rounded-control border border-border bg-surface overflow-hidden">
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="flex-1 text-sm text-ink leading-6">{item}</span>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  {isAddressed && (
                    <Badge tone="success" className="text-[11px] px-2 min-h-0 py-0.5">Addressed</Badge>
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

                  <textarea
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
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
