"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState, Modal } from "@/components/ui";
import { InteractiveStoryEditor } from "@/components/interactive-story-editor";
import { StoryBankList } from "@/components/story-bank-list";
import { TaxonomyManager } from "@/components/taxonomy-manager";
import { VoicePractice } from "@/components/voice-practice";
import type { ApplicationRecord, InterviewQuestionRecord, StoryRecord, TaxonomyActivityRecord, TaxonomyConceptRecord } from "@/lib/db/types";

type Props = {
  assignmentJobs: ApplicationRecord[];
  questions: InterviewQuestionRecord[];
  stories: StoryRecord[];
  taxonomy: TaxonomyConceptRecord[];
  taxonomyActivity: TaxonomyActivityRecord[];
  addTaxonomyAliasAction: (formData: FormData) => Promise<void>;
  archiveTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  deleteStoryAction: (id: string) => Promise<void>;
  mergeTaxonomyConceptAction: (formData: FormData) => Promise<void>;
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
  stories,
  taxonomy,
  taxonomyActivity,
  addTaxonomyAliasAction,
  archiveTaxonomyConceptAction,
  deleteStoryAction,
  mergeTaxonomyConceptAction,
  removeTaxonomyAliasAction,
  restoreTaxonomyConceptAction,
  saveQuestionAction,
  saveTaxonomyConceptAction,
  hideQuestionAction,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("practice");
  const [storyModalOpen, setStoryModalOpen] = useState(false);

  const userStoryCount = stories.filter((story) => story.storyKind !== "evaluation_suggestion").length;
  const generatedStoryCount = stories.length - userStoryCount;

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
            {questions.length} active questions
          </span>
          <span className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            {userStoryCount} user stories
          </span>
          <span className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            {generatedStoryCount} generated suggestions
          </span>
        </div>
      </div>

      {activeTab === "practice" ? (
        <div className="grid gap-5">
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
            mergeTaxonomyConceptAction={mergeTaxonomyConceptAction}
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
