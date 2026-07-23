import type { ScanJobResultSummary } from "@/lib/scan-result-types";

export type JobDiscoverySourceId = "career-sites" | "adzuna" | "dice";

export type JobDiscoverySourceStatus = "pending" | "running" | "completed" | "skipped" | "failed";

export type JobDiscoveryProgressUpdate = {
  sourceId: JobDiscoverySourceId;
  sourceLabel: string;
  status: JobDiscoverySourceStatus;
  detail: string;
};

export type JobDiscoveryScanStreamEvent =
  | { type: "progress"; progress: JobDiscoveryProgressUpdate }
  | { type: "result"; summary: ScanJobResultSummary }
  | { type: "error"; message: string };
