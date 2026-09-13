import { clearAIProviderStatus, getAISettings, markAIProviderCreditsExhausted } from "@/lib/db/queries";
import type { AIProviderName } from "@/lib/db/types";
import type { ConnectionTestResult } from "@/lib/ai/provider";
import { createProvider } from "@/lib/ai/factory";
import { isCreditsExhaustedError } from "@/lib/ai/credit-status";
import { resolveMaskedKey } from "@/lib/ai/masked-key";
import { NextResponse } from "next/server";

/**
 * A test of the account the app actually uses is the quickest way for a user to tell it
 * that credits are back — so a pass clears the out-of-credits flag, and a credits
 * failure sets it. A test of a key that has not been saved says nothing about the stored
 * account and changes nothing.
 */
function recordCreditState(provider: AIProviderName, result: ConnectionTestResult, testedStoredAccount: boolean) {
  if (!testedStoredAccount) return;
  try {
    if (result.ok) clearAIProviderStatus(provider);
    else if (result.error && isCreditsExhaustedError(result.error)) markAIProviderCreditsExhausted(provider, result.error);
  } catch {
    // The test result is still the answer; the flag is a courtesy.
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { provider: AIProviderName; apiKey?: string; model?: string; baseUrl?: string };
    const { provider, apiKey, model, baseUrl } = body;

    const settings = getAISettings();

    if (provider === "ollama") {
      const resolvedBaseUrl = baseUrl || settings.ollamaBaseUrl || "http://localhost:11434";
      const resolvedModel = model || settings.ollamaModel;
      const instance = createProvider("ollama", { apiKey: "ollama", model: resolvedModel, baseUrl: resolvedBaseUrl });
      const result = await instance.testConnection();
      recordCreditState("ollama", result, resolvedBaseUrl === settings.ollamaBaseUrl);
      return NextResponse.json(result);
    }

    if (!apiKey) {
      return NextResponse.json({ ok: false, latencyMs: 0, model: model ?? "", error: "API key required" }, { status: 400 });
    }

    const storedKey =
      provider === "anthropic" ? settings.anthropicApiKey
      : provider === "gemini" ? settings.geminiApiKey
      : settings.openaiApiKey;

    // An untouched key field still holds the mask, which is not a usable credential.
    const resolvedKey = resolveMaskedKey(apiKey, storedKey);

    const defaultModel =
      provider === "anthropic" ? settings.anthropicModel
      : provider === "gemini" ? settings.geminiModel
      : settings.openaiModel;

    const instance = createProvider(provider, { apiKey: resolvedKey, model: model ?? defaultModel });
    const result = await instance.testConnection();
    recordCreditState(provider, result, Boolean(storedKey) && resolvedKey === storedKey);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, latencyMs: 0, model: "", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
