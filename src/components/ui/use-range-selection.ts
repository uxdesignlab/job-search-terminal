"use client";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { applyRangeSelection } from "@/lib/range-selection";

export const RANGE_SELECTION_HINT = "Select a checkbox, then Shift-click another to select a range.";

export function useRangeSelection(ids: string[], selected: Set<string>, setSelected: Dispatch<SetStateAction<Set<string>>>, scope: string, disabled = false) {
  const anchor = useRef<{ scope: string; id: string | null }>({ scope: "", id: null });
  const scopeKey = JSON.stringify([scope, ids]);
  useEffect(() => { anchor.current = { scope: scopeKey, id: null }; }, [scopeKey]);
  const resetAnchor = () => { anchor.current = { scope: scopeKey, id: null }; };
  const change = (id: string, checked: boolean, shift: boolean) => {
    if (disabled) return;
    if (anchor.current.scope !== scopeKey) resetAnchor();
    const previous = anchor.current.id;
    if (!shift || !previous || !ids.includes(previous)) anchor.current.id = id;
    setSelected((current) => applyRangeSelection(current, ids, previous, id, checked, shift));
  };
  const count = ids.filter((id) => selected.has(id)).length;
  return {
    resetAnchor,
    clear: () => { if (!disabled) { resetAnchor(); setSelected(new Set()); } },
    checkbox: (id: string) => ({
      checked: selected.has(id), disabled,
      onChange: () => {}, // Mouse and keyboard share one path, so activation never toggles twice.
      onClick: (event: React.MouseEvent<HTMLInputElement>) => change(id, event.currentTarget.checked, event.shiftKey),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === " " && !event.repeat) {
          event.preventDefault();
          change(id, !selected.has(id), event.shiftKey);
        }
      },
    }),
    header: {
      checked: ids.length > 0 && count === ids.length,
      disabled: disabled || ids.length === 0,
      ref: (node: HTMLInputElement | null) => { if (node) node.indeterminate = count > 0 && count < ids.length; },
      onChange: () => {
        if (disabled) return;
        resetAnchor();
        setSelected((current) => {
          const next = new Set(current);
          for (const id of ids) { if (count === ids.length) next.delete(id); else next.add(id); }
          return next;
        });
      },
    },
  };
}
