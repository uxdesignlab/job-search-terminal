"use client";

import { useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  initialIndustry: string;
  onSave: (name: string, industry: string) => Promise<void>;
};

export function IndustryEditor({ name, initialIndustry, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialIndustry);
  const [saved, setSaved] = useState(initialIndustry);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setValue(saved);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed === saved) return;
    setSaved(trimmed);
    startTransition(() => onSave(name, trimmed));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setValue(saved);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder="e.g. AI Labs"
        className="h-7 w-36 rounded-control border border-border bg-panel px-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-border"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="Click to edit industry"
      className={cn(
        "inline-flex min-h-7 items-center rounded-control border px-2.5 text-xs font-medium transition-opacity",
        saved
          ? "border-border bg-surface text-ink hover:opacity-70"
          : "border-dashed border-border bg-transparent text-muted hover:text-ink",
        pending && "opacity-50"
      )}
    >
      {saved || "+ Add industry"}
    </button>
  );
}
