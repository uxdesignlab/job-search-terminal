"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { InteractiveStoryEditor } from "./interactive-story-editor";

type StarStory = {
  question: string;
  points: { label: string; text: string }[];
};

const STAR_LABELS: Record<string, { abbr: string; color: string }> = {
  "S:": { abbr: "S", color: "bg-blue-50 text-blue-700 border-blue-200" },
  "T:": { abbr: "T", color: "bg-violet-50 text-violet-700 border-violet-200" },
  "A:": { abbr: "A", color: "bg-amber-50 text-amber-700 border-amber-200" },
  "R:": { abbr: "R", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "Reflection:": { abbr: "↺", color: "bg-slate-50 text-slate-600 border-slate-200" },
};

function parseInterviewPlan(items: string[]): StarStory[] {
  const stories: StarStory[] = [];
  let current: StarStory | null = null;

  for (const line of items) {
    if (line.startsWith("Q: ")) {
      if (current) stories.push(current);
      current = { question: line.slice(3).trim(), points: [] };
    } else if (current) {
      const prefix = Object.keys(STAR_LABELS).find((k) => line.startsWith(k));
      if (prefix) {
        current.points.push({ label: prefix, text: line.slice(prefix.length).trim() });
      }
    }
  }
  if (current) stories.push(current);
  return stories;
}

type Props = {
  items: string[];
  jobId: string;
};

export function InterviewPlanSection({ items, jobId }: Props) {
  const router = useRouter();
  const stories = parseInterviewPlan(items);
  const [activeDraftIdx, setActiveDraftIdx] = useState<number | null>(null);

  const handleSaved = () => {
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>F. Interview plan</CardTitle>
            <CardDescription>
              {stories.length > 0
                ? `${stories.length} STAR ${stories.length === 1 ? "story" : "stories"} tailored to this role`
                : "No interview stories generated yet."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {stories.length === 0 ? (
        <p className="text-sm text-muted">Run Evaluate with AI to generate interview stories for this role.</p>
      ) : (
        <ol className="grid gap-5">
          {stories.map((story, idx) => {
            const isDrafting = activeDraftIdx === idx;

            return (
              <li key={idx} className="rounded-control border border-border bg-surface overflow-hidden">
                {/* Question row */}
                <div className="border-l-[3px] border-accent px-4 py-3 bg-panel flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-0.5">
                      Story {idx + 1} · Interview question
                    </p>
                    <p className="text-sm font-semibold text-ink leading-snug">{story.question}</p>
                  </div>
                  <div>
                    <button
                      className="rounded-control border border-border hover:border-accent hover:text-accent bg-panel px-3 py-1.5 text-xs font-semibold transition-colors"
                      onClick={() => setActiveDraftIdx(isDrafting ? null : idx)}
                    >
                      {isDrafting ? "Cancel" : "Draft / Record Answer"}
                    </button>
                  </div>
                </div>

                {isDrafting ? (
                  <div className="p-4 border-t border-border bg-panel">
                    <InteractiveStoryEditor
                      question={story.question}
                      jobId={jobId}
                      onClose={() => setActiveDraftIdx(null)}
                      onSaved={handleSaved}
                    />
                  </div>
                ) : (
                  /* STAR points */
                  <div className="divide-y divide-border">
                    {story.points.map((point) => {
                      const meta = STAR_LABELS[point.label];
                      return (
                        <div key={point.label} className="flex gap-3 px-4 py-2.5 items-start">
                          <span
                            className={`mt-0.5 shrink-0 inline-flex items-center justify-center rounded border text-[10px] font-bold w-6 h-5 leading-none ${meta?.color ?? "bg-surface text-muted border-border"}`}
                            aria-label={point.label.replace(":", "")}
                          >
                            {meta?.abbr ?? point.label}
                          </span>
                          <p className="text-sm text-ink leading-relaxed">{point.text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
