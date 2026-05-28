"use client";

import { useState } from "react";
import { InteractiveStoryEditor } from "./interactive-story-editor";

type Props = {
  questions: string[];
};

export function VoicePractice({ questions }: Props) {
  const [questionIdx, setQuestionIdx] = useState(0);

  const prevQuestion = () => {
    setQuestionIdx((i) => Math.max(0, i - 1));
  };

  const nextQuestion = () => {
    setQuestionIdx((i) => Math.min(questions.length - 1, i + 1));
  };

  return (
    <div className="grid gap-4">
      {/* Question switcher header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Question {questionIdx + 1} of {questions.length}
        </p>
        <div className="flex gap-1">
          <button
            className="rounded px-2.5 py-1 text-xs font-semibold border border-border text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            disabled={questionIdx === 0}
            onClick={prevQuestion}
            type="button"
          >
            ← Prev
          </button>
          <button
            className="rounded px-2.5 py-1 text-xs font-semibold border border-border text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            disabled={questionIdx === questions.length - 1}
            onClick={nextQuestion}
            type="button"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Render the Interactive Story Editor, resetting state via key when question changes */}
      <InteractiveStoryEditor
        key={questionIdx}
        question={questions[questionIdx]}
      />
    </div>
  );
}
