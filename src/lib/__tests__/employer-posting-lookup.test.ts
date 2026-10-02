/**
 * The employer-posting lookup is only worth having if it is never wrong: a bad
 * match sends the user to apply for a different role. So most of what is pinned
 * here is what it must *refuse* — near-miss titles, a same-slug board belonging
 * to another company — alongside the matches it should make.
 *
 * The network is replaced by an in-memory set of boards keyed by API URL.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({ getJobDedupKeys: () => ({ urls: new Set(), companyRoles: new Set() }) }));

import {
  companyNamesAgree,
  employerSlugCandidates,
  findEmployerPosting,
  findEmployerPostingsForScan,
  himalayasCompanySlug,
  normalizeTitleForMatch,
  parseBoardListing,
  type JsonFetcher,
} from "@/lib/scanner/employer-posting-lookup";

const GH = (slug: string) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
const LEVER = (slug: string) => `https://api.lever.co/v0/postings/${slug}?mode=json`;
const ASHBY = (slug: string) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

function boards(map: Record<string, unknown>): JsonFetcher & { calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    return url in map ? map[url] : null;
  }) as JsonFetcher & { calls: string[] };
  fetcher.calls = calls;
  return fetcher;
}

function greenhouse(companyName: string, jobs: Array<{ title: string; id: number; location?: string }>) {
  return {
    jobs: jobs.map((j) => ({
      title: j.title,
      company_name: companyName,
      absolute_url: `https://job-boards.greenhouse.io/x/jobs/${j.id}`,
      location: { name: j.location ?? "New York" },
    })),
  };
}

describe("matching helpers", () => {
  it("normalises titles without losing the words that distinguish roles", () => {
    expect(normalizeTitleForMatch("Senior Product Designer (Remote)")).toBe("senior product designer");
    expect(normalizeTitleForMatch("UI/UX Designer")).toBe("ui ux designer");
    expect(normalizeTitleForMatch("Diseñador de Producto")).toBe("disenador de producto");
    expect(normalizeTitleForMatch("Senior Product Designer")).not.toBe(normalizeTitleForMatch("Product Designer"));
  });

  it("reads the company slug from a Himalayas URL and nothing else", () => {
    expect(himalayasCompanySlug("https://himalayas.app/companies/slate-auto/jobs/designer")).toBe("slate-auto");
    expect(himalayasCompanySlug("https://example.com/companies/acme/jobs/1")).toBeNull();
    expect(himalayasCompanySlug("not a url")).toBeNull();
  });

  it("tries the Himalayas slug first and strips its disambiguating hex suffix", () => {
    expect(employerSlugCandidates("Fluency, Inc.", "fluency-inc-a92b56")).toEqual(["fluencyinc", "fluency-inc", "fluency"]);
    expect(employerSlugCandidates("ServiceTitan")).toEqual(["servicetitan"]);
    expect(employerSlugCandidates("Acme Group Ltd")).toEqual(["acme"]);
  });

  it("agrees on company names that plainly match, and refuses ones that do not", () => {
    expect(companyNamesAgree("Cresta", "Cresta")).toBe(true);
    expect(companyNamesAgree("Counterpart Health", "Counterpart Health, Inc.")).toBe(true);
    expect(companyNamesAgree("Arco Educação", "Arco Educacao")).toBe(true);
    expect(companyNamesAgree("Leading Educators Careers", "Leading Educators")).toBe(true);
    expect(companyNamesAgree("Neat Capital", "Neat")).toBe(false);
    expect(companyNamesAgree("Base Camp Coding", "Wayfinder")).toBe(false);
    expect(companyNamesAgree(null, "Anything")).toBe(true);
  });

  it("skips unlisted Ashby postings", () => {
    const listing = parseBoardListing("ashby", {
      jobs: [
        { title: "Designer", jobUrl: "https://jobs.ashbyhq.com/a/1", isListed: true },
        { title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/a/2", isListed: false },
      ],
    });
    expect(listing?.postings.map((p) => p.title)).toEqual(["Designer"]);
  });
});

describe("findEmployerPosting", () => {
  it("finds an exact title on the company's Greenhouse board", async () => {
    const fetchJson = boards({ [GH("cresta")]: greenhouse("Cresta", [{ title: "Senior Product Designer, AI Builders", id: 7 }]) });

    const match = await findEmployerPosting(
      { company: "Cresta", title: "Senior Product Designer, AI Builders", companySlug: "cresta" },
      { fetchJson },
    );

    expect(match).toEqual({
      provider: "greenhouse",
      boardSlug: "cresta",
      url: "https://job-boards.greenhouse.io/x/jobs/7",
      title: "Senior Product Designer, AI Builders",
    });
  });

  it("finds Lever and Ashby postings too", async () => {
    const lever = boards({
      [LEVER("remedy")]: [{ text: "Product Designer", hostedUrl: "https://jobs.lever.co/remedy/abc", categories: { location: "Remote" } }],
    });
    const ashby = boards({
      [ASHBY("permitflow")]: { jobs: [{ title: "Staff Product Designer", jobUrl: "https://jobs.ashbyhq.com/permitflow/1" }] },
    });

    expect((await findEmployerPosting({ company: "Remedy", title: "Product Designer" }, { fetchJson: lever }))?.url)
      .toBe("https://jobs.lever.co/remedy/abc");
    expect((await findEmployerPosting({ company: "PermitFlow", title: "Staff Product Designer" }, { fetchJson: ashby }))?.provider)
      .toBe("ashby");
  });

  it("refuses a near-miss title rather than guess", async () => {
    const fetchJson = boards({ [GH("toast")]: greenhouse("Toast", [{ title: "Senior Product Designer II", id: 1 }]) });

    expect(await findEmployerPosting({ company: "Toast", title: "Senior Product Designer" }, { fetchJson })).toBeNull();
  });

  it("refuses a same-slug Greenhouse board that belongs to another company", async () => {
    const fetchJson = boards({ [GH("base")]: greenhouse("Base Operations", [{ title: "Product Designer", id: 1 }]) });

    expect(await findEmployerPosting({ company: "Base", title: "Product Designer" }, { fetchJson })).toBeNull();
    expect(await findEmployerPosting({ company: "Wayfinder", title: "Product Designer", companySlug: "base" }, { fetchJson }))
      .toBeNull();
  });

  it("prefers a remote posting when several share the title", async () => {
    const fetchJson = boards({
      [GH("acme")]: greenhouse("Acme", [
        { title: "Product Designer", id: 1, location: "London" },
        { title: "Product Designer", id: 2, location: "Remote - US" },
      ]),
    });

    const match = await findEmployerPosting({ company: "Acme", title: "Product Designer" }, { fetchJson });
    expect(match?.url).toBe("https://job-boards.greenhouse.io/x/jobs/2");
  });

  it("returns null when no board exists", async () => {
    expect(await findEmployerPosting({ company: "Nobody", title: "Designer" }, { fetchJson: boards({}) })).toBeNull();
  });
});

describe("findEmployerPostingsForScan", () => {
  const job = (company: string, n: number) => ({
    company,
    position: "Product Designer",
    sourceUrl: `https://himalayas.app/companies/${company.toLowerCase()}/jobs/${n}`,
  });

  it("reads each company's boards once, however many of its jobs are in the scan", async () => {
    const fetchJson = boards({ [GH("acme")]: greenhouse("Acme", [{ title: "Product Designer", id: 1 }]) });

    const result = await findEmployerPostingsForScan([job("Acme", 1), job("Acme", 2)], { fetchJson, isKnown: () => false });

    expect(result.matches.size).toBe(2);
    expect(fetchJson.calls.filter((u) => u === GH("acme"))).toHaveLength(1);
  });

  it("skips jobs already in the database", async () => {
    const fetchJson = boards({});
    const result = await findEmployerPostingsForScan([job("Acme", 1)], { fetchJson, isKnown: () => true });

    expect(result.attempted).toBe(0);
    expect(fetchJson.calls).toHaveLength(0);
  });

  it("stops starting lookups once the time budget is spent", async () => {
    const result = await findEmployerPostingsForScan([job("Acme", 1), job("Beta", 2)], {
      fetchJson: boards({}),
      isKnown: () => false,
      budgetMs: -1,
    });

    expect(result.attempted).toBe(0);
    expect(result.skippedForTime).toBe(2);
  });
});
