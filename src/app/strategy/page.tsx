import { revalidatePath } from "next/cache";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, Input, PageHeader, SubmitButton, Textarea } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { getAIPromptOverrides, getEvaluationFeedback, getRoleDirections, getUserProfile, resetAIPromptOverride, saveAIPromptOverride, updateRoleDirection } from "@/lib/db/queries";
import type { AIPromptId } from "@/lib/db/types";
import { PROMPT_DEFINITIONS } from "@/lib/ai/prompt-registry";
import { splitListValue } from "@/lib/profile/intelligence";

export const dynamic = "force-dynamic";

function fitTone(level: string): "success" | "neutral" | "warning" | "danger" | "neutral" {
  const l = level.toLowerCase();
  if (l === "direct") return "success";
  if (l === "adjacent") return "neutral";
  if (l === "selective") return "warning";
  if (l === "avoid") return "danger";
  return "neutral";
}

function fitDescription(level: string): string {
  const l = level.toLowerCase();
  if (l === "direct") return "Strong match — apply confidently";
  if (l === "adjacent") return "Good overlap — worth pursuing with framing";
  if (l === "selective") return "Partial match — apply selectively to strong fits";
  if (l === "avoid") return "Low alignment — skip unless exceptional circumstances";
  return level;
}

function ScoreBar({ value }: { value: number }) {
  const tone = value >= 85 ? "bg-success" : value >= 70 ? "bg-accent" : value >= 55 ? "bg-warning/70" : "bg-danger/50";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "prompts" ? "prompts" : "strategy";
  const profile = getUserProfile();
  const roleDirections = getRoleDirections();
  const feedback = getEvaluationFeedback();
  const promptOverrides = new Map(getAIPromptOverrides().map((prompt) => [prompt.promptId, prompt.customPrompt]));

  async function updateRoleDirectionAction(formData: FormData) {
    "use server";
    updateRoleDirection({
      id: String(formData.get("id") ?? ""),
      fitLevel: String(formData.get("fitLevel") ?? ""),
      score: Number(formData.get("score") ?? 0),
      rationale: String(formData.get("rationale") ?? ""),
      gaps: splitListValue(formData.get("gaps"))
    });
    revalidatePath("/strategy");
    revalidatePath("/dashboard");
  }

  async function savePromptAction(formData: FormData) {
    "use server";
    const promptId = String(formData.get("promptId") ?? "") as AIPromptId;
    const customPrompt = String(formData.get("customPrompt") ?? "").trim();
    if (!PROMPT_DEFINITIONS.some((prompt) => prompt.id === promptId)) {
      throw new Error("Unknown prompt.");
    }
    saveAIPromptOverride(promptId, customPrompt);
    revalidatePath("/strategy");
  }

  async function resetPromptAction(formData: FormData) {
    "use server";
    const promptId = String(formData.get("promptId") ?? "") as AIPromptId;
    if (!PROMPT_DEFINITIONS.some((prompt) => prompt.id === promptId)) {
      throw new Error("Unknown prompt.");
    }
    resetAIPromptOverride(promptId);
    revalidatePath("/strategy");
  }

  const directCount = roleDirections.filter((d) => d.fitLevel.toLowerCase() === "direct").length;
  const adjacentCount = roleDirections.filter((d) => d.fitLevel.toLowerCase() === "adjacent").length;

  return (
    <Shell activeItem="Strategy">
      <div className="grid gap-6">
        <PageHeader
          description="Your personal role-fit map — which archetypes to pursue directly, which to frame carefully, and which to skip."
          eyebrow="Search strategy"
          title="Strategy"
        />

        <div className="flex gap-1 border-b border-border">
          {[
            { id: "strategy", label: "Strategy", href: "/strategy" },
            { id: "prompts", label: "AI Prompts", href: "/strategy?tab=prompts" },
          ].map(({ id, label, href }) => (
            <a
              key={id}
              href={href}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === id
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </a>
          ))}
        </div>

        {activeTab === "prompts" && (
        <Card>
          <CardHeader>
            <CardTitle>AI prompt tuning</CardTitle>
            <CardDescription>
              Tune resume tailoring, application answers, and outreach. Locked safety rules still apply even when prompts are edited.
            </CardDescription>
          </CardHeader>
          <div className="grid gap-4">
            {PROMPT_DEFINITIONS.map((prompt) => {
              const currentPrompt = promptOverrides.get(prompt.id) ?? prompt.defaultPrompt;
              const customized = promptOverrides.has(prompt.id);
              return (
                <div className="rounded-control border border-border bg-surface p-4" key={prompt.id}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{prompt.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted">{prompt.description}</p>
                    </div>
                    <Badge tone={customized ? "warning" : "neutral"}>{customized ? "Custom" : "Default"}</Badge>
                  </div>
                  <form action={savePromptAction} className="grid gap-3">
                    <input name="promptId" type="hidden" value={prompt.id} />
                    <Textarea
                      defaultValue={currentPrompt}
                      id={`prompt-${prompt.id}`}
                      label={`${prompt.label} prompt`}
                      name="customPrompt"
                      rows={8}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <SubmitButton label="Save prompt" savedLabel="Saved" variant="secondary" />
                      {customized && (
                        <button
                          className="min-h-11 rounded-control border border-border px-4 py-2 text-sm font-medium text-muted hover:border-danger hover:text-danger"
                          formAction={resetPromptAction}
                          type="submit"
                        >
                          Reset to default
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              );
            })}
          </div>
        </Card>
        )}

        {activeTab === "strategy" && <>
        {/* Search focus + summary stats */}
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <Card>
            <CardHeader>
              <CardTitle>Current search focus</CardTitle>
              <CardDescription>Your stated goal — informs scoring and resume tailoring across all roles.</CardDescription>
            </CardHeader>
            <p className="text-sm leading-6 text-ink">{profile.direction || profile.currentSearchGoal || "No search focus set. Update your profile to add one."}</p>
          </Card>

          {roleDirections.length > 0 && (
            <div className="flex gap-3 lg:flex-col lg:justify-center">
              <div className="rounded-panel border border-border bg-panel px-5 py-3 text-center">
                <p className="text-2xl font-bold text-success">{directCount}</p>
                <p className="text-xs text-muted">Direct fits</p>
              </div>
              <div className="rounded-panel border border-border bg-panel px-5 py-3 text-center">
                <p className="text-2xl font-bold text-accent">{adjacentCount}</p>
                <p className="text-xs text-muted">Adjacent</p>
              </div>
            </div>
          )}
	        </div>

        {/* Role direction cards */}
        {roleDirections.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {roleDirections.map((direction) => (
              <div className="rounded-panel border border-border bg-panel overflow-hidden" key={direction.id}>
                {/* Summary */}
                <div className="px-5 pt-5 pb-4 grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-ink leading-snug">{direction.roleFamily}</h3>
                    <Badge tone={fitTone(direction.fitLevel)}>{direction.fitLevel}</Badge>
                  </div>

                  {/* Score */}
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>{fitDescription(direction.fitLevel)}</span>
                      <span className="font-semibold text-ink">{direction.score}%</span>
                    </div>
                    <ScoreBar value={direction.score} />
                  </div>

                  {/* Rationale */}
                  <p className="text-sm leading-5 text-muted">{direction.rationale}</p>

                  {/* Gaps */}
                  {direction.gaps.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Gaps to address</p>
                      <ul className="grid gap-1">
                        {direction.gaps.map((gap) => (
                          <li className="flex items-start gap-1.5 text-xs text-ink" key={gap}>
                            <span className="mt-0.5 shrink-0 text-warning">›</span>
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Inline edit — collapsed by default */}
                <details className="border-t border-border">
                  <summary className="cursor-pointer list-none px-5 py-2.5 text-xs font-medium text-muted hover:text-ink hover:bg-surface transition-colors select-none">
                    ✎ Edit this direction
                  </summary>
                  <form action={updateRoleDirectionAction} className="grid gap-3 px-5 py-4 bg-surface">
                    <input name="id" type="hidden" value={direction.id} />
                    <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                      <Input defaultValue={direction.fitLevel} label="Fit level" name="fitLevel" hint="Direct · Adjacent · Selective · Avoid" />
                      <Input defaultValue={String(direction.score)} label="Score" max={100} min={0} name="score" type="number" />
                    </div>
                    <Textarea defaultValue={direction.rationale} label="Rationale" name="rationale" />
                    <Textarea defaultValue={direction.gaps.join("\n")} hint="One gap per line." label="Gaps" name="gaps" />
                    <SubmitButton label="Save" savedLabel="Saved ✓" variant="secondary" />
                  </form>
                </details>
              </div>
            ))}
          </section>
        ) : (
          <EmptyState
            description="Role directions are generated from your profile and resume evidence. Go to Profile and run extraction to populate this."
            title="No role directions yet"
          />
        )}

        {/* How to use this */}
        <Card>
          <CardHeader>
            <CardTitle>How to use your strategy</CardTitle>
            <CardDescription>These fit levels guide your job pipeline — not just scoring, but where to spend energy.</CardDescription>
          </CardHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { level: "Direct", tone: "success" as const, tip: "Apply to all strong-fit postings. Tailor resume, run full evaluation, prioritize outreach." },
              { level: "Adjacent", tone: "neutral" as const, tip: "Apply when the JD emphasizes your crossover strengths. Frame your story carefully in the cover letter." },
              { level: "Selective", tone: "warning" as const, tip: "Apply only when fit score is 80+. Investigate the team before applying — many will be false positives." },
              { level: "Avoid", tone: "danger" as const, tip: "Skip by default. Only reconsider if you know the hiring manager or have a strong referral." },
            ].map(({ level, tone, tip }) => (
              <div className="flex items-start gap-3 rounded-control border border-border bg-surface p-3" key={level}>
                <Badge tone={tone}>{level}</Badge>
                <p className="text-xs leading-5 text-muted">{tip}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Evaluation feedback */}
        {feedback.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Evaluation corrections</CardTitle>
              <CardDescription>Manual overrides from job evaluations — use these to refine your direction scores above.</CardDescription>
            </CardHeader>
            <ol className="grid gap-2">
              {feedback.map((item) => (
                <li className="rounded-control border border-border bg-surface px-3 py-2.5 text-sm" key={item.id}>
                  <p className="font-medium text-ink">{item.title} <span className="font-normal text-muted">at {item.company}</span></p>
                  <p className="mt-0.5 text-xs text-muted">
                    Corrected to <span className="font-medium text-ink">{item.correctedScore}% · {item.correctedRecommendation}</span>
                    {item.correctionNote ? ` — ${item.correctionNote}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        )}
        </>}
      </div>
    </Shell>
  );
}
