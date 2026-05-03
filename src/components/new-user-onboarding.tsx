import Link from "next/link";
import { getAISettings } from "@/lib/db/queries";

/* ── tiny helpers ────────────────────────────────────────────────────────── */

function StepCircleDone() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-sm font-bold text-white"
    >
      ✓
    </span>
  );
}

function StepCircleActive({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white"
    >
      {n}
    </span>
  );
}

function StepCirclePending({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-sm font-bold text-muted"
    >
      {n}
    </span>
  );
}

function ProviderSteps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-2 grid gap-1 pl-1 text-sm text-muted">
      {children}
    </ol>
  );
}

function ProviderStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 font-medium text-ink">{n}.</span>
      <span>{children}</span>
    </li>
  );
}

function ProviderAccordion({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-control border border-border">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          {title}
          {badge && (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              {badge}
            </span>
          )}
        </span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="border-t border-border bg-surface px-3 pb-4 pt-3">
        {children}
      </div>
    </details>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */

/**
 * Shown on the dashboard when no resume has been uploaded yet.
 * Replaces normal dashboard content with a focused 3-step setup guide.
 * Step 1: Add AI API key (instructions for all three providers).
 * Step 2: Upload resume.
 * Step 3: Extract profile and start scanning.
 */
export function NewUserOnboarding() {
  const settings = getAISettings();
  const hasKey = !!(
    settings.openaiApiKey ||
    settings.anthropicApiKey ||
    settings.geminiApiKey
  );

  return (
    <div className="grid gap-8">
      {/* Hero */}
      <div className="rounded-panel border border-border bg-panel px-8 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Welcome</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Job Search Terminal</h2>
        <p className="mx-auto mt-3 max-w-prose text-sm leading-7 text-muted">
          Your personal, AI-powered job search command center. Complete the three steps below
          and you&apos;ll be ready to scan jobs, get fit scores, and generate tailored resumes.
        </p>
      </div>

      {/* Steps */}
      <ol className="grid gap-4" aria-label="Setup steps">

        {/* ── Step 1: Add AI API key ── */}
        <li
          className={`flex gap-4 rounded-panel border p-5 ${
            hasKey
              ? "border-success/30 bg-success/5"
              : "border-accent/40 bg-accent/5"
          }`}
        >
          {hasKey ? <StepCircleDone /> : <StepCircleActive n={1} />}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">
              {hasKey ? "AI API key configured ✓" : "Add an AI API key"}
            </p>

            {hasKey ? (
              <p className="mt-1 text-sm text-success">
                AI features are enabled. You can change providers in{" "}
                <Link
                  className="font-medium text-accent underline-offset-2 hover:underline"
                  href="/settings"
                >
                  Settings → AI Providers
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm leading-6 text-muted">
                  The app uses AI to score job fit, tailor resumes, and draft outreach. Pick
                  any one provider — you only need one. Your key is stored locally on your
                  machine and is never sent anywhere except to the provider when you use an AI
                  feature.
                </p>

                {/* Provider instructions */}
                <div className="mt-4 grid gap-2">

                  <ProviderAccordion badge="free tier available" title="Google Gemini">
                    <ProviderSteps>
                      <ProviderStep n={1}>
                        Go to{" "}
                        <a
                          className="font-medium text-accent underline-offset-2 hover:underline"
                          href="https://aistudio.google.com/apikey"
                          rel="noreferrer"
                          target="_blank"
                        >
                          aistudio.google.com/apikey ↗
                        </a>{" "}
                        and sign in with your Google account.
                      </ProviderStep>
                      <ProviderStep n={2}>
                        Click <strong className="text-ink">Create API key</strong> → choose an
                        existing project or create a new one.
                      </ProviderStep>
                      <ProviderStep n={3}>
                        Copy the key that appears.
                      </ProviderStep>
                      <ProviderStep n={4}>
                        Go to{" "}
                        <Link
                          className="font-medium text-accent underline-offset-2 hover:underline"
                          href="/settings"
                        >
                          Settings → AI Providers
                        </Link>
                        , select <strong className="text-ink">Google Gemini</strong>, paste the
                        key, and click <strong className="text-ink">Save</strong>.
                      </ProviderStep>
                    </ProviderSteps>
                    <p className="mt-3 text-xs text-muted">
                      Gemini 2.5 Flash is the default model. The free tier is generous enough
                      for regular job search use.
                    </p>
                  </ProviderAccordion>

                  <ProviderAccordion title="OpenAI (GPT)">
                    <ProviderSteps>
                      <ProviderStep n={1}>
                        Go to{" "}
                        <a
                          className="font-medium text-accent underline-offset-2 hover:underline"
                          href="https://platform.openai.com/api-keys"
                          rel="noreferrer"
                          target="_blank"
                        >
                          platform.openai.com/api-keys ↗
                        </a>{" "}
                        and sign in or create an account.
                      </ProviderStep>
                      <ProviderStep n={2}>
                        Click <strong className="text-ink">Create new secret key</strong>, give
                        it a name (e.g. &ldquo;Job Search Terminal&rdquo;), then click{" "}
                        <strong className="text-ink">Create secret key</strong>.
                      </ProviderStep>
                      <ProviderStep n={3}>
                        Copy the key — it won&apos;t be shown again.
                      </ProviderStep>
                      <ProviderStep n={4}>
                        Go to{" "}
                        <Link
                          className="font-medium text-accent underline-offset-2 hover:underline"
                          href="/settings"
                        >
                          Settings → AI Providers
                        </Link>
                        , select <strong className="text-ink">OpenAI</strong>, paste the key,
                        and click <strong className="text-ink">Save</strong>.
                      </ProviderStep>
                    </ProviderSteps>
                    <p className="mt-3 text-xs text-muted">
                      OpenAI requires a paid account with credits. New accounts may receive a
                      small free credit. The default model is GPT-4o mini which is cost-effective
                      for job search tasks.
                    </p>
                  </ProviderAccordion>

                  <ProviderAccordion title="Anthropic (Claude)">
                    <ProviderSteps>
                      <ProviderStep n={1}>
                        Go to{" "}
                        <a
                          className="font-medium text-accent underline-offset-2 hover:underline"
                          href="https://console.anthropic.com/settings/keys"
                          rel="noreferrer"
                          target="_blank"
                        >
                          console.anthropic.com/settings/keys ↗
                        </a>{" "}
                        and sign in or create an account.
                      </ProviderStep>
                      <ProviderStep n={2}>
                        Click <strong className="text-ink">Create Key</strong>, give it a name,
                        and confirm.
                      </ProviderStep>
                      <ProviderStep n={3}>
                        Copy the key — it won&apos;t be shown again.
                      </ProviderStep>
                      <ProviderStep n={4}>
                        Go to{" "}
                        <Link
                          className="font-medium text-accent underline-offset-2 hover:underline"
                          href="/settings"
                        >
                          Settings → AI Providers
                        </Link>
                        , select <strong className="text-ink">Anthropic</strong>, paste the key,
                        and click <strong className="text-ink">Save</strong>.
                      </ProviderStep>
                    </ProviderSteps>
                    <p className="mt-3 text-xs text-muted">
                      Anthropic requires a paid account. The default model is Claude Sonnet 4,
                      which produces high-quality evaluation and writing output.
                    </p>
                  </ProviderAccordion>
                </div>

                <div className="mt-4">
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-control border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))]"
                    href="/settings"
                  >
                    Go to Settings → AI Providers
                  </Link>
                </div>
              </>
            )}
          </div>
        </li>

        {/* ── Step 2: Upload resume ── */}
        <li
          className={`flex gap-4 rounded-panel border p-5 ${
            hasKey
              ? "border-accent/40 bg-accent/5"
              : "border-border bg-panel opacity-60"
          }`}
        >
          {hasKey ? <StepCircleActive n={2} /> : <StepCirclePending n={2} />}

          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Upload your resume</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Your resume is the foundation — AI fit scores, tailored resumes, and application
              answers all start here. Upload a PDF and the text is extracted automatically.
              Then go to <span className="font-medium text-ink">Profile → Overview</span> and
              click <span className="font-medium text-ink">Extract with AI</span> to populate
              your skills, target roles, and preferences. Review each tab before starting
              your search.
            </p>
            {hasKey && (
              <div className="mt-4">
                <Link
                  className="inline-flex min-h-9 items-center justify-center rounded-control border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))]"
                  href="/profile?tab=resumes"
                >
                  Go to Profile → Resumes
                </Link>
              </div>
            )}
          </div>
        </li>

        {/* ── Step 3: Scan for jobs ── */}
        <li className="flex gap-4 rounded-panel border border-border bg-panel p-5 opacity-60">
          <StepCirclePending n={3} />
          <div>
            <p className="text-sm font-semibold text-ink">Scan for jobs and get AI fit scores</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Come back to this dashboard and click{" "}
              <span className="font-medium text-ink">Scan for new jobs</span>. Jobs are pulled
              from hundreds of companies and scored against your profile — you&apos;ll know instantly
              what to prioritize and what to skip.
            </p>
          </div>
        </li>
      </ol>

      <p className="text-center text-xs text-muted">
        Already set up?{" "}
        <Link className="font-medium text-accent underline-offset-2 hover:underline" href="/jobs">
          Browse jobs →
        </Link>
      </p>
    </div>
  );
}
