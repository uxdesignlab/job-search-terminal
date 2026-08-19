/**
 * Turns a provider's raw error into one readable line, keeping the full text for
 * anyone who wants it.
 *
 * Provider SDKs return the whole HTTP failure body — Google's 429 arrives as a
 * paragraph of quota metrics followed by several hundred characters of JSON
 * violation objects. Pasted verbatim into Settings it buries the one sentence that
 * says what to do, so the summary is what the panel shows and the rest goes behind
 * a toggle. Nothing is discarded.
 */

export type ProviderErrorSummary = {
  /** One line, safe to show inline. */
  summary: string;
  /** The original text, or "" when the summary already says everything. */
  detail: string;
};

/** `[429 Too Many Requests]` — the status the provider actually returned. Where one
 *  is present the summary starts there, dropping the SDK's "Error fetching from
 *  <url>" preamble, which repeats a request the user did not make by hand. */
const HTTP_STATUS = /\[\d{3}\b[^\]]*\]/;

/** Structured payloads appended after the prose: `[{"@type": …}]`, `{"error": …}`. */
const JSON_TAIL = /[[{]\s*[[{]?\s*"/;

const MAX_SUMMARY = 180;

export function summarizeProviderError(raw: string | undefined | null): ProviderErrorSummary {
  const full = (raw ?? "").trim();
  if (!full) return { summary: "", detail: "" };

  let text = full;

  const status = HTTP_STATUS.exec(text);
  if (status && status.index > 0) text = text.slice(status.index);

  const json = JSON_TAIL.exec(text);
  if (json && json.index > 0) text = text.slice(0, json.index);

  // Provider messages often continue into bullet lists of per-metric detail; the
  // first line and first sentence are where the actionable part lives.
  text = text.split("\n")[0].split(" * ")[0].trim();

  if (text.length > MAX_SUMMARY) {
    const sentenceEnd = text.slice(0, MAX_SUMMARY).lastIndexOf(". ");
    text = sentenceEnd > 40 ? text.slice(0, sentenceEnd + 1) : `${text.slice(0, MAX_SUMMARY).trimEnd()}…`;
  }

  const summary = text.trim() || full.slice(0, MAX_SUMMARY);
  return { summary, detail: summary === full ? "" : full };
}
