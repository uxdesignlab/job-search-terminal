import { describe, expect, it } from "vitest";
import { localDateString } from "@/lib/dates";
import { isJobProtectedFromAutomaticRemoval } from "@/lib/jobs/job-protection";

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateString(date);
}

const untouched = { status: "Found", archived: false as const };

describe("isJobProtectedFromAutomaticRemoval", () => {
  it("protects archived jobs regardless of age", () => {
    expect(
      isJobProtectedFromAutomaticRemoval({ status: "Found", archived: true, firstSeenDate: daysAgo(90) }),
    ).toBe(true);
  });

  it("protects jobs the user has acted on", () => {
    expect(
      isJobProtectedFromAutomaticRemoval({ status: "Applied", archived: false, firstSeenDate: daysAgo(90) }),
    ).toBe(true);
  });

  it("protects jobs discovered today", () => {
    expect(isJobProtectedFromAutomaticRemoval({ ...untouched, firstSeenDate: daysAgo(0) })).toBe(true);
  });

  it("protects jobs discovered yesterday, covering a full scan cycle", () => {
    expect(isJobProtectedFromAutomaticRemoval({ ...untouched, firstSeenDate: daysAgo(1) })).toBe(true);
  });

  it("leaves older untouched jobs eligible for automatic cleanup", () => {
    expect(isJobProtectedFromAutomaticRemoval({ ...untouched, firstSeenDate: daysAgo(2) })).toBe(false);
    expect(isJobProtectedFromAutomaticRemoval({ ...untouched, firstSeenDate: daysAgo(30) })).toBe(false);
  });

  it("does not treat a missing discovery date as recent", () => {
    expect(isJobProtectedFromAutomaticRemoval({ ...untouched, firstSeenDate: "" })).toBe(false);
  });
});
