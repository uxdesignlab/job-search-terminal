import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { ConsolidationWizard } from "@/components/consolidation-wizard";
import { getEvaluationSuggestionCount, getLatestConsolidationRun } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function ConsolidatePage() {
  const suggestionCount = getEvaluationSuggestionCount();
  const latestRun = getLatestConsolidationRun();
  const resumable = latestRun && latestRun.status === "review" ? latestRun : null;

  return (
    <Shell activeItem="Interview Prep">
      <div className="grid gap-6">
        <PageHeader
          description="Group the auto-generated interview suggestions into a small set of reusable core stories. Nothing changes until you review and commit."
          eyebrow="Interview preparation"
          title="Consolidate stories"
        />
        <Link className="text-sm text-accent hover:underline" href="/interview-prep">
          ← Back to Interview Prep
        </Link>
        <ConsolidationWizard
          initialPayload={resumable?.payload ?? null}
          initialRunId={resumable?.id ?? null}
          suggestionCount={suggestionCount}
        />
      </div>
    </Shell>
  );
}
