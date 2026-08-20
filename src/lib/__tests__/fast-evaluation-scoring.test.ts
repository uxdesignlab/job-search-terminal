import { describe, expect, it } from "vitest";
import {
  EVAL_EVIDENCE_HIGH_CHARS,
  EVAL_EVIDENCE_MIN_USABLE_CHARS,
  EVAL_JD_HIGH_CHARS,
  EVAL_JD_MIN_USABLE_CHARS,
  calculateFitScore,
  clampFitComponents,
  deriveConfidence,
  deriveRecommendation,
  deriveScoreLabel,
  normalizeModelOutput,
  validateHardBlockers,
} from "@/lib/evaluation/fast-evaluation";
import type { DirectionAlignment, FitComponents, HardBlocker, HardBlockerCandidate } from "@/lib/db/types";

const PERFECT: FitComponents = {
  coreRequirements: 40,
  roleAndSeniority: 25,
  relevantEvidence: 20,
  userPreferences: 15,
};

function componentsFor(total: number): FitComponents {
  // Spread an arbitrary total across components without exceeding any range,
  // so recommendation tests can name a fit score directly.
  const core = Math.min(40, total);
  const role = Math.min(25, Math.max(0, total - core));
  const evidence = Math.min(20, Math.max(0, total - core - role));
  const prefs = Math.min(15, Math.max(0, total - core - role - evidence));
  return { coreRequirements: core, roleAndSeniority: role, relevantEvidence: evidence, userPreferences: prefs };
}

const blockerSource = {
  postingText: "This role requires relocation to Seattle and on-site work five days a week.",
  savedConstraints: ["No relocation", "Remote only"],
};

function blocker(overrides: Partial<HardBlockerCandidate> = {}): HardBlockerCandidate {
  return {
    kind: "relocation",
    postingEvidence: "Requires relocation to Seattle",
    candidateConstraint: "No relocation",
    ...overrides,
  };
}

function recommendationFor(fitScore: number, directionAlignment: DirectionAlignment, hardBlockers: HardBlocker[] = []) {
  return deriveRecommendation({ fitScore, directionAlignment, hardBlockers });
}

describe("fit scoring (§13)", () => {
  it("sums the four components", () => {
    expect(calculateFitScore(PERFECT)).toBe(100);
    expect(calculateFitScore(componentsFor(72))).toBe(72);
  });

  it("clamps each component to its own range rather than the total", () => {
    const clamped = clampFitComponents({
      coreRequirements: 999,
      roleAndSeniority: -5,
      relevantEvidence: 20,
      userPreferences: 15,
    });

    expect(clamped).toEqual({
      coreRequirements: 40,
      roleAndSeniority: 0,
      relevantEvidence: 20,
      userPreferences: 15,
    });
    expect(calculateFitScore(clamped)).toBe(75);
  });

  it("treats missing or non-numeric components as zero", () => {
    const clamped = clampFitComponents({ coreRequirements: Number.NaN, roleAndSeniority: 25 } as Partial<FitComponents>);
    expect(clamped.coreRequirements).toBe(0);
    expect(clamped.relevantEvidence).toBe(0);
    expect(calculateFitScore(clamped)).toBe(25);
  });
});

describe("compatibility score label (§13)", () => {
  it.each([
    [100, "Strong fit"],
    [85, "Strong fit"],
    [84, "Review"],
    [70, "Review"],
    [69, "Selective"],
    [55, "Selective"],
    [54, "Weak fit"],
    [0, "Weak fit"],
  ])("maps %i to %s", (score, label) => {
    expect(deriveScoreLabel(score)).toBe(label);
  });
});

describe("hard blocker validation (§15)", () => {
  it("keeps a candidate with explicit evidence on both sides", () => {
    const validated = validateHardBlockers([blocker()], blockerSource);
    expect(validated).toHaveLength(1);
    expect(validated[0].message).toContain("Requires relocation to Seattle");
    expect(validated[0].message).toContain("No relocation");
  });

  it("drops a candidate missing either half — an inference never blocks", () => {
    expect(validateHardBlockers([blocker({ postingEvidence: "" })], blockerSource)).toHaveLength(0);
    expect(validateHardBlockers([blocker({ candidateConstraint: "   " })], blockerSource)).toHaveLength(0);
  });

  it("drops a blocker the model invented on both sides", () => {
    // Nothing downstream questions a blocker once it exists: deriveRecommendation
    // turns it straight into Blocked, so a hallucinated pair ruled a high-fit role
    // out on nothing at all.
    expect(validateHardBlockers([
      blocker({ postingEvidence: "Requires a security clearance", candidateConstraint: "No clearance" }),
    ], blockerSource)).toHaveLength(0);
  });

  it("drops a real constraint quoted against a posting that never says it", () => {
    expect(validateHardBlockers([
      blocker({ postingEvidence: "Requires relocation to Berlin" }),
    ], { ...blockerSource, postingText: "Fully remote role, work from anywhere." })).toHaveLength(0);
  });

  it("accepts the rule-based fallback'sdescription-style evidence when the constraint is in the posting", () => {
    // The local fallback finds the deal breaker in the posting and writes a
    // sentence about it, so its evidence is a description rather than a quotation.
    expect(validateHardBlockers([
      blocker({ postingEvidence: "The posting matches a saved deal breaker: No relocation" }),
    ], { ...blockerSource, postingText: "We do not offer remote work; no relocation assistance is provided." })).toHaveLength(1);
  });

  it("blocks nothing when there is no posting text to check against", () => {
    expect(validateHardBlockers([blocker()], { ...blockerSource, postingText: "" })).toHaveLength(0);
  });

  it("falls back to 'other' for an unrecognized kind", () => {
    const validated = validateHardBlockers([blocker({ kind: "vibes" as HardBlockerCandidate["kind"] })], blockerSource);
    expect(validated[0].kind).toBe("other");
  });
});

describe("recommendation rules (§14.2)", () => {
  it("returns Blocked ahead of every fit threshold", () => {
    const blockers = validateHardBlockers([blocker()], blockerSource);
    expect(recommendationFor(92, "strong", blockers)).toBe("Blocked");
    expect(recommendationFor(10, "none", blockers)).toBe("Blocked");
  });

  it("separates Blocked from a low-fit Skip", () => {
    expect(recommendationFor(20, "none")).toBe("Skip");
    expect(recommendationFor(20, "none", validateHardBlockers([blocker()], blockerSource))).toBe("Blocked");
  });

  it("requires strong direction alignment for Priority apply", () => {
    expect(recommendationFor(85, "strong")).toBe("Priority apply");
    expect(recommendationFor(85, "partial")).toBe("Strong apply");
    expect(recommendationFor(84, "strong")).toBe("Strong apply");
  });

  it("drops a well-fitting but misaligned role to Review manually", () => {
    expect(recommendationFor(91, "none")).toBe("Review manually");
  });

  it("applies the remaining thresholds", () => {
    expect(recommendationFor(70, "partial")).toBe("Strong apply");
    expect(recommendationFor(69, "partial")).toBe("Review manually");
    expect(recommendationFor(55, "none")).toBe("Review manually");
    expect(recommendationFor(54, "strong")).toBe("Skip");
  });
});

describe("evaluation confidence (§16.2)", () => {
  const resolved = { postingResolved: true, jdChars: 1500, evidenceChars: 1800 };

  it.each([
    ["resolved, rich JD and evidence", { ...resolved }, "High"],
    ["resolved, rich JD, thin evidence", { ...resolved, evidenceChars: 250 }, "Medium"],
    ["resolved, short JD, rich evidence", { ...resolved, jdChars: 500 }, "Medium"],
    ["resolved, unusable JD", { ...resolved, jdChars: 250 }, "Low"],
    ["unresolved posting", { ...resolved, postingResolved: false }, "Low"],
  ])("%s → %s", (_label, input, expected) => {
    expect(deriveConfidence(input)).toBe(expected);
  });

  it("holds at the exact thresholds", () => {
    expect(deriveConfidence({
      postingResolved: true,
      jdChars: EVAL_JD_HIGH_CHARS,
      evidenceChars: EVAL_EVIDENCE_HIGH_CHARS,
    })).toBe("High");

    expect(deriveConfidence({
      postingResolved: true,
      jdChars: EVAL_JD_MIN_USABLE_CHARS,
      evidenceChars: EVAL_EVIDENCE_MIN_USABLE_CHARS,
    })).toBe("Medium");

    expect(deriveConfidence({
      postingResolved: true,
      jdChars: EVAL_JD_MIN_USABLE_CHARS - 1,
      evidenceChars: EVAL_EVIDENCE_HIGH_CHARS,
    })).toBe("Low");
  });

  it("downgrades High to Medium on a source-integrity warning", () => {
    expect(deriveConfidence({ ...resolved, sourceIntegrityWarning: true })).toBe("Medium");
  });

  it("never leaves an input unclassified", () => {
    for (const postingResolved of [true, false]) {
      for (const jdChars of [0, 299, 300, 799, 800, 5000]) {
        for (const evidenceChars of [0, 199, 200, 499, 500, 5000]) {
          expect(["High", "Medium", "Low"]).toContain(
            deriveConfidence({ postingResolved, jdChars, evidenceChars })
          );
        }
      }
    }
  });
});

describe("model output normalization (§18.3)", () => {
  const core = {
    roleArchetype: "Director / Product Design Leadership",
    directionAlignment: "strong",
    fitComponents: PERFECT,
  };

  it("rejects output missing any core field", () => {
    expect(normalizeModelOutput({ ...core, roleArchetype: "" })).toMatchObject({ coreValid: false });
    expect(normalizeModelOutput({ ...core, directionAlignment: "maybe" })).toMatchObject({ coreValid: false });
    expect(normalizeModelOutput({ ...core, fitComponents: { coreRequirements: 40 } })).toMatchObject({ coreValid: false });
    expect(normalizeModelOutput(null)).toMatchObject({ coreValid: false });
  });

  it("names which core fields were missing", () => {
    const result = normalizeModelOutput({ directionAlignment: "strong" });
    expect(result.coreValid).toBe(false);
    if (!result.coreValid) {
      expect(result.missing).toContain("roleArchetype");
      expect(result.missing).toContain("fitComponents");
    }
  });

  it("accepts core-only output and warns about every degraded optional field", () => {
    const result = normalizeModelOutput(core);
    expect(result.coreValid).toBe(true);
    if (!result.coreValid) return;

    expect(result.output.seniority).toBe("Unknown");
    expect(result.output.strengths).toEqual([]);
    expect(result.output.requirementMatches).toEqual([]);
    expect(result.warnings.join(" ")).toContain("seniority");
    expect(result.warnings.join(" ")).toContain("strengths");
  });

  it("caps strengths, gaps and red flags", () => {
    const result = normalizeModelOutput({
      ...core,
      strengths: Array.from({ length: 9 }, (_, i) => ({ claim: `claim ${i}`, evidence: "e", strength: "strong" })),
      gaps: Array.from({ length: 9 }, (_, i) => ({ requirement: `gap ${i}`, detail: "d" })),
      redFlags: Array.from({ length: 9 }, (_, i) => `flag ${i}`),
    });

    expect(result.coreValid).toBe(true);
    if (!result.coreValid) return;
    expect(result.output.strengths).toHaveLength(5);
    expect(result.output.gaps).toHaveLength(3);
    expect(result.output.redFlags).toHaveLength(3);
  });

  it("recounts the requirement summary instead of trusting the model's tally", () => {
    const result = normalizeModelOutput({
      ...core,
      requirementMatches: [
        { requirement: "Design systems", status: "supported", evidence: "Abbott" },
        { requirement: "Healthcare", status: "supported", evidence: "Abbott" },
        { requirement: "Subscriptions", status: "partial", evidence: "" },
        { requirement: "Fintech", status: "nonsense", evidence: "" },
      ],
      requirementSummary: { supported: 99, partial: 99, unknown: 99 },
    });

    expect(result.coreValid).toBe(true);
    if (!result.coreValid) return;
    // The unrecognized status degrades to "unknown" rather than being dropped.
    expect(result.output.requirementSummary).toEqual({ supported: 2, partial: 1, unknown: 1 });
  });

  it("keeps blocker candidates raw — validation is a separate, stricter step", () => {
    const result = normalizeModelOutput({
      ...core,
      hardBlockerCandidates: [
        { kind: "relocation", postingEvidence: "Relocation required", candidateConstraint: "No relocation" },
        { kind: "other", postingEvidence: "Might prefer onsite", candidateConstraint: "" },
      ],
    });

    expect(result.coreValid).toBe(true);
    if (!result.coreValid) return;
    expect(result.output.hardBlockerCandidates).toHaveLength(2);
    expect(validateHardBlockers(result.output.hardBlockerCandidates, {
      postingText: "Relocation required for this role.",
      savedConstraints: ["No relocation"],
    })).toHaveLength(1);
  });
});
