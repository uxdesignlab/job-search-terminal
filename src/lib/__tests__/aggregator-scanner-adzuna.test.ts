import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyScanErrorMessage } from "@/lib/scan-error-category";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  getBrowserBoardImportDirectory: vi.fn(() => "/tmp/jst-adzuna-test"),
  importBrowserBoardJobs: vi.fn(async () => ({
    success: true,
    imported: 0,
    duplicates: 0,
    fresh: 0,
    unknownDate: 0,
    staleFiltered: 0,
    preferenceFiltered: 0,
    errors: [],
    summary: "",
    jobIds: [],
    importedJobs: [],
  })),
}));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));
vi.mock("@/lib/scanner/browser-board-importer", () => ({
  getBrowserBoardImportDirectory: mocks.getBrowserBoardImportDirectory,
  importBrowserBoardJobs: mocks.importBrowserBoardJobs,
}));

import { runAggregatorScan } from "@/lib/scanner/aggregator-scanner";

const CREDENTIALS = { adzunaAppId: "app-id", adzunaApiKey: "api-key" };

/** One title x one location = one query, unless a test asks for more. */
const scanOpts = (overrides: Record<string, unknown> = {}) => ({
  ...CREDENTIALS,
  titles: ["Product Designer"],
  locations: ["Berlin"],
  remotePreference: "all",
  ...overrides,
});

const ok = (results: unknown[]) => ({ ok: true, status: 200, json: async () => ({ count: results.length, results }) });
const fail = (status: number, retryAfter: string | null = null) => ({
  ok: false,
  status,
  headers: { get: () => retryAfter },
});
const aborted = () => Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

const job = (id: string) => ({
  id,
  title: "Product Designer",
  company: { display_name: "Acme" },
  description: "Design things.",
  redirect_url: `https://www.adzuna.com/land/ad/${id}?v=abc`,
  location: { display_name: "Berlin" },
  created: "2026-08-24T10:00:00Z",
});

beforeEach(() => {
  mocks.safeFetch.mockReset();
  mocks.importBrowserBoardJobs.mockClear();
  vi.useFakeTimers();
});

/** The inter-query pause and retry backoff use real timers; drive them forward. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(300_000);
  return promise;
}

describe("Adzuna transient failures", () => {
  it("retries a 502 and reports no error when the retry succeeds", async () => {
    mocks.safeFetch.mockResolvedValueOnce(fail(502)).mockResolvedValueOnce(ok([job("a")]));
    const result = await settle(runAggregatorScan(scanOpts()));
    expect(result.errors).toEqual([]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  it("reports a persistent 502 once, naming the attempt count", async () => {
    mocks.safeFetch.mockResolvedValue(fail(502));
    const result = await settle(runAggregatorScan(scanOpts()));
    expect(result.errors).toEqual(["Adzuna API returned HTTP 502 on all 3 attempts"]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
  });

  it("bounds a hung request and classifies it as a timeout, not a generic error", async () => {
    mocks.safeFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(aborted()));
        }),
    );
    const result = await settle(runAggregatorScan(scanOpts()));
    expect(result.errors).toEqual(["Adzuna search timed out after 15s"]);
    expect(classifyScanErrorMessage(result.errors[0])).toBe("timeout_or_slow");
  });

  it("gives up immediately on a long rate-limit wait rather than stalling the scan", async () => {
    mocks.safeFetch.mockResolvedValue(fail(429, "3600"));
    const result = await settle(runAggregatorScan(scanOpts()));
    expect(result.errors).toEqual([
      "Adzuna is rate limiting this account — it asked us to wait 1 hour before retrying",
    ]);
    // One call: it neither slept out the hour nor burned the retry budget.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("passes an abort signal on every Adzuna request", async () => {
    mocks.safeFetch.mockResolvedValue(ok([]));
    await settle(runAggregatorScan(scanOpts()));
    expect(mocks.safeFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("Adzuna non-retryable responses", () => {
  it("aborts the whole scan on bad credentials without retrying", async () => {
    mocks.safeFetch.mockResolvedValue(fail(401));
    const result = await settle(runAggregatorScan(scanOpts({ titles: ["A", "B"], locations: ["X", "Y"] })));
    expect(result.status).toBe("error");
    expect(result.errors).toEqual(["Invalid Adzuna credentials — check your App ID and API Key"]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("treats a 404 as an empty result set rather than an error", async () => {
    mocks.safeFetch.mockResolvedValue(fail(404));
    const result = await settle(runAggregatorScan(scanOpts()));
    expect(result.errors).toEqual([]);
    expect(result.totalFound).toBe(0);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });
});

describe("Adzuna circuit breaker", () => {
  it("abandons the sweep after three consecutive failed searches", async () => {
    mocks.safeFetch.mockResolvedValue(fail(502));
    const result = await settle(
      runAggregatorScan(scanOpts({ titles: ["A", "B", "C", "D", "E"], locations: ["X", "Y", "Z"] })),
    );
    // 3 failed queries x 3 attempts, then the breaker trips — not 15 queries.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(9);
    expect(result.errors).toContain(
      "Adzuna stopped responding — gave up after 3 consecutive failed searches",
    );
  });

  it("resets the failure streak after a successful search", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(fail(500))
      .mockResolvedValueOnce(fail(500))
      .mockResolvedValueOnce(ok([job("a")]))
      .mockResolvedValue(fail(500));
    const result = await settle(
      runAggregatorScan(scanOpts({ titles: ["A", "B", "C", "D", "E"], locations: ["X"] })),
    );
    // Two failures, a success that clears the streak, then two more failures —
    // five queries in all, so the breaker never trips.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(5);
    expect(result.errors.every((e) => !e.includes("stopped responding"))).toBe(true);
  });
});
