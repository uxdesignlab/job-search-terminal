import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDiscoveryProgressUpdate } from "@/lib/scan-progress-types";

const mocks = vi.hoisted(() => ({
  careerOpsRunToJobSummary: vi.fn(),
  getAISettings: vi.fn(),
  getTitleFilters: vi.fn(),
  getUserProfile: vi.fn(),
  runAggregatorScan: vi.fn(),
  runCareerOpsScanner: vi.fn(),
  runDiceScan: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getAISettings: mocks.getAISettings,
  getTitleFilters: mocks.getTitleFilters,
  getUserProfile: mocks.getUserProfile,
}));
vi.mock("@/lib/careerops-scan-to-summary", () => ({
  careerOpsRunToJobSummary: mocks.careerOpsRunToJobSummary,
}));
vi.mock("@/lib/scanner/aggregator-scanner", () => ({ runAggregatorScan: mocks.runAggregatorScan }));
vi.mock("@/lib/scanner/careerops-scanner", () => ({ runCareerOpsScanner: mocks.runCareerOpsScanner }));
vi.mock("@/lib/scanner/dice-scanner", () => ({ runDiceScan: mocks.runDiceScan }));

import { runJobDiscoveryScan } from "@/lib/scanner/job-discovery";

const emptySourceResult = {
  status: "ok",
  imported: 0,
  duplicates: 0,
  fresh: 0,
  unknownDate: 0,
  staleFiltered: 0,
  totalFound: 0,
  errors: [],
  jobs: [],
};

describe("runJobDiscoveryScan progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAISettings.mockReturnValue({ adzunaAppId: "app-id", adzunaApiKey: "api-key" });
    mocks.getUserProfile.mockReturnValue({
      targetRoles: ["Product Designer"],
      preferredLocations: ["Nashville, TN"],
      remotePreference: "local-or-remote",
    });
    mocks.getTitleFilters.mockReturnValue({ positive: [], negative: [] });
    mocks.runCareerOpsScanner.mockResolvedValue({
      companiesScanned: 2,
      newJobsCount: 0,
      freshCount: 0,
      unknownDateCount: 0,
      staleFilteredCount: 0,
      jobs: [],
    });
    mocks.runAggregatorScan.mockResolvedValue({ ...emptySourceResult, totalFound: 3 });
    mocks.runDiceScan.mockResolvedValue({ ...emptySourceResult, totalFound: 4 });
    mocks.careerOpsRunToJobSummary.mockReturnValue({
      companyName: "All enabled sources",
      status: "completed",
      newJobsCount: 0,
      totalJobsFound: 0,
      filteredCount: 0,
      duplicateCount: 0,
      companiesScanned: 2,
      skippedCompanies: 0,
      errors: [],
      jobs: [],
    });
  });

  it("reports the real state of all parallel scan lanes", async () => {
    const updates: JobDiscoveryProgressUpdate[] = [];

    await runJobDiscoveryScan({
      trigger: "manual",
      onProgress: (update) => updates.push(update),
    });

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "career-sites", status: "pending" }),
      expect.objectContaining({ sourceId: "career-sites", status: "running" }),
      expect.objectContaining({ sourceId: "career-sites", status: "completed", detail: "Checked 2 company sources" }),
      expect.objectContaining({ sourceId: "adzuna", status: "running" }),
      expect.objectContaining({ sourceId: "adzuna", status: "completed", detail: "Checked Adzuna — 3 listings found" }),
      expect.objectContaining({ sourceId: "dice", status: "running" }),
      expect.objectContaining({ sourceId: "dice", status: "completed", detail: "Checked Dice — 4 listings found" }),
    ]));
  });

  it("marks Adzuna as skipped when credentials are not configured", async () => {
    mocks.getAISettings.mockReturnValue({ adzunaAppId: "", adzunaApiKey: "" });
    const updates: JobDiscoveryProgressUpdate[] = [];

    await runJobDiscoveryScan({
      trigger: "manual",
      onProgress: (update) => updates.push(update),
    });

    expect(updates).toContainEqual({
      sourceId: "adzuna",
      sourceLabel: "Adzuna",
      status: "skipped",
      detail: "Not configured",
    });
    expect(mocks.runAggregatorScan).not.toHaveBeenCalled();
  });

  it("does not let a disconnected progress listener interrupt the scan", async () => {
    await expect(runJobDiscoveryScan({
      trigger: "manual",
      onProgress: () => {
        throw new Error("client disconnected");
      },
    })).resolves.toMatchObject({ status: "completed" });
  });
});
