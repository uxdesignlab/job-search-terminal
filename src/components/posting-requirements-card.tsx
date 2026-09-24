import { Badge, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { EvaluationRecord } from "@/lib/db/types";
import { extractQualificationChecklist } from "@/lib/evaluation/posting-evidence";
import {
  extractPostingRequirements,
  looksScored,
  splitRequirementLine,
  type PostingRequirement,
  type RequirementStatus,
} from "@/lib/jobs/posting-requirements";

type Props = {
  evaluation: EvaluationRecord | null;
  description: string;
};

const STATUS_TONE: Record<RequirementStatus, "success" | "warning" | undefined> = {
  supported: "success",
  partial: "warning",
  unknown: undefined,
};

/**
 * What the posting asks for, in one scannable list, beside the evaluation that
 * scored it. The evaluation says how well the fit is; this says what the fit was
 * measured against — which is the question the score always raises next.
 */
export function PostingRequirementsCard({ evaluation, description }: Props) {
  const { items, sourceNote } = resolveRequirements(evaluation, description);
  const qualifications = extractQualificationChecklist(description);
  const qualificationCount = qualifications.required.length + qualifications.preferred.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requirements in the posting</CardTitle>
        <CardDescription>{sourceNote}</CardDescription>
      </CardHeader>
      {items.length === 0 ? (
        <p className="text-sm text-muted">
          No requirements could be read from this posting. Fetch or paste the job description on the
          Overview tab, then re-evaluate.
        </p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item, index) => (
            <li className="flex gap-2 text-sm leading-6 text-ink" key={`${index}-${item.text}`}>
              <span aria-hidden className="select-none text-muted/60">•</span>
              <span className="min-w-0">
                {item.text}
                {item.status ? (
                  <>
                    {" "}
                    <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {qualificationCount > 0 && (
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            Full qualifications from the saved posting ({qualificationCount})
          </summary>
          {(["required", "preferred"] as const).map((group) => qualifications[group].length > 0 && (
            <div className="mt-3" key={group}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{group}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {qualifications[group].map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </details>
      )}
    </Card>
  );
}

function resolveRequirements(
  evaluation: EvaluationRecord | null,
  description: string
): { items: PostingRequirement[]; sourceNote: string } {
  const scored = evaluation?.modelOutput?.requirementMatches ?? [];
  if (scored.length > 0) {
    return {
      items: scored.map((match) => ({ text: match.requirement, status: match.status })),
      sourceNote: "AI match status for recorded items. Open the full saved list below to check coverage.",
    };
  }

  // A stored run that predates `modelOutput` kept the same thing as one string per
  // requirement, ending in its status. Accepted only when the strings really are in
  // that shape: the oldest evaluations wrote free-form "X aligns with Y" notes there,
  // which are not the posting's requirements and must not be presented as them.
  const merged = (evaluation?.requirementMatch ?? []).map(splitRequirementLine);
  if (looksScored(merged)) {
    return {
      items: merged,
      sourceNote: "AI match status for recorded items. Open the full saved list below to check coverage.",
    };
  }

  const parsed = extractPostingRequirements(description);
  if (parsed.length > 0) {
    return {
      items: parsed.map((text) => ({ text })),
      // Said plainly: these are the posting's own bullets, not a judgement about them.
      sourceNote: "Taken straight from the saved description — not yet checked against your resume.",
    };
  }

  // Nothing parseable in the description, so the old evaluation's notes are all there
  // is. Labelled as notes, because that is what they are.
  return {
    items: merged,
    sourceNote: "From this evaluation's notes — this run did not record the posting's requirements separately.",
  };
}
