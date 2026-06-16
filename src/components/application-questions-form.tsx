"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ProgressModal } from "@/components/ui/progress-modal";

type Props = {
  jobId: string;
};

type Status = "idle" | "preparing" | "done" | "error";

export function ApplicationQuestionsForm({ jobId }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<string[]>([""]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [modelLine, setModelLine] = useState("");

  function addQuestion() {
    setQuestions((prev) => [...prev, ""]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "preparing") return;

    const customQuestions = questions.map((q) => q.trim()).filter((q) => q.length > 0);

    setStatus("preparing");
    setError("");
    setModelLine("");
    fetch("/api/ai/active")
      .then((r) => r.json() as Promise<{ providerName: string; modelName: string }>)
      .then((d) => { if (d.modelName) setModelLine(`${d.modelName} · ${d.providerName}`); })
      .catch(() => {});

    try {
      const res = await fetch(`/api/applications/prepare-answers/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: customQuestions }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to prepare answers");
      }
      setQuestions([""]);
      setStatus("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function closeModal() {
    setStatus("idle");
    setError("");
  }

  return (
    <>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Application questions (optional)</p>
          <p className="text-xs leading-5 text-muted">
            Paste questions directly from the application form. Standard questions — why this role, fit, about you, compensation, work authorization — are always included.
          </p>
          <div className="grid gap-2 pt-1">
            {questions.map((q, i) => (
              <div className="flex gap-2 items-start" key={i}>
                <textarea
                  className="min-h-[5rem] w-full rounded-control border border-border bg-panel px-3 py-2 text-sm leading-6 text-ink placeholder:text-muted"
                  disabled={status === "preparing"}
                  name="question"
                  onChange={(e) => updateQuestion(i, e.target.value)}
                  placeholder="e.g. Describe a product decision you influenced with research."
                  rows={2}
                  value={q}
                />
                {questions.length > 1 && (
                  <button
                    className="mt-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-control border border-border text-muted transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={status === "preparing"}
                    onClick={() => removeQuestion(i)}
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="text-sm text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-55"
            disabled={status === "preparing"}
            onClick={addQuestion}
            type="button"
          >
            + Add another question
          </button>
          <div className="flex-1" />
          <Button disabled={status === "preparing" || status === "done"} type="submit" variant="secondary">
            {status === "preparing" ? "Preparing…" : "Prepare answers"}
          </Button>
        </div>
      </form>

      <ProgressModal
        open={status === "preparing" || status === "done" || status === "error"}
        phase={status === "preparing" ? "running" : "done"}
        title="Preparing application answers"
        message="Drafting answers grounded in your resume and evaluation…"
        subtitle="This may take 15–30 seconds with AI."
        modelLine={modelLine || undefined}
        error={status === "error" ? (error || "Something went wrong.") : null}
        onClose={closeModal}
      >
        <p className="text-sm text-success">Answers prepared — scroll down to review them.</p>
      </ProgressModal>
    </>
  );
}
