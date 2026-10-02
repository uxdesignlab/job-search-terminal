import { describe, expect, it } from "vitest";
import { buildPostingSearchQuery, hasResolvedPosting, isBoardOnlyUrl, needsEmployerPosting } from "@/lib/jobs/posting-resolution";

describe("needsEmployerPosting", () => {
  const himalayas = {
    source: "himalayas-api-scan",
    url: "https://himalayas.app/companies/acme/jobs/designer",
    postingResolutionStatus: "resolved" as const,
  };

  it("flags a Himalayas job that still links only to Himalayas", () => {
    expect(needsEmployerPosting(himalayas)).toBe(true);
    // It still has a usable listing — unlike an email lead with no URL at all.
    expect(hasResolvedPosting(himalayas)).toBe(true);
  });

  it("clears once the employer's posting replaces the Himalayas link", () => {
    expect(needsEmployerPosting({ ...himalayas, url: "https://job-boards.greenhouse.io/acme/jobs/1" })).toBe(false);
  });

  it("leaves other sources and email leads alone", () => {
    expect(needsEmployerPosting({ ...himalayas, source: "adzuna-api-scan" })).toBe(false);
    expect(needsEmployerPosting({ ...himalayas, postingResolutionStatus: "needs_resolution" })).toBe(false);
  });
});

describe("isBoardOnlyUrl", () => {
  it("recognises Himalayas pages for Himalayas jobs only", () => {
    expect(isBoardOnlyUrl("himalayas-api-scan", "https://himalayas.app/jobs/1")).toBe(true);
    expect(isBoardOnlyUrl("himalayas-api-scan", "https://jobs.lever.co/acme/1")).toBe(false);
    expect(isBoardOnlyUrl("greenhouse-api", "https://himalayas.app/jobs/1")).toBe(false);
    expect(isBoardOnlyUrl("himalayas-api-scan", "not a url")).toBe(false);
  });
});

describe("buildPostingSearchQuery", () => {
  const base = {
    company: "Piedmont Global Language Solutions",
    title: "After Hours Accessibility Coordinator",
    location: "United States (Remote)",
    postingSearchQuery: "",
  };

  it("quotes the title, drops the board's location, and excludes the board for Himalayas jobs", () => {
    expect(buildPostingSearchQuery({ ...base, source: "himalayas-api-scan" })).toBe(
      'Piedmont Global Language Solutions "After Hours Accessibility Coordinator" -site:himalayas.app',
    );
  });

  it("quotes the title and keeps the location for other jobs", () => {
    expect(buildPostingSearchQuery({ ...base, location: "Austin, TX", source: "email-alert-import" })).toBe(
      'Piedmont Global Language Solutions "After Hours Accessibility Coordinator" Austin, TX job',
    );
  });

  it("strips quotes already in the title so the phrase stays well-formed", () => {
    expect(buildPostingSearchQuery({ ...base, title: 'The "Fixer" Designer', source: "himalayas-api-scan" }))
      .toContain('"The Fixer Designer"');
  });

  it("uses a saved query as it stands", () => {
    expect(buildPostingSearchQuery({ ...base, postingSearchQuery: "custom query", source: "himalayas-api-scan" }))
      .toBe("custom query");
  });
});
