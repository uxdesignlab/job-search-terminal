import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyScanErrorMessage } from "@/lib/scan-error-category";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  recordScanRun: vi.fn(),
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
vi.mock("@/lib/db/queries", () => ({ recordScanRun: mocks.recordScanRun }));
vi.mock("@/lib/scanner/browser-board-importer", () => ({
  getBrowserBoardImportDirectory: mocks.getBrowserBoardImportDirectory,
  importBrowserBoardJobs: mocks.importBrowserBoardJobs,
}));

import { buildAdzunaLanes, buildAdzunaSearchTerms, runAggregatorScan } from "@/lib/scanner/aggregator-scanner";

const CREDENTIALS = { adzunaAppId: "app-id", adzunaApiKey: "api-key" };

/**
 * One term and no commute location = one nationwide query, unless a test asks
 * for more. A profile *with* a location searches two lanes per term, so tests
 * that count requests say so explicitly.
 */
const scanOpts = (overrides: Record<string, unknown> = {}) => ({
  ...CREDENTIALS,
  titles: ["Product Designer"],
  locations: [],
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
  mocks.recordScanRun.mockClear();
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

  it("ends the whole sweep on a long wait instead of retrying every remaining query", async () => {
    mocks.safeFetch.mockResolvedValue(fail(429, "3600"));
    const result = await settle(
      runAggregatorScan(scanOpts({ titles: ["A", "B", "C", "D", "E"], locations: ["X", "Y", "Z"] })),
    );
    // Every remaining query hits the same account limit, so one request and one
    // error — not one per query until the failure counter trips.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
  });

  it("does not call a gateway Retry-After an account rate limit", async () => {
    mocks.safeFetch.mockResolvedValue(fail(503, "3600"));
    const result = await settle(runAggregatorScan(scanOpts()));
    expect(result.errors).toEqual([
      "Adzuna is temporarily unavailable (HTTP 503) — it asked us to wait 1 hour before retrying",
    ]);
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
      runAggregatorScan(scanOpts({ titles: ["A", "B"], locations: ["X"] })),
    );
    // Two terms x two lanes: fail, fail, a success that clears the streak, then
    // one more failure — four queries, so the breaker never trips.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(4);
    expect(result.errors.every((e) => !e.includes("stopped responding"))).toBe(true);
  });
});

describe("Adzuna search terms", () => {
  it("searches the positive title keywords, not the target roles", () => {
    // The bug this whole lane died of: `title_only` ANDs every word, so a role
    // phrased the way a person says it matches nothing anywhere.
    expect(
      buildAdzunaSearchTerms(
        { positive: ["product design", "ux"], negative: [] },
        ["VP of User Experience and Web Management"],
      ),
    ).toEqual(["product design", "ux"]);
  });

  it("falls back to the target roles when no positive filter is set", () => {
    expect(buildAdzunaSearchTerms({ positive: [], negative: ["intern"] }, ["Product Designer"])).toEqual([
      "Product Designer",
    ]);
    expect(buildAdzunaSearchTerms(undefined, ["Product Designer"])).toEqual(["Product Designer"]);
  });

  it("drops a keyword that only stems to one already kept", () => {
    // Adzuna stems: these two return the identical result set, and the budget is
    // metered, so paying for both buys nothing.
    expect(
      buildAdzunaSearchTerms({ positive: ["product design", "product designer"], negative: [] }, []),
    ).toEqual(["product design"]);
    // Order-independent: the longer form first still collapses to one query.
    expect(
      buildAdzunaSearchTerms({ positive: ["product designer", "product design"], negative: [] }, []),
    ).toEqual(["product designer"]);
  });

  it("keeps distinct keywords that merely share a subject", () => {
    expect(buildAdzunaSearchTerms({ positive: ["ux", "user experience"], negative: [] }, [])).toEqual([
      "ux",
      "user experience",
    ]);
  });

  it("caps the term list to stay inside the free tier", () => {
    expect(
      buildAdzunaSearchTerms({ positive: ["a", "b", "c", "d", "e", "f"], negative: [] }, []),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("says there is nothing to search for rather than querying blind", async () => {
    const result = await settle(runAggregatorScan(scanOpts({ titles: [], titleFilters: { positive: [], negative: [] } })));
    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("Nothing to search for");
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });
});

describe("Adzuna search lanes", () => {
  const urls = () => mocks.safeFetch.mock.calls.map((call: unknown[]) => new URL(call[0] as string));

  it("searches the commute location and nationwide", async () => {
    mocks.safeFetch.mockResolvedValue(ok([]));
    await settle(runAggregatorScan(scanOpts({ titles: ["Product Designer"], locations: ["Berlin"] })));
    const wheres = urls().map((url) => url.searchParams.get("where"));
    // Nationwide is the only way to reach a role open across a whole country:
    // Adzuna publishes no remote flag at all.
    expect(wheres).toEqual(["Berlin", null]);
  });

  it("searches only nationwide for a remote-only profile, and never where=remote", async () => {
    mocks.safeFetch.mockResolvedValue(ok([]));
    await settle(runAggregatorScan(scanOpts({ locations: ["Berlin"], remotePreference: "remote-only" })));
    // Regression: `where=remote` geocodes to nowhere, so the one preference that
    // most needs a nationwide search was the one guaranteed to find nothing.
    expect(urls().map((url) => url.searchParams.get("where"))).toEqual([null]);
  });

  it("never sends a distance parameter", async () => {
    mocks.safeFetch.mockResolvedValue(ok([]));
    await settle(runAggregatorScan(scanOpts({ locations: ["Tennessee, United States"] })));
    // Widening the radius imports out-of-state roles the preference filter then
    // discards — it spends the page and the quota to import nothing.
    expect(urls().every((url) => url.searchParams.get("distance") === null)).toBe(true);
  });

  it("stays within the per-scan query budget", async () => {
    mocks.safeFetch.mockResolvedValue(ok([]));
    await settle(
      runAggregatorScan(
        scanOpts({
          locations: ["Berlin", "Munich", "Hamburg"],
          titleFilters: { positive: ["a", "b", "c", "d", "e", "f"], negative: [] },
        }),
      ),
    );
    // 4 terms x 2 lanes. The free tier is 2,000 queries a month against roughly
    // 210 scans, so this ceiling is what keeps the lane inside it.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(8);
  });

  it("builds lanes directly from a profile", () => {
    expect(buildAdzunaLanes(["Berlin"], false)).toEqual(["Berlin", ""]);
    expect(buildAdzunaLanes(["Berlin"], true)).toEqual([""]);
    expect(buildAdzunaLanes([], false)).toEqual([""]);
    expect(buildAdzunaLanes(["  "], false)).toEqual([""]);
  });
});

describe("Adzuna scans that import nothing", () => {
  it("records a scan run when the API returns nothing", async () => {
    mocks.safeFetch.mockResolvedValue(ok([]));
    await settle(runAggregatorScan(scanOpts()));
    // Without this row, "Adzuna found nothing" and "Adzuna never ran" look
    // identical in history — which is how this lane went dark unnoticed.
    expect(mocks.recordScanRun).toHaveBeenCalledTimes(1);
    expect(mocks.recordScanRun.mock.calls[0][0]).toMatchObject({
      scanType: "adzuna-api-scan",
      totalJobsFound: 0,
      newJobsCount: 0,
    });
  });

  it("records a scan run when the title filter removes everything", async () => {
    mocks.safeFetch.mockResolvedValue(ok([job("a")]));
    await settle(
      runAggregatorScan(scanOpts({ titleFilters: { positive: ["product"], negative: ["designer"] } })),
    );
    expect(mocks.recordScanRun).toHaveBeenCalledTimes(1);
    expect(mocks.recordScanRun.mock.calls[0][0]).toMatchObject({
      scanType: "adzuna-api-scan",
      totalJobsFound: 1,
      filteredCount: 1,
      newJobsCount: 0,
    });
  });

  it("leaves the run to the importer when jobs survive the filters", async () => {
    mocks.safeFetch.mockResolvedValue(ok([job("a")]));
    await settle(runAggregatorScan(scanOpts()));
    // The importer writes the row on this path; two rows for one scan would
    // double-count the history.
    expect(mocks.recordScanRun).not.toHaveBeenCalled();
    expect(mocks.importBrowserBoardJobs).toHaveBeenCalledTimes(1);
  });

  it("carries the preference-filtered count out of the importer", async () => {
    mocks.safeFetch.mockResolvedValue(ok([job("a")]));
    mocks.importBrowserBoardJobs.mockResolvedValueOnce({
      success: true,
      imported: 0,
      duplicates: 0,
      fresh: 0,
      unknownDate: 0,
      staleFiltered: 0,
      preferenceFiltered: 7,
      errors: [],
      summary: "",
      jobIds: [],
      importedJobs: [],
    });
    const result = await settle(runAggregatorScan(scanOpts()));
    // "Found 7, imported 0, no errors" reads as a broken scan until this number
    // is visible.
    expect(result.preferenceFiltered).toBe(7);
  });
});
