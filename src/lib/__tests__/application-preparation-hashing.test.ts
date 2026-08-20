import { describe, expect, it } from "vitest";
import { computeEvidenceHash, computeJdHash, stalenessReason } from "@/lib/application-preparation/hashing";
import { GAP_EVIDENCE_TAG, gapEvidenceId } from "@/lib/gaps/evidence-id";
import type { ProfileSupplementRecord, ResumeRecord, SkillRecord } from "@/lib/db/types";

function resume(overrides: Partial<ResumeRecord> = {}): ResumeRecord {
  return {
    id: "lead", name: "Leadership", sourceFile: "x.pdf", status: "ready", activeStatus: true,
    extractedText: "Led design systems at Abbott.", evidence: [], createdAt: "", ...overrides,
  } as ResumeRecord;
}

function skill(name = "Design systems"): SkillRecord {
  return { skillName: name, strengthLevel: "expert", evidenceSource: "Abbott" } as SkillRecord;
}

function supplement(overrides: Partial<ProfileSupplementRecord> = {}): ProfileSupplementRecord {
  return {
    id: gapEvidenceId("people management"), content: "I managed six designers.",
    tags: [GAP_EVIDENCE_TAG], qualityStatus: "addressed", followUpQuestion: "",
    assessment: {}, assessedAt: null, createdAt: "", updatedAt: "", ...overrides,
  } as ProfileSupplementRecord;
}

const base = { resumes: [resume()], skills: [skill()], supplements: [supplement()] };

describe("jd hash", () => {
  it("ignores whitespace and case", () => {
    const a = computeJdHash({ title: "Director", rawDescription: "Lead  the   team", parsedDescription: "" });
    const b = computeJdHash({ title: "director", rawDescription: "lead the team", parsedDescription: "" });
    expect(a).toBe(b);
  });

  it("changes when the posting changes", () => {
    const a = computeJdHash({ title: "Director", rawDescription: "Lead the team", parsedDescription: "" });
    const b = computeJdHash({ title: "Director", rawDescription: "Lead the platform team", parsedDescription: "" });
    expect(a).not.toBe(b);
  });

  it("changes when the posting's location changes", () => {
    // Compensation research asks the market about this title in this place, so a
    // preparation keyed only on title and description served New York research
    // for a role that had moved to Remote.
    const a = computeJdHash({ title: "Director", location: "New York, NY", rawDescription: "Lead the team", parsedDescription: "" });
    const b = computeJdHash({ title: "Director", location: "Remote", rawDescription: "Lead the team", parsedDescription: "" });
    expect(a).not.toBe(b);
  });

  it("changes when the posted salary changes", () => {
    // parsePostedCompensation reads salaryNotes straight into the suggested
    // answer, and re-evaluation rewrites the field — so a newly extracted range
    // with everything else unchanged would keep serving the obsolete answer.
    const a = computeJdHash({ title: "Director", salaryNotes: "$180,000 - $200,000", rawDescription: "Lead", parsedDescription: "" });
    const b = computeJdHash({ title: "Director", salaryNotes: "$210,000 - $240,000", rawDescription: "Lead", parsedDescription: "" });
    expect(a).not.toBe(b);
  });

  it("falls back to the parsed description when raw is empty", () => {
    const a = computeJdHash({ title: "D", rawDescription: "", parsedDescription: "text" });
    const b = computeJdHash({ title: "D", rawDescription: "", parsedDescription: "" });
    expect(a).not.toBe(b);
  });
});

describe("evidence hash spans the global bank (§26, §30)", () => {
  it("is stable across reordering", () => {
    const reordered = { ...base, supplements: [supplement({ id: "b" }), supplement({ id: "a" })] };
    const same = { ...base, supplements: [supplement({ id: "a" }), supplement({ id: "b" })] };
    expect(computeEvidenceHash(reordered)).toBe(computeEvidenceHash(same));
  });

  it("changes when a gap answer's text changes", () => {
    const edited = { ...base, supplements: [supplement({ content: "I managed twelve designers." })] };
    expect(computeEvidenceHash(edited)).not.toBe(computeEvidenceHash(base));
  });

  it("changes when an unfinished answer becomes usable", () => {
    // The whole point of hashing broadly: quality is not part of the text, but it
    // decides whether a resume may use the answer, so it must move the hash.
    const parked = { ...base, supplements: [supplement({ qualityStatus: "needs_followup" })] };
    expect(computeEvidenceHash(parked)).not.toBe(computeEvidenceHash(base));
  });

  it("changes when a gap is answered for a completely different job", () => {
    const withAnother = { ...base, supplements: [supplement(), supplement({ id: gapEvidenceId("budget ownership"), content: "I owned a $2M budget." })] };
    expect(computeEvidenceHash(withAnother)).not.toBe(computeEvidenceHash(base));
  });

  it("changes when the active resume text changes", () => {
    const edited = { ...base, resumes: [resume({ extractedText: "Different history." })] };
    expect(computeEvidenceHash(edited)).not.toBe(computeEvidenceHash(base));
  });

  it("ignores inactive resumes", () => {
    const withInactive = { ...base, resumes: [resume(), resume({ id: "old", activeStatus: false, extractedText: "Archived." })] };
    expect(computeEvidenceHash(withInactive)).toBe(computeEvidenceHash(base));
  });

  it("changes when the skill inventory changes", () => {
    const edited = { ...base, skills: [skill(), skill("Accessibility")] };
    expect(computeEvidenceHash(edited)).not.toBe(computeEvidenceHash(base));
  });
});

describe("prompt context in the evidence hash", () => {
  it("changes when any profile input the prompt carries changes", () => {
    // Naming the fields that matter is how this went wrong twice — first the
    // compensation target was missing, then everything else the prompt carries.
    // Hashing what is actually sent covers the next field by the field existing.
    const prompt = (overrides: Record<string, string>) =>
      Object.entries({ Direction: "IC", Compensation: "$220k base", "Deal breakers": "None", ...overrides })
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");

    const baseline = computeEvidenceHash({ ...base, promptContext: prompt({}) });
    expect(computeEvidenceHash({ ...base, promptContext: prompt({ Compensation: "$260k base" }) })).not.toBe(baseline);
    expect(computeEvidenceHash({ ...base, promptContext: prompt({ Direction: "Management" }) })).not.toBe(baseline);
    expect(computeEvidenceHash({ ...base, promptContext: prompt({ "Deal breakers": "No relocation" }) })).not.toBe(baseline);
  });

  it("treats an absent prompt the same as an empty one", () => {
    expect(computeEvidenceHash(base)).toBe(computeEvidenceHash({ ...base, promptContext: "" }));
  });
});

describe("staleness reasons (§30.3)", () => {
  const current = { jdHash: "jd", evidenceHash: "ev" };

  it("reports a missing preparation", () => {
    expect(stalenessReason(null, current)).toBe("missing");
  });

  it("names which input moved", () => {
    expect(stalenessReason({ jdHash: "old", evidenceHash: "ev" }, current)).toBe("jd_changed");
    expect(stalenessReason({ jdHash: "jd", evidenceHash: "old" }, current)).toBe("evidence_changed");
  });

  it("reports fresh when both match", () => {
    expect(stalenessReason(current, current)).toBeNull();
  });
});
