import { PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { InterviewPrepWorkspace } from "@/components/interview-prep-workspace";
import { getInterviewAssignmentJobs, getInterviewQuestions, getKeywordTaxonomy, getStories, getTaxonomyActivity } from "@/lib/db/queries";
import {
  addTaxonomyAliasAction,
  archiveTaxonomyConceptAction,
  deleteStoryAction,
  hideInterviewQuestionAction,
  mergeTaxonomyConceptAction,
  removeTaxonomyAliasAction,
  restoreTaxonomyConceptAction,
  saveInterviewQuestionAction,
  saveTaxonomyConceptAction
} from "./actions";

export const dynamic = "force-dynamic";

export default function InterviewPrepPage() {
  const stories = getStories();
  const questions = getInterviewQuestions();
  const assignmentJobs = getInterviewAssignmentJobs();
  const taxonomy = getKeywordTaxonomy({ includeArchived: true });
  const taxonomyActivity = getTaxonomyActivity();

  return (
    <Shell activeItem="Interview Prep">
      <div className="grid gap-6">
        <PageHeader
          description="Build reusable interview questions, capture standalone stories, and find the right STAR evidence when you need it."
          eyebrow="Interview preparation"
          title="Interview Prep"
        />

        <InterviewPrepWorkspace
          deleteStoryAction={deleteStoryAction}
          hideQuestionAction={hideInterviewQuestionAction}
          assignmentJobs={assignmentJobs}
          addTaxonomyAliasAction={addTaxonomyAliasAction}
          archiveTaxonomyConceptAction={archiveTaxonomyConceptAction}
          questions={questions}
          mergeTaxonomyConceptAction={mergeTaxonomyConceptAction}
          removeTaxonomyAliasAction={removeTaxonomyAliasAction}
          restoreTaxonomyConceptAction={restoreTaxonomyConceptAction}
          saveQuestionAction={saveInterviewQuestionAction}
          saveTaxonomyConceptAction={saveTaxonomyConceptAction}
          stories={stories}
          taxonomy={taxonomy}
          taxonomyActivity={taxonomyActivity}
        />
      </div>
    </Shell>
  );
}
