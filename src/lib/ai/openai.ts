import OpenAI from "openai";
import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";

function humanizeOpenAIError(error: unknown): Error {
  if (error instanceof OpenAI.AuthenticationError) {
    return new Error("OpenAI API key is invalid or expired. Go to Settings → AI Provider to update it.");
  }
  if (error instanceof OpenAI.RateLimitError) {
    const msg = "OpenAI rate limit reached. Wait a moment then retry, or upgrade your usage tier at platform.openai.com.";
    const err = new Error(msg) as Error & { retryAfterMs?: number };
    const retryAfterSec = error.headers?.get("retry-after");
    if (retryAfterSec) {
      const ms = parseFloat(retryAfterSec) * 1000;
      if (Number.isFinite(ms) && ms > 0) err.retryAfterMs = ms;
    }
    return err;
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new Error("OpenAI request timed out. The model may be overloaded — retry in a few seconds.");
  }
  if (error instanceof OpenAI.APIUserAbortError) {
    return new Error("Request was cancelled before it completed. Try again.");
  }
  if (error instanceof OpenAI.InternalServerError) {
    return new Error(`OpenAI service error (${error.status}). This is on OpenAI's side — retry in a moment.`);
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 429) return new Error("OpenAI quota exceeded. Check your usage at platform.openai.com/usage.");
    if (status === 503) return new Error("OpenAI is temporarily unavailable. Retry in a few seconds.");
    return new Error(`OpenAI error (HTTP ${status}): ${error.message}`);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new Error("Request aborted — likely a network timeout. Check your connection and retry.");
  }
  return new Error(error instanceof Error ? error.message : String(error));
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly defaultModel = "gpt-5.4-mini";

  private readonly client: OpenAI;
  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey, timeout: 120_000 });
  }

  private get model() {
    return this.config.model ?? this.defaultModel;
  }

  get effectiveModel() {
    return this.model;
  }

  private toOpenAIMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content
    }));
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: config?.model ?? this.model,
        max_completion_tokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature,
        messages: this.toOpenAIMessages(messages)
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw humanizeOpenAIError(error);
    }
  }

  async generateJSON<T>(messages: AIMessage[], _hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    try {
      const response = await this.client.chat.completions.create({
        model: config?.model ?? this.model,
        max_completion_tokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature,
        response_format: { type: "json_object" },
        messages: this.toOpenAIMessages(messages)
      });
      return JSON.parse(response.choices[0]?.message?.content ?? "{}") as T;
    } catch (error) {
      throw humanizeOpenAIError(error);
    }
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    try {
      const stream = this.client.chat.completions.stream({
        model: config?.model ?? this.model,
        max_completion_tokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature,
        messages: this.toOpenAIMessages(messages)
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) yield { text, done: false };
      }

      yield { text: "", done: true };
    } catch (error) {
      throw humanizeOpenAIError(error);
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 10,
        messages: [{ role: "user", content: "hi" }]
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
        model: response.model
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        model: this.model,
        error: humanizeOpenAIError(error).message
      };
    }
  }
}
