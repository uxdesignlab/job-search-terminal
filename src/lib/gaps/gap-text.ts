/**
 * Turning an evaluator's gap sentence into the thing it is actually about.
 *
 * Evaluators write complaints ("The available resume evidence does not
 * explicitly document 3–5 years of direct people management…"), not subjects.
 * Splicing that sentence into a prompt produces "For the available resume
 * evidence does not explicitly document…: what scale?", so every surface that
 * builds a question from a gap strips it down through here first.
 *
 * Pure string work — safe to import from client components.
 */

const LEADING_COMPLAINTS = [
  /^(the\s+)?(available\s+)?(resume|profile)\s+(evidence\s+)?(does\s+not|doesn'?t)\s+(explicitly\s+)?(document|show|demonstrate|include|state|evidence)\s+(explicit\s+)?(experience\s+(with|in|designing)\s+)?/i,
  /^(the\s+)?(candidate|profile|resume)\s+(does\s+not|doesn'?t)\s+(clearly\s+)?(show|demonstrate|evidence)\s+/i,
  /^there\s+is\s+(no|limited)\s+(explicit\s+)?(evidence|proof)\s+(of|for)\s+/i,
  /^no\s+(explicit|direct|clear)\s+(evidence|proof|experience)\s+(of|with|in|for)\s+/i,
  /^no\s+direct\s+experience\s+(with|in)\s+/i,
  /^no\s+evidence\s+of\s+/i,
  /^(the\s+)?posting\s+requires?\s+(?:\d+\+?\s*years?\s+(?:of\s+)?)?/i,
  /^(the\s+)?role\s+requires?\s+/i,
  /^requires?\s+(?:\d+\+?\s*years?\s+(?:of\s+)?)?/i,
  /^(the\s+)?(job|role|posting|position)\s+calls?\s+for\s+/i,
  /^(lacks?|missing|limited|lack\s+of)\s+/i,
  /^no\s+/i,
];

/**
 * "X, but limited evidence of Y" — the gap is Y, not X. The head clause is
 * usually a compliment, and taking it as the subject asks the user to prove
 * something the evaluator already credited them with.
 */
const CONTRAST_FORMS = [
  /,?\s+(?:but|though|although|however)\s+(?:with\s+)?(?:only\s+)?(?:limited|no|little|insufficient)\s+(?:explicit\s+|direct\s+|clear\s+)?(?:evidence|experience|proof)\s+(?:of|with|in|for)\s+(.+)$/i,
];

const TRAILING_COMPLAINTS = [
  /\s+(is|are)\s+not\s+(clearly\s+)?(demonstrated|stated|shown|evidenced|documented|provided|present)\.?$/i,
  /\s+(is|are)\s+not\s+(clearly\s+)?evidenced\s+in\s+the\s+(provided\s+)?resume\.?$/i,
  // "No X … is stated" — stripping the leading "No" strands the positive tail.
  /\s+(is|are)\s+(clearly\s+)?(demonstrated|stated|shown|evidenced|documented|provided|present)\.?$/i,
  /,?\s+(though|although)\s+.+$/i,
  /,?\s+but\s+(limited|no)\s+.+$/i,
  // A conjunction left dangling once its clause was stripped.
  /[,\s]+(but|though|although|however|and|or|while)\s*$/i,
];

/**
 * The subject of a gap, or "" when the sentence resists reduction and any
 * derived phrasing would read worse than a generic question.
 */
export function gapSubject(gapText: string): string {
  // Drop the "; the resume shows…" half evaluators append after a semicolon.
  let subject = gapText.split(/;\s*/)[0].trim();

  // Contrast form wins outright — the trailing clause is the actual gap.
  for (const pattern of CONTRAST_FORMS) {
    const match = subject.match(pattern);
    if (match?.[1]) {
      subject = match[1].trim();
      break;
    }
  }

  for (const pattern of LEADING_COMPLAINTS) {
    if (pattern.test(subject)) {
      subject = subject.replace(pattern, "").trim();
      break;
    }
  }
  for (const pattern of TRAILING_COMPLAINTS) {
    subject = subject.replace(pattern, "").trim();
  }

  subject = subject.replace(/\.$/, "").trim();

  // A subject that still contains the complaint verb was not reduced, and a
  // one-word remainder carries no meaning. Both are better served generically.
  if (/\b(does not|doesn'?t|no explicit|not demonstrated|not stated)\b/i.test(subject)) return "";
  if (subject.split(/\s+/).filter(Boolean).length < 2) return "";

  return subject;
}

/** The gap restated as a question the user can answer directly. */
export function gapAsQuestion(gapText: string): string {
  const subject = gapSubject(gapText);
  if (!subject) return "What experience do you have here?";
  return `What experience do you have with ${subject.charAt(0).toLowerCase()}${subject.slice(1)}?`;
}
