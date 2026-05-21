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
    <div className="grid gap-2">
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
      {isPending && (
        <div className="grid gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full w-1/3 animate-progress rounded-full bg-accent" />
          </div>
          <p className="text-xs text-muted">Analyzing your resume with AI — this takes 10–30 seconds…</p>
        </div>
      )}
    </div>
  );
}
