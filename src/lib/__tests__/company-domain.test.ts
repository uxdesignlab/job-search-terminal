import { describe, expect, it } from "vitest";
import { domainFromUrl, isEmployerHost, resolveCompanyIdentifier } from "@/lib/contacts/company-domain";

describe("employer host detection (§40)", () => {
  it("rejects applicant-tracking hosts", () => {
    for (const host of [
      "boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com",
      "acme.myworkdayjobs.com", "apply.workable.com", "himalayas.app",
    ]) {
      expect(isEmployerHost(host)).toBe(false);
    }
  });

  it("rejects aggregators and job boards", () => {
    for (const host of ["www.linkedin.com", "indeed.com", "glassdoor.com", "wellfound.com"]) {
      expect(isEmployerHost(host)).toBe(false);
    }
  });

  it("accepts an employer's own site", () => {
    expect(isEmployerHost("instacart.com")).toBe(true);
    expect(isEmployerHost("careers.instacart.com")).toBe(true);
  });
});

describe("domain from url", () => {
  it("returns nothing for an ATS link, rather than the ATS vendor", () => {
    // Deriving "greenhouse.io" here would search a real company that is not the employer.
    expect(domainFromUrl("https://boards.greenhouse.io/acme/jobs/123")).toBe("");
  });

  it("strips www and lowercases", () => {
    expect(domainFromUrl("https://WWW.Instacart.com/careers/123")).toBe("instacart.com");
  });

  it("returns nothing for a malformed url", () => {
    expect(domainFromUrl("not a url")).toBe("");
  });
});

describe("company resolution order (§40)", () => {
  const job = { url: "https://boards.greenhouse.io/acme/jobs/1" };

  it("prefers a saved profile domain over anything derived", () => {
    const r = resolveCompanyIdentifier({ job: { url: "https://instacart.com/careers/1" }, profileDomain: "saved.com" });
    expect(r).toMatchObject({ identifier: "saved.com", source: "profile", needsConfirmation: false });
  });

  it("falls back to a LinkedIn company URL when no domain is saved", () => {
    const r = resolveCompanyIdentifier({ job, profileLinkedIn: "https://linkedin.com/company/acme" });
    expect(r.identifier).toBe("https://linkedin.com/company/acme");
  });

  it("derives from the job url only when it is the employer's own host", () => {
    const r = resolveCompanyIdentifier({ job: { url: "https://instacart.com/careers/1" } });
    expect(r).toMatchObject({ identifier: "instacart.com", source: "job_url" });
  });

  it("asks for confirmation rather than guessing from an ATS link", () => {
    const r = resolveCompanyIdentifier({ job });
    expect(r).toMatchObject({ identifier: "", source: "none", needsConfirmation: true });
  });
});
