"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { InteractiveStoryEditor } from "./interactive-story-editor";

type Story = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  skills: string[];
  themes: string[];
  sourceJobId: string | null;
  sourceBlockF: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  stories: Story[];
  deleteStoryAction: (id: string) => Promise<void>;
};

const STAR_LABELS = {
  situation: { abbr: "S", color: "bg-blue-50 text-blue-700 border-blue-200" },
  task: { abbr: "T", color: "bg-violet-50 text-violet-700 border-violet-200" },
  action: { abbr: "A", color: "bg-amber-50 text-amber-700 border-amber-200" },
  result: { abbr: "R", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  reflection: { abbr: "↺", color: "bg-slate-50 text-slate-600 border-slate-200" },
};

export function StoryBankList({ stories, deleteStoryAction }: Props) {
  const router = useRouter();
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);

  const handleSaved = () => {
    router.refresh();
  };

  return (
    <div className="grid gap-4">
      {stories.map((story) => {
        const isEditing = editingStoryId === story.id;

        if (isEditing) {
          return (
            <div className="rounded-control border border-accent/40 bg-panel p-4 ring-1 ring-accent/30" key={story.id}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-semibold text-ink">Editing Story</p>
                <button
                  className="text-xs text-muted hover:text-ink font-medium"
                  onClick={() => setEditingStoryId(null)}
                >
                  Cancel
                </button>
              </div>
              <InteractiveStoryEditor
                question={`Tweak and complete story details for: ${story.title}`}
                initialStory={story}
                onClose={() => setEditingStoryId(null)}
                onSaved={handleSaved}
              />
            </div>
          );
        }

        return (
          <div className="rounded-control border border-border bg-surface p-4 hover:border-accent/20 transition-all" key={story.id}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-ink">{story.title}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {story.sourceJobId && (
                    <Link className="text-[10px] text-accent font-semibold hover:underline" href={`/jobs/${story.sourceJobId}`}>
                      From Job eval ↗
                    </Link>
                  )}
                  {story.sourceBlockF === "evaluation" && (
                    <Badge tone="neutral">AI evaluation</Badge>
                  )}
                  {story.sourceBlockF === "voice-practice" && (
                    <span className="text-[10px] text-muted">Voice practice</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="text-xs text-accent font-medium hover:underline"
                  onClick={() => setEditingStoryId(story.id)}
                >
                  Edit
                </button>
                <button
                  className="text-xs text-muted hover:text-danger transition-colors"
                  onClick={async () => {
                    if (confirm("Are you sure you want to delete this story?")) {
                      await deleteStoryAction(story.id);
                      router.refresh();
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Structured view matching STAR separation */}
            <div className="mt-3 divide-y divide-border/60">
              {(["situation", "task", "action", "result", "reflection"] as const).map((field) => {
                const text = story[field];
                if (!text) return null;
                const meta = STAR_LABELS[field];

                return (
                  <div key={field} className="flex gap-3 py-2 items-start first:pt-0 last:pb-0">
                    <span className={`mt-0.5 shrink-0 inline-flex items-center justify-center rounded border text-[9px] font-bold w-5 h-5 leading-none ${meta.color}`}>
                      {meta.abbr}
                    </span>
                    <p className="text-xs text-ink leading-relaxed">{text}</p>
                  </div>
                );
              })}
            </div>

            {(story.skills.length > 0 || story.themes.length > 0) && (
              <div className="mt-3 pt-2.5 border-t border-border/60 flex flex-wrap gap-1.5">
                {story.skills.map((skill) => (
                  <Badge key={skill} tone="neutral">{skill}</Badge>
                ))}
                {story.themes.map((theme) => (
                  <Badge key={theme}>{theme}</Badge>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
