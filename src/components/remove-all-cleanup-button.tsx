"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

type Props = {
  /** The candidates this page actually rendered — the set the user is confirming. */
  names: string[];
  onRemoveAll: (confirmedNames: string[]) => Promise<void>;
};

/**
 * Clears the whole cleanup list at once. Removal cannot be undone from the UI —
 * a re-added source has to be re-entered by hand — so the click is deliberately
 * two-step rather than guarded by a native confirm() the browser can suppress.
 */
export function RemoveAllCleanupButton({ names, onRemoveAll }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const count = names.length;

  if (!confirming) {
    return (
      <Button onClick={() => setConfirming(true)} variant="secondary">
        Remove all ({count})
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">
        Remove {count} source{count === 1 ? "" : "s"}? This cannot be undone.
      </span>
      <Button
        aria-live="polite"
        disabled={pending}
        onClick={() => startTransition(async () => {
          // Send the names the count was taken from, so the server deletes what
          // this dialog actually promised and nothing that appeared since.
          await onRemoveAll(names);
          setConfirming(false);
        })}
      >
        {pending ? "Removing…" : "Yes, remove all"}
      </Button>
      <Button disabled={pending} onClick={() => setConfirming(false)} variant="quiet">
        Cancel
      </Button>
    </div>
  );
}
