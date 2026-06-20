import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getApprovedEmailJobImportDirectory, getEmailJobAlertImportDirectory, parseEmailJobAlertFile } from "@/lib/scanner/email-job-alert-importer";
import { getBrowserBoardImportDirectory } from "@/lib/scanner/browser-board-importer";

function withTempFile(filename: string, content: string, fn: (filePath: string) => void) {
  const dir = path.join(os.tmpdir(), `jst-email-import-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  writeFileSync(filePath, content);
  try {
    fn(filePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("parseEmailJobAlertFile", () => {
  it("keeps approved candidate import files outside the watched browser-board folder", () => {
    expect(getApprovedEmailJobImportDirectory()).not.toBe(getBrowserBoardImportDirectory());
    expect(getApprovedEmailJobImportDirectory()).toBe(path.join(getEmailJobAlertImportDirectory(), "approved-imports"));
  });

  it("extracts a direct job from a text email", () => {
    withTempFile(
      "direct.txt",
      [
        "Senior Director, Product Design at Runyon",
        "Remote, US",
        "Apply here: https://jobs.ashbyhq.com/runyon/abc123",
        "Lead product design, research, and design systems craft across the organization.",
      ].join("\n"),
      (filePath) => {
        const parsed = parseEmailJobAlertFile(filePath);
        expect(parsed.candidates).toHaveLength(1);
        expect(parsed.candidates[0]).toMatchObject({
          company: "Runyon",
          position: "Senior Director, Product Design",
          postingResolutionStatus: "resolved",
          originalPostingUrl: "https://jobs.ashbyhq.com/runyon/abc123",
        });
      },
    );
  });

  it("extracts an unresolved lead when no direct posting link exists", () => {
    withTempFile(
      "lead.txt",
      "Head of Product Design at InvestEngine\nRemote\nThis alert did not include a public job posting URL.",
      (filePath) => {
        const parsed = parseEmailJobAlertFile(filePath);
        expect(parsed.candidates).toHaveLength(1);
        expect(parsed.candidates[0].postingResolutionStatus).toBe("needs_resolution");
        expect(parsed.candidates[0].url).toMatch(/^email-alert:\/\/job\//);
        expect(parsed.candidates[0].postingSearchQuery).toContain("InvestEngine");
      },
    );
  });

  it("extracts HTML links and ignores unsubscribe links", () => {
    withTempFile(
      "digest.html",
      `
        <html><body>
          <a href="https://example.com/preferences/unsubscribe">Unsubscribe</a>
          <h2>Design Director - Home at Comfrt</h2>
          <p>Remote, US</p>
          <a href="https://jobs.lever.co/comfrt/123e4567-e89b-12d3-a456-426614174000">View job</a>
        </body></html>
      `,
      (filePath) => {
        const parsed = parseEmailJobAlertFile(filePath);
        expect(parsed.candidates).toHaveLength(1);
        expect(parsed.candidates[0].company).toBe("Comfrt");
        expect(parsed.candidates[0].candidateLinks.some((link) => link.includes("unsubscribe"))).toBe(false);
      },
    );
  });

  it("skips alert/search headings that are not actual job titles", () => {
    withTempFile(
      "heading.txt",
      [
        '"Ux" jobs since yesterday "nashville"',
        "Nashville, TN",
        "https://www.linkedin.com/jobs/search/?keywords=ux&location=Nashville",
      ].join("\n"),
      (filePath) => {
        const parsed = parseEmailJobAlertFile(filePath);
        expect(parsed.candidates).toHaveLength(0);
      },
    );
  });

  it("keeps email links available without treating search links as resolved postings", () => {
    const searchLink = "https://www.linkedin.com/jobs/search/?keywords=Head%20of%20Product%20Design&location=Nashville";
    withTempFile(
      "listing-link.txt",
      [
        "Head of Product Design at Tithe.ly",
        "Not specified",
        searchLink,
        "Be the first to apply to this Head of Product Design role.",
      ].join("\n"),
      (filePath) => {
        const parsed = parseEmailJobAlertFile(filePath);
        expect(parsed.candidates).toHaveLength(1);
        expect(parsed.candidates[0]).toMatchObject({
          position: "Head of Product Design",
          postingResolutionStatus: "needs_resolution",
          originalPostingUrl: "",
        });
        expect(parsed.candidates[0].candidateLinks).toContain(searchLink);
      },
    );
  });

  it("skips roles matching negative title filters", () => {
    withTempFile(
      "negative.txt",
      "Senior AI-ML Applied Scientist at Optum\nRemote\nhttps://careers.example.com/jobs/123",
      (filePath) => {
        const parsed = parseEmailJobAlertFile(filePath, ["scientist"]);
        expect(parsed.candidates).toHaveLength(0);
        expect(parsed.skippedByNegativeFilter).toBeGreaterThan(0);
      },
    );
  });

  it("parses basic eml headers and quoted-printable body", () => {
    withTempFile(
      "alert.eml",
      [
        "Subject: Lead UX Designer @ Blue Book Global",
        "From: alerts@example.com",
        "Date: Fri, 19 Jun 2026 12:00:00 -0500",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Lead UX Designer @ Blue Book Global=0ARemote=0Ahttps://careers.example.com/jobs/ux-lead",
      ].join("\r\n"),
      (filePath) => {
        const parsed = parseEmailJobAlertFile(filePath);
        expect(parsed.metadata.subject).toBe("Lead UX Designer @ Blue Book Global");
        expect(parsed.candidates[0]).toMatchObject({
          company: "Blue Book Global",
          position: "Lead UX Designer",
        });
      },
    );
  });
});
