import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SCAN_INTERVAL_HOURS,
  computeNextScanAt,
  normalizeScanIntervalHours,
  scanIntervalLabel,
} from "@/lib/scanner/scan-interval";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe("normalizeScanIntervalHours", () => {
  it("keeps the offered choices, including form strings", () => {
    expect(normalizeScanIntervalHours(6)).toBe(6);
    expect(normalizeScanIntervalHours("12")).toBe(12);
    expect(normalizeScanIntervalHours("24")).toBe(24);
  });

  it("turns anything else into the default rather than a shorter interval", () => {
    expect(normalizeScanIntervalHours("1")).toBe(DEFAULT_SCAN_INTERVAL_HOURS);
    expect(normalizeScanIntervalHours(null)).toBe(DEFAULT_SCAN_INTERVAL_HOURS);
    expect(normalizeScanIntervalHours("abc")).toBe(DEFAULT_SCAN_INTERVAL_HOURS);
  });
});

describe("scanIntervalLabel", () => {
  it("names a day as a day", () => {
    expect(scanIntervalLabel(6)).toBe("Every 6 hours");
    expect(scanIntervalLabel(24)).toBe("Once a day");
  });
});

describe("computeNextScanAt", () => {
  it("is empty when scans are off", () => {
    expect(computeNextScanAt({ enabled: false, intervalHours: 6, lastRunAt: hoursAgo(1), now: NOW })).toBeNull();
  });

  it("anchors on the last scan, so saving does not push the next one back", () => {
    expect(computeNextScanAt({ enabled: true, intervalHours: 6, lastRunAt: hoursAgo(2), now: NOW })).toBe(
      hoursFromNow(4),
    );
  });

  it("brings the next scan forward when the interval gets shorter", () => {
    expect(computeNextScanAt({ enabled: true, intervalHours: 8, lastRunAt: hoursAgo(5), now: NOW })).toBe(
      hoursFromNow(3),
    );
  });

  it("never schedules a scan in the past — an overdue anchor waits a full interval", () => {
    expect(computeNextScanAt({ enabled: true, intervalHours: 6, lastRunAt: hoursAgo(30), now: NOW })).toBe(
      hoursFromNow(6),
    );
  });

  it("keeps a due time already on file when there is no scan to anchor on", () => {
    expect(
      computeNextScanAt({ enabled: true, intervalHours: 6, lastRunAt: null, nextRunAt: hoursFromNow(2), now: NOW }),
    ).toBe(hoursFromNow(2));
  });

  it("does not keep a stored due time further off than the new, shorter interval", () => {
    expect(
      computeNextScanAt({ enabled: true, intervalHours: 6, lastRunAt: null, nextRunAt: hoursFromNow(20), now: NOW }),
    ).toBe(hoursFromNow(6));
  });

  it("waits a full interval when there has never been a scan", () => {
    expect(computeNextScanAt({ enabled: true, intervalHours: 12, lastRunAt: null, now: NOW })).toBe(
      hoursFromNow(12),
    );
  });
});

describe("scan schedule storage", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  async function load() {
    vi.resetModules();
    tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-scan-interval-"));
    process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
    return import("@/lib/db/queries");
  }

  it("stores the chosen interval and the next completed scan uses it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const q = await load();
    q.saveScanSchedule({ enabled: true, intervalHours: 12, freshnessWindowHours: 168 });
    expect(q.getScanSchedule()).toMatchObject({ enabled: true, intervalHours: 12, freshnessWindowHours: 168 });

    q.completeScheduledScan(NOW);
    expect(q.getScanSchedule().nextRunAt).toBe(hoursFromNow(12));
  });

  it("keeps the next scan where it was when an unrelated setting is saved", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const q = await load();
    q.saveScanSchedule({ enabled: true, intervalHours: 6, freshnessWindowHours: 72 });
    q.completeScheduledScan(new Date(NOW.getTime() - 2 * 3_600_000));
    q.saveScanSchedule({ enabled: true, intervalHours: 6, freshnessWindowHours: 24 });
    expect(q.getScanSchedule().nextRunAt).toBe(hoursFromNow(4));
  });

  it("keeps the next scan where it was before any scheduled scan has run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const q = await load();
    q.saveScanSchedule({ enabled: true, intervalHours: 6, freshnessWindowHours: 72 });
    const first = q.getScanSchedule().nextRunAt;
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000));
    q.saveScanSchedule({ enabled: true, intervalHours: 6, freshnessWindowHours: 168 });
    expect(q.getScanSchedule().nextRunAt).toBe(first);
  });

  it("refuses an interval that is not offered", async () => {
    const q = await load();
    q.saveScanSchedule({ enabled: true, intervalHours: 1, freshnessWindowHours: 72 });
    expect(q.getScanSchedule().intervalHours).toBe(DEFAULT_SCAN_INTERVAL_HOURS);
  });
});
