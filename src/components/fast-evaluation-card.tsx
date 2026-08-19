import { Badge, Card, CardHeader, CardTitle } from "@/components/ui";
import { toneForRecommendation } from "@/lib/evaluation/recommendation-tone";
import { FIT_COMPONENT_MAX } from "@/lib/evaluation/fast-evaluation";
import { LOCAL_FALLBACK_LABEL } from "@/lib/evaluation/evaluation-phases";
import type { EvaluationRecord, FitComponents } from "@/lib/db/types";

/**
 * The fast-v2 evaluation surface (PRD v0.2.1 §17).
 *
 * Three signals lead: fit, recommendation, confidence. `scoreLabel` is
 * deliberately absent — it is a compatibility column, and a third headline
 * judgment beside the other two reads as disagreement rather than detail.
 */

const COMPONENT_LABELS: Record<keyof FitComponents, string> = {
  coreRequirements: "Core requirements",
  roleAndSeniority: "Role and seniority",
  relevantEvidence: "Relevant evidence",
  userPreferences: "Preferences and direction",
};

const DIRECTION_LABELS: Record<string, string> = {
  strong: "Strong",
  partial: "Partial",
  none: "None",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function FastEvaluationCard({ evaluation }: { evaluation: EvaluationRecord }) {
  const model = evaluation.modelOutput;
  const isBlocked = evaluation.recommendation === "Blocked";
  const usedFallback = evaluation.providerUsed === LOCAL_FALLBACK_LABEL;
  const summary = evaluation.requirementsSummary;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evaluation</CardTitle>
      </CardHeader>

      <div className="grid gap-6">
        {/* Headline */}
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-3xl font-semibold text-ink">{evaluation.fitScore}%</p>
            <p className="text-sm text-muted">
              {evaluation.confidenceLabel ? `${evaluation.confidenceLabel} confidence` : "Confidence not recorded"}
            </p>
          </div>
          <Badge tone={toneForRecommendation(evaluation.recommendation)}>{evaluation.recommendation}</Badge>
        </div>

        <p className="text-sm font-medium text-ink">
          {evaluation.roleArchetype}
          {evaluation.seniority && evaluation.seniority !== "Unknown" ? ` · ${evaluation.seniority}` : ""}
          {evaluation.domain ? ` · ${evaluation.domain}` : ""}
        </p>

        {usedFallback && (
          <p className="rounded-control border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
            Scored locally by rules — the AI provider could not be used for this evaluation.
          </p>
        )}

        {evaluation.completenessWarnings.length > 0 && (
          <p className="rounded-control border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
            Some fields came back incomplete: {evaluation.completenessWarnings.join("; ")}
          </p>
        )}

        {isBlocked ? (
          <Section title="Why this is blocked">
            <p className="text-sm text-ink">This role conflicts with a saved non-negotiable requirement.</p>
            <ul className="grid gap-1.5">
              {evaluation.hardBlockers.map((blocker, index) => (
                <li className="flex gap-2 text-sm text-danger" key={index}>
                  <span aria-hidden>✕</span>
                  <span>
                    {blocker.postingEvidence}
                    <span className="block text-muted">Saved constraint: {blocker.candidateConstraint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Section title="Hard blockers">
            <p className="text-sm text-muted">None found</p>
          </Section>
        )}

        {evaluation.strengths.length > 0 && (
          <Section title="Why it fits">
            <ul className="grid gap-1.5">
              {evaluation.strengths.map((item, index) => (
                <li className="flex gap-2 text-sm text-ink" key={index}>
                  <span aria-hidden className="text-success">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {evaluation.gaps.length > 0 && (
          <Section title="Concerns">
            <ul className="grid gap-1.5">
              {evaluation.gaps.map((item, index) => (
                <li className="flex gap-2 text-sm text-ink" key={index}>
                  <span aria-hidden className="text-warning">△</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="grid gap-6 sm:grid-cols-3">
          <Section title="Requirements">
            <p className="text-sm text-ink">
              {summary
                ? `${summary.supported} supported · ${summary.partial} partial · ${summary.unknown} unknown`
                : "Not recorded"}
            </p>
          </Section>
          <Section title="Compensation">
            <p className="text-sm text-ink">{model?.postedCompensation || "Not listed in the posting"}</p>
          </Section>
          <Section title="Recommended resume">
            <p className="text-sm text-ink">{evaluation.resumeBaseRecommendation}</p>
          </Section>
        </div>

        {/* Inspectability (§17). Native disclosure: keyboard-operable, no JS. */}
        <details className="rounded-control border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-ink">View details</summary>
          <div className="grid gap-5 border-t border-border px-4 py-4">
            {evaluation.fitComponents && (
              <Section title="Fit components">
                <ul className="grid gap-1">
                  {(Object.keys(COMPONENT_LABELS) as Array<keyof FitComponents>).map((key) => (
                    <li className="flex justify-between gap-4 text-sm" key={key}>
                      <span className="text-muted">{COMPONENT_LABELS[key]}</span>
                      <span className="font-mono text-ink">
                        {evaluation.fitComponents?.[key]} / {FIT_COMPONENT_MAX[key]}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-4 border-t border-border pt-1 text-sm font-medium">
                    <span className="text-ink">Total</span>
                    <span className="font-mono text-ink">{evaluation.fitScore} / 100</span>
                  </li>
                </ul>
              </Section>
            )}

            {evaluation.directionAlignment && (
              <Section title="Direction alignment">
                <p className="text-sm text-ink">
                  {DIRECTION_LABELS[evaluation.directionAlignment] ?? evaluation.directionAlignment}
                </p>
                {model?.directionAlignmentRationale && (
                  <p className="text-sm text-muted">{model.directionAlignmentRationale}</p>
                )}
              </Section>
            )}

            {evaluation.requirementMatch.length > 0 && (
              <Section title="Requirement matches">
                <ul className="grid gap-1">
                  {evaluation.requirementMatch.map((item, index) => (
                    <li className="text-sm text-ink" key={index}>{item}</li>
                  ))}
                </ul>
              </Section>
            )}

            {evaluation.resumeEvidence.length > 0 && (
              <Section title="Evidence used">
                <ul className="grid gap-1">
                  {evaluation.resumeEvidence.map((item, index) => (
                    <li className="text-sm text-ink" key={index}>{item}</li>
                  ))}
                </ul>
              </Section>
            )}

            {evaluation.redFlags.length > 0 && (
              <Section title="Red flags">
                <ul className="grid gap-1">
                  {evaluation.redFlags.map((item, index) => (
                    <li className="text-sm text-ink" key={index}>{item}</li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Run">
              <p className="text-sm text-muted">
                {evaluation.providerUsed || "unknown provider"} / {evaluation.modelUsed || "unknown model"}
                {evaluation.generationMs > 0 ? ` · ${(evaluation.generationMs / 1000).toFixed(1)}s` : ""}
              </p>
            </Section>
          </div>
        </details>
      </div>
    </Card>
  );
}
