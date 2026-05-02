"use client";

import { useState } from "react";

type Supplement = { id: string; content: string };

type Props = {
  initialSupplements: Supplement[];
};

export function ProfileSupplementsEditor({ initialSupplements }: Props) {
  const [items, setItems] = useState<Supplement[]>(initialSupplements);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  async function handleAdd() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile-supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      const data = await res.json() as { id: string };
      setItems((prev) => [{ id: data.id, content: draft.trim() }, ...prev]);
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
    await fetch(`/api/profile-supplements/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editDraft.trim() }),
    });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, content: editDraft.trim() } : i));
    setEditId(null);
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
    </div>
  );
}
