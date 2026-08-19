import { describe, expect, it } from "vitest";
import { nextBestAction, opportunityProgress, type JobStageInput } from "@/lib/jobs/next-best-action";

function stage(overrides: Partial<JobStageInput> = {}): JobStageInput {
  return {
    job: { id: "job-1", status: "Found", recommendation: "Strong apply" },
    evaluation: null,
    preparation: null,
    generatedDocument: null,
    application: null,
    contactCount: 0,
    ...overrides,
  } as JobStageInput;
}

const evaluated = { recommendation: "Strong apply" };

describe("next best action (§65)", () => {
  it("asks for an evaluation first", () => {
    expect(nextBestAction(stage()).primary.label).toBe("Evaluate");
  });

  it("moves to resume once evaluated", () => {
    expect(nextBestAction(stage({ evaluation: evaluated })).primary.label).toBe("Generate resume");
  });

  it("moves to apply once a resume exists", () => {
    const action = nextBestAction(stage({ evaluation: evaluated, generatedDocument: { id: "doc" } }));
    expect(action.primary.label).toBe("Apply");
  });

  it("never lets outreach displace the primary action", () => {
    // §8 allows outreach before applying; §65 wants one primary. Secondary satisfies both.
    const action = nextBestAction(stage({ evaluation: evaluated, generatedDocument: { id: "doc" } }));
    expect(action.primary.label).toBe("Apply");
    expect(action.secondary?.label).toBe("Find people");
  });

  it("stops suggesting outreach once contacts exist", () => {
    const action = nextBestAction(stage({ evaluation: evaluated, generatedDocument: { id: "doc" }, contactCount: 2 }));
    expect(action.secondary).toBeNull();
  });

  it("promotes outreach to primary after applying with nobody contacted", () => {
    const action = nextBestAction(stage({
      evaluation: evaluated,
      generatedDocument: { id: "doc" },
      application: { status: "Applied" },
    }));
    expect(action.primary.label).toBe("Find people");
  });

  it("does not push a Blocked role forward", () => {
    const action = nextBestAction(stage({ evaluation: { recommendation: "Blocked" } }));
    expect(action.primary.label).toBe("Review evaluation");
    expect(action.primary.reason).toMatch(/rules this out/);
    expect(action.secondary).toBeNull();
  });

  it("does not push a Skip forward, but says something different than Blocked", () => {
    const action = nextBestAction(stage({ evaluation: { recommendation: "Skip" } }));
    expect(action.primary.label).toBe("Review evaluation");
    expect(action.primary.reason).toMatch(/below your threshold/);
  });

  it("prioritizes interview prep over everything else", () => {
    const action = nextBestAction(stage({
      evaluation: evaluated,
      generatedDocument: { id: "doc" },
      application: { status: "Interviewing" },
      contactCount: 0,
    }));
    expect(action.primary.label).toBe("Prepare interview");
    expect(action.secondary).toBeNull();
  });
});

describe("opportunity progress (§66)", () => {
  it("is derived entirely from records", () => {
    const steps = opportunityProgress(stage({
      evaluation: evaluated,
      preparation: { id: "prep" },
      generatedDocument: { id: "doc" },
      application: { status: "Applied" },
      contactCount: 1,
    }));
    expect(steps.map((step) => step.done)).toEqual([true, true, true, true, true, false]);
  });

  it("shows nothing done for a freshly discovered job", () => {
    expect(opportunityProgress(stage()).every((step) => !step.done)).toBe(true);
  });
});
