import Link from "next/link";
import { revalidatePath } from "next/cache";
import { SubmitButton, Textarea } from "@/components/ui";
import {
  getAISettings,
  getResumes,
  getTitleFilters,
  getUserProfile,
  saveTitleFilters,
  updateUserProfile,
} from "@/lib/db/queries";
import { splitListValue } from "@/lib/profile/intelligence";
import type { WorkMode } from "@/lib/db/types";

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

const WORK_MODE_VALUES = new Set<WorkMode>(["remote", "hybrid", "onsite"]);

function splitWorkModes(formData: FormData): WorkMode[] {
  return formData.getAll("workModes").filter((value): value is WorkMode => WORK_MODE_VALUES.has(value as WorkMode));
}

function remotePreferenceFromWorkModes(workModes: WorkMode[]): "remote-only" | "local-or-remote" | "all" {
  if (workModes.length === 1 && workModes[0] === "remote") return "remote-only";
  if (workModes.includes("remote") && workModes.length < 3) return "local-or-remote";
  return "all";
}

function workModeLabel(mode: WorkMode) {
  if (mode === "remote") return "Remote";
  if (mode === "hybrid") return "Hybrid";
  return "On-site";
}

function normalizeTitleKeywords(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function mergeUnique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ── main component ──────────────────────────────────────────────────────── */

/**
 * Replaces normal dashboard content until the required setup records exist:
 * AI credentials, at least one extracted resume lane, title filters, target roles,
 * and selected location modes.
 */
export function NewUserOnboarding() {
  const settings = getAISettings();
  const resumes = getResumes();
  const profile = getUserProfile();
  const titleFilters = getTitleFilters();
  const hasKey = !!(
    settings.openaiApiKey ||
    settings.anthropicApiKey ||
    settings.geminiApiKey
  );
  const hasResume = resumes.some((r) => r.wordCount > 0);
  const positiveTitleFilters = titleFilters.positive.length > 0
    ? titleFilters.positive
    : normalizeTitleKeywords(profile.targetRoles);
  const hasRolePreferences = profile.targetRoles.length > 0 && titleFilters.positive.length > 0;
  const hasLocationPreferences = profile.workModes.length > 0;

  async function saveOnboardingPreferencesAction(formData: FormData) {
    "use server";

    const previous = getUserProfile();
    const targetRoles = mergeUnique(splitListValue(formData.get("targetRoles")));
    const positive = normalizeTitleKeywords(splitListValue(formData.get("titlePositive")));
    const negative = normalizeTitleKeywords(splitListValue(formData.get("titleNegative")));
    const workModes = splitWorkModes(formData);

    updateUserProfile({
      ...previous,
      targetRoles,
      workModes,
      remotePreference: remotePreferenceFromWorkModes(workModes),
    });
    saveTitleFilters(positive, negative);

    revalidatePath("/dashboard");
    revalidatePath("/profile");
    revalidatePath("/settings");
    revalidatePath("/jobs");
  }

  return (
    <div className="grid gap-8">
      {/* Hero */}
      <div className="rounded-panel border border-border bg-panel px-8 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Welcome</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Job Search Terminal</h2>
        <p className="mx-auto mt-3 max-w-prose text-sm leading-7 text-muted">
          Your personal, AI-powered job search command center. Complete the setup steps below
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
                      small free credit. The default model is cost-effective for job search tasks.
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
            hasResume
              ? "border-success/30 bg-success/5"
              : hasKey
                ? "border-accent/40 bg-accent/5"
                : "border-border bg-panel opacity-60"
          }`}
        >
          {hasResume ? <StepCircleDone /> : hasKey ? <StepCircleActive n={2} /> : <StepCirclePending n={2} />}

          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">
              {hasResume ? "Resume lane ready ✓" : "Upload at least one resume"}
            </p>
            {hasResume ? (
              <p className="mt-1 text-sm text-success">
                {resumes.filter((r) => r.wordCount > 0).length} resume lane
                {resumes.filter((r) => r.wordCount > 0).length !== 1 ? "s" : ""} uploaded. You can add more lanes any time.
              </p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-muted">
                Upload a PDF through the resume-lane workflow. Each lane can represent a different career angle.
                Then open <span className="font-medium text-ink">Profile → Overview</span> and run extraction to populate
                skills and target roles from the resume.
              </p>
            )}
            {(hasKey || hasResume) && (
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

        {/* ── Step 3: Role and location preferences ── */}
        <li
          className={`flex gap-4 rounded-panel border p-5 ${
            hasRolePreferences && hasLocationPreferences
              ? "border-success/30 bg-success/5"
              : hasResume
                ? "border-accent/40 bg-accent/5"
                : "border-border bg-panel opacity-60"
          }`}
        >
          {hasRolePreferences && hasLocationPreferences
            ? <StepCircleDone />
            : hasResume
              ? <StepCircleActive n={3} />
              : <StepCirclePending n={3} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {hasRolePreferences && hasLocationPreferences ? "Preferences saved ✓" : "Add job preferences"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted">
              These preferences control which jobs are imported and how matches are scored. Resume-extracted roles are
              used as the starting point; adjust them before scanning.
            </p>

            <form action={saveOnboardingPreferencesAction} className="mt-4 grid gap-4">
              <Textarea
                defaultValue={profile.targetRoles.join("\n")}
                disabled={!hasResume}
                hint="One desired role title per line."
                label="Desired positions"
                name="targetRoles"
                placeholder="Principal Product Designer"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Textarea
                  defaultValue={positiveTitleFilters.join("\n")}
                  disabled={!hasResume}
                  hint="One title keyword per line. Jobs must match at least one when this list is not empty."
                  label="Include when title contains"
                  name="titlePositive"
                  placeholder="principal product designer"
                />
                <Textarea
                  defaultValue={titleFilters.negative.join("\n")}
                  disabled={!hasResume}
                  hint="One title keyword per line."
                  label="Exclude when title contains"
                  name="titleNegative"
                  placeholder="intern"
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink">Location mode</legend>
                <div className="flex flex-wrap gap-3">
                  {(["remote", "hybrid", "onsite"] as WorkMode[]).map((mode) => (
                    <label
                      className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-panel px-3 text-sm text-ink has-[:disabled]:opacity-55"
                      key={mode}
                    >
                      <input
                        className="h-4 w-4 rounded border-border"
                        defaultChecked={profile.workModes.includes(mode)}
                        disabled={!hasResume}
                        name="workModes"
                        type="checkbox"
                        value={mode}
                      />
                      {workModeLabel(mode)}
                    </label>
                  ))}
                </div>
                <p className="text-xs leading-5 text-muted">
                  Select every work arrangement this search should include.
                </p>
              </fieldset>
              <div>
                {hasResume ? (
                  <SubmitButton
                    className="min-h-9 px-4 py-1.5"
                    label="Save preferences"
                    pendingLabel="Saving…"
                    savedLabel="Preferences saved ✓"
                  />
                ) : (
                  <button
                    className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-control border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-white opacity-55"
                    disabled
                    type="button"
                  >
                    Save preferences
                  </button>
                )}
              </div>
            </form>
          </div>
        </li>

        {/* ── Step 4: Scan for jobs ── */}
        <li className={`flex gap-4 rounded-panel border p-5 ${
          hasKey && hasResume && hasRolePreferences && hasLocationPreferences
            ? "border-accent/40 bg-accent/5"
            : "border-border bg-panel opacity-60"
        }`}>
          {hasKey && hasResume && hasRolePreferences && hasLocationPreferences ? <StepCircleActive n={4} /> : <StepCirclePending n={4} />}
          <div>
            <p className="text-sm font-semibold text-ink">Scan for jobs and get AI fit scores</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Once setup is complete, the dashboard will show your metrics and the scan action.
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
