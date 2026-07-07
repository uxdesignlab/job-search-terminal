"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState, Modal } from "@/components/ui";
import { InteractiveStoryEditor } from "@/components/interactive-story-editor";
import { StoryBankList } from "@/components/story-bank-list";
import { TaxonomyManager } from "@/components/taxonomy-manager";
import { VoicePractice } from "@/components/voice-practice";
import type {
  ApplicationRecord,
  InterviewQuestionRecord,
  QuestionPracticeRecord,
  StoryRecord,
  TaxonomyActivityRecord,
  TaxonomyCandidateRecord,
  TaxonomyConceptRecord,
} from "@/lib/db/types";

type Props = {
  assignmentJobs: ApplicationRecord[];
  questions: InterviewQuestionRecord[];
  questionPractice: Record<string, QuestionPracticeRecord>;
  stories: StoryRecord[];
  taxonomy: TaxonomyConceptRecord[];
  taxonomyActivity: TaxonomyActivityRecord[];
  taxonomyCandidates: TaxonomyCandidateRecord[];
  taxonomyCounts: { active: number; candidate: number; archived: number };
  addTaxonomyAliasAction: (formData: FormData) => Promise<void>;
  archiveTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  archiveUnusedTaxonomyConceptsAction: () => Promise<void>;
  bulkArchiveTaxonomyConceptsAction: (formData: FormData) => Promise<void>;
  deleteStoryAction: (id: string) => Promise<void>;
  mergeTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  promoteTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  removeTaxonomyAliasAction: (formData: FormData) => Promise<void>;
  restoreTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  saveQuestionAction: (formData: FormData) => Promise<void>;
  saveTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  hideQuestionAction: (formData: FormData) => Promise<void>;
};

type ActiveTab = "practice" | "story-bank" | "taxonomy";

export function InterviewPrepWorkspace({
  assignmentJobs,
  questions,
  questionPractice,
  stories,
  taxonomy,
  taxonomyActivity,
  taxonomyCandidates,
  taxonomyCounts,
  addTaxonomyAliasAction,
  archiveTaxonomyConceptAction,
  archiveUnusedTaxonomyConceptsAction,
  bulkArchiveTaxonomyConceptsAction,
  deleteStoryAction,
  mergeTaxonomyConceptAction,
  promoteTaxonomyConceptAction,
  removeTaxonomyAliasAction,
  restoreTaxonomyConceptAction,
  saveQuestionAction,
  saveTaxonomyConceptAction,
  hideQuestionAction,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("practice");
  const [storyModalOpen, setStoryModalOpen] = useState(false);

  const coreStories = stories.filter((story) => story.storyKind !== "evaluation_suggestion");
  const userStoryCount = coreStories.length;
  const generatedStoryCount = stories.length - userStoryCount;

  // Coverage-by-category: a question is "covered" when it has a linked story or a
  // recorded practice attempt. Categories with zero coverage are the prep gaps.
  const categoryCoverage = (() => {
    const byCategory = new Map<string, { total: number; covered: number }>();
    for (const question of questions) {
      const practice = questionPractice[question.id];
      const covered = (practice?.linkedStories.length ?? 0) > 0 || (practice?.attemptCount ?? 0) > 0;
      const entry = byCategory.get(question.category) ?? { total: 0, covered: 0 };
      entry.total += 1;
      if (covered) entry.covered += 1;
      byCategory.set(question.category, entry);
    }
    return Array.from(byCategory.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => a.covered / a.total - b.covered / b.total || b.total - a.total);
  })();
  const gapCategories = categoryCoverage.filter((c) => c.covered === 0).length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div aria-label="Interview prep sections" className="flex gap-1" role="tablist">
          <button
            aria-selected={activeTab === "practice"}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === "practice" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
            onClick={() => setActiveTab("practice")}
            role="tab"
            type="button"
          >
            Practice
          </button>
          <button
            aria-selected={activeTab === "story-bank"}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === "story-bank" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
            onClick={() => setActiveTab("story-bank")}
            role="tab"
            type="button"
          >
            Story Bank
          </button>
          <button
            aria-selected={activeTab === "taxonomy"}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === "taxonomy" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
            onClick={() => setActiveTab("taxonomy")}
            role="tab"
            type="button"
          >
            Taxonomy
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pb-2 sm:pb-0">
          <span className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            {userStoryCount} core stories
          </span>
          <span className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            {questions.length} questions
          </span>
          {generatedStoryCount > 0 ? (
            <a
              className="rounded-control border border-accent/50 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
              href="/interview-prep/consolidate"
            >
              {generatedStoryCount} to consolidate
            </a>
          ) : null}
          {taxonomyCounts.candidate > 0 ? (
            <button
              className="rounded-control border border-accent/50 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
              onClick={() => setActiveTab("taxonomy")}
              type="button"
            >
              {taxonomyCounts.candidate} candidates to review
            </button>
          ) : null}
        </div>
      </div>

      {activeTab === "practice" ? (
        <div className="grid gap-5">
          <Card>
            <CardHeader className="mb-3">
              <CardTitle>Coverage</CardTitle>
              <CardDescription>
                {userStoryCount} core {userStoryCount === 1 ? "story" : "stories"} · {questions.length} questions ·{" "}
                {gapCategories > 0 ? (
                  <span className="text-warning">{gapCategories} {gapCategories === 1 ? "category has" : "categories have"} no story yet</span>
                ) : (
                  <span className="text-success">every category has a story</span>
                )}
              </CardDescription>
            </CardHeader>
            {categoryCoverage.length === 0 ? (
              <p className="text-sm text-muted">Add questions to see coverage.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {categoryCoverage.map((cat) => {
                  const isGap = cat.covered === 0;
                  return (
                    <div
                      className={`flex items-center justify-between gap-3 rounded-control border px-3 py-2 ${
                        isGap ? "border-warning/40 bg-warning/5" : "border-border bg-surface"
                      }`}
                      key={cat.category}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{cat.category}</span>
                      <span className={`shrink-0 text-xs font-medium ${isGap ? "text-warning" : "text-muted"}`}>
                        {isGap ? "no story yet" : `${cat.covered}/${cat.total} covered`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Practice questions</CardTitle>
              <CardDescription>
                Select a reusable prompt, then open the answer wizard to type or record. AI drafts are previewed before saving.
              </CardDescription>
            </CardHeader>
            <VoicePractice
              assignmentJobs={assignmentJobs}
              hideQuestionAction={hideQuestionAction}
              questionPractice={questionPractice}
              questions={questions}
              saveQuestionAction={saveQuestionAction}
            />
          </Card>

          <Card>
            <CardHeader className="mb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Standalone story</CardTitle>
                  <CardDescription>
                    Capture an accomplishment or proof point without tying it to a specific interview question.
                  </CardDescription>
                </div>
                <button
                  className="rounded-control border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
                  onClick={() => setStoryModalOpen(true)}
                  type="button"
                >
                  Add story
                </button>
              </div>
            </CardHeader>
          </Card>
        </div>
      ) : activeTab === "story-bank" ? (
        <Card>
          <CardHeader>
            <CardTitle>Story bank</CardTitle>
            <CardDescription>{stories.length} {stories.length === 1 ? "story" : "stories"} saved</CardDescription>
          </CardHeader>
          {generatedStoryCount > 0 ? (
            <a
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-accent/40 bg-accent/5 px-4 py-3 hover:bg-accent/10"
              href="/interview-prep/consolidate"
            >
              <span className="text-sm text-ink">
                <span className="font-semibold">{generatedStoryCount} auto-generated suggestions</span> are cluttering your bank. Consolidate them into a small set of reusable core stories.
              </span>
              <span className="shrink-0 rounded-control border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-white">Consolidate →</span>
            </a>
          ) : null}
          {stories.length > 0 ? (
            <StoryBankList assignmentJobs={assignmentJobs} stories={stories} taxonomy={taxonomy} deleteStoryAction={deleteStoryAction} />
          ) : (
            <EmptyState
              description="Record your first answer or add a standalone story. Stories from job evaluations also appear here."
              title="No stories yet"
            />
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Taxonomy manager</CardTitle>
            <CardDescription>
              Review how private resume, job, and story keywords are grouped. Add, move, archive, merge, or alias tags without changing raw ATS keywords.
            </CardDescription>
          </CardHeader>
          <TaxonomyManager
            activity={taxonomyActivity}
            addTaxonomyAliasAction={addTaxonomyAliasAction}
            archiveTaxonomyConceptAction={archiveTaxonomyConceptAction}
            archiveUnusedTaxonomyConceptsAction={archiveUnusedTaxonomyConceptsAction}
            bulkArchiveTaxonomyConceptsAction={bulkArchiveTaxonomyConceptsAction}
            candidates={taxonomyCandidates}
            counts={taxonomyCounts}
            mergeTaxonomyConceptAction={mergeTaxonomyConceptAction}
            promoteTaxonomyConceptAction={promoteTaxonomyConceptAction}
            removeTaxonomyAliasAction={removeTaxonomyAliasAction}
            restoreTaxonomyConceptAction={restoreTaxonomyConceptAction}
            saveTaxonomyConceptAction={saveTaxonomyConceptAction}
            taxonomy={taxonomy}
          />
        </Card>
      )}

      <Modal
        description="Type rough notes or record audio, then review the AI-structured STAR draft before saving."
        onClose={() => setStoryModalOpen(false)}
        open={storyModalOpen}
        size="lg"
        title="Add standalone story"
      >
        <div className="p-5">
          <InteractiveStoryEditor
            assignmentJobs={assignmentJobs}
            onClose={() => setStoryModalOpen(false)}
            onSaved={() => router.refresh()}
            storyKind="standalone_story"
          />
        </div>
      </Modal>
    </div>
  );
}
