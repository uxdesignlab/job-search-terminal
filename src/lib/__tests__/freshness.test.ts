import { describe, expect, it } from "vitest";
import { classifyFreshness } from "@/lib/scanner/freshness";

const NOW = new Date("2026-06-11T12:00:00Z");

describe("classifyFreshness", () => {
  it("returns unknown-date for null", () => {
    expect(classifyFreshness(null, 72, NOW)).toBe("unknown-date");
  });

  it("returns unknown-date for empty string", () => {
    expect(classifyFreshness("", 72, NOW)).toBe("unknown-date");
  });

  it("returns unknown-date for unparseable date", () => {
    expect(classifyFreshness("not-a-date", 72, NOW)).toBe("unknown-date");
  });

  it("returns fresh for a date within 24h window", () => {
    const recent = new Date(NOW.getTime() - 10 * 60 * 60 * 1000).toISOString();
    expect(classifyFreshness(recent, 24, NOW)).toBe("fresh");
  });

  it("returns stale for a date outside 24h window", () => {
    const old = new Date(NOW.getTime() - 30 * 60 * 60 * 1000).toISOString();
    expect(classifyFreshness(old, 24, NOW)).toBe("stale");
  });

  it("returns fresh for a date within 72h window", () => {
    const recent = new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString();
    expect(classifyFreshness(recent, 72, NOW)).toBe("fresh");
  });

  it("returns stale for a date outside 72h window", () => {
    const old = new Date(NOW.getTime() - 96 * 60 * 60 * 1000).toISOString();
    expect(classifyFreshness(old, 72, NOW)).toBe("stale");
  });

  it("returns fresh for a date within 168h window", () => {
    const recent = new Date(NOW.getTime() - 120 * 60 * 60 * 1000).toISOString();
    expect(classifyFreshness(recent, 168, NOW)).toBe("fresh");
  });
});
