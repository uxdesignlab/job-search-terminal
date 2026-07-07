"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Modal } from "@/components/ui";
import { InteractiveStoryEditor } from "./interactive-story-editor";
import type { ApplicationRecord, InterviewQuestionRecord, PracticeAttemptRecord, QuestionPracticeRecord } from "@/lib/db/types";

type Props = {
  assignmentJobs: ApplicationRecord[];
  questions: InterviewQuestionRecord[];
  questionPractice: Record<string, QuestionPracticeRecord>;
  saveQuestionAction: (formData: FormData) => Promise<void>;
  hideQuestionAction: (formData: FormData) => Promise<void>;
};

type QuestionModalState =
  | { mode: "add" }
  | { mode: "edit"; question: InterviewQuestionRecord }
  | null;

function qualityTone(status: PracticeAttemptRecord["qualityStatus"]) {
  return status === "ready" ? "success" : status === "missing_result" ? "danger" : "warning";
}

function qualityLabel(status: PracticeAttemptRecord["qualityStatus"]) {
  return status === "ready" ? "Ready" : status === "missing_result" ? "Needs result" : "Needs detail";
}

function AttemptItem({ attempt, index, total }: { attempt: PracticeAttemptRecord; index: number; total: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-control border border-border bg-surface">
      <button className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left" onClick={() => setOpen((v) => !v)} type="button">
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink">Attempt {total - index}</span>
          <Badge tone={qualityTone(attempt.qualityStatus)}>{qualityLabel(attempt.qualityStatus)}</Badge>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-muted">{new Date(attempt.createdAt).toLocaleString()}</span>
          <span className="text-[10px] text-muted">{open ? "▴" : "▾"}</span>
        </span>
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-border px-3 py-2 text-xs text-ink">
          {(["situation", "task", "action", "result", "reflection"] as const).map((field) =>
            attempt.parsed[field] ? (
              <p key={field}>
                <span className="font-semibold uppercase tracking-wider text-muted">{field.slice(0, 1)}</span>{" "}
                {attempt.parsed[field]}
              </p>
            ) : null
          )}
          {attempt.coachingNotes.length > 0 ? (
            <div className="rounded-control border border-warning/30 bg-warning/5 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-warning">Coaching</p>
              <ul className="list-disc pl-4">
                {attempt.coachingNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {attempt.transcript ? (
            <details>
              <summary className="cursor-pointer text-[11px] text-muted">Transcript</summary>
              <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted">{attempt.transcript}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function VoicePractice({ assignmentJobs, questions, questionPractice, saveQuestionAction, hideQuestionAction }: Props) {
  const router = useRouter();
  const [selectedQuestionId, setSelectedQuestionId] = useState(questions[0]?.id ?? "");
  const [questionModal, setQuestionModal] = useState<QuestionModalState>(null);
  const [practiceQuestion, setPracticeQuestion] = useState<InterviewQuestionRecord | null>(null);
  const [historyQuestion, setHistoryQuestion] = useState<InterviewQuestionRecord | null>(null);

  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId) ?? questions[0] ?? null;
  const customCount = questions.filter((question) => question.source === "custom").length;
  const defaultCount = questions.length - customCount;
  const reuseStoryIdFor = (questionId: string) => questionPractice[questionId]?.linkedStories[0]?.id ?? null;

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
            const practice = questionPractice[question.id];
            const attemptCount = practice?.attemptCount ?? 0;
            const linkedCount = practice?.linkedStories.length ?? 0;
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
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      {question.category} · {question.source === "custom" ? "Custom" : "Default"}
                    </span>
                    {attemptCount > 0 ? (
                      <Badge tone="success">{attemptCount} {attemptCount === 1 ? "attempt" : "attempts"}</Badge>
                    ) : null}
                    {linkedCount > 0 ? <Badge tone="neutral">{linkedCount} linked {linkedCount === 1 ? "story" : "stories"}</Badge> : null}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-relaxed text-ink">{question.prompt}</span>
                </button>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="text-xs font-medium text-accent hover:underline"
                    onClick={() => setPracticeQuestion(question)}
                    type="button"
                  >
                    {attemptCount > 0 ? "Practice again" : "Practice / record"}
                  </button>
                  {attemptCount > 0 || linkedCount > 0 ? (
                    <button
                      className="text-xs font-medium text-muted hover:text-ink"
                      onClick={() => setHistoryQuestion(question)}
                      type="button"
                    >
                      History &amp; stories
                    </button>
                  ) : null}
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
              reuseStoryId={reuseStoryIdFor(practiceQuestion.id)}
              storyKind="answered_question"
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        description="Your saved answers and every practice attempt for this question."
        onClose={() => setHistoryQuestion(null)}
        open={historyQuestion !== null}
        size="lg"
        title="Question history"
      >
        {historyQuestion ? (
          <div className="grid gap-4 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{historyQuestion.category}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{historyQuestion.prompt}</p>
            </div>

            {(questionPractice[historyQuestion.id]?.linkedStories.length ?? 0) > 0 ? (
              <div className="grid gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Linked stories</p>
                {questionPractice[historyQuestion.id]!.linkedStories.map((story) => (
                  <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2" key={story.id}>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{story.title}</span>
                    <Badge tone={qualityTone(story.qualityStatus)}>{qualityLabel(story.qualityStatus)}</Badge>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Attempt history ({questionPractice[historyQuestion.id]?.attemptCount ?? 0})
                </p>
                <button
                  className="rounded-control border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
                  onClick={() => {
                    const q = historyQuestion;
                    setHistoryQuestion(null);
                    setPracticeQuestion(q);
                  }}
                  type="button"
                >
                  Practice again
                </button>
              </div>
              {(questionPractice[historyQuestion.id]?.attempts ?? []).map((attempt, index) => (
                <AttemptItem
                  attempt={attempt}
                  index={index}
                  key={attempt.id}
                  total={questionPractice[historyQuestion.id]!.attempts.length}
                />
              ))}
              {(questionPractice[historyQuestion.id]?.attempts.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">No attempts yet. Practice this question to start a history.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
