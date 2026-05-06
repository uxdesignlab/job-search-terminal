"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AISettingsForm } from "@/components/ai-settings-form";
import { ExtractProfileButton } from "@/components/extract-profile-button";
import { ResumeManageCard } from "@/components/resume-manage-card";
import { Button, SubmitButton, Textarea } from "@/components/ui";
import {
  createOnboardingResumeLaneAction,
  dismissOnboardingAction,
  saveOnboardingPreferencesAction,
} from "@/app/dashboard/onboarding-actions";
import { cn } from "@/lib/utils";
import type { AISettingsRecord, ResumeRecord, UserProfileRecord, WorkMode } from "@/lib/db/types";

type StepId = "ai" | "resume" | "preferences" | "ready";

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
}: OnboardingWizardModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);

  const statuses = useMemo<Record<StepId, boolean>>(() => ({
    ai: hasKey,
    resume: hasResume,
    preferences: hasConfirmedPreferences,
    ready: hasKey && hasResume && hasConfirmedPreferences,
  }), [hasConfirmedPreferences, hasKey, hasResume]);

  const firstIncompleteStep = (Object.keys(statuses) as StepId[]).find((step) => !statuses[step]) ?? "ready";
  const [activeStep, setActiveStep] = useState<StepId>(firstIncompleteStep);

  useEffect(() => {
    if (statuses.ready) return;
    if (statuses[activeStep]) setActiveStep(firstIncompleteStep);
  }, [activeStep, firstIncompleteStep, statuses]);

  const steps: Array<{ id: StepId; title: string; description: string }> = [
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
    const canContinue = Boolean(
      String(formData.get("targetRoles") ?? "").trim() &&
      String(formData.get("titlePositive") ?? "").trim() &&
      formData.getAll("workModes").length > 0
    );
    await saveOnboardingPreferencesAction(formData);
    if (canContinue) setActiveStep("ready");
    router.refresh();
  }

  async function dismissOnboarding() {
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
            <button
              aria-label="Close onboarding"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-lg leading-none text-muted transition-colors hover:border-accent hover:text-ink"
              onClick={requestClose}
              type="button"
            >
              ×
            </button>
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
                <Button onClick={() => setConfirmClose(false)} variant="primary">Continue setup</Button>
                <Button onClick={() => setOpen(false)} variant="secondary">Close anyway</Button>
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
                              "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
                              complete
                                ? "border-success bg-success text-white"
                                : active
                                  ? "border-accent bg-accent text-white"
                                  : "border-border bg-surface text-muted"
                            )}
                          >
                            {complete ? "✓" : index + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-ink">{step.title}</span>
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
                        Upload a PDF to at least one lane. Keep separate lanes for different career angles.
                      </p>
                    </div>
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
                        Uploading a resume seeds positions and title filters. Run AI extraction to fill skills and richer profile details.
                      </p>
                      <div className="mt-3">
                        <ExtractProfileButton disabled={!hasResume || !hasKey} onExtracted={() => router.refresh()} />
                      </div>
                    </div>
                    <form action={addResumeLane}>
                      <SubmitButton label="Add resume lane" pendingLabel="Adding…" savedLabel="Lane added ✓" variant="secondary" />
                    </form>
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
                        <SubmitButton label="Save and continue" pendingLabel="Saving…" savedLabel="Preferences saved ✓" />
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
