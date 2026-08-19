import { describe, expect, it } from "vitest";
import { fingerprintsFor, identityFingerprint, identityKeys, normalizeLinkedInUrl } from "@/lib/contacts/identity";
import { outreachRecommendation, rankContact } from "@/lib/contacts/ranking";

describe("linkedin normalization", () => {
  it("collapses spellings of one profile to a single key", () => {
    const variants = [
      "https://www.linkedin.com/in/jane-doe",
      "http://linkedin.com/in/jane-doe/",
      "https://LinkedIn.com/in/Jane-Doe?utm_source=share",
      "https://www.linkedin.com/in/jane-doe#experience",
    ];
    const keys = new Set(variants.map(normalizeLinkedInUrl));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("linkedin.com/in/jane-doe");
  });

  it("keeps distinct people distinct", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com/in/jane-doe"))
      .not.toBe(normalizeLinkedInUrl("https://linkedin.com/in/john-doe"));
  });

  it("returns empty for empty input", () => {
    expect(normalizeLinkedInUrl("")).toBe("");
  });
});

describe("identity keys (§37 priority)", () => {
  it("prefers a provider record id, then linkedin, then email", () => {
    const keys = identityKeys({
      sourceProvider: "clay", sourceRecordId: "rec_1",
      linkedinUrl: "https://linkedin.com/in/jane-doe", workEmail: "Jane@Example.com ",
    });
    expect(keys).toEqual(["clay:rec_1", "linkedin:linkedin.com/in/jane-doe", "email:jane@example.com"]);
  });

  it("ignores a manual provider's record id", () => {
    // "manual" is not a namespace that can identify anyone across sources.
    expect(identityKeys({ sourceProvider: "manual", sourceRecordId: "x", workEmail: "a@b.com" }))
      .toEqual(["email:a@b.com"]);
  });

  it("yields nothing for a contact with no stable identifier", () => {
    expect(identityKeys({ sourceProvider: "manual" })).toEqual([]);
  });
});

describe("suppression fingerprints", () => {
  it("is one-way — the identifier cannot be read back out", () => {
    const email = "jane@example.com";
    const print = identityFingerprint(`email:${email}`);
    expect(print).toHaveLength(64);
    expect(print).not.toContain(email);
    expect(print).not.toContain("jane");
    expect(print).not.toContain("example");
  });

  it("recognizes the same person arriving again from a search", () => {
    const stored = fingerprintsFor({ workEmail: "Jane@Example.com" });
    const laterResult = fingerprintsFor({ workEmail: " jane@example.com " });
    expect(laterResult.some((print) => stored.includes(print))).toBe(true);
  });

  it("does not match a different person", () => {
    const stored = fingerprintsFor({ workEmail: "jane@example.com" });
    const other = fingerprintsFor({ workEmail: "john@example.com" });
    expect(other.some((print) => stored.includes(print))).toBe(false);
  });

  it("produces one fingerprint per identifier, so any of them suppresses", () => {
    expect(fingerprintsFor({
      sourceProvider: "clay", sourceRecordId: "rec_1",
      linkedinUrl: "https://linkedin.com/in/jane-doe", workEmail: "jane@example.com",
    })).toHaveLength(3);
  });
});

describe("contact ranking (§48)", () => {
  const job = { title: "Director of Product Design", company: "Instacart" };
  const base = { title: "", company: "Instacart", companyDomain: "", linkedinUrl: "", workEmail: "" };

  it("ranks a hiring manager in the same function above a distant peer", () => {
    const manager = rankContact({ contact: { ...base, title: "Director of Product Design" }, role: "hiring_manager", job });
    const peer = rankContact({ contact: { ...base, title: "Warehouse Associate" }, role: "peer", job });
    expect(manager.score).toBeGreaterThan(peer.score);
  });

  it("explains itself rather than returning a bare number", () => {
    const ranked = rankContact({ contact: { ...base, title: "Head of Design" }, role: "functional_leader", job });
    expect(ranked.reasons.length).toBeGreaterThan(0);
    expect(ranked.reasons.join(" ")).toMatch(/function|role|company|seniority/i);
  });

  it("counts contactability — an unreachable match is worth less", () => {
    const contact = { ...base, title: "Director of Product Design" };
    const reachable = rankContact({ contact: { ...contact, linkedinUrl: "linkedin.com/in/x", workEmail: "x@y.com" }, role: "peer", job });
    const unreachable = rankContact({ contact, role: "peer", job });
    expect(reachable.score).toBeGreaterThan(unreachable.score);
  });

  it("stays within 0-100", () => {
    const maxed = rankContact({
      contact: { ...base, title: "VP Director Head of Product Design Principal", linkedinUrl: "l", workEmail: "e" },
      role: "hiring_manager", job,
    });
    expect(maxed.score).toBeGreaterThanOrEqual(0);
    expect(maxed.score).toBeLessThanOrEqual(100);
  });

  it("bands rather than exposing another score (§57)", () => {
    expect(outreachRecommendation(80)).toBe("Recommended");
    expect(outreachRecommendation(40)).toBe("Optional");
    expect(outreachRecommendation(5)).toBe("Low value");
  });
});
