"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ProgressModal } from "@/components/ui/progress-modal";
import { extractProfileWithAIAction } from "@/app/profile/actions";

type Props = {
  disabled?: boolean;
  onExtracted?: () => void;
};

export function ExtractProfileButton({ disabled = false, onExtracted }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [skillCount, setSkillCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  function handle() {
    setError("");
    setSkillCount(null);
    setPhase("running");
    startTransition(async () => {
      try {
        const r = await extractProfileWithAIAction();
        setSkillCount(r.skillCount);
        setPhase("done");
        router.refresh();
        onExtracted?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Extraction failed");
        setPhase("error");
      }
    });
  }

  function closeModal() {
    setPhase("idle");
    setError("");
    setSkillCount(null);
  }

  return (
    <>
      <Button disabled={disabled || isPending} onClick={handle} variant="secondary">
        {isPending ? "Extracting…" : "Extract with AI"}
      </Button>

      <ProgressModal
        open={phase === "running" || phase === "done" || phase === "error"}
        phase={phase === "running" ? "running" : "done"}
        title="Extracting profile with AI"
        message="Analyzing your resume…"
        subtitle="This takes 10–30 seconds."
        error={phase === "error" ? (error || "Extraction failed") : null}
        onClose={closeModal}
      >
        <p className="text-sm text-success">
          Done — {skillCount ?? 0} skills extracted from your resume.
        </p>
      </ProgressModal>
    </>
  );
}
