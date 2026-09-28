import { describe, expect, it } from "vitest";
import { isOutOfCreditsReply, readClayErrorText } from "@/lib/integrations/clay/provider";

describe("readClayErrorText", () => {
  it("reads the message from the JSON shapes Clay uses", () => {
    expect(readClayErrorText('{"message":"Routine not found"}')).toBe("Routine not found");
    expect(readClayErrorText('{"error":{"message":"Invalid input: Social Profile URL"}}')).toBe("Invalid input: Social Profile URL");
    expect(readClayErrorText('{"errors":[{"detail":"items must not be empty"}]}')).toBe("items must not be empty");
  });

  it("keeps plain text, collapses whitespace and caps the length", () => {
    expect(readClayErrorText("  Bad\n  request  ")).toBe("Bad request");
    expect(readClayErrorText("x".repeat(500))).toHaveLength(300);
  });

  it("drops an HTML error page", () => {
    expect(readClayErrorText("<html><body>502 Bad Gateway</body></html>")).toBe("");
  });
});

describe("isOutOfCreditsReply", () => {
  it("treats 402 as out of allowance whatever the text", () => {
    expect(isOutOfCreditsReply(402, "")).toBe(true);
  });

  it("recognises a 400 that says the account cannot pay", () => {
    expect(isOutOfCreditsReply(400, "Insufficient credits to run this routine")).toBe(true);
    expect(isOutOfCreditsReply(400, "Workspace is out of credits")).toBe(true);
  });

  it("leaves a genuine routine problem alone", () => {
    expect(isOutOfCreditsReply(400, "Routine not found")).toBe(false);
    expect(isOutOfCreditsReply(500, "credit service down")).toBe(false);
  });
});
