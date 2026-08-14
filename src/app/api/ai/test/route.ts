import { getAISettings } from "@/lib/db/queries";
import type { AIProviderName } from "@/lib/db/types";
import { createProvider } from "@/lib/ai/factory";
import { resolveMaskedKey } from "@/lib/ai/masked-key";
import { NextResponse } from "next/server";

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

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, latencyMs: 0, model: "", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
