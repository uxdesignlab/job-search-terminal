import Link from "next/link";
import { getAISettings, getResumes } from "@/lib/db/queries";

/**
 * Shown on the dashboard for returning users who are partially set up.
 * Hidden when no resume is uploaded (NewUserOnboarding handles that state).
 * Hidden when everything is configured.
 */
export function OnboardingBanner() {
  const settings = getAISettings();
  const resumes = getResumes();

  const hasResume = resumes.some((r) => r.wordCount > 0);
  const hasKey = !!(settings.openaiApiKey || settings.anthropicApiKey || settings.geminiApiKey);

  // New user state is handled by <NewUserOnboarding> on the dashboard — skip here
  if (!hasResume) return null;

  // Fully set up — nothing to show
  if (hasKey) return null;

  // Has a resume but no AI key — prompt to add one
  return (
    <div className="rounded-panel border border-accent/40 bg-accent/5 p-5" role="alert">
      <p className="text-sm font-semibold text-ink">Add an AI key to unlock evaluations</p>
      <p className="mt-1 text-sm leading-6 text-muted">
        Your resume is uploaded — one more step. Add an API key to enable AI fit scoring,
        tailored resume generation, and application answer drafting.
      </p>
      <ol className="mt-3 grid gap-1.5 text-sm text-muted" aria-label="Setup steps">
        <li>
          <span className="font-medium text-success">✓</span>{" "}
          Resume uploaded and profile ready
        </li>
        <li>
          <span className="font-medium text-ink">2.</span> Go to Settings and add your
          OpenAI, Claude, or Gemini API key
        </li>
        <li>
          <span className="font-medium text-ink">3.</span> Open a job and click{" "}
          <span className="font-medium text-ink">Evaluate with AI</span> — instant fit score
        </li>
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
