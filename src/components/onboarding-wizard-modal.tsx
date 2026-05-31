"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AISettingsForm } from "@/components/ai-settings-form";
import { ExtractProfileButton } from "@/components/extract-profile-button";
import { ResumeBuilderEditor } from "@/components/resume-builder-editor";
import { ResumeManageCard } from "@/components/resume-manage-card";
import { Button, Input, SubmitButton, Textarea } from "@/components/ui";
import {
  createOnboardingResumeLaneAction,
  dismissOnboardingAction,
  saveOnboardingIntegrationsAction,
  saveOnboardingPreferencesAction,
  saveOnboardingScheduleAction,
} from "@/app/dashboard/onboarding-actions";
import { cn } from "@/lib/utils";
import type { AISettingsRecord, ResumeBuilderVersionRecord, ResumeRecord, UserProfileRecord, WorkMode } from "@/lib/db/types";

type StepId = "ai" | "resume" | "preferences" | "integrations" | "ready";

type OnboardingWizardModalProps = {
  settings: AISettingsRecord;
  resumes: ResumeRecord[];
  profile: UserProfileRecord;
  titleFilters: {
    positive: string[];
    negative: string[];
  };
  hasKey: boolean;
  hasResume: boolean;
  hasRolePreferences: boolean;
  hasLocationPreferences: boolean;
  hasConfirmedPreferences: boolean;
  hasAdzunaKeys: boolean;
  hasBraveKey: boolean;
  hasExtractedProfile: boolean;
  resumeVersions: Record<string, ResumeBuilderVersionRecord | undefined>;
};

const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];

function workModeLabel(mode: WorkMode) {
  if (mode === "remote") return "Remote";
  if (mode === "hybrid") return "Hybrid";
  return "On-site";
}

function setupWarning(statuses: Record<StepId, boolean>) {
  const missing = [];
  if (!statuses.ai) missing.push("AI provider key");
  if (!statuses.resume) missing.push("resume lane upload");
  if (!statuses.preferences) missing.push("desired positions, title filters, and location mode");
  return missing;
}

export function OnboardingWizardModal({
  settings,
  resumes,
  profile,
  titleFilters,
  hasKey,
  hasResume,
  hasRolePreferences,
  hasLocationPreferences,
  hasConfirmedPreferences,
  hasAdzunaKeys,
  hasBraveKey,
  hasExtractedProfile,
  resumeVersions,
}: OnboardingWizardModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [extractionDone, setExtractionDone] = useState(hasExtractedProfile);
  // When set, shows the resume builder inline (full-screen within the modal overlay)
  const [builderResumeId, setBuilderResumeId] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

  const statuses = useMemo<Record<StepId, boolean>>(() => ({
    ai: hasKey,
    // Resume step is only complete once the file is uploaded AND AI extraction has run
    resume: hasResume && hasExtractedProfile,
    preferences: hasConfirmedPreferences,
    integrations: hasAdzunaKeys || hasBraveKey,
    ready: hasKey && hasResume && hasExtractedProfile && hasConfirmedPreferences,
  }), [hasAdzunaKeys, hasBraveKey, hasConfirmedPreferences, hasExtractedProfile, hasKey, hasResume]);

  const firstIncompleteStep = (Object.keys(statuses) as StepId[]).find((step) => !statuses[step]) ?? "ready";
  const [activeStep, setActiveStep] = useState<StepId>(firstIncompleteStep);

  // Track previous statuses so we only auto-advance when a step transitions
  // false → true (just completed), not when the user manually navigates back to it.
  const prevStatuses = useRef(statuses);
  useEffect(() => {
    const prev = prevStatuses.current;
    prevStatuses.current = statuses;
    if (statuses.ready) return;
    // Resume step: never auto-advance — user must run extraction and click Continue
    if (activeStep === "resume") return;
    // Only advance when this specific step just became complete
    if (!prev[activeStep] && statuses[activeStep]) setActiveStep(firstIncompleteStep);
  }, [activeStep, firstIncompleteStep, statuses]);

  const steps: Array<{ id: StepId; title: string; description: string; optional?: boolean }> = [
    {
      id: "ai",
      title: "AI provider",
      description: "Add one API key so scoring, resume generation, and answer drafting can run.",
    },
    {
      id: "resume",
      title: "Resume lanes",
      description: "Upload at least one PDF resume lane. You can add more lanes for different career angles.",
    },
    {
      id: "preferences",
      title: "Job preferences",
      description: "Set target roles, title filters, and location mode before scanning.",
    },
    {
      id: "integrations",
      title: "Integrations",
      description: "Connect Adzuna and Brave Search for broader job coverage.",
      optional: true,
    },
    {
      id: "ready",
      title: "Ready",
      description: "Review sources, scan for jobs, then start evaluating matches.",
    },
  ];

  const positiveTitleFilters = titleFilters.positive;
  const missingItems = setupWarning(statuses);
  const visibleResumes = resumes.length > 0 ? resumes : [];

  async function addResumeLane() {
    await createOnboardingResumeLaneAction();
    router.refresh();
  }

  async function savePreferences(formData: FormData) {
    await saveOnboardingPreferencesAction(formData);
    setActiveStep("integrations");
    router.refresh();
  }

  async function saveIntegrations(formData: FormData) {
    await saveOnboardingIntegrationsAction(formData);
    setActiveStep("ready");
    router.refresh();
  }

  async function dismissOnboarding() {
    await saveOnboardingScheduleAction(scheduleEnabled);
    await dismissOnboardingAction();
    setOpen(false);
    router.refresh();
  }

  function requestClose() {
    if (statuses.ready) {
      void dismissOnboarding();
      return;
    }
    setConfirmClose(true);
  }

  // Inline resume builder — takes over the full overlay while the user reviews structure
  if (builderResumeId) {
    const inlineVersion = resumeVersions[builderResumeId];
    const inlineResume = resumes.find((r) => r.id === builderResumeId);
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-panel" role="dialog" aria-modal="true" aria-label="Resume builder">
        <div className="p-5">
          {!inlineVersion || !inlineResume ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <p className="text-sm text-muted">Preparing resume builder…</p>
            </div>
          ) : (
            <ResumeBuilderEditor
              resumeId={inlineResume.id}
              resumeName={inlineResume.name}
              version={inlineVersion}
              isNew={true}
              onDone={() => { setBuilderResumeId(null); router.refresh(); }}
            />
          )}
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-panel border border-warning/35 bg-warning/8 p-5" role="alert">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">Onboarding is not complete</p>
            <p className="text-sm leading-6 text-muted">
              The app will fail to generate useful matches, resumes, and answer drafts until setup is finished.
            </p>
          </div>
          <Button onClick={() => { setConfirmClose(false); setOpen(true); }} variant="primary">
            Resume onboarding
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-labelledby="onboarding-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/45 px-4 py-6 backdrop-blur-sm sm:py-10"
      role="dialog"
    >
      <div className="mx-auto grid min-h-full max-w-5xl place-items-center">
        <div className="w-full overflow-hidden rounded-panel border border-border bg-panel shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">First-run setup</p>
              <h2 className="mt-1 text-xl font-semibold text-ink" id="onboarding-title">Job Search Terminal onboarding</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                Complete each step here before using the dashboard. Your data stays on this machine.
              </p>
            </div>
            {statuses.ready && (
              <button
                aria-label="Close onboarding"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-lg leading-none text-muted transition-colors hover:border-accent hover:text-ink"
                onClick={requestClose}
                type="button"
              >
                ×
              </button>
            )}
          </div>

          {confirmClose ? (
            <div className="grid gap-5 p-5 sm:p-6">
              <div className="rounded-panel border border-danger/30 bg-danger/5 p-5">
                <p className="text-base font-semibold text-ink">Setup is not finished</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  The app will fail to generate useful matches, tailored resumes, and application answers until these
                  required items are completed.
                </p>
                <ul className="mt-3 grid gap-1 text-sm text-muted">
                  {missingItems.map((item) => (
                    <li key={item}>Missing: {item}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setConfirmClose(false)} variant="primary">Back to setup</Button>
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[260px_1fr]">
              <aside className="border-b border-border bg-surface p-4 lg:border-b-0 lg:border-r">
                <ol className="grid gap-2" aria-label="Onboarding steps">
                  {steps.map((step, index) => {
                    const active = step.id === activeStep;
                    const complete = statuses[step.id];
                    const locked =
                      (step.id === "resume" && !statuses.ai) ||
                      (step.id === "preferences" && (!statuses.ai || !statuses.resume)) ||
                      (step.id === "integrations" && !statuses.preferences) ||
                      (step.id === "ready" && !statuses.ready);
                    return (
                      <li key={step.id}>
                        <button
                          className={cn(
                            "grid w-full grid-cols-[2rem_1fr] gap-3 rounded-control border px-3 py-3 text-left transition-colors",
                            active ? "border-accent bg-panel" : "border-transparent hover:bg-panel",
                            locked && "cursor-not-allowed opacity-55"
                          )}
                          disabled={locked}
                          onClick={() => setActiveStep(step.id)}
                          type="button"
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                              complete
                                ? "border-success bg-success text-white"
                                : active
                                  ? "border-accent bg-accent text-white"
                                  : step.optional
                                    ? "border-dashed border-border bg-surface text-muted"
                                    : "border-border bg-surface text-muted"
                            )}
                          >
                            {complete ? "✓" : step.optional && !active ? "·" : index + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                              {step.title}
                              {step.optional && (
                                <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium leading-4 text-muted">
                                  Optional
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-muted">{step.description}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </aside>

              <main className="max-h-[78vh] overflow-y-auto p-5 sm:p-6">
                {activeStep === "ai" && (
                  <section className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">Add an AI API key</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Choose one provider, paste the key, and save. The wizard will continue after the dashboard sees a saved key.
                      </p>
                    </div>
                    <AISettingsForm
                      compact
                      onSaved={() => router.refresh()}
                      settings={settings}
                      submitLabel={hasKey ? "Save API settings" : "Save and continue"}
                    />
                  </section>
                )}

                {activeStep === "resume" && (
                  <section className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">Upload resume lanes</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        {!hasResume
                          ? "Upload your resume PDF. You'll be taken to the resume builder to review the structure before continuing."
                          : "Resume uploaded. Extract your full profile with AI, then continue to set job preferences."}
                      </p>
                    </div>

                    {/* Step A: Upload (no resume yet) */}
                    {!hasResume && (
                      <div className="grid gap-3">
                        {visibleResumes.length === 0 ? (
                          <div className="grid gap-3">
                            <p className="text-sm text-muted">No resume lanes yet. Add one to get started.</p>
                            <form action={addResumeLane}>
                              <SubmitButton label="Add resume lane" pendingLabel="Adding…" savedLabel="Lane added ✓" />
                            </form>
                          </div>
                        ) : (
                          visibleResumes.map((resume) => (
                            <ResumeManageCard
                              evidence={resume.evidence}
                              id={resume.id}
                              key={resume.id}
                              name={resume.name}
                              wordCount={resume.wordCount}
                              onUploaded={() => { setBuilderResumeId(resume.id); router.refresh(); }}
                            />
                          ))
                        )}
                      </div>
                    )}

                    {/* Step B: Resume uploaded — extract + review */}
                    {hasResume && (
                      <>
                        <div className="grid gap-3">
                          {visibleResumes.map((resume) => (
                            <ResumeManageCard
                              evidence={resume.evidence}
                              id={resume.id}
                              key={resume.id}
                              name={resume.name}
                              wordCount={resume.wordCount}
                            />
                          ))}
                        </div>

                        <div className="rounded-control border border-border bg-surface p-4">
                          <p className="text-sm font-semibold text-ink">Extract full profile details</p>
                          <p className="mt-1 text-sm leading-6 text-muted">
                            Run AI extraction to populate skills, target roles, and career intelligence from your resume.
                          </p>
                          <div className="mt-3">
                            <ExtractProfileButton
                              disabled={!hasKey}
                              onExtracted={() => { setExtractionDone(true); router.refresh(); }}
                            />
                          </div>
                        </div>

                        {/* Optional: add more lanes — only after extraction done */}
                        {extractionDone && visibleResumes.every((r) => r.sourceFile) && (
                          <form action={addResumeLane}>
                            <SubmitButton label="Add another lane (optional)" pendingLabel="Adding…" savedLabel="Lane added ✓" variant="secondary" />
                          </form>
                        )}

                        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                          {!extractionDone && (
                            <p className="text-xs text-muted">Run &ldquo;Extract with AI&rdquo; above to populate your profile before continuing.</p>
                          )}
                          <Button
                            className="ml-auto"
                            disabled={!extractionDone}
                            onClick={() => setActiveStep("preferences")}
                            type="button"
                            variant="primary"
                          >
                            Continue to job preferences →
                          </Button>
                        </div>
                      </>
                    )}
                  </section>
                )}

                {activeStep === "preferences" && (
                  <section className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">Set job preferences</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Review the resume-derived values, adjust them, then save to confirm before continuing.
                      </p>
                      {(hasRolePreferences || hasLocationPreferences) && !hasConfirmedPreferences ? (
                        <p className="mt-3 rounded-control border border-warning/35 bg-warning/8 px-3 py-2 text-sm leading-6 text-muted">
                          Resume upload filled some values. Confirm they match your search before moving to Ready.
                        </p>
                      ) : null}
                    </div>
                    <form action={savePreferences} className="grid gap-4">
                      <Textarea
                        defaultValue={profile.targetRoles.join("\n")}
                        hint="One desired role title per line."
                        label="Desired positions"
                        name="targetRoles"
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Textarea
                          defaultValue={positiveTitleFilters.join("\n")}
                          hint="One title keyword per line. Jobs must match at least one when this list is not empty."
                          label="Include when title contains"
                          name="titlePositive"
                        />
                        <Textarea
                          defaultValue={titleFilters.negative.join("\n")}
                          hint="One title keyword per line."
                          label="Exclude when title contains"
                          name="titleNegative"
                        />
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-ink">Location mode</legend>
                        <div className="flex flex-wrap gap-3">
                          {WORK_MODES.map((mode) => (
                            <label
                              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-panel px-3 text-sm text-ink"
                              key={mode}
                            >
                              <input
                                className="h-4 w-4 rounded border-border"
                                defaultChecked={profile.workModes.includes(mode)}
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
                        <SubmitButton label="Save and continue →" pendingLabel="Saving…" savedLabel="Saved ✓" />
                      </div>
                    </form>
                  </section>
                )}

                {activeStep === "integrations" && (
                  <section className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">Optional integrations</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Both are free and optional. You can skip this step and add keys later in Settings → AI Provider.
                      </p>
                    </div>

                    <form action={saveIntegrations} className="grid gap-5">
                      <div className="rounded-panel border border-border bg-surface p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink">Adzuna · Job aggregator</p>
                            {hasAdzunaKeys && (
                              <span className="rounded-full bg-success/10 px-2 py-px text-xs font-medium text-success">Configured ✓</span>
                            )}
                          </div>
                          <a
                            className="shrink-0 text-xs text-accent hover:underline"
                            href="/help/job-search#aggregator"
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Help →
                          </a>
                        </div>
                        <p className="text-sm leading-6 text-muted">
                          Pulls matching jobs directly from Adzuna&apos;s index using your saved roles and locations — no browser session needed.
                          Free tier: 2,000 queries/month.
                        </p>
                        <div className="mt-4 grid gap-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              autoComplete="off"
                              label="App ID"
                              name="adzunaAppId"
                              placeholder={hasAdzunaKeys ? "Leave blank to keep existing" : "e.g. a1b2c3d4"}
                            />
                            <Input
                              autoComplete="off"
                              label="API Key"
                              name="adzunaApiKey"
                              placeholder={hasAdzunaKeys ? "Leave blank to keep existing" : "e.g. e5f6g7h8i9j0…"}
                              type="password"
                            />
                          </div>
                          <p className="text-xs text-muted">
                            Free keys at{" "}
                            <a className="text-accent hover:underline" href="https://developer.adzuna.com" rel="noopener noreferrer" target="_blank">
                              developer.adzuna.com
                            </a>
                          </p>
                        </div>
                      </div>

                      <div className="rounded-panel border border-border bg-surface p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink">Brave Search · Source discovery</p>
                            {hasBraveKey && (
                              <span className="rounded-full bg-success/10 px-2 py-px text-xs font-medium text-success">Configured ✓</span>
                            )}
                          </div>
                          <a
                            className="shrink-0 text-xs text-accent hover:underline"
                            href="/help/ai-providers#discovery-aggregators"
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Help →
                          </a>
                        </div>
                        <p className="text-sm leading-6 text-muted">
                          Powers the &ldquo;Search discover&rdquo; button in Settings → Sources. Finds new companies using Ashby, Greenhouse, or Lever
                          from live search results. Free tier: 2,000 queries/month.
                        </p>
                        <div className="mt-4 grid gap-3">
                          <Input
                            autoComplete="off"
                            label="API Key"
                            name="braveSearchApiKey"
                            placeholder={hasBraveKey ? "Leave blank to keep existing" : "e.g. BSAxxxxxxxxxx…"}
                            type="password"
                          />
                          <p className="text-xs text-muted">
                            Free keys at{" "}
                            <a className="text-accent hover:underline" href="https://brave.com/search/api" rel="noopener noreferrer" target="_blank">
                              brave.com/search/api
                            </a>
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <SubmitButton label="Save and continue" pendingLabel="Saving…" savedLabel="Saved ✓" />
                        <Button onClick={() => setActiveStep("ready")} type="button" variant="secondary">
                          Skip for now
                        </Button>
                      </div>
                    </form>
                  </section>
                )}

                {activeStep === "ready" && (
                  <section className="grid gap-5">
                    <div className="rounded-panel border border-success/30 bg-success/5 p-5">
                      <h3 className="text-lg font-semibold text-ink">Setup complete</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        The dashboard is ready for scanning, scoring, resume generation, and answer drafting.
                      </p>
                    </div>
                    <div className="rounded-panel border border-border bg-surface p-5">
                      <p className="text-sm font-semibold text-ink">Next steps</p>
                      <ol className="mt-3 grid gap-2 text-sm leading-6 text-muted">
                        <li>1. Open Settings and review scan sources. Disable sources you do not want to scan.</li>
                        <li>2. Return to Dashboard and run Scan for new jobs.</li>
                        <li>3. Review imported jobs, evaluate promising matches, and generate tailored resumes only for roles you want to pursue.</li>
                      </ol>
                    </div>
                    <label className="flex items-start gap-2 rounded-panel border border-border bg-surface p-4 text-sm leading-6 text-ink">
                      <input checked={scheduleEnabled} className="mt-1" onChange={(event) => setScheduleEnabled(event.target.checked)} type="checkbox" />
                      Scan approved sources every six hours while this app is running. Fresh matches will appear on the Dashboard.
                    </label>
                    <Button onClick={() => void dismissOnboarding()} variant="primary">Open dashboard</Button>
                  </section>
                )}
              </main>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
