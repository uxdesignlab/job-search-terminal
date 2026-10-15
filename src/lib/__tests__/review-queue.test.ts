import { describe, expect, it } from "vitest";

const SHORT_DESCRIPTION_THRESHOLD = 100;

function classifyReviewStatus(rawDescription: string): "none" | "pending_review" {
  return rawDescription.length < SHORT_DESCRIPTION_THRESHOLD ? "pending_review" : "none";
}

describe("review queue routing", () => {
  it("routes job with no description to pending_review", () => {
    expect(classifyReviewStatus("")).toBe("pending_review");
  });

  it("routes job with very short description to pending_review", () => {
    expect(classifyReviewStatus("Short description.")).toBe("pending_review");
  });

  it("routes job with exactly 99 chars to pending_review", () => {
    expect(classifyReviewStatus("a".repeat(99))).toBe("pending_review");
  });

  it("routes job with exactly 100 chars to none", () => {
    expect(classifyReviewStatus("a".repeat(100))).toBe("none");
  });

  it("routes job with full description to none", () => {
    const fullDesc = "We are looking for a Senior Software Engineer to join our growing team. You will work on distributed systems, lead technical projects, and mentor junior engineers. Strong experience with TypeScript and Node.js required.";
    expect(classifyReviewStatus(fullDesc)).toBe("none");
  });
});
