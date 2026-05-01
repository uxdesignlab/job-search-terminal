import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, SubmitButton, Textarea } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { getStories } from "@/lib/db/queries";
import { deleteStoryAction, saveStoryAction } from "./actions";

export const dynamic = "force-dynamic";

const COMMON_QUESTIONS = [
  "Tell me about a time you led a cross-functional initiative.",
  "Describe a situation where you had to influence without authority.",
  "Give an example of a product decision you made with incomplete data.",
  "Tell me about a time you had to navigate ambiguity.",
  "Describe how you've handled a significant project failure.",
  "Give an example of how you built alignment with senior stakeholders."
];

export default function InterviewPrepPage() {
  const stories = getStories();

  return (
    <Shell activeItem="Interview Prep">
      <div className="grid gap-6">
        <PageHeader
          description="Build your STAR story bank for interview prep. Stories feed into AI-generated application answers."
          eyebrow="Interview preparation"
          title="Interview Prep"
        />

        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add a story</CardTitle>
              <CardDescription>Structure experiences as STAR + Reflection for reuse across applications.</CardDescription>
            </CardHeader>
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
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Common interview questions</CardTitle>
              <CardDescription>Match your stories to these themes before interviews.</CardDescription>
            </CardHeader>
            <ol className="grid gap-2">
              {COMMON_QUESTIONS.map((q, i) => (
                <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={q}>
                  <span className="mr-2 font-semibold text-muted">{i + 1}.</span>
                  {q}
                </li>
              ))}
            </ol>
          </Card>
        </section>

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
                    <div className="flex gap-2">
                      {story.sourceJobId && (
                        <Link className="text-xs text-accent hover:underline" href={`/jobs/${story.sourceJobId}`}>
                          From job eval
                        </Link>
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
              description="Add, your, first, STAR, story, above. Stories, are, also, automatically, saved from Block F of AI evaluations."
              title="No stories yet"
            />
          )}
        </Card>
      </div>
    </Shell>
  );
}
