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
  /**
   * Turn an auto setting into a concrete model id before anything is reported.
   *
   * "latest-sonnet" names a policy, not a model, and it only became an id inside
   * the request — so progress UI named a policy while the user waited. Resolving
   * first costs nothing: the lookup is cached per key and the request would have
   * made it anyway. Providers with no sentinels do not implement it.
   */
  prepare?(): Promise<void>;
  generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string>;
  generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>): Promise<T>;
  stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk>;
  testConnection(): Promise<ConnectionTestResult>;
  /** Optional: perform a web search and return a summary. Returns null if not supported. */
  webSearch?(query: string): Promise<string | null>;
}
