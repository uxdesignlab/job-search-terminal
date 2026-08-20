import { describe, expect, it } from "vitest";
import { normalizeEvidenceMap } from "@/lib/application-preparation";

const validIds = new Set(["evidence-1", "evidence-2"]);

const evidenceById = new Map([
  ["evidence-1", "Helped consolidate 11 disconnected logistics systems into a unified operational platform, designing multi-role workflows."],
  ["evidence-2", "Embedded WCAG 2.2 accessibility into component behaviour and review workflows."],
]);

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

  it("drops an invented claim filed under a real evidence id", () => {
    // A pointer that resolves does not make the text attached to it real, and
    // person-outreach copies this field into a message to a real person at the
    // employer — the furthest an unsupported claim travels anywhere in the app.
    expect(normalizeEvidenceMap([
      mapping({ evidence: "Grew revenue 40% across the enterprise portfolio." }),
    ], validIds, evidenceById)).toEqual([]);
  });

  it("keeps a span copied from the cited item", () => {
    expect(normalizeEvidenceMap([
      mapping({ evidence: "designing multi-role workflows" }),
    ], validIds, evidenceById)).toHaveLength(1);
  });

  it("ignores case and spacing when matching the span", () => {
    expect(normalizeEvidenceMap([
      mapping({ evidence: "Consolidate 11   Disconnected Logistics Systems" }),
    ], validIds, evidenceById)).toHaveLength(1);
  });

  it("drops a span quoted from a different evidence item than the one cited", () => {
    expect(normalizeEvidenceMap([
      mapping({ evidenceId: "evidence-2", evidence: "designing multi-role workflows" }),
    ], validIds, evidenceById)).toEqual([]);
  });

  it("keeps the id-only check when the caller cannot resolve the texts", () => {
    expect(normalizeEvidenceMap([mapping()], validIds)).toHaveLength(1);
  });

  it("still drops mappings missing a requirement or the evidence text", () => {
    expect(normalizeEvidenceMap([mapping({ requirement: "" })], validIds)).toEqual([]);
    expect(normalizeEvidenceMap([mapping({ evidence: "  " })], validIds)).toEqual([]);
  });
});
