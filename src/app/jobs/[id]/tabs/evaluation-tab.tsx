import { AIProviderBadge } from "@/components/ai-provider-badge";
import { FastEvaluationCard } from "@/components/fast-evaluation-card";
import { InterviewPlanSection } from "@/components/interview-plan-section";
import { PostingRequirementsCard } from "@/components/posting-requirements-card";
import { StreamingEvaluation } from "@/components/streaming-evaluation";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/ui";
import { getMatchingStoriesForJob } from "@/lib/db/queries";
import type { EvaluationRecord, JobRecord } from "@/lib/db/types";
import { EvaluationSection } from "./detail-list";

type Props = {
  evaluation: EvaluationRecord | undefined;
  id: string;
  isFastEvaluation: boolean;
  job: JobRecord;
  linkStoryToJobAction: (formData: FormData) => Promise<void>;
  saveCorrectionAction: (formData: FormData) => Promise<void>;
  saveStoryAction: (formData: FormData) => Promise<void>;
};

export function EvaluationTab({
  evaluation,
  id,
  isFastEvaluation,
  job,
  linkStoryToJobAction,
  saveCorrectionAction,
  saveStoryAction,
}: Props) {
  if (!evaluation) {
    return (
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>No evaluation yet</CardTitle>
            <CardDescription>Run the evaluation to see all seven analysis blocks for this role.</CardDescription>
          </CardHeader>
          <StreamingEvaluation hasExistingEvaluation={false} jobId={id} />
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {isFastEvaluation ? (
        // The score's first follow-up question is "against what?", so the
        // posting's requirements sit beside it rather than a tab away.
        <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          <FastEvaluationCard evaluation={evaluation} />
          <PostingRequirementsCard
            description={job.parsedDescription || job.rawDescription}
            evaluation={evaluation}
          />
        </div>
      ) : (
        <>
          <AIProviderBadge
            generationMs={evaluation.generationMs}
            model={evaluation.modelUsed}
            provider={evaluation.providerUsed}
            tokensUsed={evaluation.tokensUsed}
          />

          <PostingRequirementsCard
            description={job.parsedDescription || job.rawDescription}
            evaluation={evaluation}
          />

          <section className="grid gap-4 lg:grid-cols-2">
            <EvaluationSection title="A. Role summary" items={evaluation.sections.roleSummary} />
            <EvaluationSection title="B. Match with resume" items={evaluation.sections.matchWithResume} />
            <EvaluationSection title="C. Level and strategy" items={evaluation.sections.levelStrategy} />
            <EvaluationSection title="D. Comp and demand" items={evaluation.sections.compensationDemand} />
            <div className="lg:col-span-2">
              <EvaluationSection title="E. Personalization plan" items={evaluation.sections.tailoringPlan} />
            </div>
            <div className="lg:col-span-2">
              <InterviewPlanSection
                items={evaluation.sections.interviewPlan}
                jobId={id}
                linkStoryAction={linkStoryToJobAction}
                matchedStories={getMatchingStoriesForJob(id)}
              />
            </div>
            <EvaluationSection title="G. Posting legitimacy" items={evaluation.sections.postingLegitimacy} />
            <EvaluationSection title="Keywords" items={evaluation.keywords} />
          </section>

          {/* Save a story */}
          <Card>
            <CardHeader>
              <CardTitle>Save a story from this evaluation</CardTitle>
              <CardDescription>Pre-fill a STAR story from this job&apos;s interview plan. Complete it in Interview Prep. Only older evaluations carry an interview plan — new ones route story work to Interview Prep instead.</CardDescription>
            </CardHeader>
            <form action={saveStoryAction} className="grid gap-3">
              <input name="jobId" type="hidden" value={id} />
              <input name="storySource" type="hidden" value={evaluation.sections.interviewPlan.join(" ")} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Story title" name="title" placeholder="e.g. Led design system rollout" />
                <Input label="Situation" name="situation" placeholder="What was the context?" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Task" name="task" placeholder="Your role" />
                <Input label="Action" name="action" placeholder="What you did" />
                <Input label="Result" name="result" placeholder="Measurable outcome" />
              </div>
              <div><SubmitButton label="Save to story bank" savedLabel="Saved" variant="secondary" /></div>
            </form>
          </Card>
        </>
      )}

      {/* Correct evaluation */}
      <Card>
        <CardHeader>
          <CardTitle>Correct evaluation</CardTitle>
          <CardDescription>Override score or recommendation when the AI got it wrong. Corrections feed back into future evaluations.</CardDescription>
        </CardHeader>
        <form action={saveCorrectionAction} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-[1fr_9rem_14rem]">
            <Input defaultValue={evaluation.roleArchetype} label="Role archetype" name="roleArchetype" />
            <Input defaultValue={evaluation.fitScore} label="Fit score" max={100} min={0} name="fitScore" type="number" />
            <Select defaultValue={evaluation.recommendation} label="Recommendation" name="recommendation">
              <option>Priority apply</option>
              <option>Strong apply</option>
              <option>Review manually</option>
              <option>Save for later</option>
              <option>Skip</option>
              <option>Blocked</option>
            </Select>
          </div>
          <Textarea defaultValue={evaluation.summary} label="Summary" name="summary" />
          <Textarea defaultValue={evaluation.strengths.join("\n")} hint="One per line." label="Strengths" name="strengths" />
          <Textarea defaultValue={evaluation.gaps.join("\n")} hint="One per line." label="Gaps" name="gaps" />
          <Textarea defaultValue={evaluation.redFlags.join("\n")} hint="One per line." label="Red flags" name="redFlags" />
          <Textarea
            defaultValue={String(evaluation.userCorrection.correctionNote ?? "")}
            hint="Explain what the evaluator got wrong."
            label="Correction note"
            name="correctionNote"
          />
          <div><SubmitButton label="Save correction" savedLabel="Saved" variant="secondary" /></div>
        </form>
      </Card>
    </div>
  );
}
