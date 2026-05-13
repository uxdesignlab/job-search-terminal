"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Props = {
  jobId: string;
};

type Status = "idle" | "preparing" | "error";

export function ApplicationQuestionsForm({ jobId }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<string[]>([""]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

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
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function closeError() {
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
          <Button disabled={status === "preparing"} type="submit" variant="secondary">
            {status === "preparing" ? "Preparing…" : "Prepare answers"}
          </Button>
        </div>
      </form>

      {status === "preparing" && (
        <div
          aria-busy="true"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-panel shadow-2xl">
            <div className="border-b border-border px-6 pt-6 pb-4">
              <h2 className="text-sm font-semibold text-ink">Preparing application answers</h2>
            </div>
            <div className="px-6 py-6">
              <div className="flex flex-col items-center gap-3 py-4">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                <p className="text-sm text-ink">Drafting answers grounded in your resume and evaluation…</p>
                <p className="text-xs text-muted">This may take 15–30 seconds with AI.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeError();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
              <h2 className="text-sm font-semibold text-ink">Could not prepare answers</h2>
              <button
                aria-label="Close"
                className="text-muted transition-colors hover:text-ink"
                onClick={closeError}
                type="button"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-danger">{error || "Something went wrong."}</p>
              <p className="mt-2 text-xs text-muted">Close this dialog and try again. Your questions are preserved.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Button onClick={closeError} variant="secondary">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
