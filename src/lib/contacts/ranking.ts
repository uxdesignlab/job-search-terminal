import type { ContactRecord, ContactRole } from "../db/types";

/**
 * Deterministic contact relevance (PRD v0.2.1 §48).
 *
 * Clay finds people; JST decides which of them matter. Rules rather than a model:
 * §48 is explicit that spending an LLM call to rank five people is not worth it,
 * and rules give the same answer twice and can explain themselves.
 */

const WEIGHTS = {
  functionalProximity: 30,
  hiringAuthority: 25,
  seniorityRelationship: 20,
  teamProximity: 15,
  dataQuality: 10,
} as const;

/** Roles that decide, roles that influence, roles that inform. */
const HIRING_AUTHORITY: Partial<Record<ContactRole, number>> = {
  hiring_manager: 25,
  functional_leader: 20,
  executive: 14,
  recruiter: 12,
  referral: 8,
  peer: 4,
};

const SENIORITY_TERMS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\b(chief|cxo|c-level|founder|co-founder)\b/, score: 14 },
  { pattern: /\b(vp|vice president|svp|evp)\b/, score: 18 },
  { pattern: /\b(head of|director)\b/, score: 20 },
  { pattern: /\b(principal|staff|lead|manager)\b/, score: 14 },
  { pattern: /\b(senior|sr\.?)\b/, score: 9 },
];

export type RankedRelevance = {
  score: number;
  reasons: string[];
};

function overlapWords(a: string, b: string): string[] {
  const stop = new Set(["of", "and", "the", "for", "at", "in", "to", "a", "senior", "lead"]);
  const left = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w)));
  return b.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w) && left.has(w));
}

/**
 * Score one contact against one job. Reasons are returned alongside the number
 * because a bare relevance score tells the user nothing about whether to trust it.
 */
export function rankContact(input: {
  contact: Pick<ContactRecord, "title" | "company" | "companyDomain" | "linkedinUrl" | "workEmail">;
  role: ContactRole;
  job: { title: string; company: string };
}): RankedRelevance {
  const reasons: string[] = [];
  let score = 0;

  const shared = overlapWords(input.job.title, input.contact.title);
  if (shared.length > 0) {
    const points = Math.min(WEIGHTS.functionalProximity, shared.length * 12);
    score += points;
    reasons.push(`Works in the same function (${shared.slice(0, 3).join(", ")})`);
  }

  const authority = HIRING_AUTHORITY[input.role] ?? 0;
  if (authority > 0) {
    score += authority;
    reasons.push(`Role is ${input.role.replace(/_/g, " ")}`);
  }

  const seniority = SENIORITY_TERMS.find((term) => term.pattern.test(input.contact.title.toLowerCase()));
  if (seniority) {
    score += seniority.score;
    reasons.push("Seniority is close to the level of the role");
  }

  // Same employer as the posting — the whole reason this person is relevant.
  if (input.contact.company && input.job.company
      && input.contact.company.toLowerCase().includes(input.job.company.toLowerCase().slice(0, 8))) {
    score += WEIGHTS.teamProximity;
    reasons.push("Works at the hiring company");
  }

  // Contactability is part of relevance: a perfect match with no way to reach
  // them is worth less than a good match you can actually message.
  let quality = 0;
  if (input.contact.linkedinUrl) quality += 6;
  if (input.contact.workEmail) quality += 4;
  if (quality > 0) {
    score += quality;
    reasons.push(input.contact.workEmail && input.contact.linkedinUrl
      ? "LinkedIn and email are both known"
      : input.contact.linkedinUrl ? "LinkedIn profile is known" : "Work email is known");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/** §57: a band and a reason, deliberately not another number to interpret. */
export function outreachRecommendation(score: number): "Recommended" | "Optional" | "Low value" {
  if (score >= 55) return "Recommended";
  if (score >= 30) return "Optional";
  return "Low value";
}
