import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";
import { GEMINI_FALLBACK_MODELS, geminiSentinelFamily, resolveLatestGeminiModel } from "./gemini-models";
import { parseJsonResponse } from "./json-response";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly defaultModel = GEMINI_FALLBACK_MODELS.flash;

  private readonly client: GoogleGenerativeAI;
  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  private get model() {
    return this.config.model ?? this.defaultModel;
  }

  /** Once a sentinel has been resolved, the concrete id is what ran — and what
   *  provenance, error reports and the saved evaluation must name. */
  private resolved = "";

  get effectiveModel() {
    return this.resolved || this.model;
  }

  /** The stored model may be a "latest-<tier>" sentinel; turn it into a concrete
   *  id. Cached inside resolveLatestGeminiModel, so this is a no-op on the hot path. */
  private async resolveModel(override?: string): Promise<string> {
    const requested = override ?? this.model;
    const family = geminiSentinelFamily(requested);
    if (!family) return requested;
    this.resolved = await resolveLatestGeminiModel(this.config.apiKey, family);
    return this.resolved;
  }

  private buildContents(messages: AIMessage[]) {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));
  }

  private getSystemInstruction(messages: AIMessage[]) {
    const systemMessages = messages.filter((m) => m.role === "system");
    return systemMessages.length > 0 ? systemMessages.map((m) => m.content).join("\n\n") : undefined;
  }

  async prepare(): Promise<void> {
    await this.resolveModel();
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: await this.resolveModel(config?.model),
      systemInstruction: this.getSystemInstruction(messages)
    });

    const result = await model.generateContent({
      contents: this.buildContents(messages),
      generationConfig: {
        maxOutputTokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature
      }
    });

    return result.response.text();
  }

  async generateJSON<T>(messages: AIMessage[], _hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    const model = this.client.getGenerativeModel({
      model: await this.resolveModel(config?.model),
      systemInstruction: this.getSystemInstruction(messages)
    });

    // Do NOT use responseMimeType: "application/json" — Gemini's constrained-decoding
    // JSON mode silently caps output at ~128 tokens regardless of maxOutputTokens, causing
    // truncation on any moderately-sized response. Plain-text mode respects maxOutputTokens.
    const result = await model.generateContent({
      contents: this.buildContents(messages),
      generationConfig: {
        maxOutputTokens: config?.maxTokens ?? 8192,
        temperature: config?.temperature
      }
    });

    const candidate = result.response.candidates?.[0];
    const finishReason = candidate?.finishReason as string | undefined;
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        "Gemini output was cut off (MAX_TOKENS). Try a model with a larger output window, or reduce the amount of text being processed."
      );
    }

    const raw = result.response.text()?.trim() ?? "";
    if (!raw) {
      throw new Error(
        "Gemini returned empty output. Check for safety blocks or try a different model."
      );
    }
    return parseJsonResponse<T>(raw, "Gemini");
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    const model = this.client.getGenerativeModel({
      model: await this.resolveModel(config?.model),
      systemInstruction: this.getSystemInstruction(messages)
    });

    const result = await model.generateContentStream({
      contents: this.buildContents(messages),
      generationConfig: {
        maxOutputTokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature
      }
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield { text, done: false };
    }

    yield { text: "", done: true };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    // Resolved before the try so a failure reports the model that actually ran,
    // not the "latest-…" sentinel, which says nothing about what went wrong.
    const resolved = await this.resolveModel();
    try {
      const model = this.client.getGenerativeModel({ model: resolved });
      await model.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
      return { ok: true, latencyMs: Date.now() - start, model: resolved };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        model: resolved,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async webSearch(query: string): Promise<string | null> {
    try {
      const model = this.client.getGenerativeModel({
        model: await this.resolveModel(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ googleSearch: {} } as any]
      });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: query }] }],
        generationConfig: { maxOutputTokens: 800 }
      });
      return result.response.text().trim() || null;
    } catch {
      return null;
    }
  }
}
