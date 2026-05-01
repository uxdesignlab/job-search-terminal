import Link from "next/link";
import { getAISettings } from "@/lib/db/queries";

export function OnboardingBanner() {
  const settings = getAISettings();
  const hasKey = !!(settings.openaiApiKey || settings.anthropicApiKey || settings.geminiApiKey);

  if (hasKey) return null;

  return (
    <div className="rounded-panel border border-accent/40 bg-accent/5 p-5" role="alert">
      <p className="text-sm font-semibold text-ink">Get started with AI-powered evaluations</p>
      <p className="mt-1 text-sm leading-6 text-muted">
        Add an API key in Settings to unlock AI evaluation (A–G blocks), resume tailoring, outreach drafts, and application answer generation.
      </p>
      <ol className="mt-3 grid gap-1.5 text-sm text-muted" aria-label="Setup steps">
        <li><span className="font-medium text-ink">1.</span> Go to Settings and add your OpenAI, Claude, or Gemini API key</li>
        <li><span className="font-medium text-ink">2.</span> Open a job and click <span className="font-medium text-ink">Evaluate with AI</span></li>
        <li><span className="font-medium text-ink">3.</span> Generate a tailored resume and prepare application answers</li>
      </ol>
      <div className="mt-4">
        <Link
          className="inline-flex min-h-9 items-center justify-center rounded-control border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))]"
          href="/settings"
        >
          Add API key →
        </Link>
      </div>
    </div>
  );
}
