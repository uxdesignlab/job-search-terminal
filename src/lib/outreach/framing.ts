/** Locked rules shared by every AI outreach path, including custom prompt overrides. */
export const ORGANIZATION_FIRST_MESSAGE_RULES = `Organization-first framing is mandatory:
- Start with the organization's or team's specific need, challenge, or desired outcome.
- State how the candidate can help move that outcome forward.
- Use the candidate's background only as evidence for that contribution, never as the subject of the message.
- Do not open with "I am", "I'm", "I have", "I've", "My background", "My experience", "As a", or a years-of-experience summary.
- Do not write a biography, credentials list, or compressed resume.
- If the context does not support a company-specific claim, stay grounded in the needs stated in the role instead of inventing one.
- For email, make the subject about the role or organization outcome, not the candidate's identity.`;

export class OutreachFramingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutreachFramingError";
  }
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openingWithoutGreeting(message: string): string {
  return message
    .trim()
    .replace(/^hi\s+[^,!.?]{1,60}[,!.?]\s*/i, "")
    .trim();
}

/** Return a plain-language correction when a draft centers the candidate instead of the employer. */
export function organizationFirstIssue(message: string, company: string): string | null {
  const text = openingWithoutGreeting(message);
  if (!text) return "The message is empty.";

  if (/^(?:i am|i'm|i’ve|i've|i have|i’ve|i've|my background|my experience|as (?:an?|the)|with \d)/i.test(text)) {
    return "The message opens with the candidate's identity or background.";
  }

  const opening = text.slice(0, 220);
  const companyPattern = company.trim() ? new RegExp(`\\b${escapedRegex(company.trim())}\\b`, "i") : null;
  const namesOrganization = Boolean(companyPattern?.test(opening))
    || /\b(your team|your organization|your company|this role|the role|the team|the organization)\b/i.test(opening);
  if (!namesOrganization) {
    return "The opening does not name the organization, team, role, or outcome it needs help with.";
  }

  const contribution = /\bi (?:can|could|would) (?:help|support|advance|strengthen|scale|improve|build|deliver|translate|enable|reduce|guide|shape|solve|contribute)\b/i.test(text)
    || /\bi bring\b.{0,100}\b(?:to help|to support|that can help|that could help)\b/i.test(text);
  if (!contribution) {
    return "The message does not clearly state how the candidate can help the organization.";
  }

  return null;
}

export function assertOrganizationFirstMessage(message: string, company: string): void {
  const issue = organizationFirstIssue(message, company);
  if (issue) throw new OutreachFramingError(issue);
}

export function assertOrganizationFirstSubject(subject: string, company: string, role: string): void {
  const clean = subject.trim();
  if (!clean) throw new OutreachFramingError("The email subject is empty.");
  if (/^(?:i am|i'm|my background|my experience|experienced|seasoned|senior|design leader|product leader)/i.test(clean)) {
    throw new OutreachFramingError("The email subject summarizes the candidate instead of the role or organization need.");
  }

  const companyWords = normalizedTerms(company);
  const roleWords = normalizedTerms(role);
  const subjectWords = new Set(normalizedTerms(clean));
  if (![...companyWords, ...roleWords].some((word) => subjectWords.has(word))) {
    throw new OutreachFramingError("The email subject does not connect to the organization or role.");
  }
}

function normalizedTerms(value: string): string[] {
  const stop = new Set(["the", "and", "for", "with", "senior", "sr", "director"]);
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stop.has(word));
}

/** Keep the role-specific part of a long posting near the top of the outreach prompt. */
export function organizationNeedExcerpt(description: string): string {
  const clean = description.trim();
  if (!clean) return "";
  const anchor = clean.search(/\b(?:about the role|the opportunity|what you(?:'|’)ll do|what you will do)\b/i);
  return clean.slice(anchor >= 0 ? anchor : 0, (anchor >= 0 ? anchor : 0) + 2400).trim();
}
