import { describe, expect, it } from "vitest";
import {
  beginScanActivity,
  endScanActivity,
  getActiveScans,
  recordCareerBoardProgress,
  recordScanSourceProgress,
} from "@/lib/scanner/scan-activity";

describe("scan activity", () => {
  it("tracks a running scan's sources and board counts until it ends", () => {
    const id = beginScanActivity("scheduled", new Date("2026-11-24T14:00:00Z"));
    recordScanSourceProgress(id, { sourceId: "dice", sourceLabel: "Dice", status: "running", detail: "" });
    recordScanSourceProgress(id, { sourceId: "dice", sourceLabel: "Dice", status: "completed", detail: "" });
    recordCareerBoardProgress(id, 120, 400);

    const [scan] = getActiveScans().filter((s) => s.id === id);
    expect(scan.trigger).toBe("scheduled");
    expect(scan.sources).toEqual([{ sourceId: "dice", sourceLabel: "Dice", status: "completed", detail: "" }]);
    expect([scan.careerChecked, scan.careerTotal]).toEqual([120, 400]);

    endScanActivity(id);
    expect(getActiveScans().some((s) => s.id === id)).toBe(false);
  });

  it("ignores updates for a scan that already ended", () => {
    const id = beginScanActivity("manual");
    endScanActivity(id);
    recordCareerBoardProgress(id, 1, 2);
    expect(getActiveScans().some((s) => s.id === id)).toBe(false);
  });
});
