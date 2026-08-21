import { describe, expect, it } from "vitest";
import { AllProvidersFailedError } from "@/lib/ai/chain-failure";
import {
  FAILURE_PHASE_MESSAGE,
  PHASE_FAILURE_ATTRIBUTION,
  toUserMessage,
} from "@/lib/evaluation/failure-reporting";
import { EVALUATION_PHASES } from "@/lib/evaluation/evaluation-phases";

describe("phase attribution", () => {
  it("attributes a failure while preparing to the input phase", () => {
    // "preparing" used to fall through a ternary chain to "validate", so a run
    // that threw before any provider was contacted reported "The AI response was
    // incomplete." for a response that was never requested.
    expect(PHASE_FAILURE_ATTRIBUTION.preparing).toBe("input");
    expect(FAILURE_PHASE_MESSAGE[PHASE_FAILURE_ATTRIBUTION.preparing]).toBe("The job could not be loaded.");
  });

  it("attributes each remaining phase to the step it belongs to", () => {
    expect(PHASE_FAILURE_ATTRIBUTION.evaluating).toBe("provider");
    expect(PHASE_FAILURE_ATTRIBUTION.validating).toBe("validate");
    expect(PHASE_FAILURE_ATTRIBUTION.saving).toBe("save");
  });

  it("covers every progress phase, so no phase can fall to a default again", () => {
    for (const phase of EVALUATION_PHASES) {
      expect(PHASE_FAILURE_ATTRIBUTION[phase]).toBeDefined();
    }
  });
});

describe("toUserMessage", () => {
  it("tells a first-run user to add a provider, not to re-enter a key", () => {
    // The not-configured error contains the words "api key", so it matched the
    // invalid-key branch and sent someone with an empty settings page hunting
    // for a typo in a field they had never filled in.
    const message = toUserMessage(
      new Error("No AI provider configured. Add an API key in Settings → AI Provider.")
    );
    expect(message).toBe("No AI provider is configured — add an API key in Settings → AI Provider.");
    expect(message).not.toContain("re-enter");
  });

  it("still reports a genuinely rejected key as invalid", () => {
    expect(toUserMessage(new Error("401 invalid api key"))).toBe(
      "Invalid API key — check your AI provider settings and re-enter the key."
    );
  });

  it("reports a whole-chain failure as itself", () => {
    const chain = new AllProvidersFailedError(
      [{ provider: "ollama", model: "gemma4:12b", error: "timed out" }],
      new Error("timed out")
    );
    expect(toUserMessage(chain)).toContain("ollama (gemma4:12b)");
  });

  it("still recognizes quota and network failures", () => {
    expect(toUserMessage(new Error("429 quota exceeded"))).toContain("AI quota exceeded");
    expect(toUserMessage(new Error("network unreachable"))).toContain("Network error");
  });
});
