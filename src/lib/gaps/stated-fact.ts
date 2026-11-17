/**
 * Facts the user states while editing a resume — "add 8+ years of healthcare
 * experience" typed into a section's instruction — saved to the Evidence bank so the
 * next rewrite and the PDF export can use them without being told again.
 *
 * Client-safe: no Node imports, so the editor can build the same prefill and label
 * the server stores.
 */

/** Tag that marks a bank entry as a fact the user stated, not an answer to a gap. */
export const STATED_FACT_TAG = "stated-fact";

/** Prefix of the bank heading for a stated fact. The full heading is also its key. */
export const STATED_FACT_PREFIX = "In your own words: ";

const LEADING_REQUEST = /^(?:please\s+)?(?:add|mention|include|say|state|note|show|highlight|emphasi[sz]e|put in|work in)\s+(?:that\s+)?(?:i\s+have\s+|i\s+had\s+|my\s+)?/i;

/**
 * The instruction rewritten as a statement where that is a safe, mechanical change:
 * "add 8+ years of healthcare experience" → "8+ years of healthcare experience".
 * Anything else is returned as typed — the user edits it before saving.
 */
export function factFromInstruction(instruction: string): string {
  const trimmed = instruction.trim().replace(/\s+/g, " ");
  const stripped = trimmed.replace(LEADING_REQUEST, "").trim();
  if (!stripped) return trimmed;
  return stripped[0].toUpperCase() + stripped.slice(1);
}

/**
 * The bank heading — and key — for one stated fact. The whole fact, never truncated:
 * the row's id is derived from this text, so two long facts sharing an opening would
 * otherwise collide and the second save would overwrite the first.
 */
export function statedFactGapText(fact: string): string {
  return `${STATED_FACT_PREFIX}${fact.trim().replace(/\s+/g, " ")}`;
}
