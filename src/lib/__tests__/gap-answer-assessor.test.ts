import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/factory", () => ({
  // No provider configured → every case below exercises the heuristic path,
  // which must hold the same line as the prompt when AI is unavailable.
  tryGetActiveProvider: () => null,
}));

const { assessGapAnswer, assessmentToJson, followUpQuestionsFromJson } =
  await import("@/lib/gaps/gap-answer-assessor");

const PEOPLE_GAP =
  "The available resume evidence does not explicitly document 3–5 years of direct people management specifically for product designers.";

describe("gap answer assessment", () => {
  it("never asks more than two follow-up questions", async () => {
    const assessment = await assessGapAnswer(PEOPLE_GAP, "I managed people.");

    expect(assessment.status).toBe("needs_followup");
    expect(assessment.followUpQuestions.length).toBeGreaterThan(0);
    expect(assessment.followUpQuestions.length).toBeLessThanOrEqual(2);
  });

  it("does not ask for dates, employers, or titles", async () => {
    const assessment = await assessGapAnswer(PEOPLE_GAP, "I managed people.");

    const asked = assessment.followUpQuestions.join(" ").toLowerCase();
    expect(asked).not.toMatch(/\bdates?\b|\bduration\b|\bwhen did\b/);
    expect(asked).not.toMatch(/\bemployer\b|\bwhich compan(y|ies)\b|\bjob title\b/);
  });

  it("accepts an answer that names where, what, and how many", async () => {
    const assessment = await assessGapAnswer(
      PEOPLE_GAP,
      "At the selected companies I directly managed a team of 6 product designers, owning hiring and performance reviews."
    );

    expect(assessment.status).toBe("addressed");
    expect(assessment.followUpQuestions).toEqual([]);
  });

  it("treats an answer that only restates the gap as empty evidence", async () => {
    // The shape the old modal prefill produced: companies prepended to the gap sentence.
    const echo = `At Northwind Design Co., Contoso Health, Fabrikam Studios: ${PEOPLE_GAP}`;

    const assessment = await assessGapAnswer(PEOPLE_GAP, echo);

    expect(assessment.status).toBe("needs_followup");
  });

  it("round-trips its question list through assessment JSON so the UI can re-read it", async () => {
    const assessment = await assessGapAnswer(PEOPLE_GAP, "I managed people.");

    const restored = followUpQuestionsFromJson(
      assessmentToJson(assessment),
      assessment.followUpQuestion
    );

    expect(restored).toEqual(assessment.followUpQuestions);
  });

  it("falls back to the legacy single question for rows saved before the list existed", () => {
    const restored = followUpQuestionsFromJson(
      { rationale: "", signals: [], assessedBy: "ai" },
      "How many designers reported to you?"
    );

    expect(restored).toEqual(["How many designers reported to you?"]);
  });

  it("falls back to a scale question for rows whose stale questions were cleared in bulk", () => {
    // What clear-stale-gap-questions.ts leaves behind: rationale kept, questions gone.
    const restored = followUpQuestionsFromJson(
      { rationale: "Needs scale.", signals: [], assessedBy: "ai" },
      "",
      PEOPLE_GAP
    );

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatch(/how many people|scale/i);
    // The fallback must obey the same rules as a generated question.
    expect(restored[0].toLowerCase()).not.toMatch(/\bdates?\b|\bemployer\b|\bjob title\b/);
  });

  it("returns nothing when there is no question and no gap text to derive one from", () => {
    expect(followUpQuestionsFromJson({ rationale: "", signals: [] }, "")).toEqual([]);
  });
});

const { gapAsQuestion, gapSubject } = await import("@/lib/gaps/gap-text");

describe("gap sentence reduction", () => {
  it("strips the evaluator's complaint framing from the front", () => {
    expect(gapSubject(PEOPLE_GAP)).toBe(
      "3–5 years of direct people management specifically for product designers"
    );
  });

  it("strips trailing 'is not demonstrated' framing", () => {
    expect(
      gapSubject("Direct ownership of hiring, performance reviews, promotions, and structured career development is not demonstrated.")
    ).toBe("Direct ownership of hiring, performance reviews, promotions, and structured career development");
  });

  it("gives up rather than splicing an unreduced complaint into a question", () => {
    // No recognized framing and the complaint verb survives → generic wording.
    expect(gapSubject("Somehow this does not read like a subject at all")).toBe("");
    expect(gapAsQuestion("Somehow this does not read like a subject at all"))
      .toBe("What experience do you have here?");
  });

  it("never leaves the complaint verb inside a generated question", async () => {
    const assessment = await assessGapAnswer(PEOPLE_GAP, "I managed people.");

    expect(assessment.followUpQuestions[0]).not.toMatch(/does not|doesn't/i);
    expect(assessment.followUpQuestions[0]).toMatch(/how many people/i);
  });
});

describe("gap sentence reduction — negated-tail forms", () => {
  it("strips the positive tail left behind by a leading 'No'", () => {
    expect(
      gapSubject("No nonprofit, fundraising, donor-management, or social-impact product experience is stated.")
    ).toBe("nonprofit, fundraising, donor-management, or social-impact product experience");
  });

  it("handles 'No explicit evidence of X' without stranding a tail", () => {
    expect(
      gapSubject("No explicit evidence of behavioral health, telehealth, or clinical workflow experience.")
    ).toBe("behavioral health, telehealth, or clinical workflow experience");
  });
});

describe("gap sentence reduction — contrast and dangling clauses", () => {
  it("takes the gap from the contrast clause, not the compliment before it", () => {
    expect(
      gapSubject("The profile shows strong design-systems depth, but limited explicit evidence of shipping customer-facing AI-native product experiences.")
    ).toBe("shipping customer-facing AI-native product experiences");
  });

  it("does not leave a conjunction dangling after its clause is stripped", () => {
    const subject = gapSubject("Business development, sales pursuits, proposal ownership, pipeline growth, and deal-closing experience are central to this role but are not clearly evidenced in the provided resume.");

    expect(subject).not.toMatch(/\b(but|though|although|however)\s*$/i);
    expect(subject).toContain("Business development");
  });

  it("strips 'the job calls for' framing", () => {
    expect(gapSubject("The job calls for directly managing design managers and leads."))
      .toBe("directly managing design managers and leads");
  });

  it("strips 'although' clauses as well as 'though'", () => {
    const subject = gapSubject("No digital banking product ownership, although fintech and financial workflow experience is adjacent.");

    expect(subject).toBe("digital banking product ownership");
  });
});
