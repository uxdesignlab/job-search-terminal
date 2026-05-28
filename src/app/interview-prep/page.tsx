import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, SubmitButton, Textarea } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { VoicePractice } from "@/components/voice-practice";
import { getStories } from "@/lib/db/queries";
import { deleteStoryAction, saveStoryAction } from "./actions";

export const dynamic = "force-dynamic";

const COMMON_QUESTIONS = [
  "Tell me about a time you led a cross-functional initiative.",
  "Describe a situation where you had to influence without authority.",
  "Give an example of a product decision you made with incomplete data.",
  "Tell me about a time you had to navigate ambiguity.",
  "Describe how you've handled a significant project failure.",
  "Give an example of how you built alignment with senior stakeholders.",
  "Tell me about a project you're most proud of.",
  "Describe a time you had to give difficult feedback.",
  "How do you prioritize when everything feels urgent?",
  "Tell me about a time you changed someone's mind with data.",
];

export default function InterviewPrepPage() {
  const stories = getStories();

  return (
    <Shell activeItem="Interview Prep">
      <div className="grid gap-6">
        <PageHeader
          description="Practice answers with your voice — the AI structures them into STAR stories automatically."
          eyebrow="Interview preparation"
          title="Interview Prep"
        />

        {/* ── Voice practice ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Voice practice</CardTitle>
            <CardDescription>
              Answer each question out loud. The AI will structure your spoken answer into a STAR story you can edit and save.
              Optionally updates your writing voice profile so generated content matches how you naturally express yourself.
            </CardDescription>
          </CardHeader>
          <VoicePractice questions={COMMON_QUESTIONS} />
        </Card>

        {/* ── Manual story entry ─────────────────────────────────────── */}
        <details className="rounded-panel border border-border bg-panel">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-muted hover:text-ink transition-colors">
            Add story manually
          </summary>
          <div className="border-t border-border px-5 pb-5 pt-4">
            <form action={saveStoryAction} className="grid gap-4">
              <input name="id" type="hidden" value="" />
              <Textarea label="Title" name="title" hint="A short label for quick recall, e.g. 'Led API migration'" />
              <Textarea label="Situation" name="situation" hint="Context and background" />
              <Textarea label="Task" name="task" hint="Your specific responsibility" />
              <Textarea label="Action" name="action" hint="Concrete steps you took" />
              <Textarea label="Result" name="result" hint="Measurable outcome" />
              <Textarea label="Reflection" name="reflection" hint="What you'd do differently; what you learned" />
              <Textarea label="Skills demonstrated" name="skills" hint="Comma-separated, e.g. stakeholder management, SQL" />
              <Textarea label="Themes" name="themes" hint="Comma-separated, e.g. leadership, data-driven, cross-functional" />
              <div>
                <SubmitButton label="Save story" savedLabel="Story saved" />
              </div>
            </form>
          </div>
        </details>

        {/* ── Story bank ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Story bank</CardTitle>
            <CardDescription>{stories.length} {stories.length === 1 ? "story" : "stories"} saved</CardDescription>
          </CardHeader>
          {stories.length > 0 ? (
            <div className="grid gap-4">
              {stories.map((story) => (
                <div className="rounded-control border border-border bg-surface p-4" key={story.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-ink">{story.title}</h3>
                    <div className="flex gap-3">
                      {story.sourceJobId && (
                        <Link className="text-xs text-accent hover:underline" href={`/jobs/${story.sourceJobId}`}>
                          From job eval
                        </Link>
                      )}
                      {story.sourceBlockF === "evaluation" && (
                        <Badge tone="neutral">AI evaluation</Badge>
                      )}
                      {story.sourceBlockF === "voice-practice" && (
                        <span className="text-xs text-muted">Voice practice</span>
                      )}
                      <form action={deleteStoryAction.bind(null, story.id)}>
                        <button className="text-xs text-muted hover:text-ink" type="submit">Delete</button>
                      </form>
                    </div>
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm">
                    {story.situation && (
                      <div>
                        <dt className="font-medium text-muted">Situation</dt>
                        <dd className="mt-0.5 text-ink">{story.situation}</dd>
                      </div>
                    )}
                    {story.task && (
                      <div>
                        <dt className="font-medium text-muted">Task</dt>
                        <dd className="mt-0.5 text-ink">{story.task}</dd>
                      </div>
                    )}
                    {story.action && (
                      <div>
                        <dt className="font-medium text-muted">Action</dt>
                        <dd className="mt-0.5 text-ink">{story.action}</dd>
                      </div>
                    )}
                    {story.result && (
                      <div>
                        <dt className="font-medium text-muted">Result</dt>
                        <dd className="mt-0.5 text-ink">{story.result}</dd>
                      </div>
                    )}
                    {story.reflection && (
                      <div>
                        <dt className="font-medium text-muted">Reflection</dt>
                        <dd className="mt-0.5 text-ink">{story.reflection}</dd>
                      </div>
                    )}
                  </dl>

                  {(story.skills.length > 0 || story.themes.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {story.skills.map((skill) => (
                        <Badge key={skill} tone="neutral">{skill}</Badge>
                      ))}
                      {story.themes.map((theme) => (
                        <Badge key={theme}>{theme}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              description="Record your first answer above or add a story manually. Stories from Block F evaluations also appear here."
              title="No stories yet"
            />
          )}
        </Card>
      </div>
    </Shell>
  );
}
