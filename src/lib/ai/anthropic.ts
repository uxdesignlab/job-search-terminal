import Anthropic from "@anthropic-ai/sdk";
import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";
import {
  ANTHROPIC_FALLBACK_MODELS,
  anthropicSentinelFamily,
  resolveLatestAnthropicModel,
  webSearchToolType,
} from "./anthropic-models";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly defaultModel = ANTHROPIC_FALLBACK_MODELS.sonnet;

  private readonly client: Anthropic;
  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
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
   *  id. Cached inside resolveLatestAnthropicModel, so this is a no-op on the
   *  hot path. */
  private async resolveModel(override?: string): Promise<string> {
    const requested = override ?? this.model;
    const family = anthropicSentinelFamily(requested);
    if (!family) return requested;
    this.resolved = await resolveLatestAnthropicModel(this.client, this.config.apiKey ?? "", family);
    return this.resolved;
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    const model = await this.resolveModel(config?.model);
    const systemMessages = messages.filter((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model,
      max_tokens: config?.maxTokens ?? 4096,
      system: systemMessages.length > 0
        ? [
            {
              type: "text" as const,
              text: systemMessages.map((m) => m.content).join("\n\n"),
              cache_control: { type: "ephemeral" as const }
            }
          ]
        : undefined,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }))
    });

    const block = response.content[0];
    return block.type === "text" ? block.text : "";
  }

  async generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    const augmented = [...messages];
    const lastUser = augmented.findLastIndex((m) => m.role === "user");
    if (lastUser >= 0) {
      augmented[lastUser] = {
        ...augmented[lastUser],
        content: `${augmented[lastUser].content}\n\nRespond with valid JSON only. Schema: ${hint}`
      };
    }
    const text = await this.generateText(augmented, config);
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    const payload = jsonMatch ? jsonMatch[1] ?? jsonMatch[0] : text;
    try {
      return JSON.parse(payload) as T;
    } catch (error) {
      // Truncated/malformed output (e.g. the response hit max_tokens mid-object) would
      // otherwise throw a bare SyntaxError. Normalize it so withRetry treats it as a
      // retryable malformed-JSON failure and the expected shape is visible in logs.
      const reason = error instanceof Error ? error.message : String(error);
      const preview = payload.length > 200 ? `${payload.slice(0, 200)}…` : payload;
      throw new Error(`Anthropic returned invalid JSON (${reason}); expected shape ${hint}. Preview: ${preview}`);
    }
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    const model = await this.resolveModel(config?.model);
    const systemMessages = messages.filter((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");

    const stream = this.client.messages.stream({
      model,
      max_tokens: config?.maxTokens ?? 4096,
      system: systemMessages.length > 0
        ? [
            {
              type: "text" as const,
              text: systemMessages.map((m) => m.content).join("\n\n"),
              cache_control: { type: "ephemeral" as const }
            }
          ]
        : undefined,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }))
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { text: event.delta.text, done: false };
      }
    }

    yield { text: "", done: true };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = Date.now();
    // Resolved before the try so a failure reports the model that actually ran,
    // not the "latest-…" sentinel, which says nothing about what went wrong.
    const resolved = await this.resolveModel();
    try {
      const response = await this.client.messages.create({
        model: resolved,
        max_tokens: 10,
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
        model: resolved,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async webSearch(query: string): Promise<string | null> {
    try {
      const model = await this.resolveModel();
      const response = await this.client.messages.create({
        model,
        max_tokens: 800,
        // The tool type tracks the model: current releases take the dynamic-filtering
        // variant, older ones only the basic tool. Sending the wrong one is rejected.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: webSearchToolType(model) as any, name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: query }]
      });
      const texts: string[] = [];
      for (const block of response.content) {
        if (block.type === "text") texts.push(block.text);
      }
      return texts.join("\n").trim() || null;
    } catch {
      return null;
    }
  }
}
