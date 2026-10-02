/**
 * The employer-posting lookup is only worth having if it is never wrong: a bad
 * match sends the user to apply for a different role. So most of what is pinned
 * here is what it must *refuse* — near-miss titles, a same-slug board belonging
 * to another company — alongside the matches it should make.
 *
 * The network is replaced by an in-memory set of boards keyed by API URL.
 */

import { describe, expect, it, vi } from "vitest";

const known = vi.hoisted(() => ({ urls: new Set<string>() }));
vi.mock("@/lib/db/queries", () => ({ getKnownJobUrls: () => known.urls }));

import {
  companyNamesAgree,
  employerSlugCandidates,
  findEmployerPosting,
  findEmployerPostingCandidates,
  himalayasCountries,
  findEmployerPostingsForScan,
  himalayasCompanySlug,
  normalizeTitleForMatch,
  parseBoardListing,
  pickUnambiguousPosting,
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

  it("ignores remote and gender asides but keeps brackets that distinguish openings", () => {
    expect(normalizeTitleForMatch("UX Designer (Remote - US)")).toBe("ux designer");
    expect(normalizeTitleForMatch("UX Designer (f/m/d)")).toBe("ux designer");
    expect(normalizeTitleForMatch("UX Designer (m/w/d)")).toBe("ux designer");
    expect(normalizeTitleForMatch("UX Designer (all genders)")).toBe("ux designer");
    expect(normalizeTitleForMatch("Software Engineer (Frontend)")).not.toBe(normalizeTitleForMatch("Software Engineer (Backend)"));
    expect(normalizeTitleForMatch("Designer (Contract)")).toBe("designer contract");
  });

  it("reads the countries a Himalayas location restricts the job to", () => {
    expect(himalayasCountries("United States (Remote); Canada (Remote)")).toEqual(["united states", "canada"]);
    expect(himalayasCountries("Remote")).toEqual([]);
    expect(himalayasCountries("")).toEqual([]);
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
      location: "New York",
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

  describe("when several postings share the title", () => {
    const twins = () =>
      boards({
        [GH("acme")]: greenhouse("Acme", [
          { title: "Product Designer", id: 1, location: "Remote - US" },
          { title: "Product Designer", id: 2, location: "Remote - Germany" },
        ]),
      });

    it("adopts the one posting that fits the job's countries", async () => {
      const match = await findEmployerPosting(
        { company: "Acme", title: "Product Designer", location: "Germany (Remote)" },
        { fetchJson: twins() },
      );
      expect(match?.url).toBe("https://job-boards.greenhouse.io/x/jobs/2");
    });

    it("refuses to guess for an unrestricted listing", async () => {
      expect(
        await findEmployerPosting({ company: "Acme", title: "Product Designer", location: "Remote" }, { fetchJson: twins() }),
      ).toBeNull();
    });

    it("refuses when no posting, or more than one, fits the job's countries", async () => {
      expect(
        await findEmployerPosting({ company: "Acme", title: "Product Designer", location: "France (Remote)" }, { fetchJson: twins() }),
      ).toBeNull();
      expect(
        await findEmployerPosting(
          { company: "Acme", title: "Product Designer", location: "United States (Remote); Germany (Remote)" },
          { fetchJson: twins() },
        ),
      ).toBeNull();
    });

    it("still lists every one of them for the user to choose from", async () => {
      const all = await findEmployerPostingCandidates({ company: "Acme", title: "Product Designer" }, { fetchJson: twins() });
      expect(all.map((c) => c.location)).toEqual(["Remote - US", "Remote - Germany"]);
    });

    it("recognises common short forms of a country", () => {
      const us = { provider: "greenhouse" as const, boardSlug: "a", title: "D", url: "u1", location: "New York, NY, USA" };
      const uk = { provider: "greenhouse" as const, boardSlug: "a", title: "D", url: "u2", location: "London, UK" };
      expect(pickUnambiguousPosting([us, uk], "United Kingdom (Remote)")?.url).toBe("u2");
      expect(pickUnambiguousPosting([us, uk], "United States (Remote)")?.url).toBe("u1");
    });
  });

  it("does not let a bracketed qualifier stand in for another opening", async () => {
    const fetchJson = boards({ [GH("acme")]: greenhouse("Acme", [{ title: "Software Engineer (Backend)", id: 1 }]) });

    expect(await findEmployerPosting({ company: "Acme", title: "Software Engineer (Frontend)" }, { fetchJson })).toBeNull();
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

  it("skips a listing already on file, but not a new listing with the same company and title", async () => {
    const fetchJson = boards({ [GH("acme")]: greenhouse("Acme", [{ title: "Product Designer", id: 1 }]) });
    known.urls = new Set([job("Acme", 1).sourceUrl]);

    // No isKnown override: the real check, by listing URL, is what runs.
    const result = await findEmployerPostingsForScan([job("Acme", 1), job("Acme", 2)], { fetchJson });

    expect(result.attempted).toBe(1);
    expect([...result.matches.keys()]).toEqual([job("Acme", 2).sourceUrl]);
    known.urls = new Set();
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
