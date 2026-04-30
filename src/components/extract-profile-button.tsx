"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { extractProfileWithAIAction } from "@/app/profile/actions";

export function ExtractProfileButton() {
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Extraction failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button disabled={isPending} onClick={handle} variant="secondary">
        {isPending ? "Extracting…" : "Re-extract with AI"}
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
