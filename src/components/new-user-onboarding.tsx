import { OnboardingWizardModal } from "@/components/onboarding-wizard-modal";
import { getAISettings, getResumes, getTitleFilters, getUserProfile } from "@/lib/db/queries";

function maskSettings(settings: ReturnType<typeof getAISettings>) {
  return {
    ...settings,
    anthropicApiKey: settings.anthropicApiKey ? `••••${settings.anthropicApiKey.slice(-4)}` : "",
    geminiApiKey: settings.geminiApiKey ? `••••${settings.geminiApiKey.slice(-4)}` : "",
    openaiApiKey: settings.openaiApiKey ? `••••${settings.openaiApiKey.slice(-4)}` : "",
  };
}

export function NewUserOnboarding() {
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
      settings={maskSettings(settings)}
      titleFilters={titleFilters}
    />
  );
}
