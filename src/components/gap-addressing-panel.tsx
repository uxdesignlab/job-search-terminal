"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Card, CardHeader, CardTitle } from "@/components/ui";

type GapResponse = {
  rawResponse: string;
  polishedResponse: string;
  qualityStatus: "addressed" | "needs_followup";
  followUpQuestion: string;
};

type PerGapState = {
  savedResponse: string;
  polishedResponse: string;
  qualityStatus: "addressed" | "needs_followup";
  followUpQuestion: string;
};

type Company = { name: string; dateRange: string };

type ModalState = {
  gapText: string;
  selectedCompanies: Set<string>;
  description: string;
  metrics: string;
  phase: "main" | "followup";
  followUpDraft: string;
  saving: boolean;
  polishing: boolean;
  wasPolished: boolean;  // shows "AI-polished" hint after Polish completes
};

type Props = {
  jobId: string;
  items: string[];
  initialResponses: Record<string, GapResponse>;
};

function parseExistingResponse(text: string): { companies: string[]; description: string; metrics: string } {
  let remaining = text.trim();
  const companies: string[] = [];
  let metrics = "";

  // Strip leading "At Company1, Company2: " prefix
  const companyMatch = remaining.match(/^At ([^:]+):\s*/);
  if (companyMatch) {
    companies.push(...companyMatch[1].split(",").map((c) => c.trim()).filter(Boolean));
    remaining = remaining.slice(companyMatch[0].length);
  }

  // Strip "Key results: ..." line (only the first occurrence in the main body)
  const metricsMatch = remaining.match(/^([\s\S]*?)\nKey results:\s*([^\n]+)/);
  if (metricsMatch) {
    remaining = metricsMatch[1].trim();
    metrics = metricsMatch[2].trim();
  }

  return { companies, description: remaining.trim(), metrics };
}

function buildPrefillFrom(gapText: string): string {
  // Strip "the resume evidence shows..." half (after the first semicolon)
  const core = gapText.split(/;\s*/)[0].trim();

  const cleaned = core
    .replace(/^the posting requires?\s+(?:\d+\+?\s*years?\s+(?:of\s+)?)?/i, "")
    .replace(/^requires?\s+(?:\d+\+?\s*years?\s+(?:of\s+)?)?/i, "")
    .replace(/^the role requires?\s*/i, "")
    .replace(/^no explicit (?:evidence|proof) of\s*/i, "")
    .replace(/^no direct experience (?:with|in)\s*/i, "")
    .replace(/^no evidence of\s*/i, "")
    .replace(/^lacks?\s+/i, "")
    .replace(/^limited\s+/i, "")
    .trim();

  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + (cleaned.endsWith(".") ? "" : ".");
}

function buildRawResponse(m: ModalState): string {
  const parts: string[] = [];
  if (m.selectedCompanies.size > 0) {
    const cos = [...m.selectedCompanies].join(", ");
    parts.push(m.description.trim()
      ? `At ${cos}: ${m.description.trim()}`
      : `Experience confirmed at: ${cos}.`);
  } else if (m.description.trim()) {
    parts.push(m.description.trim());
  }
  if (m.metrics.trim()) {
    parts.push(`Key results: ${m.metrics.trim()}`);
  }
  return parts.join("\n");
}

export function GapAddressingPanel({ jobId, items, initialResponses }: Props) {
  const [gapStates, setGapStates] = useState<Record<string, PerGapState>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item,
        {
          savedResponse: initialResponses[item]?.rawResponse ?? "",
          polishedResponse: initialResponses[item]?.polishedResponse ?? "",
          qualityStatus: initialResponses[item]?.qualityStatus ?? "addressed",
          followUpQuestion: initialResponses[item]?.followUpQuestion ?? "",
        },
      ])
    )
  );

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [bankSavedGap, setBankSavedGap] = useState<string | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Load resume companies once
  useEffect(() => {
    fetch("/api/resume-companies")
      .then((r) => r.json())
      .then((data: { companies?: Company[] }) => {
        setCompanies(data.companies ?? []);
        setCompaniesLoaded(true);
      })
      .catch(() => setCompaniesLoaded(true));
  }, []);

  // Sync new gap items added after mount
  useEffect(() => {
    setGapStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of items) {
        if (!next[item]) {
          next[item] = {
            savedResponse: initialResponses[item]?.rawResponse ?? "",
            polishedResponse: initialResponses[item]?.polishedResponse ?? "",
            qualityStatus: initialResponses[item]?.qualityStatus ?? "addressed",
            followUpQuestion: initialResponses[item]?.followUpQuestion ?? "",
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items, initialResponses]);

  // Close modal on Escape
  useEffect(() => {
    if (!modal) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [modal]);

  // Focus description on modal open
  useEffect(() => {
    if (modal?.phase === "main") {
      setTimeout(() => descRef.current?.focus(), 50);
    }
  }, [modal?.gapText, modal?.phase]);

  function openModal(gapText: string) {
    const existing = gapStates[gapText];
    const hasExisting = !!existing?.savedResponse;

    if (hasExisting) {
      const text = existing.polishedResponse || existing.savedResponse;
      const parsed = parseExistingResponse(text);
      const knownNames = new Set(companies.map((c) => c.name));
      setModal({
        gapText,
        selectedCompanies: new Set(parsed.companies.filter((co) => knownNames.has(co))),
        description: parsed.description || text,
        metrics: parsed.metrics,
        phase: "main",
        followUpDraft: "",
        saving: false,
        polishing: false,
        wasPolished: false,
      });
    } else {
      setModal({
        gapText,
        selectedCompanies: new Set(),
        description: buildPrefillFrom(gapText),
        metrics: "",
        phase: "main",
        followUpDraft: "",
        saving: false,
        polishing: false,
        wasPolished: false,
      });
    }
  }

  function toggleCompany(name: string) {
    if (!modal) return;
    const next = new Set(modal.selectedCompanies);
    if (next.has(name)) next.delete(name); else next.add(name);
    setModal({ ...modal, selectedCompanies: next });
  }

  // Polish: preview-only, updates the textarea — never saves to DB.
  async function handlePolish() {
    if (!modal) return;
    const rawResponse = buildRawResponse(modal);
    if (!rawResponse.trim()) return;
    setModal({ ...modal, polishing: true });
    try {
      const res = await fetch("/api/gaps/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText: modal.gapText, rawResponse }),
      });
      const data = await res.json() as { polishedResponse: string };
      setModal({
        ...modal,
        polishing: false,
        description: data.polishedResponse || modal.description,
        wasPolished: true,
      });
    } catch {
      setModal({ ...modal, polishing: false });
    }
  }

  // Save: persist the current textarea content, then close.
  async function handleSave() {
    if (!modal) return;
    const rawResponse = buildRawResponse(modal);
    if (!rawResponse.trim()) return;
    setModal({ ...modal, saving: true });
    try {
      const res = await fetch(`/api/gaps/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText: modal.gapText, rawResponse, wasPolished: modal.wasPolished }),
      });
      const data = await res.json() as {
        polishedResponse: string;
        qualityStatus: "addressed" | "needs_followup";
        followUpQuestion: string;
        savedToBank?: boolean;
      };
      setGapStates((prev) => ({
        ...prev,
        [modal.gapText]: {
          savedResponse: rawResponse,
          polishedResponse: data.polishedResponse ?? "",
          qualityStatus: data.qualityStatus,
          followUpQuestion: data.followUpQuestion ?? "",
        },
      }));
      if (data.qualityStatus === "needs_followup") {
        setModal({ ...modal, saving: false, phase: "followup", followUpDraft: "", wasPolished: false });
      } else {
        if (data.savedToBank) {
          const gapText = modal.gapText;
          setBankSavedGap(gapText);
          setTimeout(() => setBankSavedGap((prev) => prev === gapText ? null : prev), 3500);
        }
        setModal(null);
      }
    } catch {
      // Use functional update so a user-dismissed modal (null) isn't resurrected.
      setModal((prev) => prev ? { ...prev, saving: false } : null);
    }
  }

  async function submitFollowUp() {
    if (!modal || !modal.followUpDraft.trim()) return;
    const base = buildRawResponse(modal);
    const combined = `${base.trim()}\n\nAdditional detail: ${modal.followUpDraft.trim()}`;
    setModal({ ...modal, saving: true });
    try {
      const res = await fetch(`/api/gaps/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText: modal.gapText, rawResponse: combined }),
      });
      const data = await res.json() as {
        polishedResponse: string;
        qualityStatus: "addressed" | "needs_followup";
        followUpQuestion: string;
        savedToBank?: boolean;
      };
      setGapStates((prev) => ({
        ...prev,
        [modal.gapText]: {
          savedResponse: combined,
          polishedResponse: data.polishedResponse ?? "",
          qualityStatus: data.qualityStatus,
          followUpQuestion: data.followUpQuestion ?? "",
        },
      }));
      if (data.qualityStatus !== "needs_followup") {
        if (data.savedToBank) {
          const gapText = modal.gapText;
          setBankSavedGap(gapText);
          setTimeout(() => setBankSavedGap((prev) => prev === gapText ? null : prev), 3500);
        }
        setModal(null);
      } else {
        setModal({ ...modal, saving: false, followUpDraft: "" });
      }
    } catch {
      setModal((prev) => prev ? { ...prev, saving: false } : null);
    }
  }

  async function handleClear(gapText: string) {
    try {
      const res = await fetch(`/api/gaps/${jobId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGapStates((prev) => ({
        ...prev,
        [gapText]: { savedResponse: "", polishedResponse: "", qualityStatus: "addressed", followUpQuestion: "" },
      }));
    } catch {
      // Leave UI unchanged if delete failed — avoids showing "cleared" when DB still has the record.
    }
  }

  const canSubmit = (m: ModalState) =>
    m.description.trim().length > 0 || m.selectedCompanies.size > 0;

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Gaps and red flags</CardTitle></CardHeader>
        <p className="text-sm text-muted">No gaps or red flags identified.</p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Gaps and red flags</CardTitle></CardHeader>
        <ul className="grid gap-2">
          {items.map((item) => {
            const s = gapStates[item] ?? {
              savedResponse: "", polishedResponse: "",
              qualityStatus: "addressed" as const, followUpQuestion: "",
            };
            const isAddressed = !!s.savedResponse && s.qualityStatus === "addressed";
            const needsDetail = !!s.savedResponse && s.qualityStatus === "needs_followup";
            return (
              <li key={item} className="rounded-control border border-border bg-surface px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="flex-1 text-sm text-ink leading-6">{item}</span>
                  <div className="flex items-center gap-2 shrink-0 pt-0.5 flex-wrap justify-end">
                    {isAddressed && (
                      <Badge tone="success" className="text-[11px] px-2 min-h-0 py-0.5">Addressed</Badge>
                    )}
                  {bankSavedGap === item && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success animate-pulse">
                        ✓ Saved to experience bank
                      </span>
                    )}
                    {needsDetail && (
                      <Badge tone="warning" className="text-[11px] px-2 min-h-0 py-0.5">Needs detail</Badge>
                    )}
                    <button
                      className="text-xs text-accent hover:underline whitespace-nowrap"
                      onClick={() => openModal(item)}
                      type="button"
                    >
                      {isAddressed ? "Edit" : needsDetail ? "Add detail" : "Address"}
                    </button>
                    {isAddressed && (
                      <button
                        className="text-xs text-muted hover:text-danger hover:underline whitespace-nowrap"
                        onClick={() => handleClear(item)}
                        type="button"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ── Address gap modal ─────────────────────────────────────── */}
      {modal && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full sm:max-w-lg rounded-t-panel sm:rounded-panel bg-panel shadow-2xl max-h-[92dvh] flex flex-col">

            {/* Header */}
            <div className="border-b border-border px-5 py-4 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">
                    {modal.phase === "followup" ? "Add more detail" : "Address this gap"}
                  </h3>
                  <p className="mt-1 text-xs text-muted leading-5 line-clamp-2">{modal.gapText}</p>
                </div>
                <button
                  aria-label="Close"
                  className="shrink-0 mt-0.5 text-muted hover:text-ink text-base leading-none"
                  onClick={() => setModal(null)}
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>

            {modal.phase === "main" ? (
              <>
                <div className="grid gap-5 px-5 py-5 overflow-y-auto">

                  {/* Companies */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                      Where did you have this experience?
                    </p>
                    {!companiesLoaded ? (
                      <p className="text-xs text-muted">Loading…</p>
                    ) : companies.length === 0 ? (
                      <p className="text-xs text-muted italic">
                        No resume companies found — add a resume lane under Profile to enable checkboxes.
                      </p>
                    ) : (
                      <div className="grid gap-1.5 max-h-40 overflow-y-auto pr-0.5">
                        {companies.map((c) => (
                          <label
                            key={c.name}
                            className={`flex items-center gap-3 rounded-control border px-3 py-2 cursor-pointer transition-colors ${
                              modal.selectedCompanies.has(c.name)
                                ? "border-accent/50 bg-accent/5"
                                : "border-border bg-surface hover:border-accent/30"
                            }`}
                          >
                            <input
                              checked={modal.selectedCompanies.has(c.name)}
                              className="shrink-0 accent-[rgb(var(--color-accent))] w-4 h-4"
                              onChange={() => toggleCompany(c.name)}
                              type="checkbox"
                            />
                            <span className="flex-1 text-sm font-medium text-ink">{c.name}</span>
                            {c.dateRange && (
                              <span className="text-xs text-muted tabular-nums">{c.dateRange}</span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        What did you do?
                      </p>
                      {modal.wasPolished && (
                        <span className="text-[10px] font-medium text-accent">✨ AI polished — review and Save</span>
                      )}
                    </div>
                    <textarea
                      ref={descRef}
                      aria-label="What did you do?"
                      className={`min-h-[5.5rem] w-full rounded-control border px-3 py-2 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent bg-surface ${modal.wasPolished ? "border-accent/40" : "border-border"}`}
                      onChange={(e) => setModal({ ...modal, description: e.target.value, wasPolished: false })}
                      placeholder="Describe your relevant experience…"
                      value={modal.description}
                    />
                  </div>

                  {/* Metrics */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                      Key metrics or outcomes
                      <span className="ml-1 font-normal normal-case text-muted">(optional)</span>
                    </p>
                    <input
                      aria-label="Key metrics or outcomes"
                      className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      onChange={(e) => setModal({ ...modal, metrics: e.target.value })}
                      placeholder="e.g. $2M pipeline, 15 enterprise proposals, 3 clients onboarded"
                      type="text"
                      value={modal.metrics}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4 shrink-0">
                  <button
                    className="h-9 rounded-control border border-transparent px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
                    onClick={() => setModal(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="h-9 rounded-control border border-accent/50 bg-accent/5 px-3 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={modal.polishing || modal.saving || !canSubmit(modal)}
                    onClick={handlePolish}
                    type="button"
                  >
                    {modal.polishing ? "Polishing…" : "Polish with AI"}
                  </button>
                  <button
                    className="h-9 rounded-control border border-accent bg-accent px-4 text-sm font-medium text-white hover:bg-[rgb(var(--color-accent-strong))] disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={modal.saving || modal.polishing || !canSubmit(modal)}
                    onClick={handleSave}
                    type="button"
                  >
                    {modal.saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            ) : (
              /* ── Follow-up step ──────────────────────────────────────── */
              <>
                <div className="grid gap-3 px-5 py-5 overflow-y-auto">
                  <div className="rounded-control border border-warning/35 bg-warning/10 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-warning mb-1">
                      AI needs more specifics
                    </p>
                    <p className="text-sm text-ink leading-6">
                      {gapStates[modal.gapText]?.followUpQuestion ||
                        "Can you add a specific example — role, actions you took, and the outcome?"}
                    </p>
                  </div>
                  <div className="rounded-control border border-border bg-surface px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Your response so far</p>
                    <p className="text-sm text-ink leading-6">
                      {gapStates[modal.gapText]?.savedResponse}
                    </p>
                  </div>
                  <textarea
                    autoFocus
                    aria-label="Additional detail"
                    className="min-h-20 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                    onChange={(e) => setModal({ ...modal, followUpDraft: e.target.value })}
                    placeholder="Add the specific role, project, your actions, and measurable result…"
                    value={modal.followUpDraft}
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-border px-5 py-4 shrink-0">
                  <button
                    className="h-9 rounded-control border border-transparent px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
                    onClick={() => setModal(null)}
                    type="button"
                  >
                    Later
                  </button>
                  <button
                    className="h-9 rounded-control border border-accent bg-accent px-4 text-sm font-medium text-white hover:bg-[rgb(var(--color-accent-strong))] disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={modal.saving || !modal.followUpDraft.trim()}
                    onClick={submitFollowUp}
                    type="button"
                  >
                    {modal.saving ? "Saving…" : "Save detail"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
