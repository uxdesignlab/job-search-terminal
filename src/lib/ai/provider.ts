export type AIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AIProviderConfig = {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Base URL for local providers (e.g. Ollama). Ignored by cloud providers. */
  baseUrl?: string;
};

export type StreamChunk = {
  text: string;
  done: boolean;
};

export type ConnectionTestResult = {
  ok: boolean;
  latencyMs: number;
  model: string;
  error?: string;
};

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  /** Resolved model id from settings (`config.model` when set, otherwise {@link defaultModel}). */
  readonly effectiveModel: string;
  generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string>;
  generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>): Promise<T>;
  stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk>;
  testConnection(): Promise<ConnectionTestResult>;
  /** Optional: perform a web search and return a summary. Returns null if not supported. */
  webSearch?(query: string): Promise<string | null>;
}
