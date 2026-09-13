import Link from "next/link";
import { getAIProviderStatuses, getAISettings } from "@/lib/db/queries";
import { resolveWritingCandidates } from "@/lib/ai/factory";
import { providerLabel } from "@/lib/ai/credit-status";

/**
 * Shown on every page while a provider the user relies on is out of credits.
 *
 * Each AI action already reports its own failure, but only to whoever is looking at
 * that action — and several quietly fall back to non-AI output rather than fail. A
 * user whose cloud account ran dry would otherwise meet it as a series of oddly
 * generic results, one feature at a time. This says it once, everywhere, with the one
 * thing that fixes it.
 */
export function AICreditsBanner() {
  let exhausted: string[];
  let reachable: string[];
  try {
    const settings = getAISettings();
    reachable = resolveWritingCandidates(settings);
    const inUse = new Set(reachable);
    exhausted = getAIProviderStatuses()
      .map((status) => status.provider)
      .filter((provider) => inUse.has(provider));
  } catch {
    return null;
  }
  if (exhausted.length === 0) return null;

  const exhaustedSet = new Set(exhausted);
  const working = reachable.filter((provider) => !exhaustedSet.has(provider));
  const names = exhausted.map(providerLabel);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? "is" : "are";

  if (working.length > 0) {
    const next = working[0] === "ollama" ? "your local model" : providerLabel(working[0]);
    return (
      <div className="border-b border-warning/35 bg-warning/10" role="status">
        <p className="mx-auto max-w-6xl px-6 py-2 text-sm text-ink">
          <strong className="font-semibold">{who} {verb} out of credits.</strong>{" "}
          AI features are using {next} until you add credits.{" "}
          <Link className="font-medium text-accent underline-offset-2 hover:underline" href="/settings?tab=ai">
            AI settings
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-danger/35 bg-danger/10" role="alert">
      <p className="mx-auto max-w-6xl px-6 py-2 text-sm text-ink">
        <strong className="font-semibold">No AI provider has credits left.</strong>{" "}
        AI actions will fail until you add credits with {who} or turn on a local model.{" "}
        <Link className="font-medium text-accent underline-offset-2 hover:underline" href="/settings?tab=ai">
          AI settings
        </Link>
      </p>
    </div>
  );
}
