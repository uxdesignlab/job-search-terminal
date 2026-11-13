import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adzunaResultToScanJob, type AdzunaJob } from "@/lib/scanner/aggregator-scanner";
import { parseBrowserBoardScanFile, prepareBrowserBoardJobs } from "@/lib/scanner/browser-board-importer";
import { boardOnlySourceLabel, buildPostingSearchQuery, needsEmployerPosting } from "@/lib/jobs/posting-resolution";
import { migrations } from "@/lib/db/schema";

/**
 * Adzuna's `redirect_url` is a click tracker. Sponsored results (`/land/ad/`)
 * resell that click to job-ad networks, and a JPMorgan design role was seen
 * landing on a UPS driver job. Jobs must link to Adzuna's own listing page and
 * never present the tracker as the employer's posting.
 */
const result = (overrides: Partial<AdzunaJob> = {}): AdzunaJob => ({
  id: "5963669719",
  title: "Experience Design Vice President",
  company: { display_name: "JPMorganChase" },
  description: "Shape the future of user experience.",
  redirect_url: "https://www.adzuna.com/land/ad/5963669719?se=abc&v=C797A470",
  location: { display_name: "Fairfax, Delaware" },
  created: "2026-11-12T20:00:00Z",
  ...overrides,
});

const dedup = () => ({
  urls: new Set<string>(), companyRoles: new Set<string>(), companyRoleLocations: new Set<string>(),
  urlToIds: new Map<string, string[]>(), originalPostingKeyToIds: new Map<string, string[]>(),
  companyRoleToIds: new Map<string, string[]>(), companyRoleLocationToIds: new Map<string, string[]>(), openIds: new Set<string>(),
});

describe("adzunaResultToScanJob", () => {
  it("links a sponsored result to Adzuna's listing page, not the ad redirect", () => {
    const job = adzunaResultToScanJob(result());
    expect(job.url).toBe("https://www.adzuna.com/details/5963669719");
    expect(job.sourceUrl).toBe(job.url);
    expect(job.originalPostingUrl).toBe("");
  });

  it("keeps a /details/ result on the same page", () => {
    const job = adzunaResultToScanJob(result({ redirect_url: "https://www.adzuna.com/details/5963735935?utm_medium=api" , id: "5963735935" }));
    expect(job.url).toBe("https://www.adzuna.com/details/5963735935");
  });

  it("keeps the country site", () => {
    expect(adzunaResultToScanJob(result({ redirect_url: "https://www.adzuna.co.uk/land/ad/42?v=x", id: "42" })).url)
      .toBe("https://www.adzuna.co.uk/details/42");
  });

  it("never trusts a non-Adzuna host for the listing link", () => {
    expect(adzunaResultToScanJob(result({ redirect_url: "https://www.jobg8.com/x", id: "7" })).url)
      .toBe("https://www.adzuna.com/details/7");
  });

  it("keeps the job ID it had before the link changed", () => {
    const now = adzunaResultToScanJob(result());
    const prepare = (job: Record<string, unknown>) =>
      prepareBrowserBoardJobs(
        parseBrowserBoardScanFile({ metadata: { source: "adzuna" }, jobs: [{ ...job, datePosted: "2026-11-12T20:00:00Z" }] }),
        { dedup: dedup(), now: new Date("2026-11-12T21:00:00Z") },
      ).jobs[0];
    // Before 0.21.0 the ID was hashed from the redirect URL minus its query.
    const before = prepare({ ...now, sourceUrl: "https://www.adzuna.com/land/ad/5963669719", idKey: undefined });
    const after = prepare(now);
    expect(after.id).toBe(before.id);
    expect(after.url).toBe("https://www.adzuna.com/details/5963669719");
    expect(after.originalPostingUrl).toBe("");
  });
});

describe("Adzuna as a board-only source", () => {
  const job = { source: "adzuna-api-scan", url: "https://www.adzuna.com/details/1", postingResolutionStatus: "resolved" as const };

  it("asks for the employer's posting while the job links to Adzuna", () => {
    expect(needsEmployerPosting(job)).toBe(true);
    expect(needsEmployerPosting({ ...job, url: "https://www.adzuna.co.uk/details/1" })).toBe(true);
    expect(boardOnlySourceLabel("adzuna-api-scan")).toBe("Adzuna");
  });

  it("stops asking once the employer's posting is saved", () => {
    expect(needsEmployerPosting({ ...job, url: "https://jobs.lever.co/acme/1" })).toBe(false);
  });

  it("excludes Adzuna from the posting search", () => {
    expect(buildPostingSearchQuery({ company: "Acme", title: "Designer", location: "Remote", postingSearchQuery: "", source: "adzuna-api-scan" }))
      .toBe('Acme "Designer" -site:adzuna.com');
  });
});

describe("migration 0071_adzuna_listing_links", () => {
  let directory: string;
  let client: typeof import("@/lib/db/client");
  let q: typeof import("@/lib/db/queries");
  const sql = migrations.find((m) => m.id === "0071_adzuna_listing_links")!.sql;

  beforeEach(async () => {
    vi.resetModules();
    directory = mkdtempSync(path.join(os.tmpdir(), "jst-adzuna-migration-"));
    process.env.JST_DATABASE_PATH = path.join(directory, "test.sqlite");
    client = await import("@/lib/db/client");
    q = await import("@/lib/db/queries");
  });
  afterEach(() => { client.closeDatabase(); delete process.env.JST_DATABASE_PATH; rmSync(directory, { recursive: true, force: true }); });

  function insert(id: string, url: string, sourceUrl: string, originalPostingUrl: string, source = "adzuna-api-scan") {
    q.insertBrowserBoardJobs([{
      id, company: "Acme", title: `Designer ${id}`, url, sourceUrl, originalPostingUrl, originalPostingKey: "",
      source: source as never, location: "Remote", rawDescription: "", datePosted: null, firstSeenDate: "2026-11-12",
      salaryNotes: "", isDuplicate: false, duplicateOf: null,
    }]);
  }
  const row = (id: string) => client.getDatabase()
    .prepare("select url, source_url, original_posting_url, is_duplicate, duplicate_of from jobs where id = ?").get(id) as Record<string, unknown>;

  it("moves sponsored jobs to the listing page and forgets the tracker", () => {
    const ad = "https://www.adzuna.com/land/ad/100?se=x&v=y";
    insert("a", ad, "https://www.adzuna.com/land/ad/100", ad);
    client.getDatabase().exec(sql);
    expect(row("a")).toMatchObject({
      url: "https://www.adzuna.com/details/100",
      source_url: "https://www.adzuna.com/details/100",
      original_posting_url: "",
      is_duplicate: 0,
    });
  });

  it("keeps an employer posting the user already found", () => {
    insert("b", "https://jobs.lever.co/acme/1", "https://www.adzuna.com/land/ad/200", "https://jobs.lever.co/acme/1");
    client.getDatabase().exec(sql);
    expect(row("b")).toMatchObject({ url: "https://jobs.lever.co/acme/1", original_posting_url: "https://jobs.lever.co/acme/1", source_url: "https://www.adzuna.com/details/200" });
  });

  it("marks a second copy of a listing as a duplicate instead of failing on the unique link", () => {
    insert("kept", "https://www.adzuna.com/details/300", "https://www.adzuna.com/details/300", "https://www.adzuna.com/details/300");
    insert("copy", "https://www.adzuna.com/land/ad/300?v=1", "https://www.adzuna.com/land/ad/300", "https://www.adzuna.com/land/ad/300?v=1");
    insert("copy2", "https://www.adzuna.com/land/ad/301?v=1", "https://www.adzuna.com/land/ad/301", "");
    insert("copy3", "https://www.adzuna.com/land/ad/301?v=2", "https://www.adzuna.com/land/ad/301", "");
    client.getDatabase().exec(sql);
    expect(row("kept")).toMatchObject({ url: "https://www.adzuna.com/details/300", original_posting_url: "" });
    expect(row("copy")).toMatchObject({ url: "https://www.adzuna.com/land/ad/300?v=1", is_duplicate: 1, duplicate_of: '["kept"]' });
    expect(row("copy2")).toMatchObject({ url: "https://www.adzuna.com/details/301", is_duplicate: 0 });
    expect(row("copy3")).toMatchObject({ is_duplicate: 1, duplicate_of: '["copy2"]' });
  });

  it("leaves other sources alone", () => {
    insert("c", "https://www.adzuna.com/land/ad/400?v=1", "https://www.adzuna.com/land/ad/400", "https://www.adzuna.com/land/ad/400?v=1", "email-alert-import");
    client.getDatabase().exec(sql);
    expect(row("c")).toMatchObject({ url: "https://www.adzuna.com/land/ad/400?v=1" });
  });
});
