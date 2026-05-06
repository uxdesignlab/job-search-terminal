"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { extractProfileWithAIAction } from "@/app/profile/actions";

type Props = {
  /** Disable the button when no resume has been uploaded yet. */
  disabled?: boolean;
  onExtracted?: () => void;
};

export function ExtractProfileButton({ disabled = false, onExtracted }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ skillCount: number } | null>(null);
  const [error, setError] = useState("");

  function handle() {
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        const r = await extractProfileWithAIAction();
        setResult(r);
        router.refresh();
        onExtracted?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Extraction failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button disabled={disabled || isPending} onClick={handle} variant="secondary">
        {isPending ? "Extracting…" : "Extract with AI"}
      </Button>
      {result && (
        <span className="text-xs text-[var(--color-success)]">
          Done — {result.skillCount} skills extracted
        </span>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
