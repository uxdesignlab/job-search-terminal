import { OnboardingWizardModal } from "@/components/onboarding-wizard-modal";
import { getAISettings, getResumes, getTitleFilters, getUserProfile } from "@/lib/db/queries";
import { ensureResumeBuilderVersion } from "@/lib/documents/resume-builder";

function maskSettings(settings: ReturnType<typeof getAISettings>) {
  return {
    ...settings,
    anthropicApiKey: settings.anthropicApiKey ? `••••${settings.anthropicApiKey.slice(-4)}` : "",
    geminiApiKey: settings.geminiApiKey ? `••••${settings.geminiApiKey.slice(-4)}` : "",
    openaiApiKey: settings.openaiApiKey ? `••••${settings.openaiApiKey.slice(-4)}` : "",
  };
}

export async function NewUserOnboarding() {
  const settings = getAISettings();
  const resumes = getResumes();
  const profile = getUserProfile();
  const titleFilters = getTitleFilters();
  const hasKey = Boolean(settings.openaiApiKey || settings.anthropicApiKey || settings.geminiApiKey);
  const hasResume = resumes.some((r) => Boolean(r.sourceFile));
  const hasRolePreferences = profile.targetRoles.length > 0 && titleFilters.positive.length > 0;
  const hasLocationPreferences = profile.workModes.length > 0;
  const hasConfirmedPreferences = settings.onboardingPreferencesConfirmed && hasRolePreferences && hasLocationPreferences;
  const hasAdzunaKeys = Boolean(settings.adzunaAppId && settings.adzunaApiKey);
  const hasBraveKey = Boolean(settings.braveSearchApiKey);
  // currentSearchGoal is only populated by AI extraction, not by resume upload
  const hasExtractedProfile = Boolean(profile.currentSearchGoal);

  // Load builder versions for all uploaded resumes so the wizard can show the builder inline
  const uploadedResumes = resumes.filter((r) => Boolean(r.sourceFile));
  const versionPairs = await Promise.all(
    uploadedResumes.map(async (r) => [r.id, await ensureResumeBuilderVersion(r, profile)] as const)
  );
  const resumeVersions = Object.fromEntries(versionPairs);

  return (
    <OnboardingWizardModal
      hasAdzunaKeys={hasAdzunaKeys}
      hasBraveKey={hasBraveKey}
      hasExtractedProfile={hasExtractedProfile}
      hasKey={hasKey}
      hasLocationPreferences={hasLocationPreferences}
      hasConfirmedPreferences={hasConfirmedPreferences}
      hasResume={hasResume}
      hasRolePreferences={hasRolePreferences}
      profile={profile}
      resumes={resumes}
      resumeVersions={resumeVersions}
      settings={maskSettings(settings)}
      titleFilters={titleFilters}
    />
  );
}
