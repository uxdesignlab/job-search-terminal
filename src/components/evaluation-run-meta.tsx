import { LOCAL_FALLBACK_LABEL } from "@/lib/evaluation/evaluation-phases";

type EvaluationRunMetaProps = {
  provider: string;
  model: string;
  generationMs: number;
  createdAt: string;
};

/**
 * One line of provenance for the evaluation on screen: which model ran it, how
 * long it took, and when the job was first assessed. It sits beside the tabs
 * rather than inside the Evaluation tab because the cost of a run is worth
 * seeing from any tab — a three-minute local fallback is the kind of thing you
 * only notice if it is always in view.
 *
 * The date and the rest of the line describe *different runs*, which is why each
 * half is labelled. `created_at` is deliberately preserved across
 * re-evaluations so a job keeps the date it was first assessed, while provider,
 * model and duration are replaced every time. Reading them as one phrase —
 * "Evaluated <date> · <model> · <duration>" — put a stale date beside fresh
 * provenance and claimed today's model ran months ago.
 */
export function EvaluationRunMeta({ provider, model, generationMs, createdAt }: EvaluationRunMetaProps) {
  const firstAssessed = formatRunTime(createdAt);
  // "local-fallback / local-fallback" is the stored value, not a sentence. Rows
  // written before an AI failure stopped being scored by rules still exist, and
  // the one thing they must say is that no model produced them.
  const engine =
    provider === LOCAL_FALLBACK_LABEL ? "scored by local rules, no AI model" : [provider, model].filter(Boolean).join(" / ");
  const duration = generationMs > 0 ? `${(generationMs / 1000).toFixed(1)}s` : "";
  const latestRun = [engine, duration].filter(Boolean).join(" · ");
  if (!latestRun && !firstAssessed) return null;

  return (
    <p className="pb-2 text-xs text-muted sm:whitespace-nowrap" title={createdAt || undefined}>
      {latestRun ? `Evaluated ${latestRun}` : ""}
      {latestRun && firstAssessed ? " · " : ""}
      {firstAssessed ? `first assessed ${firstAssessed}` : ""}
    </p>
  );
}

function formatRunTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
