/**
 * Coverage for the walk itself — `runHimalayasScan` — as opposed to the pure
 * helpers exercised in `himalayas-scanner.test.ts`.
 *
 * What is worth pinning here is when a run reports the page cap. Hitting the cap
 * is the normal ending, so reporting it every time buried the runs where the
 * sweep really was too thin to cover the gap between scans. Both sides of that
 * decision are asserted, along with the two other ways a walk can end.
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
const MAX_PAGES = 60;
const PAGE_SIZE = 20;

function posting(id: number, ageHours: number) {
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

/**
 * A page as the API returns it. The cursor is the next offset in disguise, so a
 * mocked feed can be addressed by position whichever way the scanner pages.
 */
function page(jobs: unknown[], offset = 0) {
  const nextCursor = jobs.length > 0 ? `c${offset + jobs.length}` : null;
  return { ok: true, text: async () => JSON.stringify({ jobs, nextCursor }) };
}

/**
 * A feed whose postings age linearly from now to `spanHours` across the full
 * page budget — the shape that decides whether the cap is worth reporting.
 */
function feedSpanning(spanHours: number) {
  const perPage = PAGE_SIZE;
  const total = MAX_PAGES * perPage;
  return (offset: number) => {
    const jobs = Array.from({ length: perPage }, (_, i) => {
      const index = offset + i;
      return posting(index, (index / total) * spanHours);
    });
    return page(jobs, offset);
  };
}

function offsetFromUrl(url: string): number {
  const params = new URL(url).searchParams;
  const cursor = params.get("cursor");
  return cursor ? Number(cursor.slice(1)) : Number(params.get("offset") ?? 0);
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

describe("runHimalayasScan — how a walk ends", () => {
  it("reports the page cap when the sweep covered less feed than the gap between scans", async () => {
    const feed = feedSpanning(2);
    mocks.safeFetch.mockImplementation((url: string) => Promise.resolve(feed(offsetFromUrl(url))));

    const progress: string[] = [];
    const result = await scan({ titleFilters: NO_TITLE_MATCHES }, (m) => progress.push(m));

    expect(mocks.safeFetch).toHaveBeenCalledTimes(MAX_PAGES);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Reached the 60-page cap after only 2\.0h of postings/);
    expect(result.errors[0]).toContain("under the 6h between scans");
    expect(progress.some((m) => m.startsWith("Note: Reached the 60-page cap"))).toBe(true);
  });

  it("finishes clean when the cap ends a sweep that covered more than the gap", async () => {
    const feed = feedSpanning(10);
    mocks.safeFetch.mockImplementation((url: string) => Promise.resolve(feed(offsetFromUrl(url))));

    const progress: string[] = [];
    const result = await scan({ titleFilters: NO_TITLE_MATCHES }, (m) => progress.push(m));

    expect(mocks.safeFetch).toHaveBeenCalledTimes(MAX_PAGES);
    expect(result.status).toBe("ok");
    expect(result.errors).toEqual([]);
    expect(progress).toContain("Reached the 60-page cap, covering the newest 10.0h of postings.");
  });

  it("stops at the first posting past the freshness window, without reporting the cap", async () => {
    // Newest-first: one posting older than the window means every page behind it
    // is older still, so the walk ends there rather than at the page budget.
    mocks.safeFetch.mockImplementation((url: string) => {
      const offset = offsetFromUrl(url);
      const jobs = Array.from({ length: PAGE_SIZE }, (_, i) =>
        posting(offset + i, offset === 0 && i === PAGE_SIZE - 1 ? 100 : 1)
      );
      return Promise.resolve(page(jobs, offset));
    });

    const result = await scan({ titleFilters: NO_TITLE_MATCHES, freshnessWindowHours: 72 });

    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
    expect(result.errors).toEqual([]);
    expect(result.totalFound).toBe(PAGE_SIZE - 1);
  });

  it("aborts after three consecutive page failures instead of hammering a degraded API", async () => {
    mocks.safeFetch.mockResolvedValue({ ok: false, text: async () => "" });

    const progress: string[] = [];
    const result = await scan({ titleFilters: NO_TITLE_MATCHES }, (m) => progress.push(m));

    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    expect(result.errors).toContain("Aborted after 3 consecutive page failures.");
    expect(progress).toContain("Himalayas is not responding — stopping early.");
    // No pages were read, so the cap never enters the picture.
    expect(result.errors.some((e) => e.includes("page cap"))).toBe(false);
  });
});

describe("runHimalayasScan — paging", () => {
  it("follows nextCursor after the first page instead of the deprecated offset", async () => {
    const feed = feedSpanning(10);
    mocks.safeFetch.mockImplementation((url: string) => Promise.resolve(feed(offsetFromUrl(url))));

    await scan({ titleFilters: NO_TITLE_MATCHES });

    const urls = mocks.safeFetch.mock.calls.map(([url]) => new URL(url as string));
    expect(urls[0].searchParams.has("cursor")).toBe(false);
    expect(urls[0].searchParams.has("offset")).toBe(false);
    expect(urls[1].searchParams.get("cursor")).toBe(`c${PAGE_SIZE}`);
    expect(urls.slice(1).every((u) => !u.searchParams.has("offset"))).toBe(true);
  });

  it("falls back to offset when a response carries no cursor", async () => {
    mocks.safeFetch.mockImplementation((url: string) => {
      const offset = offsetFromUrl(url);
      const jobs = offset < PAGE_SIZE * 2
        ? Array.from({ length: PAGE_SIZE }, (_, i) => posting(offset + i, 1))
        : [];
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ jobs }) });
    });

    await scan({ titleFilters: NO_TITLE_MATCHES });

    const second = new URL(mocks.safeFetch.mock.calls[1][0] as string);
    expect(second.searchParams.get("offset")).toBe(String(PAGE_SIZE));
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
      Promise.resolve(page(offsetFromUrl(url) === 0 ? [himalayasPosting(1), himalayasPosting(2)] : []))
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
      Promise.resolve(page(offsetFromUrl(url) === 0 ? [himalayasPosting(1)] : []))
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
      Promise.resolve(page(offsetFromUrl(url) === 0 ? [posting(1, 1)] : []))
    );
    importEcho();

    await scan({ titleFilters: { positive: ["designer"], negative: [] } });

    expect(mocks.findEmployerPostings).not.toHaveBeenCalled();
  });
});

describe("runHimalayasScan — handing matched jobs to the importer", () => {
  it("writes the scan file under its final name and imports it", async () => {
    mocks.safeFetch.mockImplementation((url: string) => {
      const offset = offsetFromUrl(url);
      // A short page ends the walk, so this test is about the write, not the walk.
      return Promise.resolve(page(offset === 0 ? [posting(1, 1), posting(2, 2)] : []));
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
      Promise.resolve(page(offsetFromUrl(url) === 0 ? [posting(1, 1)] : []))
    );
    mocks.importBrowserBoardJobs.mockRejectedValue(new Error("database is locked"));

    const result = await scan({ titleFilters: { positive: ["designer"], negative: [] } });

    expect(result.status).toBe("error");
    expect(result.errors).toContain("database is locked");
    expect(result.jobs.map((j) => j.title)).toEqual(["Product Designer"]);
  });
});
