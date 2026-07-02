"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { InteractiveStoryEditor } from "./interactive-story-editor";
import type { ApplicationRecord, InterviewQuestionRecord } from "@/lib/db/types";

type Props = {
  assignmentJobs: ApplicationRecord[];
  questions: InterviewQuestionRecord[];
  saveQuestionAction: (formData: FormData) => Promise<void>;
  hideQuestionAction: (formData: FormData) => Promise<void>;
};

type QuestionModalState =
  | { mode: "add" }
  | { mode: "edit"; question: InterviewQuestionRecord }
  | null;

export function VoicePractice({ assignmentJobs, questions, saveQuestionAction, hideQuestionAction }: Props) {
  const router = useRouter();
  const [selectedQuestionId, setSelectedQuestionId] = useState(questions[0]?.id ?? "");
  const [questionModal, setQuestionModal] = useState<QuestionModalState>(null);
  const [practiceQuestion, setPracticeQuestion] = useState<InterviewQuestionRecord | null>(null);

  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) ?? questions[0] ?? null;
  const customCount = questions.filter((question) => question.source === "custom").length;
  const defaultCount = questions.length - customCount;

  async function saveQuestion(formData: FormData) {
    await saveQuestionAction(formData);
    setQuestionModal(null);
    router.refresh();
  }

  async function hideQuestion(formData: FormData) {
    await hideQuestionAction(formData);
    const id = String(formData.get("id") ?? "");
    if (id === selectedQuestionId) {
      const next = questions.find((question) => question.id !== id);
      setSelectedQuestionId(next?.id ?? "");
    }
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            {defaultCount} default
          </span>
          <span className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            {customCount} custom
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-control border border-border bg-panel px-4 py-2 text-xs font-semibold text-ink hover:bg-surface"
            onClick={() => setQuestionModal({ mode: "add" })}
            type="button"
          >
            Add question
          </button>
          <button
            className="rounded-control border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedQuestion}
            onClick={() => selectedQuestion && setPracticeQuestion(selectedQuestion)}
            type="button"
          >
            Practice selected
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Question library</p>
        <div className="grid max-h-[34rem] gap-2 overflow-auto rounded-control border border-border bg-surface p-2">
          {questions.length === 0 ? (
            <div className="rounded-control border border-border bg-panel px-4 py-6 text-sm text-muted">
              No active questions. Add a custom question to start practicing.
            </div>
          ) : null}

          {questions.map((question) => {
            const selected = selectedQuestion?.id === question.id;
            return (
              <div
                className={`rounded-control border p-3 transition-colors ${selected ? "border-accent bg-accent/5" : "border-border bg-panel"}`}
                key={question.id}
              >
                <button
                  aria-pressed={selected}
                  className="block w-full text-left"
                  onClick={() => setSelectedQuestionId(question.id)}
                  type="button"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {question.category} · {question.source === "custom" ? "Custom" : "Default"}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-relaxed text-ink">{question.prompt}</span>
                </button>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="text-xs font-medium text-accent hover:underline"
                    onClick={() => setPracticeQuestion(question)}
                    type="button"
                  >
                    Practice / record
                  </button>
                  {question.source === "custom" ? (
                    <button
                      className="text-xs font-medium text-muted hover:text-ink"
                      onClick={() => setQuestionModal({ mode: "edit", question })}
                      type="button"
                    >
                      Edit
                    </button>
                  ) : null}
                  <form action={hideQuestion}>
                    <input name="id" type="hidden" value={question.id} />
                    <button className="text-xs font-medium text-muted hover:text-danger" type="submit">
                      Hide
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        description="Save the prompt once, then reuse it whenever you practice."
        onClose={() => setQuestionModal(null)}
        open={questionModal !== null}
        size="md"
        title={questionModal?.mode === "edit" ? "Edit interview question" : "Add interview question"}
      >
        <form action={saveQuestion} className="grid gap-4 p-5">
          {questionModal?.mode === "edit" ? <input name="id" type="hidden" value={questionModal.question.id} /> : null}
          <input name="source" type="hidden" value="custom" />
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-ink">Question</span>
            <textarea
              className="min-h-28 rounded-control border border-border bg-panel px-3 py-2 text-sm text-ink"
              defaultValue={questionModal?.mode === "edit" ? questionModal.question.prompt : ""}
              name="prompt"
              placeholder="Paste or write the interview question you want to practice."
              required
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-ink">Category</span>
            <input
              className="min-h-10 rounded-control border border-border bg-panel px-3 py-2 text-sm text-ink"
              defaultValue={questionModal?.mode === "edit" ? questionModal.question.category : ""}
              name="category"
              placeholder="Leadership, product strategy, conflict, research..."
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-control border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
              onClick={() => setQuestionModal(null)}
              type="button"
            >
              Cancel
            </button>
            <button className="rounded-control border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90" type="submit">
              Save question
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Type or record your answer, then review the AI-structured STAR draft before saving."
        onClose={() => setPracticeQuestion(null)}
        open={practiceQuestion !== null}
        size="lg"
        title="Practice answer"
      >
        {practiceQuestion ? (
          <div className="p-5">
            <InteractiveStoryEditor
              assignmentJobs={assignmentJobs}
              key={practiceQuestion.id}
              onClose={() => setPracticeQuestion(null)}
              onSaved={() => router.refresh()}
              promptText={practiceQuestion.prompt}
              question={practiceQuestion.prompt}
              questionId={practiceQuestion.id}
              storyKind="answered_question"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
