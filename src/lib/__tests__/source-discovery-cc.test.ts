import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));

import {
  computeRetryDelayMs,
  isQueryDegraded,
  loadLastSourceDiscoveryAt,
  queryCcIndex,
  resolveCcIndexes,
  retryAfterMs,
  selectBalancedCandidates,
  type AtsProvider,
  type CcQueryOutcome,
  type DiscoveredEntry,
} from "@/lib/scanner/source-discovery";

describe("loadLastSourceDiscoveryAt", () => {
  it("reads the completion time written by a discovery run", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "jst-source-discovery-"));
    const outputPath = path.join(dir, "discovered-sources.json");
    try {
      writeFileSync(outputPath, JSON.stringify({ fetchedAt: "2026-09-02T17:48:32.509Z", entries: [] }));
      expect(loadLastSourceDiscoveryAt(outputPath)).toBe("2026-09-02T17:48:32.509Z");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not report missing, corrupt, or invalid timestamps", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "jst-source-discovery-"));
    const outputPath = path.join(dir, "discovered-sources.json");
    try {
      expect(loadLastSourceDiscoveryAt(outputPath)).toBeUndefined();
      writeFileSync(outputPath, "{not json");
      expect(loadLastSourceDiscoveryAt(outputPath)).toBeUndefined();
      writeFileSync(outputPath, JSON.stringify({ fetchedAt: "sometime" }));
      expect(loadLastSourceDiscoveryAt(outputPath)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const ok = (body: string) => ({ ok: true, status: 200, text: async () => body });
const fail = (status: number) => ({
  ok: false,
  status,
  headers: { get: () => null },
  text: async () => "",
});

const COLLINFO = JSON.stringify([
  { id: "CC-MAIN-2026-30" },
  { id: "CC-MAIN-2026-25" },
  { id: "CC-MAIN-2026-17" },
  { id: "CC-MAIN-2026-12" },
]);

beforeEach(() => {
  mocks.safeFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Retry backoff uses real timers, so drive them forward while the promise is in flight. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(120_000);
  return promise;
}

describe("resolveCcIndexes", () => {
  it("returns the most recent crawls plus the archival one", async () => {
    mocks.safeFetch.mockResolvedValue(ok(COLLINFO));
    const indexes = await settle(resolveCcIndexes(3));
    expect(indexes).toEqual(["CC-MAIN-2026-30", "CC-MAIN-2026-25", "CC-MAIN-2026-17", "CC-MAIN-2024-51"]);
  });

  it("honours the requested count", async () => {
    mocks.safeFetch.mockResolvedValue(ok(COLLINFO));
    expect(await settle(resolveCcIndexes(1))).toEqual(["CC-MAIN-2026-30", "CC-MAIN-2024-51"]);
  });

  it("does not duplicate the archival index when it is also recent", async () => {
    mocks.safeFetch.mockResolvedValue(ok(JSON.stringify([{ id: "CC-MAIN-2024-51" }])));
    expect(await settle(resolveCcIndexes(3))).toEqual(["CC-MAIN-2024-51"]);
  });

  it("retries a transient gateway failure and then succeeds", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce(fail(504))
      .mockResolvedValueOnce(ok(COLLINFO));
    const indexes = await settle(resolveCcIndexes(2));
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    expect(indexes).toEqual(["CC-MAIN-2026-30", "CC-MAIN-2026-25", "CC-MAIN-2024-51"]);
  });

  it("falls back to the pinned crawl when every attempt fails", async () => {
    mocks.safeFetch.mockResolvedValue(fail(504));
    const indexes = await settle(resolveCcIndexes(3));
    // Attempts are deliberately few: hammering a throttling index earns a block.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    expect(indexes).toEqual(["CC-MAIN-2026-30", "CC-MAIN-2024-51"]);
  });

  it("does not retry a non-retryable status", async () => {
    mocks.safeFetch.mockResolvedValue(fail(400));
    await settle(resolveCcIndexes(3));
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404", async () => {
    mocks.safeFetch.mockResolvedValue(fail(404));
    await settle(resolveCcIndexes(3));
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a transport error, not just an HTTP status", async () => {
    mocks.safeFetch
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(ok(COLLINFO));
    const indexes = await settle(resolveCcIndexes(1));
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
    expect(indexes).toEqual(["CC-MAIN-2026-30", "CC-MAIN-2024-51"]);
  });

  it("falls back when collinfo returns unparseable content", async () => {
    mocks.safeFetch.mockResolvedValue(ok("not json"));
    expect(await settle(resolveCcIndexes(3))).toEqual(["CC-MAIN-2026-30", "CC-MAIN-2024-51"]);
  });
});

describe("selectBalancedCandidates", () => {
  const entry = (slug: string, provider: AtsProvider): DiscoveredEntry => ({
    slug,
    provider,
    careersUrl: `https://example.test/${slug}`,
    apiUrl: `https://api.example.test/${slug}`,
    validationStatus: "unknown",
    checkedAt: null,
    snapshotDate: null,
    companyDisplayName: null,
    industry: null,
  });

  const countByProvider = (entries: DiscoveredEntry[]) =>
    entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.provider] = (acc[e.provider] ?? 0) + 1;
      return acc;
    }, {});

  it("returns everything when under the limit", () => {
    const all = [entry("a", "greenhouse"), entry("b", "lever")];
    expect(selectBalancedCandidates(all, 10)).toHaveLength(2);
  });

  it("does not starve a small provider when a large one dominates", () => {
    const all = [
      ...Array.from({ length: 500 }, (_, i) => entry(`gh${i}`, "greenhouse")),
      ...Array.from({ length: 200 }, (_, i) => entry(`ash${i}`, "ashby")),
      ...Array.from({ length: 3 }, (_, i) => entry(`lev${i}`, "lever")),
    ];
    const picked = selectBalancedCandidates(all, 30);
    expect(picked).toHaveLength(30);
    // All three lanes represented; Lever's entire supply survives the cap.
    const byProvider = countByProvider(picked);
    expect(byProvider.lever).toBe(3);
    expect(byProvider.greenhouse).toBeGreaterThan(0);
    expect(byProvider.ashby).toBeGreaterThan(0);
  });

  it("keeps drawing from remaining lanes once one is exhausted", () => {
    const all: DiscoveredEntry[] = [
      ...Array.from({ length: 50 }, (_, i) => entry(`gh${i}`, "greenhouse")),
      entry("lev0", "lever"),
    ];
    const picked = selectBalancedCandidates(all, 20);
    expect(picked).toHaveLength(20);
  });

  it("never exceeds the limit", () => {
    const all = Array.from({ length: 100 }, (_, i) => entry(`gh${i}`, "greenhouse"));
    expect(selectBalancedCandidates(all, 7)).toHaveLength(7);
  });
});

describe("computeRetryDelayMs", () => {
  const noJitter = () => 0;

  it("grows exponentially across attempts", () => {
    const d0 = computeRetryDelayMs(0, null, noJitter);
    const d1 = computeRetryDelayMs(1, null, noJitter);
    const d2 = computeRetryDelayMs(2, null, noJitter);
    expect(d0).toBe(2000);
    expect(d1).toBe(6000);
    expect(d2).toBe(18000);
  });

  it("adds jitter so parallel retries do not synchronise", () => {
    expect(computeRetryDelayMs(0, null, () => 0.999)).toBeGreaterThan(computeRetryDelayMs(0, null, noJitter));
  });

  it("lets a server-supplied Retry-After win over backoff", () => {
    expect(computeRetryDelayMs(2, 1500, noJitter)).toBe(1500);
  });
});

describe("retryAfterMs", () => {
  const withHeader = (value: string | null) => ({ headers: { get: () => value } });

  it("parses a delay in seconds", () => {
    expect(retryAfterMs(withHeader("7"))).toBe(7000);
  });

  it("parses an HTTP-date", () => {
    const future = new Date(Date.now() + 30_000).toUTCString();
    const ms = retryAfterMs(withHeader(future));
    expect(ms).toBeGreaterThan(20_000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it("never returns a negative delay for a past date", () => {
    expect(retryAfterMs(withHeader(new Date(Date.now() - 60_000).toUTCString()))).toBe(0);
  });

  it("returns null when the header is absent or unparseable", () => {
    expect(retryAfterMs(withHeader(null))).toBeNull();
    expect(retryAfterMs(withHeader("soon"))).toBeNull();
  });
});

describe("isQueryDegraded", () => {
  const outcome = (over: Partial<CcQueryOutcome> = {}): CcQueryOutcome => ({
    records: [],
    pages: 5,
    failedPages: 0,
    aborted: false,
    ...over,
  });

  it("is clean when nothing failed", () => {
    expect(isQueryDegraded(outcome({ records: [{ url: "u", timestamp: "t" }] }))).toBe(false);
  });

  it("is degraded when the in-query breaker aborted", () => {
    expect(isQueryDegraded(outcome({ aborted: true }))).toBe(true);
  });

  it("is degraded when the page-count request itself failed", () => {
    expect(isQueryDegraded(outcome({ pages: 0, failedPages: 1 }))).toBe(true);
  });

  it("is degraded when a majority of pages failed even if some records survived", () => {
    // Regression: the old check was `records.length === 0`, so one salvaged
    // record reset the sweep breaker while the index was throttling.
    expect(isQueryDegraded(outcome({ pages: 5, failedPages: 4, records: [{ url: "u", timestamp: "t" }] }))).toBe(true);
    expect(isQueryDegraded(outcome({ pages: 4, failedPages: 2 }))).toBe(true);
  });

  it("tolerates a minority of failed pages", () => {
    expect(isQueryDegraded(outcome({ pages: 5, failedPages: 1 }))).toBe(false);
  });
});

describe("queryCcIndex", () => {
  const pageCount = (n: number) => ok(JSON.stringify({ pages: n }));
  const recordPage = (slug: string) =>
    ok(JSON.stringify({ url: `https://job-boards.greenhouse.io/${slug}`, timestamp: "20260719034542" }));

  it("walks every page and accumulates records", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(pageCount(3))
      .mockResolvedValueOnce(recordPage("a"))
      .mockResolvedValueOnce(recordPage("b"))
      .mockResolvedValueOnce(recordPage("c"));
    const out = await settle(queryCcIndex("CC-MAIN-2026-30", "job-boards.greenhouse.io/*"));
    expect(out.pages).toBe(3);
    expect(out.records).toHaveLength(3);
    expect(out.failedPages).toBe(0);
    expect(out.aborted).toBe(false);
  });

  it("stops early once consecutive pages fail, leaving later pages unread", async () => {
    // 20 pages, but every page request fails. Without the in-query breaker this
    // would issue 20 pages x 3 attempts against an index that is refusing us.
    mocks.safeFetch.mockImplementation(async (url: string) =>
      url.includes("showNumPages") ? pageCount(20) : fail(504)
    );
    const out = await settle(queryCcIndex("CC-MAIN-2026-30", "jobs.lever.co/*"));
    expect(out.aborted).toBe(true);
    expect(out.failedPages).toBe(3); // CC_MAX_CONSECUTIVE_FAILURES
    expect(isQueryDegraded(out)).toBe(true);
    // 1 page-count call + 3 failed pages x 3 attempts each = 10, far short of 20 pages.
    expect(mocks.safeFetch.mock.calls.length).toBeLessThan(20);
  });

  it("resets the consecutive counter when a page succeeds", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(pageCount(5))
      .mockResolvedValueOnce(fail(502)).mockResolvedValueOnce(fail(502)).mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce(fail(502)).mockResolvedValueOnce(fail(502)).mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce(recordPage("a"))
      .mockResolvedValue(recordPage("b"));
    const out = await settle(queryCcIndex("CC-MAIN-2026-30", "jobs.ashbyhq.com/*"));
    // Two isolated page failures separated by successes must not trip the breaker.
    expect(out.aborted).toBe(false);
    expect(out.failedPages).toBe(2);
    expect(out.records.length).toBeGreaterThan(0);
  });

  it("treats a parseable but unexpected page-count payload as a failure", async () => {
    // Reporting this as a clean zero would silently reset the sweep breaker.
    mocks.safeFetch.mockResolvedValueOnce(ok(JSON.stringify({ unexpected: true })));
    const out = await settle(queryCcIndex("CC-MAIN-2026-30", "boards.greenhouse.io/*"));
    expect(out).toEqual({ records: [], pages: 0, failedPages: 1, aborted: false });
    expect(isQueryDegraded(out)).toBe(true);
  });

  it("reports a genuine zero-page pattern as clean, not failed", async () => {
    mocks.safeFetch.mockResolvedValueOnce(pageCount(0));
    const out = await settle(queryCcIndex("CC-MAIN-2026-30", "boards.greenhouse.io/*"));
    expect(out.failedPages).toBe(0);
    expect(isQueryDegraded(out)).toBe(false);
  });
});
