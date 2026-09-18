import type { CleanupReason } from "./job-protection";
export type CleanupCandidate = {
  id: string; title: string; company: string; location: string; status: string;
  source: string; savedAt: string; reason: string; evidenceUrl: string; checkedAt: string;
  cleanupReason: CleanupReason; protectedFromRemoval: false;
};
export type CleanupSummary = {
  checked: number; total: number; protected: number; active: number; uncertain: number;
  candidates: CleanupCandidate[]; expiredUntouched: CleanupCandidate[];
  expiredProtected: never[]; outOfScope: never[];
};
export type CleanupEvent = { type: "progress" | "result"; summary: CleanupSummary } | { type: "error"; message: string };
