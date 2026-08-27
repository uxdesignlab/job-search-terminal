export type ProfileReadinessInput = {
  hasConfiguredAIProvider: boolean;
  hasUploadedResume: boolean;
  hasTargetRoles: boolean;
  hasPositiveTitleFilters: boolean;
  hasExplicitWorkModes: boolean;
  /** Satisfied when no on-site or hybrid mode is selected — there is then nowhere to
   *  name. The remote region list is deliberately not required: empty means "anywhere",
   *  which is a real and common answer. */
  hasPreferredLocations: boolean;
};

export type MissingProfileSetupItem = {
  id: "ai-provider" | "resume" | "target-roles" | "title-filters" | "work-modes" | "preferred-locations";
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
    label: "Work arrangement",
    guidance: "Choose remote, hybrid, or on-site work.",
    href: "/profile",
    actionLabel: "Open profile",
  },
  {
    id: "preferred-locations",
    isComplete: "hasPreferredLocations",
    label: "On-site locations",
    guidance: "Name at least one city or region for on-site or hybrid work.",
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
    hasLocationPreferences: input.hasExplicitWorkModes && input.hasPreferredLocations,
    hasPreferences: input.hasTargetRoles && input.hasPositiveTitleFilters,
  };
}
