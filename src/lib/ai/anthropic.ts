import Anthropic from "@anthropic-ai/sdk";
import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly defaultModel = "claude-sonnet-4-6";

  private readonly client: Anthropic;
  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  private get model() {
    return this.config.model ?? this.defaultModel;
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    const model = config?.model ?? this.model;
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
    return JSON.parse(jsonMatch ? jsonMatch[1] ?? jsonMatch[0] : text) as T;
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    const model = config?.model ?? this.model;
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
    try {
      const response = await this.client.messages.create({
        model: this.model,
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
        model: this.model,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async webSearch(query: string): Promise<string | null> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 800,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search_20250305" as any, name: "web_search", max_uses: 3 }],
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
