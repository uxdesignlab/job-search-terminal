import { describe, expect, it } from "vitest";
import { factFromInstruction, STATED_FACT_PREFIX, statedFactGapText } from "@/lib/gaps/stated-fact";

describe("factFromInstruction", () => {
  it("turns a request into a statement", () => {
    expect(factFromInstruction("add 8+ years of healthcare experience")).toBe("8+ years of healthcare experience");
    expect(factFromInstruction("Please mention that I have led teams of 12")).toBe("Led teams of 12");
    expect(factFromInstruction("include my HIPAA training")).toBe("HIPAA training");
  });

  it("leaves anything else as typed", () => {
    expect(factFromInstruction("shorter")).toBe("Shorter");
    expect(factFromInstruction("  I ran  the design system ")).toBe("I ran the design system");
    expect(factFromInstruction("add")).toBe("Add");
  });
});

describe("statedFactGapText", () => {
  it("labels and bounds the bank heading", () => {
    expect(statedFactGapText("8+ years of healthcare experience")).toBe(`${STATED_FACT_PREFIX}8+ years of healthcare experience`);
    expect(statedFactGapText("x".repeat(300)).length).toBeLessThanOrEqual(STATED_FACT_PREFIX.length + 120);
  });
});

describe("the Evidence bank label for a stated fact", () => {
  it("does not phrase it as a gap question", async () => {
    const { gapAsQuestion } = await import("@/lib/gaps/gap-text");
    expect(gapAsQuestion(statedFactGapText("8+ years of healthcare experience"))).toBe("A fact you stated while editing a resume. Keep it true and specific:");
  });
});
