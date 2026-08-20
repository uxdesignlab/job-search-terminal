export const TABS = ["overview", "evaluation", "resume", "apply", "outreach"] as const;

export type Tab = (typeof TABS)[number];

/** Builds the href for a tab on the current job. */
export type TabHref = (t: Tab) => string;
