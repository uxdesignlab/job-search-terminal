type EvaluationRunMetaProps = {
  provider: string;
  model: string;
  generationMs: number;
  createdAt: string;
};

/**
 * One line of provenance for the evaluation on screen: when it ran, which model
 * ran it, and how long it took. It sits beside the tabs rather than inside the
 * Evaluation tab because the cost of a run is worth seeing from any tab — a
 * three-minute local fallback is the kind of thing you only notice if it is
 * always in view.
 */
export function EvaluationRunMeta({ provider, model, generationMs, createdAt }: EvaluationRunMetaProps) {
  const when = formatRunTime(createdAt);
  const engine = [provider, model].filter(Boolean).join(" / ");
  const duration = generationMs > 0 ? `${(generationMs / 1000).toFixed(1)}s` : "";
  const parts = [when, engine, duration].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <p className="pb-2 text-xs text-muted sm:whitespace-nowrap" title={createdAt || undefined}>
      Evaluated {parts.join(" · ")}
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
