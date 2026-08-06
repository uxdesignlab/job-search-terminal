import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));

import {
  resolveCcIndexes,
  selectBalancedCandidates,
  type AtsProvider,
  type DiscoveredEntry,
} from "@/lib/scanner/source-discovery";

const ok = (body: string) => ({ ok: true, status: 200, text: async () => body });
const fail = (status: number) => ({ ok: false, status, text: async () => "" });

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
    // 5 attempts, then the pinned fallback plus the archival index.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(5);
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
