import { describe, expect, it } from "vitest";
import { auditDraftAgainstEvidence, unsupportedClaimsInLines } from "@/lib/documents/evidence-audit";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";

const base = "Design lead for accessible platforms. Led a team of 6 designers.";
const draftWith = (summary: string): ResumeTemplateInput => ({
  name: "Sam", headline: "", contactItems: [], title: "", summary, impactHeading: "", impactItems: [],
  experienceHeading: "", experience: [], skills: [], recognition: [], education: [],
});

describe("a stated fact as evidence", () => {
  const note = "add 8+ years of healthcare experience";
  it.each([
    "Design lead with 8+ years of healthcare experience.",
    "Design lead with 8 years of healthcare experience.",
    "Design lead with over 8 years of healthcare experience.",
  ])("backs the model's phrasing: %s", (line) => {
    expect(unsupportedClaimsInLines([line], `${base}\n${note}`)).toEqual([]);
    expect(unsupportedClaimsInLines([line], base).length).toBeGreaterThan(0);
  });

  it("once saved to the bank, passes the PDF export audit with no instruction", () => {
    const saved = "8+ years of healthcare experience";
    const audit = auditDraftAgainstEvidence(draftWith("Design lead with 8+ years of healthcare experience."), `${base}\n${saved}`);
    expect(audit.status).not.toBe("unsupported-claims");
  });

  it("does not let a larger open figure back a different bare number", () => {
    expect(unsupportedClaimsInLines(["Design lead with 8 years of healthcare experience."], "15+ years of healthcare experience")).toContain("8");
  });

  it("checks a summary a sentence at a time, as PDF export does", () => {
    const summary = "8 years designing financial platforms. 8 years of healthcare experience.";
    const bank = "8 years designing financial platforms.";
    expect(unsupportedClaimsInLines([summary], bank, "summary")).toContain("8");
    expect(auditDraftAgainstEvidence(draftWith(summary), bank).status).toBe("unsupported-claims");
  });

  it("a formatting number in the note does not back an unrelated claim", () => {
    expect(unsupportedClaimsInLines(["Led 2 design teams across healthcare."], `${base}\nkeep it to 2 sentences`)).not.toEqual([]);
  });
});
