import OpenAI from "openai";
import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";

function humanizeOllamaError(error: unknown): Error {
  if (error instanceof OpenAI.APIConnectionError || (error instanceof Error && error.message.includes("ECONNREFUSED"))) {
    return new Error("Could not connect to Ollama. Make sure it is running: `ollama serve`");
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new Error("Ollama request timed out. The model may still be loading — retry in a moment.");
  }
  if (error instanceof OpenAI.APIUserAbortError) {
    return new Error("Request was cancelled before it completed. Try again.");
  }
  if (error instanceof OpenAI.InternalServerError) {
    return new Error(`Ollama server error (${error.status}). Check that the model is fully downloaded.`);
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 404) return new Error(`Model not found in Ollama. Run: ollama pull ${"`<model-name>`"}`);
    return new Error(`Ollama error (HTTP ${status}): ${error.message}`);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new Error("Request aborted — check your network connection and retry.");
  }
  if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
    return new Error("Could not connect to Ollama. Make sure it is running: `ollama serve`");
  }
  return new Error(error instanceof Error ? error.message : String(error));
}

const JSON_SYSTEM_PREFIX = "Respond ONLY with a valid JSON object. No markdown fences, no prose before or after.\n\n";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  readonly defaultModel = "llama3.1:8b";

  private readonly client: OpenAI;
  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    const baseURL = (config.baseUrl ?? "http://localhost:11434") + "/v1";
    this.client = new OpenAI({ baseURL, apiKey: "ollama", timeout: 120_000 });
  }

  private get model() {
    return this.config.model ?? this.defaultModel;
  }

  get effectiveModel() {
    return this.model;
  }

  private toMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: config?.model ?? this.model,
        max_tokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature,
        messages: this.toMessages(messages)
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw humanizeOllamaError(error);
    }
  }

  async generateJSON<T>(messages: AIMessage[], _hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    try {
      const messagesWithJsonHint = messages.map((m) =>
        m.role === "system" ? { ...m, content: JSON_SYSTEM_PREFIX + m.content } : m
      );
      const response = await this.client.chat.completions.create({
        model: config?.model ?? this.model,
        max_tokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature,
        response_format: { type: "json_object" },
        messages: this.toMessages(messagesWithJsonHint)
      });
      const text = response.choices[0]?.message?.content ?? "{}";
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Ollama returned invalid JSON. Try a larger model (14B+) for more reliable structured output.");
      }
      throw humanizeOllamaError(error);
    }
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    try {
      const stream = this.client.chat.completions.stream({
        model: config?.model ?? this.model,
        max_tokens: config?.maxTokens ?? 4096,
        temperature: config?.temperature,
        messages: this.toMessages(messages)
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) yield { text, done: false };
      }

      yield { text: "", done: true };
    } catch (error) {
      throw humanizeOllamaError(error);
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const list = await this.client.models.list();
      const modelNames = list.data.map((m) => m.id);
      const matched = modelNames.find((id) => id === this.model) ?? modelNames[0] ?? "ollama";
      return { ok: true, latencyMs: Date.now() - start, model: matched };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        model: this.model,
        error: humanizeOllamaError(error).message
      };
    }
  }
}
