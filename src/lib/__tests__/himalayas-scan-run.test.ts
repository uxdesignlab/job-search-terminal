/**
 * Coverage for the walk itself — `runHimalayasScan` — as opposed to the pure
 * helpers exercised in `himalayas-scanner.test.ts`.
 *
 * What is worth pinning here is how each search ends and when that is reported.
 * Stopping at the page cap is fine when the pages read cover the gap between
 * scans, and reporting it anyway buried the runs where coverage really was too
 * thin. Both sides of that decision are asserted, along with the other ways a
 * search or a whole run can end: the coverage horizon, the end of the results,
 * the request budget, a rate limit, and repeated failures.
 *
 * The network and the importer are mocked; the file write is redirected to a
 * temp directory, so a run touches nothing real.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importDir = mkdtempSync(path.join(tmpdir(), "himalayas-scan-"));

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  importBrowserBoardJobs: vi.fn(),
  findEmployerPostings: vi.fn(),
}));

// The lookup reads the database and the ATS APIs; its own tests cover it.
vi.mock("@/lib/scanner/employer-posting-lookup", () => ({
  findEmployerPostingsForScan: (...args: unknown[]) => mocks.findEmployerPostings(...args),
}));

vi.mock("@/lib/safe-fetch", () => ({
  safeFetch: (...args: unknown[]) => mocks.safeFetch(...args),
}));

vi.mock("@/lib/scanner/browser-board-importer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scanner/browser-board-importer")>();
  return {
    ...actual,
    getBrowserBoardImportDirectory: () => importDir,
    importBrowserBoardJobs: (...args: unknown[]) => mocks.importBrowserBoardJobs(...args),
  };
});

import { runHimalayasScan } from "@/lib/scanner/himalayas-scanner";

/** Mirrors the constants the scanner uses; a change to either should fail here. */
const MAX_PAGES_PER_QUERY = 10;
const MAX_REQUESTS = 50;
const PAGE_SIZE = 20;

function posting(id: number | string, ageHours: number) {
  return {
    title: "Product Designer",
    companyName: `Company ${id}`,
    applicationLink: `https://example.com/jobs/${id}`,
    guid: `https://himalayas.app/jobs/${id}`,
    pubDate: Math.floor((Date.now() - ageHours * 60 * 60 * 1000) / 1000),
    description: "A remote design role.",
    locationRestrictions: [],
  };
}

/** A search page as the API returns it. */
function page(jobs: unknown[], totalCount = 10_000) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ jobs, totalCount }) };
}

function searchOf(url: string): { q: string; page: number } {
  const params = new URL(url).searchParams;
  return { q: params.get("q") ?? "", page: Number(params.get("page")) };
}

/**
 * Results whose postings age `hoursPerPage` per page, newest first — the shape
 * that decides whether a search reaches the horizon before its page cap.
 */
function resultsAging(hoursPerPage: number) {
  return (url: string) => {
    const { q, page: n } = searchOf(url);
    return page(
      Array.from({ length: PAGE_SIZE }, (_, i) =>
        posting(`${q}-${n}-${i}`, ((n - 1) * PAGE_SIZE + i) * (hoursPerPage / PAGE_SIZE)),
      ),
    );
  };
}

/** Runs the scan with fake timers, so the inter-page delays cost no real time. */
async function scan(...args: Parameters<typeof runHimalayasScan>) {
  const promise = runHimalayasScan(...args);
  await vi.runAllTimersAsync();
  return promise;
}

/** Filters out every posting, so a walk-focused test stops before the file write. */
const NO_TITLE_MATCHES = { positive: ["quantum-farrier"], negative: [] };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.safeFetch.mockReset();
  mocks.importBrowserBoardJobs.mockReset();
  mocks.findEmployerPostings.mockReset();
  mocks.findEmployerPostings.mockResolvedValue({ matches: new Map(), attempted: 0, skippedForTime: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  rmSync(importDir, { recursive: true, force: true });
});

describe("runHimalayasScan — what it searches for", () => {
  it("searches each positive title keyword, newest first", async () => {
    mocks.safeFetch.mockResolvedValue(page([], 0));

    await scan({ titleFilters: { positive: ["UX", "product design", "ux"], negative: ["intern"] } });

    const urls = mocks.safeFetch.mock.calls.map(([url]) => new URL(url as string));
    expect(urls.map((u) => `${u.origin}${u.pathname}`)).toEqual([
      "https://himalayas.app/jobs/api/search",
      "https://himalayas.app/jobs/api/search",
    ]);
    // Duplicates differing only in case are searched once.
    expect(urls.map((u) => u.searchParams.get("q"))).toEqual(["UX", "product design"]);
    expect(urls.every((u) => u.searchParams.get("sort") === "recent")).toBe(true);
    expect(urls.every((u) => u.searchParams.get("page") === "1")).toBe(true);
  });

  it("falls back to target roles when there are no positive keywords", async () => {
    mocks.safeFetch.mockResolvedValue(page([], 0));

    await scan({ titleFilters: { positive: [], negative: [] }, targetRoles: ["Head of Product Design"] });

    expect(searchOf(mocks.safeFetch.mock.calls[0][0] as string).q).toBe("Head of Product Design");
  });

  it("keeps only titles matching the target roles it fell back to, not everything the search returned", async () => {
    mocks.safeFetch.mockResolvedValue(page([
      { ...posting(1, 1), title: "Head of Product Design, Platform" },
      { ...posting(2, 1), title: "Airtable Specialist" },
    ], 2));

    const result = await scan({ titleFilters: { positive: [], negative: [] }, targetRoles: ["Head of Product Design"] });

    expect(result.totalFound).toBe(2);
    const [filePath] = mocks.importBrowserBoardJobs.mock.calls[0] as [string];
    const written = JSON.parse(readFileSync(filePath, "utf-8")).jobs as Array<{ position: string }>;
    expect(written.map((j) => j.position)).toEqual(["Head of Product Design, Platform"]);
  });

  it("says so, rather than importing the whole board, when there is nothing to search for", async () => {
    const progress: string[] = [];
    const result = await scan({ titleFilters: { positive: [], negative: [] }, targetRoles: [] }, (m) => progress.push(m));

    expect(mocks.safeFetch).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Himalayas was not searched: add an include keyword under Account → Settings → Preferences → Title filters/);
  });
});

describe("runHimalayasScan — how a search ends", () => {
  it("stops a search once a whole page is older than the 12-hour horizon", async () => {
    // 5h per page: page 3 starts at 10h, page 4 at 15h — the first page wholly past it.
    mocks.safeFetch.mockImplementation((url: string) => Promise.resolve(resultsAging(5)(url)));

    const result = await scan({ titleFilters: { positive: ["designer"], negative: ["designer"] } });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(4);
    expect(result.errors).toEqual([]);
  });

  it("does not stop at one old posting, because the last page of results mixes dates", async () => {
    mocks.safeFetch.mockImplementation((url: string) => {
      const { page: n } = searchOf(url);
      const jobs = Array.from({ length: PAGE_SIZE }, (_, i) => posting(`${n}-${i}`, i === 0 ? 500 : 1));
      return Promise.resolve(page(n <= 2 ? jobs : []));
    });

    const result = await scan({ titleFilters: NO_TITLE_MATCHES });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    // The 500-hour-old postings fall outside the 72h window and are not counted.
    expect(result.totalFound).toBe(2 * (PAGE_SIZE - 1));
  });

  it("stops when the results run out, and does not mistake a short page for the end", async () => {
    // Himalayas often returns 17–19 per page after dropping duplicates.
    mocks.safeFetch.mockImplementation((url: string) => {
      const { page: n } = searchOf(url);
      const jobs = Array.from({ length: 18 }, (_, i) => posting(`${n}-${i}`, 1));
      return Promise.resolve(page(jobs, 50));
    });

    const result = await scan({ titleFilters: NO_TITLE_MATCHES });

    // totalCount 50 is spent after page 3 (3 × 20 ≥ 50).
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    expect(result.totalFound).toBe(54);
    expect(result.errors).toEqual([]);
  });

  it("reports the page cap when the search covered less than the gap between scans", async () => {
    mocks.safeFetch.mockImplementation((url: string) => Promise.resolve(resultsAging(0.2)(url)));

    const progress: string[] = [];
    const result = await scan({ titleFilters: NO_TITLE_MATCHES }, (m) => progress.push(m));

    expect(mocks.safeFetch).toHaveBeenCalledTimes(MAX_PAGES_PER_QUERY);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/reached the 10-page cap after only 2\.0h of postings/);
    expect(result.errors[0]).toContain("under the 6h between scans");
    expect(progress.some((m) => m.startsWith("Note: Himalayas search for"))).toBe(true);
  });

  it("finishes clean when the cap ends a search that covered more than the gap", async () => {
    mocks.safeFetch.mockImplementation((url: string) => Promise.resolve(resultsAging(1)(url)));

    const result = await scan({ titleFilters: NO_TITLE_MATCHES });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(MAX_PAGES_PER_QUERY);
    expect(result.status).toBe("ok");
    expect(result.errors).toEqual([]);
  });

  it("skips postings outside the freshness window and counts each posting once across searches", async () => {
    mocks.safeFetch.mockImplementation(() =>
      Promise.resolve(page([posting("shared", 1), posting("old", 100)], 2)),
    );

    const result = await scan({ titleFilters: { positive: ["ux", "hci"], negative: ["designer"] }, freshnessWindowHours: 72 });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
    expect(result.totalFound).toBe(1);
  });
});

describe("runHimalayasScan — protecting the API", () => {
  it("stops the whole run at the first rate limit and names what was not searched", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(page([posting(1, 1)], 1))
      .mockResolvedValue({ ok: false, status: 429, text: async () => "" });

    const progress: string[] = [];
    const result = await scan(
      { titleFilters: { positive: ["ux", "hci", "accessibility"], negative: ["designer"] } },
      (m) => progress.push(m),
    );

    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
    expect(result.errors).toContain("Himalayas rate-limited the scan (HTTP 429) after 2 requests, so it stopped early.");
    expect(result.errors.some((e) => e.startsWith("Not searched back 6h this run: \u201chci\u201d, \u201caccessibility\u201d."))).toBe(true);
    expect(progress).toContain("Himalayas asked the scan to slow down — stopping early.");
  });

  it("aborts after three consecutive page failures instead of hammering a degraded API", async () => {
    mocks.safeFetch.mockResolvedValue({ ok: false, status: 503, text: async () => "" });

    const progress: string[] = [];
    const result = await scan({ titleFilters: NO_TITLE_MATCHES }, (m) => progress.push(m));

    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    expect(result.errors).toContain("Aborted after 3 consecutive page failures.");
    expect(progress).toContain("Himalayas is not responding — stopping early.");
    // No pages were read, so the cap never enters the picture.
    expect(result.errors.some((e) => e.includes("page cap"))).toBe(false);
  });

  it("retries a failed page from the same position", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => "" })
      .mockResolvedValue(page([], 0));

    await scan({ titleFilters: NO_TITLE_MATCHES });

    const pages = mocks.safeFetch.mock.calls.map(([url]) => searchOf(url as string).page);
    expect(pages).toEqual([1, 1]);
  });

  it("never spends more than the request budget in one run, and names keywords it never reached", async () => {
    mocks.safeFetch.mockImplementation((url: string) => Promise.resolve(resultsAging(1)(url)));
    const keywords = Array.from({ length: 8 }, (_, i) => `keyword${i}`);

    const result = await scan({ titleFilters: { positive: keywords, negative: ["designer"] } });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(MAX_REQUESTS);
    expect(result.errors).toContain("Reached the 50-request limit for one scan.");
    expect(result.errors).toContain(
      "Not searched back 6h this run: \u201ckeyword5\u201d, \u201ckeyword6\u201d, \u201ckeyword7\u201d. " +
        "The next scan starts from the newest postings again.",
    );
  });

  it("stays quiet when the budget cuts off a search that already covered the gap between scans", async () => {
    const aging = resultsAging(1);
    // "short" runs out after 3 pages, four keywords take 10 each, leaving 7 pages
    // — 7h of postings — for "last" before the budget runs out.
    mocks.safeFetch.mockImplementation((url: string) =>
      Promise.resolve(searchOf(url).q === "short" ? { ...aging(url), text: async () => JSON.stringify({
        jobs: [posting(`short-${searchOf(url).page}`, 1)], totalCount: 60,
      }) } : aging(url)),
    );

    const result = await scan({
      titleFilters: { positive: ["short", "k1", "k2", "k3", "k4", "last"], negative: ["designer"] },
    });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(MAX_REQUESTS);
    expect(result.errors).toEqual([]);
  });

  it("names a search the budget cut off before it covered the gap between scans", async () => {
    const aging = resultsAging(1);
    // As above, but "last" is left only 3 pages — 3h of postings.
    mocks.safeFetch.mockImplementation((url: string) =>
      Promise.resolve(searchOf(url).q === "short" ? { ...aging(url), text: async () => JSON.stringify({
        jobs: [posting(`short-${searchOf(url).page}`, 1)], totalCount: 140,
      }) } : aging(url)),
    );

    const result = await scan({
      titleFilters: { positive: ["short", "k1", "k2", "k3", "k4", "last"], negative: ["designer"] },
    });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(MAX_REQUESTS);
    expect(result.errors).toContain("Reached the 50-request limit for one scan.");
    expect(result.errors.some((e) => e.startsWith("Not searched back 6h this run: \u201clast\u201d."))).toBe(true);
  });
});

describe("runHimalayasScan — the employer's own posting", () => {
  function himalayasPosting(id: number) {
    return {
      ...posting(id, 1),
      applicationLink: `https://himalayas.app/companies/acme/jobs/designer-${id}`,
      guid: `https://himalayas.app/companies/acme/jobs/designer-${id}`,
    };
  }

  function importEcho() {
    mocks.importBrowserBoardJobs.mockImplementation((filePath: string) => {
      const scanFile = JSON.parse(readFileSync(filePath, "utf-8"));
      return Promise.resolve({
        imported: scanFile.jobs.length, duplicates: 0, fresh: scanFile.jobs.length,
        unknownDate: 0, staleFiltered: 0, errors: [],
        importedJobs: scanFile.jobs.map((j: { position: string; url: string; company: string }) => ({
          title: j.position, url: j.url, company: j.company,
        })),
      });
    });
  }

  function writtenJobs() {
    const [filePath] = mocks.importBrowserBoardJobs.mock.calls.at(-1) as [string];
    return JSON.parse(readFileSync(filePath, "utf-8")).jobs as Array<Record<string, string>>;
  }

  it("uses the employer's posting when the lookup finds one, keeping Himalayas as the source", async () => {
    mocks.safeFetch.mockImplementation((url: string) =>
      Promise.resolve(page(searchOf(url).page === 1 ? [himalayasPosting(1), himalayasPosting(2)] : [], 2))
    );
    mocks.findEmployerPostings.mockImplementation(async (jobs: Array<{ sourceUrl: string }>) => ({
      matches: new Map([[jobs[0].sourceUrl, {
        provider: "greenhouse", boardSlug: "acme",
        url: "https://job-boards.greenhouse.io/acme/jobs/1", title: "Product Designer",
      }]]),
      attempted: jobs.length,
      skippedForTime: 0,
    }));
    importEcho();

    const progress: string[] = [];
    await scan({ titleFilters: { positive: ["designer"], negative: [] } }, (m) => progress.push(m));

    const [found, notFound] = writtenJobs();
    expect(found.url).toBe("https://job-boards.greenhouse.io/acme/jobs/1");
    expect(found.originalPostingUrl).toBe("https://job-boards.greenhouse.io/acme/jobs/1");
    expect(found.sourceUrl).toBe("https://himalayas.app/companies/acme/jobs/designer-1");
    // No match: the Himalayas page is the job's link, but never its employer link.
    expect(notFound.url).toBe("https://himalayas.app/companies/acme/jobs/designer-2");
    expect(notFound.originalPostingUrl).toBe("");
    expect(progress).toContain("Found the employer's own posting for 1 of 2 new Himalayas jobs (Greenhouse, Lever, Ashby).");
  });

  it("imports the jobs anyway when the lookup throws", async () => {
    mocks.safeFetch.mockImplementation((url: string) =>
      Promise.resolve(page(searchOf(url).page === 1 ? [himalayasPosting(1)] : [], 1))
    );
    mocks.findEmployerPostings.mockRejectedValue(new Error("ATS down"));
    importEcho();

    const result = await scan({ titleFilters: { positive: ["designer"], negative: [] } });

    expect(result.status).toBe("ok");
    expect(result.imported).toBe(1);
    expect(writtenJobs()[0].url).toBe("https://himalayas.app/companies/acme/jobs/designer-1");
  });

  it("does not look up jobs that arrive with an employer link of their own", async () => {
    mocks.safeFetch.mockImplementation((url: string) =>
      Promise.resolve(page(searchOf(url).page === 1 ? [posting(1, 1)] : [], 1))
    );
    importEcho();

    await scan({ titleFilters: { positive: ["designer"], negative: [] } });

    expect(mocks.findEmployerPostings).not.toHaveBeenCalled();
  });
});

describe("runHimalayasScan — handing matched jobs to the importer", () => {
  it("writes the scan file under its final name and imports it", async () => {
    mocks.safeFetch.mockImplementation((url: string) => {
      // A spent totalCount ends the search, so this test is about the write, not the walk.
      return Promise.resolve(page(searchOf(url).page === 1 ? [posting(1, 1), posting(2, 2)] : [], 2));
    });
    mocks.importBrowserBoardJobs.mockImplementation((filePath: string) => {
      const scanFile = JSON.parse(readFileSync(filePath, "utf-8"));
      return Promise.resolve({
        imported: scanFile.jobs.length,
        duplicates: 0,
        fresh: scanFile.jobs.length,
        unknownDate: 0,
        staleFiltered: 0,
        errors: [],
        importedJobs: scanFile.jobs.map((j: { position: string; url: string; company: string }) => ({
          title: j.position,
          url: j.url,
          company: j.company,
        })),
      });
    });

    const result = await scan({ titleFilters: { positive: ["designer"], negative: [] } });

    expect(result.status).toBe("ok");
    expect(result.imported).toBe(2);
    expect(result.jobs.map((j) => j.company)).toEqual(["Company 1", "Company 2"]);

    const [filePath, options] = mocks.importBrowserBoardJobs.mock.calls[0] as [string, { freshnessWindowHours: number }];
    expect(path.basename(filePath)).toMatch(/^himalayas-jobs-.*Z\.json$/);
    expect(options.freshnessWindowHours).toBe(72);

    // The two-step write must leave no .tmp behind for the watcher to read.
    const written = readdirSync(importDir);
    expect(written.some((f) => f.endsWith(".tmp"))).toBe(false);
    expect(existsSync(filePath)).toBe(true);

    const payload = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(payload.metadata.source).toBe("himalayas");
    expect(payload.metadata.totalJobsValid).toBe(2);
    expect(payload.jobs[0].dataQuality.hasDescription).toBe(true);
  });

  it("reports an importer failure as an error result that still names the jobs found", async () => {
    mocks.safeFetch.mockImplementation((url: string) =>
      Promise.resolve(page(searchOf(url).page === 1 ? [posting(1, 1)] : [], 1))
    );
    mocks.importBrowserBoardJobs.mockRejectedValue(new Error("database is locked"));

    const result = await scan({ titleFilters: { positive: ["designer"], negative: [] } });

    expect(result.status).toBe("error");
    expect(result.errors).toContain("database is locked");
    expect(result.jobs.map((j) => j.title)).toEqual(["Product Designer"]);
  });
});
