/**
 * Reading a model's JSON answer.
 *
 * Every provider is asked for raw JSON and told not to use markdown fences, and
 * models wrap it in ```json anyway — instructions are a request, not a guarantee.
 * Anthropic and Gemini each grew their own unwrapping regex; Ollama grew none, so
 * a local model that fenced its answer was reported as returning "invalid JSON"
 * when the JSON inside the fence was perfectly good. One reader, so a model that
 * is understood by one provider is understood by all of them.
 */

/** ```json … ``` or a bare ``` … ``` block, whichever the model chose. */
const FENCED = /```(?:json)?\s*([\s\S]*?)```/;

/** A JSON object or array embedded in prose, as a last resort. */
const EMBEDDED = /(\{[\s\S]*\}|\[[\s\S]*\])/;

export function unwrapJson(text: string): string {
  const raw = text.trim();
  const fenced = FENCED.exec(raw);
  if (fenced) return fenced[1].trim();
  if (raw.startsWith("{") || raw.startsWith("[")) return raw;
  return EMBEDDED.exec(raw)?.[1]?.trim() ?? raw;
}

/**
 * Parse, or throw an error that says what came back. The words "invalid JSON" are
 * load-bearing: they are what marks the failure retryable and worth failing over,
 * rather than an auth or quota problem the user has to act on.
 */
export function parseJsonResponse<T>(text: string, provider: string, hint?: string): T {
  const payload = unwrapJson(text);
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const preview = payload.length > 300 ? `${payload.slice(0, 300)}…` : payload;
    throw new Error(
      `${provider} returned invalid JSON (${reason})${hint ? `; expected shape ${hint}` : ""}. Preview: ${preview}`
    );
  }
}
