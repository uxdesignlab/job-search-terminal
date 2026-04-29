export const mockMetrics = [
  { label: "New jobs", value: "12", detail: "This week", tone: "success" as const },
  { label: "Priority matches", value: "3", detail: "Needs review", tone: "warning" as const },
  { label: "PDFs generated", value: "1", detail: "Ready", tone: "neutral" as const },
  { label: "Applications sent", value: "2", detail: "Tracked", tone: "neutral" as const },
  { label: "Interviews active", value: "1", detail: "In progress", tone: "success" as const },
  { label: "Skipped", value: "6", detail: "Weak fit", tone: "danger" as const }
];

export const mockActivity = [
  "Civic Platform marked as resume generated",
  "Northstar AI reviewed as priority apply",
  "LaunchKit skipped because role is brand-only",
  "Atlas Health saved for design operations review"
];
