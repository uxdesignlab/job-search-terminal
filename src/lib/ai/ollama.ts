import OpenAI from "openai";
import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";
import { LOCAL_GENERATION_TIMEOUT_MS } from "./deadlines";
import { parseJsonResponse } from "./json-response";

function humanizeOllamaError(error: unknown, model?: string): Error {
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
    if (status === 404) {
      return new Error(
        model
          ? `Ollama has no model named "${model}". Install it with: ollama pull ${model}`
          : "Model not found in Ollama. Install it with: ollama pull <model-name>"
      );
    }
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
    // Deliberately longer than the local generation deadline (10 minutes), so the
    // caller's deadline is always the one that decides. A local model is slow, not
    // broken: when the HTTP client gave up first, the chain read that as "Ollama
    // failed" and answered by spending a cloud call — the opposite of what someone
    // who put a local model first is asking for.
    this.client = new OpenAI({ baseURL, apiKey: "ollama", timeout: LOCAL_GENERATION_TIMEOUT_MS + 60_000 });
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
    const maxTokens = config?.maxTokens ?? 4096;
    try {
      const response = await this.client.chat.completions.create({
        model: config?.model ?? this.model,
        max_tokens: maxTokens,
        temperature: config?.temperature,
        messages: this.toMessages(messages)
      });
      const choice = response.choices[0];
      const text = choice?.message?.content ?? "";

      // A reasoning model spends the token budget thinking before it writes
      // anything, so a cap that is merely tight comes back as a well-formed
      // response whose `content` is empty. Returning "" from here made every
      // caller invent its own generic failure downstream; saying what happened
      // also marks the call worth retrying on the next provider in the chain.
      if (!text.trim()) {
        if (choice?.finish_reason === "length") {
          throw new Error(
            `Ollama returned no usable text: the answer was cut off at the ${maxTokens}-token limit ` +
              `after ${response.usage?.completion_tokens ?? "?"} tokens, before any content was written. ` +
              "The model is reasoning at length — raise the token limit or use a non-reasoning model."
          );
        }
        throw new Error(
          "Ollama returned no usable text: the answer was empty. Try another local model."
        );
      }

      return text;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Ollama returned no usable text")) throw error;
      throw humanizeOllamaError(error, this.model);
    }
  }

  async generateJSON<T>(messages: AIMessage[], _hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    try {
      const messagesWithJsonHint = messages.map((m) =>
        m.role === "system" ? { ...m, content: JSON_SYSTEM_PREFIX + m.content } : m
      );
      const response = await this.client.chat.completions.create({
        model: config?.model ?? this.model,
        // Larger than the text default, matching Gemini: the structured shapes this
        // app asks for run past 4096 tokens, and a response truncated mid-object
        // arrives as "invalid JSON" — which reads as the model being incapable
        // rather than out of room. Local generation has no per-token cost.
        max_tokens: config?.maxTokens ?? 8192,
        temperature: config?.temperature,
        response_format: { type: "json_object" },
        messages: this.toMessages(messagesWithJsonHint)
      });
      const choice = response.choices[0];
      const text = choice?.message?.content ?? "";
      const maxTokens = config?.maxTokens ?? 8192;

      // "Invalid JSON" was the same answer for three different problems: an answer
      // cut off at the token limit, an empty answer, and a model that genuinely
      // cannot hold a schema. They need different responses from the user, so each
      // says what it is — and every message keeps the words "invalid JSON", which
      // is what marks it retryable and worth failing over.
      if (choice?.finish_reason === "length") {
        throw new Error(
          `Ollama returned invalid JSON: the answer was cut off at the ${maxTokens}-token limit, ` +
            `after ${response.usage?.completion_tokens ?? "?"} tokens. The model is writing more than the ` +
            "shape needs — a model tuned for structured output will fit it."
        );
      }
      if (!text.trim()) {
        throw new Error(
          "Ollama returned invalid JSON: the answer was empty. The model may not support JSON mode — " +
            "try another local model."
        );
      }

      return parseJsonResponse<T>(text, "Ollama");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Ollama returned invalid JSON")) throw error;
      throw humanizeOllamaError(error, this.model);
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
      throw humanizeOllamaError(error, this.model);
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    try {
      const list = await this.client.models.list();
      const modelNames = list.data.map((m) => m.id);

      // A reachable server is not a working provider. This used to report ok:true and
      // display modelNames[0] whenever the configured model was absent — so onboarding
      // showed "Verified" against a model the app was not going to use, and the first
      // real request came back 404 from somewhere the user could not connect to setup.
      if (!modelNames.includes(this.model)) {
        const installed = modelNames.length > 0
          ? ` Installed: ${modelNames.slice(0, 6).join(", ")}${modelNames.length > 6 ? "…" : ""}.`
          : " No models are installed.";
        return {
          ok: false,
          latencyMs: Date.now() - start,
          model: this.model,
          error: `Ollama is running but has no model named "${this.model}". Install it with: ollama pull ${this.model}.${installed}`
        };
      }
      return { ok: true, latencyMs: Date.now() - start, model: this.model };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        model: this.model,
        error: humanizeOllamaError(error, this.model).message
      };
    }
  }
}
