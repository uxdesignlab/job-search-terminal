"use client";

import { useRef, useState, useTransition } from "react";

interface Props {
  initialPositive: string[];
  initialNegative: string[];
  onSave: (positive: string[], negative: string[]) => Promise<void>;
}

function ChipList({
  chips,
  tone,
  onRemove,
  onAdd,
}: {
  chips: string[];
  tone: "success" | "danger";
  onRemove: (kw: string) => void;
  onAdd: (kw: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAdd() {
    const val = inputRef.current?.value.trim().toLowerCase();
    if (!val) return;
    onAdd(val);
    if (inputRef.current) inputRef.current.value = "";
  }

  const chipClass =
    tone === "success"
      ? "bg-success/15 text-success border border-success/25"
      : "bg-danger/15 text-danger border border-danger/25";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 min-h-[2rem]">
        {chips.length > 0 ? (
          chips.map((kw) => (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${chipClass}`} key={kw}>
              {kw}
              <button
                aria-label={`Remove ${kw}`}
                className="ml-0.5 opacity-60 hover:opacity-100 focus:outline-none"
                onClick={() => onRemove(kw)}
                type="button"
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-sm text-muted">{tone === "success" ? "All titles included" : "No exclusions"}</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="h-8 flex-1 rounded-control border border-border bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          placeholder={tone === "success" ? "e.g. product manager" : "e.g. intern"}
          ref={inputRef}
          type="text"
        />
        <button
          className="h-8 rounded-control border border-border bg-surface px-3 text-sm text-muted hover:text-ink transition-colors"
          onClick={handleAdd}
          type="button"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function TitleFiltersEditor({ initialPositive, initialNegative, onSave }: Props) {
  const [positive, setPositive] = useState(initialPositive);
  const [negative, setNegative] = useState(initialNegative);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await onSave(positive, negative);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Include when title contains</p>
          <ChipList
            chips={positive}
            onAdd={(kw) => setPositive((p) => p.includes(kw) ? p : [...p, kw])}
            onRemove={(kw) => setPositive((p) => p.filter((k) => k !== kw))}
            tone="success"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Exclude when title contains</p>
          <ChipList
            chips={negative}
            onAdd={(kw) => setNegative((p) => p.includes(kw) ? p : [...p, kw])}
            onRemove={(kw) => setNegative((p) => p.filter((k) => k !== kw))}
            tone="danger"
          />
        </div>
      </div>
      <div>
        <button
          className="h-9 rounded-control border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-panel transition-colors disabled:opacity-50"
          disabled={pending}
          onClick={handleSave}
          type="button"
        >
          {saved ? "Saved" : pending ? "Saving…" : "Save filters"}
        </button>
      </div>
    </div>
  );
}
