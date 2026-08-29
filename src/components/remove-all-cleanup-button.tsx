"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

type Props = {
  count: number;
  onRemoveAll: () => Promise<void>;
};

/**
 * Clears the whole cleanup list at once. Removal cannot be undone from the UI —
 * a re-added source has to be re-entered by hand — so the click is deliberately
 * two-step rather than guarded by a native confirm() the browser can suppress.
 */
export function RemoveAllCleanupButton({ count, onRemoveAll }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

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
          await onRemoveAll();
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
