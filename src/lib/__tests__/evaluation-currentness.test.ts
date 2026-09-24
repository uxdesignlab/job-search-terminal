import { describe, expect, it } from "vitest";
import { computeJdHash } from "@/lib/application-preparation/hashing";
import { evaluationNeedsRefresh } from "@/lib/evaluation/currentness";
import type { EvaluationRecord, JobRecord } from "@/lib/db/types";

const job = {
  title: "Design Specialist",
  location: "Remote",
  salaryNotes: "$100,000 - $130,000",
  rawDescription: "Initial description and qualifications.",
  parsedDescription: "",
} as JobRecord;

describe("evaluation posting freshness", () => {
  it("accepts a matching posting and detects description, location, or pay changes", () => {
    const evaluation = { jdHash: computeJdHash(job) } as EvaluationRecord;
    expect(evaluationNeedsRefresh(evaluation, job)).toBe(false);
    expect(evaluationNeedsRefresh(evaluation, { ...job, rawDescription: "Updated qualifications." })).toBe(true);
    expect(evaluationNeedsRefresh(evaluation, { ...job, location: "Chicago" })).toBe(true);
    expect(evaluationNeedsRefresh(evaluation, { ...job, salaryNotes: "$90,000" })).toBe(true);
  });

  it("keeps older evaluations without a fingerprint usable", () => {
    expect(evaluationNeedsRefresh({ jdHash: "" } as EvaluationRecord, job)).toBe(false);
  });
});
