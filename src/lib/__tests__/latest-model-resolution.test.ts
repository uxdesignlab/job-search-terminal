import { describe, expect, it } from "vitest";
import {
  WEB_SEARCH_TOOL_BASIC,
  WEB_SEARCH_TOOL_CURRENT,
  anthropicSentinelFamily,
  parseClaudeModelId,
  pickLatestClaude,
  webSearchToolType,
} from "@/lib/ai/anthropic-models";
import {
  geminiSentinelFamily,
  parseGeminiModelId,
  parseGeminiPreviewId,
  pickLatestGemini,
} from "@/lib/ai/gemini-models";

describe("pickLatestClaude", () => {
  const listing = (...ids: string[]) => ids.map((id) => ({ id }));

  it("picks the newest release within the asked-for tier, not across tiers", () => {
    const models = listing("claude-opus-5", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5");
    expect(pickLatestClaude(models, "sonnet")).toBe("claude-sonnet-5");
    expect(pickLatestClaude(models, "opus")).toBe("claude-opus-5");
    expect(pickLatestClaude(models, "haiku")).toBe("claude-haiku-4-5");
  });

  it("ranks numerically, not lexically", () => {
    // "claude-opus-4-10" sorts below "claude-opus-4-8" as a string.
    expect(pickLatestClaude(listing("claude-opus-4-8", "claude-opus-4-10"), "opus")).toBe("claude-opus-4-10");
    expect(pickLatestClaude(listing("claude-opus-4-8", "claude-opus-5"), "opus")).toBe("claude-opus-5");
  });

  it("prefers the undated alias over a dated snapshot of the same release", () => {
    // The alias keeps following Anthropic's own pointer; the snapshot freezes.
    expect(pickLatestClaude(listing("claude-haiku-4-5-20251001", "claude-haiku-4-5"), "haiku"))
      .toBe("claude-haiku-4-5");
  });

  it("still ranks 3.x-era ids, which put the version before the tier", () => {
    expect(pickLatestClaude(listing("claude-3-5-sonnet-20241022", "claude-3-opus-20240229"), "sonnet"))
      .toBe("claude-3-5-sonnet-20241022");
    expect(parseClaudeModelId("claude-3-5-sonnet-20241022")).toEqual({ family: "sonnet", rank: 3005, dated: true });
  });

  it("returns null when the tier is absent, so the caller falls back rather than downgrading", () => {
    expect(pickLatestClaude(listing("claude-sonnet-5"), "opus")).toBeNull();
    expect(pickLatestClaude([], "sonnet")).toBeNull();
  });
});

describe("pickLatestGemini", () => {
  it("picks the newest stable release within the asked-for tier", () => {
    const ids = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-2.5-pro"];
    expect(pickLatestGemini(ids, "flash")).toBe("gemini-3.7-flash");
    expect(pickLatestGemini(ids, "pro")).toBe("gemini-2.5-pro");
  });

  it("keeps flash and flash-lite apart, so latest never swaps the tier", () => {
    const ids = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
    expect(pickLatestGemini(ids, "flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(pickLatestGemini(ids, "flash")).toBe("gemini-2.5-flash");
  });

  it("ignores previews, experiments and dated builds", () => {
    // These can be withdrawn or rate-limited without notice; an auto setting must
    // not move the app onto one.
    expect(parseGeminiModelId("gemini-3.0-flash-preview-01-21")).toBeNull();
    expect(parseGeminiModelId("gemini-2.5-flash-001")).toBeNull();
    expect(parseGeminiModelId("gemini-2.0-flash-thinking-exp")).toBeNull();
    expect(pickLatestGemini(["gemini-2.5-flash", "gemini-9.9-flash-preview"], "flash")).toBe("gemini-2.5-flash");
  });

  it("ranks numerically, not lexically", () => {
    expect(pickLatestGemini(["gemini-3.9-flash", "gemini-3.10-flash"], "flash")).toBe("gemini-3.10-flash");
  });

  it("uses a preview only for a tier that has fallen a generation behind", () => {
    // Google's real list: Pro's newest stable is 2.5 — which already 404s for new
    // keys — while the current Pro ships only as a preview. Flash is current, so it
    // must stay on its stable release.
    const ids = [
      "gemini-2.5-pro", "gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools",
      "gemini-3-pro-image-preview", "gemini-3.7-flash", "gemini-3.8-flash-preview",
      "gemini-3.5-flash-lite",
    ];
    expect(pickLatestGemini(ids, "pro")).toBe("gemini-3.1-pro-preview");
    expect(pickLatestGemini(ids, "flash")).toBe("gemini-3.7-flash");
    expect(pickLatestGemini(ids, "flash-lite")).toBe("gemini-3.5-flash-lite");
  });

  it("does not treat image, TTS or custom-tool builds as a newer version", () => {
    expect(parseGeminiPreviewId("gemini-3-pro-image-preview")).toBeNull();
    expect(parseGeminiPreviewId("gemini-3.1-flash-tts-preview")).toBeNull();
    expect(parseGeminiPreviewId("gemini-3.1-pro-preview-customtools")).toBeNull();
    expect(parseGeminiPreviewId("gemini-3.1-pro-preview")).toEqual({ family: "pro", rank: 3001 });
  });
});

describe("sentinel recognition", () => {
  it("maps each auto option to the tier it keeps", () => {
    expect(anthropicSentinelFamily("latest-sonnet")).toBe("sonnet");
    expect(anthropicSentinelFamily(" Latest-Opus ")).toBe("opus");
    expect(geminiSentinelFamily("latest-flash-lite")).toBe("flash-lite");
  });

  it("treats a concrete model id as a pin", () => {
    expect(anthropicSentinelFamily("claude-sonnet-5")).toBeNull();
    expect(geminiSentinelFamily("gemini-2.5-flash")).toBeNull();
    expect(geminiSentinelFamily(undefined)).toBeNull();
  });
});

describe("webSearchToolType", () => {
  it("sends the dynamic-filtering tool to models that accept it", () => {
    for (const id of ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6", "claude-fable-5"]) {
      expect(webSearchToolType(id)).toBe(WEB_SEARCH_TOOL_CURRENT);
    }
  });

  it("keeps the basic tool for models that only accept that one", () => {
    // Haiku 4.5 outranks Sonnet 4.5 numerically but is not in the supported set —
    // the rule is per family, not a single global cutoff.
    for (const id of ["claude-haiku-4-5", "claude-opus-4-5", "claude-3-5-sonnet-20241022"]) {
      expect(webSearchToolType(id)).toBe(WEB_SEARCH_TOOL_BASIC);
    }
  });

  it("falls back to the basic tool for an id it cannot parse", () => {
    // An unknown id may be anything, including a model too old for the current tool.
    expect(webSearchToolType("some-future-name")).toBe(WEB_SEARCH_TOOL_BASIC);
  });
});
