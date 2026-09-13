import type { AIProviderName } from "@/lib/db/types";
import type { AIProvider, AIMessage, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";

/**
 * A paid provider that has run out of credits, told apart from one that is merely busy.
 *
 * Each SDK reports this differently and none of them calls it what it is. OpenAI sends
 * it as a 429 with `code: "insufficient_quota"`, which the adapter used to translate into
 * "rate limit reached — wait a moment": advice that could never work. Anthropic sends a
 * 400, which the chain treats as a malformed request and does not fail over on, so a
 * local model configured behind it never got its turn. Gemini's daily quota and its
 * per-minute limit share a status code and differ only in the metric named in the text.
 *
 * Waiting fixes a rate limit. Only the user can fix this — by adding credits or choosing
 * another provider — so it gets its own error, its own failover, and a notice that says
 * which of the two it was.
 */

const LABELS: Record<AIProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  ollama: "Ollama",
};

const BILLING_PAGES: Partial<Record<AIProviderName, string>> = {
  openai: "platform.openai.com/settings/organization/billing",
  anthropic: "console.anthropic.com/settings/billing",
  gemini: "aistudio.google.com/usage",
};

export function providerLabel(provider: string): string {
  return LABELS[provider as AIProviderName] ?? provider;
}

export class ProviderCreditsExhaustedError extends Error {
  /** Survives serialization and chain summaries, where `instanceof` does not. */
  static readonly MARKER = "is out of credits";

  constructor(readonly provider: AIProviderName, readonly detail: string) {
    const page = BILLING_PAGES[provider];
    super(
      `${providerLabel(provider)} ${ProviderCreditsExhaustedError.MARKER}. ` +
        `Add credits${page ? ` at ${page}` : ""}, or choose another provider in Settings → AI Provider.`
    );
    this.name = "ProviderCreditsExhaustedError";
  }
}

export function isCreditsExhaustedError(error: unknown): boolean {
  if (error instanceof ProviderCreditsExhaustedError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(ProviderCreditsExhaustedError.MARKER);
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

/** OpenAI: a 429 carrying `insufficient_quota`, as opposed to a request-rate 429. */
export function isOpenAICreditsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "insufficient_quota") return true;
  if (statusOf(error) === 402) return true;
  return /insufficient_quota|exceeded your current quota/i.test(textOf(error));
}

/** Anthropic: "Your credit balance is too low", delivered as a 400. */
export function isAnthropicCreditsError(error: unknown): boolean {
  if (statusOf(error) === 402) return true;
  return /credit balance is too low|purchase credits/i.test(textOf(error));
}

/**
 * Gemini: a quota that will not come back by waiting a minute — the free tier's daily
 * allowance, or a paid account's prepaid credit. A per-minute limit is a rate limit and
 * is left to the retry policy.
 */
export function isGeminiCreditsError(error: unknown): boolean {
  const text = textOf(error);
  if (/prepayment credits are depleted|billing account|BILLING_DISABLED/i.test(text)) return true;
  if (!/exceeded your current quota|RESOURCE_EXHAUSTED/i.test(text)) return false;
  if (/per\s*day|PerDay/i.test(text)) return true;
  return !/per\s*minute|PerMinute/i.test(text);
}

/** Store the chain reports to. Injected so the chain itself stays free of the database. */
export type CreditStatusStore = {
  exhausted(): Set<string>;
  mark(provider: AIProviderName, message: string): void;
  clear(provider: AIProviderName): void;
};

/**
 * Report a provider's credit state as a side effect of using it.
 *
 * Wrapped around each adapter by the factory rather than built into the chain, because
 * a single configured provider is not a chain — it would otherwise never record running
 * out, and never clear the flag when credits came back.
 */
export function trackCredits(provider: AIProvider, store: CreditStatusStore): AIProvider {
  const name = provider.name as AIProviderName;
  let flagged = store.exhausted().has(name);

  const succeeded = () => {
    if (!flagged) return;
    store.clear(name);
    flagged = false;
  };
  const failed = (error: unknown) => {
    if (!isCreditsExhaustedError(error)) return;
    store.mark(name, error instanceof Error ? error.message : String(error));
    flagged = true;
  };

  const tracked: AIProvider = {
    get name() { return provider.name; },
    get defaultModel() { return provider.defaultModel; },
    get effectiveModel() { return provider.effectiveModel; },
    prepare: provider.prepare ? () => provider.prepare!() : undefined,
    async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>) {
      try {
        const result = await provider.generateText(messages, config);
        succeeded();
        return result;
      } catch (error) {
        failed(error);
        throw error;
      }
    },
    async generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>) {
      try {
        const result = await provider.generateJSON<T>(messages, hint, config);
        succeeded();
        return result;
      } catch (error) {
        failed(error);
        throw error;
      }
    },
    async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
      try {
        yield* provider.stream(messages, config);
        succeeded();
      } catch (error) {
        failed(error);
        throw error;
      }
    },
    async testConnection(): Promise<ConnectionTestResult> {
      const result = await provider.testConnection();
      if (result.ok) succeeded();
      else if (result.error && isCreditsExhaustedError(result.error)) failed(new Error(result.error));
      return result;
    },
    webSearch: provider.webSearch ? (query: string) => provider.webSearch!(query) : undefined,
  };
  return tracked;
}

/**
 * The sentence an AI action shows when it ran on a different provider than the one
 * that leads the chain, because the leaders were out of credits.
 */
export function creditFallbackNotice(skipped: string[], used: { name: string; effectiveModel: string }): string {
  if (skipped.length === 0) return "";
  const names = skipped.map(providerLabel);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? "is" : "are";
  const local = used.name === "ollama" ? "your local model" : providerLabel(used.name);
  return `${who} ${verb} out of credits — this used ${local} (${used.effectiveModel}) instead.`;
}
