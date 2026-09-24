import type { ApplicationRequirement, EvaluationRecord, JobKeywordSignal, JobRecord, SkillRecord } from "../db/types";
import { getWritingStyle } from "../db/queries";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";
import type { ResumeTemplateInput } from "./resume-template";

/**
 * Prompt blocks for resume writing, shared by every part the unit writer produces
 * (`resume-unit-writer.ts`) and by section Improve / Regenerate. Each block renders one
 * kind of context and returns "" when it has nothing to say, so a prompt never carries
 * an empty heading.
 */

export type GapResponseContext = {
  gapText: string;
  rawResponse: string;
  polishedResponse: string;
};

export type SupplementContext = {
  content: string;
};

/**
 * The posting is context for the complete evaluated qualification list and the
 * preparation keywords. The raw copy can be shorter because those structured
 * lists carry requirements that occur near the end of a long posting.
 */
const MAX_JD_TAILORING_CHARS = 6000;
const MAX_REQUIREMENTS = 20;



export function buildGapContext(
  gapResponses?: GapResponseContext[],
  supplements?: SupplementContext[]
): string {
  const parts: string[] = [];

  const addressed = (gapResponses ?? []).filter((r) => r.polishedResponse || r.rawResponse);
  if (addressed.length > 0) {
    parts.push("## Candidate's Responses to Identified Gaps");
    for (const g of addressed) {
      parts.push(`- Gap: "${g.gapText}"\n  Notes: ${g.polishedResponse || g.rawResponse}`);
    }
  }

  const active = (supplements ?? []).filter((s) => s.content.trim());
  if (active.length > 0) {
    parts.push("## Additional Profile Context");
    for (const s of active) {
      parts.push(`- ${s.content}`);
    }
  }

  return parts.length > 0 ? `\n\n${parts.join("\n")}` : "";
}

export function buildKeywordsBlock(keywords: string[]): string {
  if (keywords.length === 0) {
    return "(None listed — rely on the source resume only.)";
  }
  return keywords.map((k) => `- ${k}`).join("\n");
}

export function buildStrengthsBlock(strengths: string[]): string {
  if (strengths.length === 0) {
    return "(None listed.)";
  }
  return strengths.map((s) => `- ${s}`).join("\n");
}

export function buildSkillsPreferenceBlock(skills: SkillRecord[]): string {
  const emphasize = skills.filter((s) => s.usePreference === "use_more").map((s) => s.skillName);
  const deemphasize = skills.filter((s) => s.usePreference === "use_less").map((s) => s.skillName);
  const parts: string[] = [];
  if (emphasize.length > 0) parts.push(`Skills to emphasize (candidate wants more of these): ${emphasize.join(", ")}`);
  if (deemphasize.length > 0) parts.push(`Skills to de-emphasize (candidate wants less of these): ${deemphasize.join(", ")}`);
  return parts.length > 0 ? `\n\nSKILLS PREFERENCE:\n${parts.join("\n")}` : "";
}

export function buildJobDescriptionBlock(job: JobRecord): string {
  const description = (job.rawDescription || job.parsedDescription || "").trim();
  if (!description) return "";
  return `\n\n## Job Description (Reference for Keyword Context)\n${description.slice(0, MAX_JD_TAILORING_CHARS)}${description.length > MAX_JD_TAILORING_CHARS ? "\n[Truncated — use the evaluated qualifications and preparation requirements above for the rest of the posting.]" : ""}`;
}

/** The posting's requirements as preparation read them, one line each. */
export function buildRequirementsBlock(requirements: ApplicationRequirement[]): string {
  if (requirements.length === 0) return "";
  const lines = requirements
    .slice(0, MAX_REQUIREMENTS)
    .map((requirement) => `- ${requirement.text} [${requirement.type.replace("_", " ")}; evidence: ${requirement.evidenceStatus}]`);
  return `\n\n## What This Posting Requires\n${lines.join("\n")}`;
}

/** The saved evaluation's full qualification checklist is never capped by preparation. */
export function buildEvaluationRequirementsBlock(evaluation: EvaluationRecord, requirements: ApplicationRequirement[]): string {
  const matches = evaluation.modelOutput?.requirementMatches ?? [];
  if (matches.length === 0) return buildRequirementsBlock(requirements);
  const lines = matches
    .filter((match) => match.requirement.trim())
    .map((match) => `- ${match.requirement.trim()} [evaluation: ${match.status}]`);
  const evaluated = new Set(matches.map((match) => match.requirement.trim().toLowerCase()));
  const additional = requirements
    .filter((requirement) => !evaluated.has(requirement.text.trim().toLowerCase()))
    .slice(0, MAX_REQUIREMENTS)
    .map((requirement) => `- ${requirement.text} [${requirement.type.replace("_", " ")}; preparation evidence: ${requirement.evidenceStatus}]`);
  return `\n\n## Evaluated Qualifications (complete saved checklist)\nThese labels are an AI assessment, not proof of candidate experience. Use only the approved resume and confirmed answers to make claims. Partial or unknown qualifications must not be presented as met without that evidence.\n${lines.join("\n")}${additional.length ? `\n\n## Other Posting Requirements from Application Preparation\n${additional.join("\n")}` : ""}`;
}

/**
 * The parts of the approved resume this call is not rewriting, as evidence only.
 *
 * This replaced a 5,000-character excerpt of the source PDF, which repeated the
 * selected sections the prompt already carried in full — and, being cut at a
 * character count, dropped exactly the later sections (skills, education) that are
 * the evidence the rewrite could not otherwise see.
 */
export function buildBackgroundBlock(sourceDraft: ResumeTemplateInput, selected: {
  summary?: string;
  impactItems?: string[];
  experience?: unknown;
  extraSections: Array<{ title: string }>;
}, heading = "## Candidate Background (not being rewritten — evidence only)"): string {
  const selectedExtra = new Set(selected.extraSections.map((section) => section.title));
  const parts: string[] = [];
  if (sourceDraft.headline) parts.push(`Headline: ${sourceDraft.headline}`);
  if (selected.summary === undefined && sourceDraft.summary) parts.push(`Summary: ${sourceDraft.summary}`);
  if (selected.impactItems === undefined && sourceDraft.impactItems.length > 0) {
    parts.push(`${sourceDraft.impactHeading}:\n${sourceDraft.impactItems.map((item) => `- ${item}`).join("\n")}`);
  }
  if (selected.experience === undefined && sourceDraft.experience.length > 0) {
    parts.push(`Experience:\n${sourceDraft.experience.map((entry) =>
      `${entry.title}, ${entry.organization} (${entry.dateRange})\n${entry.bullets.map((bullet) => `- ${bullet}`).join("\n")}`
    ).join("\n")}`);
  }
  if (sourceDraft.skills.length > 0) parts.push(`Skills:\n${sourceDraft.skills.map((item) => `- ${item}`).join("\n")}`);
  if (sourceDraft.recognition.length > 0) parts.push(`Recognition:\n${sourceDraft.recognition.map((item) => `- ${item}`).join("\n")}`);
  for (const section of sourceDraft.extraSections ?? []) {
    if (selectedExtra.has(section.title) || section.items.length === 0) continue;
    parts.push(`${section.title}:\n${section.items.map((item) => `- ${item}`).join("\n")}`);
  }
  if (sourceDraft.education.length > 0) {
    parts.push(`Education:\n${sourceDraft.education.map((entry) => `- ${[entry.degree, entry.school, entry.focus].filter(Boolean).join(", ")}`).join("\n")}`);
  }
  return parts.length > 0 ? `${heading}\n${parts.join("\n\n")}` : "";
}

export function buildStyleContextBlock(): string {
  const writingStyle = getWritingStyle();
  if (!writingStyle.toneProfile) {
    return "";
  }
  const formatted = formatStyleForPrompt(writingStyle.toneProfile).trim();
  if (!formatted) {
    return "";
  }
  return `

STYLE CONTEXT:
The following style guidance may influence tone only. It must never override factual accuracy, source grounding, or the strict rules above:
${formatted}`;
}

export function buildMissingKeywordsBlock(missingKeywords: string[]): string {
  if (missingKeywords.length === 0) return "";
  return `\n\nKeywords absent from current draft — prioritize weaving these in:\n${missingKeywords.map((k) => `- ${k}`).join("\n")}`;
}

// The model was only ever told what the draft was missing. Without the other
// half it would paraphrase a phrase that already matched — "service design"
// becoming "service maps" — and the rewrite came back with fewer matches than
// the untouched resume.
export function buildProtectedKeywordsBlock(protectedKeywords: string[]): string {
  if (protectedKeywords.length === 0) return "";
  return `\n\n### Job language already present — keep the phrase, not the sentence:\n` +
    `These exact phrases already appear in the text you are rewriting and already match the posting. Rewrite those lines as freely as any other — reorder, tighten, sharpen, change the framing — but make sure each phrase below still appears verbatim somewhere in the section that carried it. This is a constraint on wording, never a reason to leave a line unchanged.\n` +
    protectedKeywords.map((k) => `- ${k}`).join("\n");
}

export function buildKeywordStrategyBlock(
  allKeywords: JobKeywordSignal[],
  confirmedKeywords: string[],
  missingFromDraft: string[]
): string {
  const confirmedSet = new Set(confirmedKeywords.map((k) => k.toLowerCase()));
  const missingSet = new Set(missingFromDraft.map((k) => k.toLowerCase()));

  const confirmedList = allKeywords.filter((signal) => confirmedSet.has(signal.keyword.toLowerCase()));
  const candidateList = allKeywords.filter((signal) => !confirmedSet.has(signal.keyword.toLowerCase()));
  const confirmedMissing = confirmedList.filter((signal) => missingSet.has(signal.keyword.toLowerCase()));

  const parts: string[] = [];

  const highPriorityConfirmed = confirmedList.filter((signal) => signal.priority !== "preferred");
  const preferredConfirmed = confirmedList.filter((signal) => signal.priority === "preferred");
  if (highPriorityConfirmed.length > 0) {
    parts.push(
      `### Evidence-supported, high-priority job language:\n` +
      `Use these naturally where they make the candidate's actual evidence clearer. Preserve exact wording when it reads well, because literal recruiter searches may use it. Do not force every phrase or repeat it mechanically.\n` +
      highPriorityConfirmed.map((signal) => `- ${signal.keyword} [${signal.priority}; ${signal.category}] — ${signal.rationale}`).join("\n")
    );
  }

  if (preferredConfirmed.length > 0) {
    parts.push(
      `### Evidence-supported, preferred language — optional:\n` +
      preferredConfirmed.map((signal) => `- ${signal.keyword} [${signal.category}]`).join("\n")
    );
  }

  if (candidateList.length > 0) {
    parts.push(
      `### Job requirements not confirmed in candidate evidence — treat as gaps, not insertion targets:\n` +
      candidateList.map((signal) => `- ${signal.keyword} [${signal.priority}; ${signal.category}]`).join("\n")
    );
  }

  if (confirmedMissing.length > 0) {
    const critical = confirmedMissing.filter((signal) => signal.priority === "critical");
    const rest = confirmedMissing.filter((signal) => signal.priority !== "critical");
    if (critical.length > 0) {
      parts.push(
        `### Must-have job language the candidate's evidence supports but the draft does not yet state:\n` +
        `Work each of these into the selected sections unless doing so would misstate the evidence. These are the phrases the posting screens on, and the draft currently misses them.\n` +
        critical.map((signal) => `- ${signal.keyword} [${signal.category}]`).join("\n")
      );
    }
    if (rest.length > 0) {
      parts.push(
        `### Supported phrases absent from the draft — consider only when relevant to the selected section:\n` +
        rest.map((signal) => `- ${signal.keyword}`).join("\n")
      );
    }
  }

  return parts.length > 0 ? `## ATS Keywords\n${parts.join("\n\n")}` : "";
}

export function buildJobGapsBlock(gaps: string[], redFlags: string[]): string {
  const parts: string[] = [];
  const addressableGaps = gaps.slice(0, 5);
  const topRedFlags = redFlags.slice(0, 3);
  if (addressableGaps.length > 0) {
    parts.push(`Gaps to address if source resume supports it:\n${addressableGaps.map((g) => `- ${g}`).join("\n")}`);
  }
  if (topRedFlags.length > 0) {
    parts.push(`Red flags to mitigate (reframe where factually defensible):\n${topRedFlags.map((f) => `- ${f}`).join("\n")}`);
  }
  return parts.length > 0 ? `\n\n## Job-Specific Gaps\n${parts.join("\n\n")}` : "";
}
