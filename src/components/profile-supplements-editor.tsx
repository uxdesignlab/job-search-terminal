"use client";

import { useState } from "react";
import { Badge, Modal } from "@/components/ui";

type QualityStatus = "addressed" | "needs_followup";
type Supplement = {
  id: string;
  content: string;
  qualityStatus: QualityStatus;
  followUpQuestion: string;
};
type FollowUpState = {
  id: string;
  baseContent: string;
  question: string;
  draft: string;
  saving: boolean;
} | null;

type Props = {
  initialSupplements: Supplement[];
};

export function ProfileSupplementsEditor({ initialSupplements }: Props) {
  const [items, setItems] = useState<Supplement[]>(initialSupplements);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpState>(null);

  async function handleAdd() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile-supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      const data = await res.json() as { id: string; qualityStatus: QualityStatus; followUpQuestion: string };
      const item = {
        id: data.id,
        content: draft.trim(),
        qualityStatus: data.qualityStatus,
        followUpQuestion: data.followUpQuestion,
      };
      setItems((prev) => [item, ...prev]);
      if (data.qualityStatus === "needs_followup") {
        setFollowUp({
          id: data.id,
          baseContent: draft.trim(),
          question: data.followUpQuestion,
          draft: "",
          saving: false,
        });
      }
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/profile-supplements/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function startEdit(item: Supplement) {
    setEditId(item.id);
    setEditDraft(item.content);
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft.trim()) return;
    const res = await fetch(`/api/profile-supplements/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editDraft.trim() }),
    });
    const data = await res.json() as { qualityStatus: QualityStatus; followUpQuestion: string };
    setItems((prev) => prev.map((i) => i.id === id ? {
      ...i,
      content: editDraft.trim(),
      qualityStatus: data.qualityStatus,
      followUpQuestion: data.followUpQuestion,
    } : i));
    if (data.qualityStatus === "needs_followup") {
      setFollowUp({
        id,
        baseContent: editDraft.trim(),
        question: data.followUpQuestion,
        draft: "",
        saving: false,
      });
    }
    setEditId(null);
  }

  async function handleSaveFollowUp() {
    if (!followUp || !followUp.draft.trim()) return;
    const content = `${followUp.baseContent.trim()}\n\nAdditional detail: ${followUp.draft.trim()}`;
    setFollowUp({ ...followUp, saving: true });
    const res = await fetch(`/api/profile-supplements/${followUp.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json() as { qualityStatus: QualityStatus; followUpQuestion: string };
    setItems((prev) => prev.map((i) => i.id === followUp.id ? {
      ...i,
      content,
      qualityStatus: data.qualityStatus,
      followUpQuestion: data.followUpQuestion,
    } : i));
    if (data.qualityStatus === "needs_followup") {
      setFollowUp({
        id: followUp.id,
        baseContent: content,
        question: data.followUpQuestion,
        draft: "",
        saving: false,
      });
    } else {
      setFollowUp(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2 items-start">
        <textarea
          className="flex-1 min-h-16 rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder='e.g. "I have managed 8 direct reports at Google, including 2 senior designers"'
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
          }}
        />
        <button
          className="h-9 rounded-control border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-panel disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          disabled={saving || !draft.trim()}
          onClick={handleAdd}
          type="button"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-control border border-border bg-surface overflow-hidden">
              {editId === item.id ? (
                <div className="p-3 grid gap-2">
                  <textarea
                    className="w-full min-h-16 rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      className="h-8 rounded-control border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-panel"
                      onClick={() => handleSaveEdit(item.id)}
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className="h-8 px-3 text-xs text-muted hover:text-ink"
                      onClick={() => setEditId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 px-3 py-2">
                  <p className="flex-1 text-sm text-ink leading-6">{item.content}</p>
                  <div className="flex gap-2 shrink-0 pt-0.5">
                    {item.qualityStatus === "addressed" ? (
                      <Badge tone="success" className="text-[11px] px-2 min-h-0 py-0.5">Addressed</Badge>
                    ) : (
                      <Badge tone="warning" className="text-[11px] px-2 min-h-0 py-0.5">Needs detail</Badge>
                    )}
                    {item.qualityStatus === "needs_followup" && (
                      <button
                        className="text-xs text-warning hover:underline"
                        onClick={() => setFollowUp({
                          id: item.id,
                          baseContent: item.content,
                          question: item.followUpQuestion,
                          draft: "",
                          saving: false,
                        })}
                        type="button"
                      >
                        Add detail
                      </button>
                    )}
                    <button
                      className="text-xs text-muted hover:text-accent transition-colors"
                      onClick={() => startEdit(item)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="text-xs text-muted hover:text-danger transition-colors"
                      onClick={() => handleDelete(item.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No supplements added yet. Add context that strengthens your profile across all jobs.</p>
      )}
      <Modal
        open={!!followUp}
        onClose={() => setFollowUp(null)}
        title="Add evidence detail"
        description={followUp?.question}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="h-9 rounded-control border border-transparent px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
              onClick={() => setFollowUp(null)}
              type="button"
            >
              Later
            </button>
            <button
              className="h-9 rounded-control border border-accent bg-accent px-3 text-sm font-medium text-white hover:bg-[rgb(var(--color-accent-strong))] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!followUp?.draft?.trim() || !!followUp?.saving}
              onClick={handleSaveFollowUp}
              type="button"
            >
              {followUp?.saving ? "Saving…" : "Save detail"}
            </button>
          </div>
        }
      >
        <div className="grid gap-3 px-5 py-4">
          {followUp && (
            <>
              <div className="rounded-control border border-border bg-surface px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Saved draft</p>
                <p className="mt-1 text-sm leading-6 text-ink">{followUp.baseContent}</p>
              </div>
              <textarea
                aria-label="Follow-up detail"
                autoFocus
                className="min-h-24 w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                onChange={(event) => setFollowUp({ ...followUp, draft: event.target.value })}
                placeholder="Add the role, project, your action, and the result..."
                value={followUp.draft}
              />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
