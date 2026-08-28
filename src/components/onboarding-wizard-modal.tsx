"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AISettingsForm } from "@/components/ai-settings-form";
import { ExtractProfileButton } from "@/components/extract-profile-button";
import { PreferredLocationsInput } from "@/components/preferred-locations-input";
import { ResumeBuilderEditor } from "@/components/resume-builder-editor";
import { ResumeManageCard } from "@/components/resume-manage-card";
import { Button, Input, SubmitButton, Textarea } from "@/components/ui";
import {
  createOnboardingResumeLaneAction,
  dismissOnboardingAction,
  saveOnboardingIntegrationsAction,
  saveOnboardingLocationsAction,
  saveOnboardingPreferencesAction,
  saveOnboardingScheduleAction,
} from "@/app/dashboard/onboarding-actions";
import { extractTitleKeywords, looksLikeFullTitle } from "@/lib/jobs/title-keywords";
import { useModalDialog } from "@/lib/hooks/use-modal-dialog";
import { cn } from "@/lib/utils";
import type { AISettingsRecord, ResumeBuilderVersionRecord, ResumeRecord, UserProfileRecord, WorkMode } from "@/lib/db/types";

type StepId = "ai" | "resume" | "preferences" | "locations" | "integrations" | "ready";

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
  profileLocations: { preferred: string[]; remote: string[] };
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

/** Why a locked step is locked. `disabled` alone tells assistive tech nothing about
 *  what would unlock it. */
/** Mirrors the server action's list parsing closely enough to gate the submit. */
function splitLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function lockReason(step: StepId): string {
  if (step === "resume") return "Add an AI provider key first.";
  if (step === "preferences") return "Add an AI provider key and a resume lane first.";
  if (step === "locations") return "Set your roles and title keywords first.";
  if (step === "integrations") return "Choose where you want to work first.";
  return "Finish the AI provider, resume, roles, and location steps first.";
}

/** Uses the same names as the step list, so the warning and the sidebar agree. */
function setupWarning(statuses: Record<StepId, boolean>) {
  const missing = [];
  if (!statuses.ai) missing.push("AI provider — one API key");
  if (!statuses.resume) missing.push("Resume lanes — a PDF and AI extraction");
  if (!statuses.preferences) missing.push("Roles & titles — desired positions and title keywords");
  if (!statuses.locations) missing.push("Locations — work arrangement, and where on-site work can be");
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
  profileLocations,
  hasAdzunaKeys,
  hasBraveKey,
  hasExtractedProfile,
  resumeVersions,
}: OnboardingWizardModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [extractionDone, setExtractionDone] = useState(hasExtractedProfile);
  const [extractionError, setExtractionError] = useState(false);
  // When set, shows the resume builder inline (full-screen within the modal overlay)
  const [builderResumeId, setBuilderResumeId] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");
  /* Only on a genuinely fresh start. Once a key or a resume exists the user has already
     been through this, and a briefing every time would be in the way. */
  const [showIntro, setShowIntro] = useState(!hasKey && !hasResume);
  const [locationsError, setLocationsError] = useState("");
  const [selectedModes, setSelectedModes] = useState<WorkMode[]>(profile.workModes);

  // Escape routes to the same confirmation the × does, so it can never drop a
  // half-finished setup without the user seeing what is still missing.
  const dialogRef = useModalDialog({
    open: open && !builderResumeId,
    onEscape: () => requestClose(),
  });
  const builderRef = useModalDialog({ open: Boolean(builderResumeId) });

  const statuses = useMemo<Record<StepId, boolean>>(() => ({
    ai: hasKey,
    // Matches the dashboard's readiness definition exactly. Requiring extraction here
    // as well made the two disagree: the wizard called the step unfinished while the
    // dashboard already treated the profile as ready, because readiness follows the
    // saved profile data regardless of which screen filled it in. Extraction is still
    // pushed hard inside the step — it just is not what marks the step done.
    resume: hasResume,
    preferences: hasConfirmedPreferences,
    locations: hasLocationPreferences,
    integrations: hasAdzunaKeys || hasBraveKey,
    ready: hasKey && hasResume && hasConfirmedPreferences && hasLocationPreferences,
  }), [hasAdzunaKeys, hasBraveKey, hasConfirmedPreferences, hasKey, hasLocationPreferences, hasResume]);

  // "integrations" is optional, so it must not be what an otherwise-finished user lands
  // on — they should see Ready, not be parked on a step they can skip.
  const REQUIRED_STEPS: StepId[] = ["ai", "resume", "preferences", "locations"];
  const firstIncompleteStep = REQUIRED_STEPS.find((step) => !statuses[step]) ?? "ready";
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
    // AI step: same — saving a key lands on the provider summary, where the user can
    // add a fallback before pressing Continue. Advancing the moment a key verifies
    // would snatch that screen away.
    if (activeStep === "ai") return;
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
      title: "Roles & titles",
      description: "Name the roles you want and the title keywords a job must match.",
    },
    {
      id: "locations",
      title: "Locations",
      description: "Choose remote, hybrid, or on-site — and where each applies.",
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

  /* Include-lists saved by the old upload behaviour hold whole titles. Rather than
     rewrite them behind the user's back, offer the keyword form and let them apply it. */
  const suggestedKeywords = useMemo(() => {
    if (!positiveTitleFilters.some(looksLikeFullTitle)) return [];
    const keywords = extractTitleKeywords(positiveTitleFilters);
    return keywords.filter((keyword) => !positiveTitleFilters.includes(keyword));
  }, [positiveTitleFilters]);

  const positiveFieldRef = useRef<HTMLTextAreaElement>(null);
  const needsPlace = selectedModes.includes("onsite") || selectedModes.includes("hybrid");

  function applySuggestedKeywords() {
    const field = positiveFieldRef.current;
    if (!field) return;
    const kept = positiveTitleFilters.filter((entry) => !looksLikeFullTitle(entry));
    field.value = [...new Set([...kept, ...suggestedKeywords])].join("\n");
    field.focus();
  }
  const missingItems = setupWarning(statuses);
  const visibleResumes = resumes.length > 0 ? resumes : [];

  async function addResumeLane() {
    await createOnboardingResumeLaneAction();
    router.refresh();
  }

  /** Advances only when the save actually satisfies readiness. It used to advance
   *  unconditionally, so a blank submit moved the user to Integrations while the
   *  sidebar re-locked steps 4 and 5 behind them. */
  async function savePreferences(formData: FormData) {
    const roles = splitLines(formData.get("targetRoles"));
    const positive = splitLines(formData.get("titlePositive"));

    const missing: string[] = [];
    if (roles.length === 0) missing.push("at least one desired position");
    if (positive.length === 0) missing.push("at least one include-title keyword");
    if (missing.length > 0) {
      setPreferencesError(`Add ${missing.join(", ")} before continuing.`);
      return;
    }

    setPreferencesError("");
    await saveOnboardingPreferencesAction(formData);
    setActiveStep("locations");
    router.refresh();
  }

  async function saveLocations(formData: FormData) {
    const modes = formData.getAll("workModes").map(String);
    const preferred = splitLines(formData.get("preferredLocations"));

    if (modes.length === 0) {
      setLocationsError("Choose at least one work arrangement.");
      return;
    }
    // Only on-site and hybrid need a place. A remote-only search has no city to give a
    // job board, and an empty remote-region list already means "anywhere".
    if ((modes.includes("onsite") || modes.includes("hybrid")) && preferred.length === 0) {
      setLocationsError("Name at least one city or region for on-site or hybrid work.");
      return;
    }

    setLocationsError("");
    await saveOnboardingLocationsAction(formData);
    setActiveStep("integrations");
    router.refresh();
  }

  async function saveIntegrations(formData: FormData) {
    await saveOnboardingIntegrationsAction(formData);
    setActiveStep("ready");
    router.refresh();
  }

  /** Only the Ready panel's own button writes the scan schedule — pressing it is the
   *  user's answer to the checkbox above it. The × used to route here too, which meant
   *  closing the dialog switched on six-hourly background scanning that the user had
   *  never been shown, over a database default of off. */
  async function finishOnboarding() {
    await saveOnboardingScheduleAction(scheduleEnabled);
    await dismissOnboardingAction();
    setOpen(false);
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

  // Inline resume builder — takes over the full overlay while the user reviews structure
  if (builderResumeId) {
    const inlineVersion = resumeVersions[builderResumeId];
    const inlineResume = resumes.find((r) => r.id === builderResumeId);
    return (
      <div
        aria-label="Resume builder"
        aria-modal="true"
        className="fixed inset-0 z-50 overflow-y-auto bg-panel outline-none"
        ref={builderRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="p-5">
          {!inlineVersion || !inlineResume ? (
            /* The version is prepared server-side and arrives on the next refresh. If it
               never does, this screen used to have no close button, no Escape and no back
               link — a full-screen dead end escapable only by reloading the page. */
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
              <p className="text-sm text-muted">Preparing resume builder…</p>
              <Button onClick={() => setBuilderResumeId(null)} variant="secondary">
                Back to setup
              </Button>
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

  // Closing unmounts this on the next refresh; the dashboard's "Finish profile setup"
  // card carries the persistent prompt and the way back in. This branch used to render a
  // warning banner with a "Resume onboarding" button for exactly one paint.
  if (!open) return null;

  return (
    <div
      aria-labelledby="onboarding-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/45 px-4 py-6 outline-none backdrop-blur-sm sm:py-10"
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
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
                  Job scoring, tailored resumes, and application answers stay unavailable until these are done. You
                  can finish them later from the Dashboard or Settings — dismissing only closes this guide.
                </p>
                <ul className="mt-3 grid gap-1 text-sm text-muted">
                  {missingItems.map((item) => (
                    <li key={item}>Still needed: {item}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setConfirmClose(false)} variant="primary">Back to setup</Button>
                <Button onClick={() => void dismissOnboarding()} variant="secondary">Dismiss setup</Button>
              </div>
            </div>
          ) : showIntro ? (
            /* A briefing, not a step: what setup needs and roughly how long, before the
               first screen asks for a paid API key. Shown only on a genuinely fresh
               start, and never again once a provider is saved. */
            <div className="grid gap-5 p-5 sm:p-6">
              <div>
                <h3 className="text-lg font-semibold text-ink">Before you start</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                  About five minutes. Everything runs on this machine — there is no account and no server.
                </p>
              </div>

              <div className="rounded-panel border border-border bg-surface p-5">
                <p className="text-sm font-semibold text-ink">What you&apos;ll need</p>
                <ul className="mt-3 grid gap-3 text-sm leading-6 text-muted">
                  <li>
                    <span className="font-medium text-ink">An AI provider.</span> Either an API key from
                    OpenAI, Claude, or Gemini — these bill you by usage, so cost depends on how much you
                    scan and evaluate — or{" "}
                    <a className="text-accent underline hover:no-underline" href="https://ollama.com" rel="noopener noreferrer" target="_blank">
                      Ollama
                    </a>{" "}
                    installed and running locally, which is free.
                  </li>
                  <li>
                    <span className="font-medium text-ink">Your resume as a PDF.</span> It must be text-based
                    rather than a scan, so its text can be extracted.
                  </li>
                  <li>
                    <span className="font-medium text-ink">The roles and places you&apos;re searching.</span>{" "}
                    Job titles you want, and whether you&apos;re open to remote, hybrid, or on-site work.
                  </li>
                </ul>
              </div>

              <div className="rounded-panel border border-border bg-surface p-5">
                <p className="text-sm font-semibold text-ink">What happens here</p>
                <ol className="mt-3 grid gap-2 text-sm leading-6 text-muted">
                  {steps
                    .filter((step) => step.id !== "ready")
                    .map((step, index) => (
                      <li key={step.id}>
                        {index + 1}. {step.title}
                        {step.optional && <span className="text-muted"> — optional</span>}
                      </li>
                    ))}
                </ol>
                <p className="mt-3 text-sm leading-6 text-muted">
                  After that the dashboard scans job boards, scores how well each role fits you, and tailors
                  resumes for the ones you want to pursue.
                </p>
              </div>

              <div>
                <Button onClick={() => setShowIntro(false)} variant="primary">Get started →</Button>
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[260px_1fr]">
              <aside className="border-b border-border bg-surface p-4 lg:border-b-0 lg:border-r">
                <ol className="grid gap-2" aria-label="Onboarding steps">
                  {steps.map((step, index) => {
                    const active = step.id === activeStep;
                    const complete = statuses[step.id];
                    // A finished step is always revisitable. Gating on prerequisites alone
                    // produced rows that were both ✓ and locked — complete, yet closed to
                    // the user who completed them.
                    const locked = !complete && (
                      (step.id === "resume" && !statuses.ai) ||
                      (step.id === "preferences" && (!statuses.ai || !statuses.resume)) ||
                      (step.id === "locations" && !statuses.preferences) ||
                      (step.id === "integrations" && !statuses.locations) ||
                      (step.id === "ready" && !statuses.ready)
                    );
                    return (
                      <li key={step.id}>
                        {/* State reached assistive tech only as a ✓ glyph and a colour, with
                            no reason attached to the four disabled rows. */}
                        <button
                          aria-current={active ? "step" : undefined}
                          aria-describedby={locked ? `${step.id}-lock-reason` : undefined}
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
                            <span className="sr-only">
                              {`Step ${index + 1} of ${steps.length}. `}
                              {complete ? "Complete." : locked ? "Locked." : "Not finished."}
                            </span>
                          </span>
                        </button>
                        {locked && (
                          <span className="sr-only" id={`${step.id}-lock-reason`}>
                            {lockReason(step.id)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </aside>

              <div className="max-h-[78vh] overflow-y-auto p-5 sm:p-6">
                {activeStep === "ai" && (
                  <section className="grid gap-5">
                    {/* The rest of setup is locked behind this step, so say so — but as the
                        step's own intro copy rather than a bordered callout. The bold lead-in
                        carries the emphasis; a warning panel over the primary instruction read
                        as an error on a screen where nothing has gone wrong yet. */}
                    <div>
                      <h3 className="text-lg font-semibold text-ink">Add an AI API key</h3>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {!hasKey && <strong className="font-semibold text-ink">This step is required. </strong>}
                        Job Search Terminal uses your own provider account to score job fit, tailor resumes, and
                        draft application answers. One key is enough — add more later as fallbacks. Keys stay on
                        this machine and are sent only to the provider you choose.
                      </p>
                    </div>

                    <AISettingsForm
                      compact
                      onComplete={() => setActiveStep("resume")}
                      onSaved={() => router.refresh()}
                      requireCredential
                      settings={settings}
                      submitLabel="Save and continue"
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
                          : "Resume uploaded. Extract your full profile with AI, then continue to name the roles you want."}
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
                              onEditRequested={() => setBuilderResumeId(resume.id)}
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
                              onEditRequested={() => setBuilderResumeId(resume.id)}
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
                              onExtracted={() => { setExtractionDone(true); setExtractionError(false); router.refresh(); }}
                              onError={() => setExtractionError(true)}
                            />
                          </div>
                        </div>

                        {/* Optional: add more lanes — only after extraction done */}
                        {extractionDone && visibleResumes.every((r) => r.sourceFile) && (
                          <form action={addResumeLane}>
                            <SubmitButton label="Add another lane (optional)" pendingLabel="Adding…" savedLabel="Lane added ✓" variant="secondary" />
                          </form>
                        )}

                        {/* Extraction is strongly recommended, not a gate. Blocking on it
                            left the step ticked-but-stuck for anyone whose extraction
                            failed, and disagreed with the dashboard, which counts a lane
                            as done on upload. */}
                        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                          {!extractionDone && !extractionError && (
                            <p className="text-xs text-muted">
                              Run &ldquo;Extract with AI&rdquo; first — scoring is much better with skills and career
                              detail filled in. You can also do it later from Profile.
                            </p>
                          )}
                          {extractionError && (
                            <p className="text-xs text-muted">Extraction failed — you can continue and re-run it from the Profile page later.</p>
                          )}
                          <Button
                            className="ml-auto shrink-0"
                            onClick={() => setActiveStep("preferences")}
                            type="button"
                            variant={extractionDone || extractionError ? "primary" : "secondary"}
                          >
                            Continue to roles &amp; titles →
                          </Button>
                        </div>
                      </>
                    )}
                  </section>
                )}

                {activeStep === "preferences" && (
                  <section className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">Roles &amp; titles</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Review the resume-derived values, adjust them, then save to confirm before continuing.
                      </p>
                      {hasRolePreferences && !hasConfirmedPreferences ? (
                        <p className="mt-3 rounded-control border border-warning/35 bg-warning/8 px-3 py-2 text-sm leading-6 text-muted">
                          Resume upload filled some values. Confirm they match your search before continuing.
                        </p>
                      ) : null}
                    </div>
                    <form action={savePreferences} className="grid gap-4">
                      <Textarea
                        defaultValue={profile.targetRoles.join("\n")}
                        hint="One desired role title per line. Full titles are fine here — this is what you want to be called."
                        label="Desired positions"
                        name="targetRoles"
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Textarea
                          defaultValue={positiveTitleFilters.join("\n")}
                          hint="Short keywords, one per line — “ux”, “product manager”, “user experience”. A job matches if its title contains any of them, so shorter means a wider search."
                          label="Include when title contains"
                          name="titlePositive"
                          textareaRef={positiveFieldRef}
                        />
                        <Textarea
                          defaultValue={titleFilters.negative.join("\n")}
                          hint="Short keywords too — “junior”, “intern”. Any match here rules the job out."
                          label="Exclude when title contains"
                          name="titleNegative"
                        />
                      </div>
                      {/* Lists written by the old upload behaviour hold whole titles like
                          "senior hci engineer / principal ux designer", which match almost
                          nothing. Offer the keyword form rather than silently rewriting. */}
                      {suggestedKeywords.length > 0 && (
                        <div className="rounded-control border border-warning/35 bg-warning/8 px-3 py-3">
                          <p className="text-sm leading-6 text-ink">
                            Some include entries look like full job titles. A title only matches a job that
                            starts with that whole phrase, so these will find very little.
                          </p>
                          <p className="mt-2 text-sm leading-6 text-muted">
                            Suggested keywords:{" "}
                            <span className="font-medium text-ink">{suggestedKeywords.join(", ")}</span>
                          </p>
                          <button
                            className="mt-2 text-sm font-medium text-accent underline hover:no-underline"
                            onClick={applySuggestedKeywords}
                            type="button"
                          >
                            Replace with keywords
                          </button>
                        </div>
                      )}
                      {preferencesError && (
                        <p className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm leading-6 text-danger" role="alert">
                          {preferencesError}
                        </p>
                      )}
                      <div>
                        <SubmitButton label="Save and continue →" pendingLabel="Saving…" savedLabel="Saved ✓" />
                      </div>
                    </form>
                  </section>
                )}

                {activeStep === "locations" && (
                  <section className="grid gap-5">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">Where do you want to work?</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        Scanning needs to know where. Fill in the list for each arrangement you chose — only
                        those are shown.
                      </p>
                    </div>
                    <form action={saveLocations} className="grid gap-5">
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-ink">Work arrangement</legend>
                        <div className="flex flex-wrap gap-3">
                          {WORK_MODES.map((mode) => (
                            <label
                              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-panel px-3 text-sm text-ink"
                              key={mode}
                            >
                              <input
                                checked={selectedModes.includes(mode)}
                                className="h-4 w-4 rounded border-border"
                                name="workModes"
                                onChange={(event) =>
                                  setSelectedModes((prev) =>
                                    event.target.checked ? [...prev, mode] : prev.filter((m) => m !== mode)
                                  )
                                }
                                type="checkbox"
                                value={mode}
                              />
                              {workModeLabel(mode)}
                            </label>
                          ))}
                        </div>
                        <p className="text-xs leading-5 text-muted">
                          Select every arrangement this search should include.
                        </p>
                      </fieldset>

                      {/* The same picker Profile → Preferences uses: autocomplete against
                          the locations API, so entries match the exact values filtering
                          compares against, plus group expansion for regions. Free-text
                          boxes here would have let onboarding save spellings the scanner
                          then failed to match. Each list is only asked for when the
                          arrangement that needs it is on. */}
                      {needsPlace && (
                        <PreferredLocationsInput
                          defaultLocations={profileLocations.preferred}
                          emptyLabel="No on-site or hybrid locations set."
                          hint="Cities or regions you would physically commute to. This is the location job boards are searched with."
                          inputId="onboarding-preferred-location-search"
                          label="On-site and hybrid locations"
                          name="preferredLocations"
                        />
                      )}

                      {selectedModes.includes("remote") && (
                        <PreferredLocationsInput
                          defaultLocations={profileLocations.remote}
                          emptyLabel="No remote regions set — remote roles from anywhere are accepted."
                          hint={
                            "Countries whose remote roles you can take. Leave empty to accept remote roles from anywhere; " +
                            "a listing that names no region is never ruled out. Groups expand to their member countries — " +
                            "type one and use “Add typed location”: European Union (or EU), Europe, EMEA, North America, " +
                            "South America, Latin America, Americas, APAC, Asia, Oceania, Africa, Middle East, Nordics, " +
                            "Scandinavia, Benelux."
                          }
                          inputId="onboarding-remote-location-search"
                          label="Remote regions"
                          name="remoteLocations"
                          placeholder="Start typing a country or region (for example United States, Canada, or Europe)"
                        />
                      )}

                      {locationsError && (
                        <p className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm leading-6 text-danger" role="alert">
                          {locationsError}
                        </p>
                      )}
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
                    {/* This panel is reachable before setup is finished — "Skip for now" and
                        the integrations save both land here directly — so it must not claim
                        otherwise. It used to render "Setup complete" unconditionally, over a
                        readiness card that was still listing what was missing. */}
                    {statuses.ready ? (
                      <div className="rounded-panel border border-success/30 bg-success/5 p-5">
                        <h3 className="text-lg font-semibold text-ink">Setup complete</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">
                          The dashboard is ready for scanning, scoring, resume generation, and answer drafting.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-panel border border-warning/35 bg-warning/8 p-5">
                        <h3 className="text-lg font-semibold text-ink">Almost there</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">
                          You can open the dashboard now, but these parts of the app stay limited until the rest is
                          done. Each item links back to the step that owns it.
                        </p>
                        <ul className="mt-3 grid gap-2">
                          {(["ai", "resume", "preferences", "locations"] as StepId[])
                            .filter((step) => !statuses[step])
                            .map((step) => (
                              <li key={step}>
                                <button
                                  className="text-sm font-medium text-accent underline hover:no-underline"
                                  onClick={() => setActiveStep(step)}
                                  type="button"
                                >
                                  {steps.find((s) => s.id === step)?.title} — not finished
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
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
                    {/* Wrapped, like every other step's submit — a bare grid child stretches
                        to the full column and reads as a banner rather than a button. */}
                    <div>
                      <Button onClick={() => void finishOnboarding()} variant="primary">
                        {statuses.ready ? "Open dashboard" : "Open dashboard anyway"}
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
