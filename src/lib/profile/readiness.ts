export type ProfileReadinessInput = {
  hasConfiguredAIProvider: boolean;
  hasUploadedResume: boolean;
  hasTargetRoles: boolean;
  hasPositiveTitleFilters: boolean;
  hasExplicitWorkModes: boolean;
};

export type MissingProfileSetupItem = {
  id: "ai-provider" | "resume" | "target-roles" | "title-filters" | "work-modes";
  label: string;
  guidance: string;
  href: string;
  actionLabel: string;
};

const SETUP_ITEMS: Array<{
  id: MissingProfileSetupItem["id"];
  isComplete: keyof ProfileReadinessInput;
  label: string;
  guidance: string;
  href: string;
  actionLabel: string;
}> = [
  {
    id: "ai-provider",
    isComplete: "hasConfiguredAIProvider",
    label: "AI provider",
    guidance: "Add a provider key or enable Ollama in your provider chain.",
    href: "/settings?tab=ai",
    actionLabel: "Open AI settings",
  },
  {
    id: "resume",
    isComplete: "hasUploadedResume",
    label: "Resume lane",
    guidance: "Upload a resume to at least one career lane.",
    href: "/resumes",
    actionLabel: "Open resumes",
  },
  {
    id: "target-roles",
    isComplete: "hasTargetRoles",
    label: "Desired positions",
    guidance: "Add at least one target role for job discovery.",
    href: "/profile",
    actionLabel: "Open profile",
  },
  {
    id: "title-filters",
    isComplete: "hasPositiveTitleFilters",
    label: "Included title filters",
    guidance: "Add at least one title keyword that should be included.",
    href: "/settings?tab=preferences",
    actionLabel: "Open title filters",
  },
  {
    id: "work-modes",
    isComplete: "hasExplicitWorkModes",
    label: "Location mode",
    guidance: "Choose remote, hybrid, or on-site work.",
    href: "/profile",
    actionLabel: "Open profile",
  },
];

export function getProfileReadiness(input: ProfileReadinessInput) {
  const missingItems = SETUP_ITEMS
    .filter((item) => !input[item.isComplete])
    .map((item) => ({
      id: item.id,
      label: item.label,
      guidance: item.guidance,
      href: item.href,
      actionLabel: item.actionLabel,
    }));

  return {
    isReady: missingItems.length === 0,
    missingItems,
    hasRolePreferences: input.hasTargetRoles && input.hasPositiveTitleFilters,
    hasLocationPreferences: input.hasExplicitWorkModes,
    hasPreferences: input.hasTargetRoles && input.hasPositiveTitleFilters && input.hasExplicitWorkModes,
  };
}
