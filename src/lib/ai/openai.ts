import OpenAI from "openai";
import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly defaultModel = "gpt-5.4-mini";

  private readonly client: OpenAI;
  private readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  private get model() {
    return this.config.model ?? this.defaultModel;
  }

  private toOpenAIMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content
    }));
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: config?.model ?? this.model,
      max_completion_tokens: config?.maxTokens ?? 4096,
      temperature: config?.temperature,
      messages: this.toOpenAIMessages(messages)
    });

    return response.choices[0]?.message?.content ?? "";
  }

  async generateJSON<T>(messages: AIMessage[], _hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: config?.model ?? this.model,
      max_completion_tokens: config?.maxTokens ?? 4096,
      temperature: config?.temperature,
      response_format: { type: "json_object" },
      messages: this.toOpenAIMessages(messages)
    });

    return JSON.parse(response.choices[0]?.message?.content ?? "{}") as T;
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
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
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
