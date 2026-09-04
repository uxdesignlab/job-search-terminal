import { describe, expect, it } from "vitest";
import { companyJobsHref, companyLinkFor, isAppliedStatus } from "@/lib/jobs/company-link";

describe("companyLinkFor", () => {
  it("does not link a company tracked once and never applied to", () => {
    expect(companyLinkFor("Garmin", { total: 1, applied: 0 })).toBeNull();
  });

  it("does not link when the company name is blank", () => {
    expect(companyLinkFor("   ", { total: 4, applied: 2 })).toBeNull();
  });

  it("links without a count when other positions exist but none were applied to", () => {
    expect(companyLinkFor("Garmin", { total: 3, applied: 0 })).toEqual({
      href: "/jobs?company=Garmin",
      appliedCount: 0,
    });
  });

  it("links with the applied count once the user has applied there", () => {
    expect(companyLinkFor("Garmin", { total: 5, applied: 2 })).toEqual({
      href: "/jobs?company=Garmin",
      appliedCount: 2,
    });
  });

  it("links a single position the user already applied to", () => {
    expect(companyLinkFor("Garmin", { total: 1, applied: 1 })?.appliedCount).toBe(1);
  });

  it("encodes company names that would otherwise break the query string", () => {
    expect(companyJobsHref("Smith & Co / Labs")).toBe("/jobs?company=Smith%20%26%20Co%20%2F%20Labs");
  });
});

describe("isAppliedStatus", () => {
  it("counts every status that can only be reached by applying", () => {
    for (const status of ["Applied", "Follow-up needed", "Recruiter responded", "Interviewing", "Offer", "Rejected"]) {
      expect(isAppliedStatus(status)).toBe(true);
    }
  });

  it("does not count roles that were never submitted", () => {
    for (const status of ["Found", "Reviewed", "Resume generated", "Skipped", "Archived"]) {
      expect(isAppliedStatus(status)).toBe(false);
    }
  });
});
