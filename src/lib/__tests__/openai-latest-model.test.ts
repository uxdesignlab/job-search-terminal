import { describe, expect, it } from "vitest";
import { isLatestSentinel, pickLatestFlagship } from "@/lib/ai/openai-models";

describe("pickLatestFlagship", () => {
  it("picks the highest generation alias, not the highest-sorting string", () => {
    // "gpt-5.6" sorts below "gpt-5.10" lexically but is older numerically.
    expect(pickLatestFlagship(["gpt-4", "gpt-5.6", "gpt-5.10"])).toBe("gpt-5.10");
    expect(pickLatestFlagship(["gpt-5.6", "gpt-5.5", "gpt-5.4"])).toBe("gpt-5.6");
    expect(pickLatestFlagship(["gpt-6", "gpt-5.9"])).toBe("gpt-6");
  });

  it("ignores variants and snapshots so latest never downgrades", () => {
    expect(pickLatestFlagship(["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-mini", "gpt-5.6-2026-05-01"]))
      .toBe("gpt-5.5");
  });

  it("falls back to -sol when the account's list omits the bare generation alias", () => {
    // Real shape of one account's /v1/models: 5.6 variants present, no bare gpt-5.6.
    expect(pickLatestFlagship(["gpt-5.5", "gpt-5.5-pro", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]))
      .toBe("gpt-5.6-sol");
  });

  it("skips a generation that exposes only cheaper or off-product variants", () => {
    expect(pickLatestFlagship(["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-codex", "gpt-5.6-pro"]))
      .toBe("gpt-5.5");
  });

  it("returns null when no generation alias is present", () => {
    expect(pickLatestFlagship(["text-embedding-3-large", "whisper-1"])).toBeNull();
    expect(pickLatestFlagship([])).toBeNull();
  });
});

describe("isLatestSentinel", () => {
  it("matches the sentinel case-insensitively and tolerates whitespace", () => {
    expect(isLatestSentinel("latest")).toBe(true);
    expect(isLatestSentinel(" Latest ")).toBe(true);
    expect(isLatestSentinel("gpt-5.6")).toBe(false);
    expect(isLatestSentinel(undefined)).toBe(false);
  });
});
