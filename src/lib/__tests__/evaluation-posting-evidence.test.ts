import { describe, expect, it } from "vitest";
import type { JobRecord } from "@/lib/db/types";
import { buildJobContext } from "@/lib/evaluation/prompts";
import { expandQualificationReference, extractPostedCompensation, extractQualificationChecklist, reconcileQualificationMatches } from "@/lib/evaluation/posting-evidence";

const description = [
  "Overview",
  "A".repeat(6100),
  "Qualifications",
  "Required",
  "5-7+ years of professional experience in UI/UX design.",
  "Ability to obtain and maintain a Public Trust clearance.",
  "Desired",
  "Experience supporting VA or VHA programs.",
  "Target salary range: $100,000 - $130,000.",
  "The salary range displayed is not a guarantee of compensation.",
].join("\r\n");

const job = {
  title: "Human-Centered Design Specialist IV - UI/UX",
  company: "LMI",
  location: "US",
  remoteType: "Not specified",
  datePosted: null,
  firstSeenDate: "2026-09-24",
  url: "https://example.com/job",
  rawDescription: description,
  parsedDescription: description,
  salaryNotes: "Not provided",
} as JobRecord;

describe("evaluation posting evidence", () => {
  it("sends the entire saved description, including late qualifications and salary", () => {
    const context = buildJobContext(job);
    expect(context).toContain("Ability to obtain and maintain a Public Trust clearance.");
    expect(context).toContain("Target salary range: $100,000 - $130,000.");
  });

  it("reads the posted range instead of an old missing-pay label", () => {
    expect(extractPostedCompensation(job)).toBe("Target salary range: $100,000 - $130,000.");
    expect(extractPostedCompensation({ rawDescription: "", parsedDescription: "", salaryNotes: "Not captured by scanner." })).toBe("");
  });

  it("keeps required and desired qualifications separate on unbulleted ATS pages", () => {
    expect(extractQualificationChecklist(description)).toEqual({
      required: [
        "5-7+ years of professional experience in UI/UX design.",
        "Ability to obtain and maintain a Public Trust clearance.",
      ],
      preferred: ["Experience supporting VA or VHA programs."],
    });
  });

  it("marks skipped qualifications and inferred credentials unknown", () => {
    const result = reconcileQualificationMatches(
      { required: ["Bachelor's degree in design.", "Ability to obtain a Public Trust clearance."], preferred: ["Portfolio of shipped work."] },
      [
        { requirement: "Q1: Bachelor's degree", status: "supported", evidence: "Years as a professor imply a degree." },
        { requirement: "Q2", status: "unknown", evidence: "No clearance information in the resume." },
      ]
    );
    expect(result.matches).toEqual([
      { requirement: "Bachelor's degree in design.", status: "unknown", evidence: "Direct evidence was not supplied." },
      { requirement: "Ability to obtain a Public Trust clearance.", status: "unknown", evidence: "No clearance information in the resume." },
      { requirement: "Portfolio of shipped work.", status: "unknown", evidence: "Not assessed in this run." },
    ]);
    expect(result.warnings).toHaveLength(2);
  });

  it("expands numbered references in concern labels", () => {
    const checklist = { required: ["Bachelor's degree in design.", "Public Trust clearance."], preferred: [] };
    expect(expandQualificationReference("Q2", checklist)).toBe("Public Trust clearance.");
    expect(expandQualificationReference("Federal experience", checklist)).toBe("Federal experience");
  });
});
