"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableMultiSelectOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  placeholder?: string;
  options: SearchableMultiSelectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
};

/** Button + popover multi-select with a search box, for filters with many options (tags, positions, etc.). */
export function SearchableMultiSelect({ label, placeholder = "Search…", options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    const timeout = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [options, search]);

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <button
        className="mt-1 flex min-h-10 w-full min-w-0 items-center justify-between rounded-control border border-border bg-panel px-3 text-left text-sm text-ink"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <span className="truncate">
          {selected.size === 0 ? "All" : `${selected.size} selected`}
        </span>
        <span className={`ml-2 shrink-0 text-[10px] text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 w-full min-w-[14rem] rounded-control border border-border bg-panel p-2 shadow-lg">
          <input
            autoFocus
            className="mb-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            type="text"
            value={search}
          />
          <div className="flex items-center justify-between px-0.5 pb-1.5">
            <span className="text-[10px] text-muted">{visible.length} of {options.length}</span>
            {selected.size > 0 ? (
              <button
                className="text-[10px] font-medium text-accent underline underline-offset-2 hover:text-ink"
                onClick={() => onChange(new Set())}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="max-h-52 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted">No matches.</p>
            ) : (
              visible.map((option) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-surface"
                  key={option.value}
                >
                  <input
                    checked={selected.has(option.value)}
                    className="h-3.5 w-3.5 accent-[rgb(var(--color-accent))]"
                    onChange={() => toggle(option.value)}
                    type="checkbox"
                  />
                  <span className="truncate text-ink">{option.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
