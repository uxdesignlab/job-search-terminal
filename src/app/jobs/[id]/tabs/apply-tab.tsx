import { ApplicationQuestionsForm } from "@/components/application-questions-form";
import { CopyAnswerButton } from "@/components/copy-answer-button";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ExternalLinkButton,
  Input,
  LinkButton,
  Textarea,
} from "@/components/ui";
import type {
  ApplicationAnswerDraftRecord,
  ApplicationRecord,
  JobRecord,
} from "@/lib/db/types";
import type { TabHref } from "./types";

type Props = {
  answerDrafts: ApplicationAnswerDraftRecord[];
  application: ApplicationRecord | undefined;
  id: string;
  job: JobRecord;
  resolvedPosting: boolean;
  tabHref: TabHref;
  updateStatusAction: (formData: FormData) => Promise<void>;
};

export function ApplyTab({
  answerDrafts,
  application,
  id,
  job,
  resolvedPosting,
  tabHref,
  updateStatusAction,
}: Props) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Application tracker */}
        <Card>
          <CardHeader>
            <CardTitle>Application status</CardTitle>
            <CardDescription>
              <span className="flex flex-wrap items-center gap-2">
                <span>Track where you are in the process. All actions are manual — the app never submits anything on your behalf.</span>
                {application?.followUpDate && (
                  <Badge>{`Follow-up ${application.followUpDate}`}</Badge>
                )}
              </span>
            </CardDescription>
          </CardHeader>
          <div className="grid gap-4">
            <form action={updateStatusAction} className="grid gap-3">
              <input name="status" type="hidden" value="Follow-up needed" />
              <Input
                defaultValue={application?.followUpDate ?? ""}
                hint="Set a date to check back after applying."
                label="Follow-up date"
                name="followUpDate"
                type="date"
              />
              <Textarea
                defaultValue={application?.notes ?? ""}
                label="Note"
                name="notes"
                hint="Private note for your next action."
              />
              <div>
                <Button type="submit" variant="secondary">Save follow-up</Button>
              </div>
            </form>
          </div>
        </Card>

        {/* Quick links */}
        <div className="grid gap-4 content-start">
          <Card>
            <CardHeader>
              <CardTitle>Next actions</CardTitle>
            </CardHeader>
            <div className="grid gap-2">
              {resolvedPosting ? <ExternalLinkButton href={job.url}>Open job posting ↗</ExternalLinkButton> : null}
              <LinkButton href={`/jobs/${id}/research`} variant="secondary">Company research</LinkButton>
              <LinkButton href={tabHref("outreach")} variant="secondary">Find people</LinkButton>
            </div>
          </Card>
        </div>
      </div>

      {/* Application assistant */}
      <Card>
        <CardHeader>
          <CardTitle>Application assistant</CardTitle>
          <CardDescription>Paste the questions from the application form and get AI-generated answers grounded in your resume and evaluation.</CardDescription>
        </CardHeader>
        <div className="grid gap-4">
          <ApplicationQuestionsForm jobId={id} />
          {answerDrafts.length > 0 ? (
            <ol className="grid gap-3">
              {answerDrafts.map((draft) => (
                <li className="rounded-control border border-border bg-surface px-3 py-3" key={draft.id}>
                  <p className="text-sm font-semibold text-ink">{draft.question}</p>
                  <p className="mt-2 text-sm leading-6 text-ink whitespace-pre-wrap">{draft.answer}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted font-mono">
                      {draft.modelUsed ? `${draft.modelUsed} · ${draft.providerUsed}` : draft.source}
                    </p>
                    <CopyAnswerButton answer={draft.answer} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">No drafts yet. Add your questions and click Prepare answers.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
