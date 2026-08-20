import { describe, expect, it } from "vitest";
import { normalizeEvidenceMap } from "@/lib/application-preparation";

const validIds = new Set(["evidence-1", "evidence-2"]);

const mapping = (overrides: Record<string, unknown> = {}) => ({
  requirement: "Complex multi-role workflows",
  evidence: "Consolidated 11 logistics systems into one platform.",
  evidenceId: "evidence-1",
  source: "resume",
  suggestedPlacement: "experience",
  ...overrides,
});

describe("evidence map guard", () => {
  it("keeps a mapping that cites evidence we supplied", () => {
    expect(normalizeEvidenceMap([mapping()], validIds)).toHaveLength(1);
  });

  it("drops a mapping whose evidence id was never supplied", () => {
    expect(normalizeEvidenceMap([mapping({ evidenceId: "evidence-invented" })], validIds)).toEqual([]);
  });

  it("drops a mapping with no evidence id at all", () => {
    // The guard used to run only when an id was present, so the least verifiable
    // mapping of all — a claim with the pointer left off — passed untouched, and
    // person-outreach lists these to a real human as the candidate's evidence.
    expect(normalizeEvidenceMap([mapping({ evidenceId: "" })], validIds)).toEqual([]);
    expect(normalizeEvidenceMap([mapping({ evidenceId: "   " })], validIds)).toEqual([]);
    const { evidenceId: _omitted, ...withoutId } = mapping();
    void _omitted;
    expect(normalizeEvidenceMap([withoutId], validIds)).toEqual([]);
    expect(normalizeEvidenceMap([mapping({ evidenceId: 42 })], validIds)).toEqual([]);
  });

  it("still drops mappings missing a requirement or the evidence text", () => {
    expect(normalizeEvidenceMap([mapping({ requirement: "" })], validIds)).toEqual([]);
    expect(normalizeEvidenceMap([mapping({ evidence: "  " })], validIds)).toEqual([]);
  });
});
