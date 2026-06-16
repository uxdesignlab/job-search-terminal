import { getAISettings } from "@/lib/db/queries";
import type { AIProviderName } from "@/lib/db/types";
import { createProvider } from "@/lib/ai/factory";
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

    const defaultModel =
      provider === "anthropic" ? settings.anthropicModel
      : provider === "gemini" ? settings.geminiModel
      : settings.openaiModel;

    const instance = createProvider(provider, { apiKey, model: model ?? defaultModel });
    const result = await instance.testConnection();

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, latencyMs: 0, model: "", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
