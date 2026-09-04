import { describe, expect, it } from "vitest";
import {
  assertOrganizationFirstMessage,
  assertOrganizationFirstSubject,
  organizationFirstIssue,
  organizationNeedExcerpt,
  OutreachFramingError,
} from "@/lib/outreach/framing";
import { PROMPT_DEFINITIONS } from "@/lib/ai/prompt-registry";

describe("organization-first outreach framing", () => {
  it("accepts a message that starts with the organization's need and states the contribution", () => {
    const message = "Alteryx is scaling trustworthy agentic analytics across its product suite. I can help turn that shift into a clear UX strategy and an operating model the global design team can deliver.";
    expect(organizationFirstIssue(message, "Alteryx")).toBeNull();
  });

  it("accepts an organization-first message after a personal greeting", () => {
    const message = "Hi Elizabeth, your team is moving complex analytics into agentic workflows. I could help make that transition trustworthy while scaling design quality across the portfolio.";
    expect(organizationFirstIssue(message, "Alteryx")).toBeNull();
  });

  it("rejects a resume-led opening even when it eventually mentions helping", () => {
    const message = "Hi Elizabeth, I have led global design teams for 20 years. I can help Alteryx scale its UX organization.";
    expect(organizationFirstIssue(message, "Alteryx")).toMatch(/opens with the candidate/i);
    expect(() => assertOrganizationFirstMessage(message, "Alteryx")).toThrow(OutreachFramingError);
  });

  it("rejects an organization mention with no statement of how the candidate can help", () => {
    const message = "Alteryx is building agentic analytics products. My background includes global design leadership and accessibility.";
    expect(organizationFirstIssue(message, "Alteryx")).toMatch(/does not clearly state/i);
  });

  it("keeps email subjects about the organization or role", () => {
    expect(() => assertOrganizationFirstSubject(
      "Scaling trustworthy UX at Alteryx",
      "Alteryx",
      "Senior Director, User Experience",
    )).not.toThrow();
    expect(() => assertOrganizationFirstSubject(
      "Experienced global design leader",
      "Alteryx",
      "Senior Director, User Experience",
    )).toThrow(OutreachFramingError);
  });

  it("extracts the role-specific section instead of leading with company boilerplate", () => {
    const description = `${"Company introduction. ".repeat(80)}About the Role\nLead the move to trustworthy agentic experiences.`;
    expect(organizationNeedExcerpt(description)).toMatch(/^About the Role/);
    expect(organizationNeedExcerpt(description)).toContain("trustworthy agentic experiences");
  });

  it("keeps organization-first framing in every editable outreach prompt default", () => {
    const outreachPrompts = PROMPT_DEFINITIONS.filter((prompt) => prompt.id.startsWith("outreach_"));
    expect(outreachPrompts).toHaveLength(3);
    for (const prompt of outreachPrompts) {
      expect(prompt.defaultPrompt).toMatch(/company|organization|team/i);
      expect(prompt.defaultPrompt).toMatch(/how the candidate can help|candidate could help/i);
    }
  });
});
