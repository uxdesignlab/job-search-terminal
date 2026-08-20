import { describe, expect, it } from "vitest";
import { summarizeProviderError } from "@/lib/ai/provider-error-summary";

describe("summarizeProviderError", () => {
  it("keeps the status and the actionable sentence out of a Gemini quota dump", () => {
    const raw =
      "[GoogleGenerativeAI Error]: Error fetching from " +
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent: " +
      "[429 Too Many Requests] You exceeded your current quota, please check your plan and billing details. " +
      "For more information on this error, head to: https://ai.dev/gemini-api/docs/rate-limit. " +
      "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0 " +
      '[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more"}]}]';

    const { summary, detail } = summarizeProviderError(raw);
    expect(summary).toBe("[429 Too Many Requests] You exceeded your current quota, please check your plan and billing details.");
    expect(detail).toBe(raw.trim());
  });

  it("leaves a short message alone and reports no detail to expand", () => {
    const { summary, detail } = summarizeProviderError("API key required");
    expect(summary).toBe("API key required");
    expect(detail).toBe("");
  });

  it("drops a JSON body that follows the prose", () => {
    const raw = 'Request failed. {"error":{"code":401,"message":"invalid key"}}';
    expect(summarizeProviderError(raw).summary).toBe("Request failed.");
  });

  it("truncates a long unpunctuated message rather than filling the panel", () => {
    const raw = `x${"y".repeat(400)}`;
    const { summary, detail } = summarizeProviderError(raw);
    expect(summary.length).toBeLessThanOrEqual(181);
    expect(summary.endsWith("…")).toBe(true);
    expect(detail).toBe(raw);
  });

  it("handles an empty or missing error", () => {
    expect(summarizeProviderError("")).toEqual({ summary: "", detail: "" });
    expect(summarizeProviderError(undefined)).toEqual({ summary: "", detail: "" });
  });
});
