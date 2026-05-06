"use client";

import { useState } from "react";

export function CopyAnswerButton({ answer }: { answer: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      className="text-xs text-muted transition-colors hover:text-ink"
      onClick={handleCopy}
      type="button"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
