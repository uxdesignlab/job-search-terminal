import { describe, expect, it } from "vitest";
import { buildEvaluation } from "@/lib/evaluation/job-evaluator";
import type { JobRecord, UserProfileRecord } from "@/lib/db/types";

const job = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: "job-a", company: "Acme", title: "Staff Product Designer", url: "https://example.com",
  source: "manual", location: "Remote", remoteType: "remote", firstSeenDate: "2026-08-01",
  freshnessLabel: "fresh", rawDescription: "This role is Remote only. Join our platform team.",
  parsedDescription: "", status: "Found", summary: "", ...overrides,
} as JobRecord);

const profile = (overrides: Partial<UserProfileRecord> = {}): UserProfileRecord => ({
  name: "Pavel", location: "Nashville, TN", targetRoles: ["Product Designer"], dealBreakers: ["Remote only"],
  constraints: [], desiredIndustries: [], workPreferences: [], skills: [],
  currentSearchGoal: "", urgency: "", direction: "", careerIntent: "", compensationNeeds: "",
  ...overrides,
} as UserProfileRecord);

describe("the rule-based fallback raises no hard blockers", () => {
  it("does not block a remote job over a 'Remote only' deal breaker", () => {
    // containsAny fires when any word over three characters matches, so "Remote
    // only" was flagged by every posting containing "remote" — including the
    // remote job the user wants. Reading that as a conflict returned Blocked for
    // compatible roles.
    const result = buildEvaluation(job(), profile(), [], [], []);

    expect(result.hardBlockers).toEqual([]);
    expect(result.recommendation).not.toBe("Blocked");
  });

  it("still lets the deal breaker shade the score", () => {
    // The signal keeps the job it always had: a few points off userPreferences.
    const withDealBreaker = buildEvaluation(job(), profile(), [], [], []);
    const withoutDealBreaker = buildEvaluation(job(), profile({ dealBreakers: [] }), [], [], []);

    expect(withDealBreaker.fitComponents!.userPreferences)
      .toBeLessThan(withoutDealBreaker.fitComponents!.userPreferences);
  });
});
