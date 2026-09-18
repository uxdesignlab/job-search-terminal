/** Select/deselect only the displayed inclusive range, retaining unrelated selections. */
export function applyRangeSelection(selected: ReadonlySet<string>, displayed: readonly string[], anchor: string | null, target: string, checked: boolean, shift: boolean) {
  const next = new Set(selected);
  const from = anchor ? displayed.indexOf(anchor) : -1;
  const to = displayed.indexOf(target);
  if (to < 0) return next;
  const ids = shift && from >= 0 ? displayed.slice(Math.min(from, to), Math.max(from, to) + 1) : [target];
  for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
  return next;
}
