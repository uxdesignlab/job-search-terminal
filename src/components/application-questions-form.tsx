"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
};

export function ApplicationQuestionsForm({ action }: Props) {
  const [questions, setQuestions] = useState<string[]>([""]);

  function addQuestion() {
    setQuestions((prev) => [...prev, ""]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));
  }

  return (
    <form action={action} className="grid gap-3">
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
                name="question"
                onChange={(e) => updateQuestion(i, e.target.value)}
                placeholder="e.g. Describe a product decision you influenced with research."
                rows={2}
                value={q}
              />
              {questions.length > 1 && (
                <button
                  className="mt-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-control border border-border text-muted transition-colors hover:border-danger hover:text-danger"
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
          className="text-sm text-accent hover:underline"
          onClick={addQuestion}
          type="button"
        >
          + Add another question
        </button>
        <div className="flex-1" />
        <SubmitButton
          label="Prepare answers"
          pendingLabel="Preparing…"
          savedLabel="Done ✓"
          variant="secondary"
        />
      </div>
    </form>
  );
}
