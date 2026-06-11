import { describe, expect, it } from "vitest";

// Replicate the parseJson implementation from queries.ts to test the logic in isolation.
function parseJson<T>(value: string | null | undefined, fallback?: T): T {
  if (value == null || value === "") return (fallback ?? null) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return (fallback ?? null) as T;
  }
}

describe("parseJson", () => {
  it("parses valid JSON array", () => {
    expect(parseJson<string[]>('["a","b"]', [])).toEqual(["a", "b"]);
  });

  it("parses valid JSON object", () => {
    expect(parseJson<Record<string, number>>('{"x":1}', {})).toEqual({ x: 1 });
  });

  it("returns fallback for null", () => {
    expect(parseJson<string[]>(null, [])).toEqual([]);
  });

  it("returns fallback for undefined", () => {
    expect(parseJson<string[]>(undefined, [])).toEqual([]);
  });

  it("returns fallback for empty string", () => {
    expect(parseJson<string[]>("", [])).toEqual([]);
  });

  it("returns fallback for corrupt JSON", () => {
    expect(parseJson<string[]>("{broken", [])).toEqual([]);
  });

  it("returns fallback for corrupt JSON object", () => {
    expect(parseJson<Record<string, unknown>>("{broken", {})).toEqual({});
  });

  it("returns null when no fallback provided and value is null", () => {
    expect(parseJson(null)).toBeNull();
  });

  it("returns null when no fallback provided and JSON is corrupt", () => {
    expect(parseJson("{broken")).toBeNull();
  });

  it("does not throw on corrupt input", () => {
    expect(() => parseJson('{"unclosed":{')).not.toThrow();
  });
});
