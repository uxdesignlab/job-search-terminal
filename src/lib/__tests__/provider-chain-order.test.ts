import { describe, expect, it } from "vitest";
import type { AIProviderName } from "@/lib/db/types";

/**
 * The ordering rule the settings form applies when a provider is added during
 * onboarding. Kept as a pure function here so the behaviour is pinned without
 * mounting the form.
 */
function chainAfterAdding(
  order: AIProviderName[],
  enabled: Set<AIProviderName>,
  added: AIProviderName
): AIProviderName[] {
  const isNew = !enabled.has(added);
  const nextOrder = isNew
    ? [
        ...order.filter((p) => p !== added && enabled.has(p)),
        added,
        ...order.filter((p) => p !== added && !enabled.has(p)),
      ]
    : order;
  const nextEnabled = new Set([...enabled, added]);
  return nextOrder.filter((p) => nextEnabled.has(p));
}

const DEFAULT_ORDER: AIProviderName[] = ["openai", "anthropic", "gemini", "ollama"];

describe("provider chain order during onboarding", () => {
  /**
   * The bug this covers: the chain was built by filtering the fixed default order, so
   * a provider added later could outrank the one chosen first. Picking Ollama and then
   * adding OpenAI as a fallback produced [openai, ollama] — every AI call went to the
   * paid cloud service instead of the local provider the user picked first.
   */
  it("keeps the first provider chosen at the head of the chain", () => {
    const afterOllama = chainAfterAdding(DEFAULT_ORDER, new Set(), "ollama");
    expect(afterOllama).toEqual(["ollama"]);

    const afterFallback = chainAfterAdding(DEFAULT_ORDER, new Set<AIProviderName>(["ollama"]), "openai");
    expect(afterFallback).toEqual(["ollama", "openai"]);
    expect(afterFallback[0]).toBe("ollama");
  });

  it("appends each further provider after the ones already chosen", () => {
    let enabled = new Set<AIProviderName>();
    let order = DEFAULT_ORDER;
    for (const next of ["gemini", "anthropic", "openai"] as AIProviderName[]) {
      const isNew = !enabled.has(next);
      order = isNew
        ? [
            ...order.filter((p) => p !== next && enabled.has(p)),
            next,
            ...order.filter((p) => p !== next && !enabled.has(p)),
          ]
        : order;
      enabled = new Set([...enabled, next]);
    }
    expect(order.filter((p) => enabled.has(p))).toEqual(["gemini", "anthropic", "openai"]);
  });

  it("leaves the order alone when re-saving a provider already in the chain", () => {
    const enabled = new Set<AIProviderName>(["ollama", "openai"]);
    const order: AIProviderName[] = ["ollama", "openai", "anthropic", "gemini"];
    expect(chainAfterAdding(order, enabled, "ollama")).toEqual(["ollama", "openai"]);
  });
});
