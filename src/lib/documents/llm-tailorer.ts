import { getActiveProvider } from "../ai/factory";
import { getAIPromptText, renderPromptTemplate } from "../ai/prompt-registry";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { EvaluationRecord, JobKeywordSignal, JobRecord, ResumeSectionModeInput, SkillRecord, UserProfileRecord } from "../db/types";
import { getWritingStyle } from "../db/queries";
import { keywordMatchTier } from "./keyword-coverage";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";
import type { ResumeTemplateInput } from "./resume-template";

export type TailoredResumeSections = {
  summary?: string;
  impactItems?: string[];
  experience?: Array<{ index: number; bullets: string[] }>;
  extraSections?: Array<{ title: string; items: string[] }>;
};

type GapResponseContext = {
  gapText: string;
  rawResponse: string;
  polishedResponse: string;
};

type SupplementContext = {
  content: string;
};

const MAX_RESUME_PROMPT_CHARS = 5000;
const MAX_JD_TAILORING_CHARS = 10000;

function buildGapContext(
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

function buildKeywordsBlock(keywords: string[]): string {
  if (keywords.length === 0) {
    return "(None listed — rely on the source resume only.)";
  }
  return keywords.map((k) => `- ${k}`).join("\n");
}

function buildStrengthsBlock(strengths: string[]): string {
  if (strengths.length === 0) {
    return "(None listed.)";
  }
  return strengths.map((s) => `- ${s}`).join("\n");
}

function buildSkillsPreferenceBlock(skills: SkillRecord[]): string {
  const emphasize = skills.filter((s) => s.usePreference === "use_more").map((s) => s.skillName);
  const deemphasize = skills.filter((s) => s.usePreference === "use_less").map((s) => s.skillName);
  const parts: string[] = [];
  if (emphasize.length > 0) parts.push(`Skills to emphasize (candidate wants more of these): ${emphasize.join(", ")}`);
  if (deemphasize.length > 0) parts.push(`Skills to de-emphasize (candidate wants less of these): ${deemphasize.join(", ")}`);
  return parts.length > 0 ? `\n\nSKILLS PREFERENCE:\n${parts.join("\n")}` : "";
}

function buildJobDescriptionBlock(job: JobRecord): string {
  const description = (job.rawDescription || job.parsedDescription || "").trim();
  if (!description) return "";
  return `\n\n## Job Description (Reference for Keyword Context)\n${description.slice(0, MAX_JD_TAILORING_CHARS)}${description.length > MAX_JD_TAILORING_CHARS ? "\n[Truncated — use keywords as the primary signal for requirements beyond this excerpt.]" : ""}`;
}

function buildStyleContextBlock(): string {
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

function buildMissingKeywordsBlock(missingKeywords: string[]): string {
  if (missingKeywords.length === 0) return "";
  return `\n\nKeywords absent from current draft — prioritize weaving these in:\n${missingKeywords.map((k) => `- ${k}`).join("\n")}`;
}

// The model was only ever told what the draft was missing. Without the other
// half it would paraphrase a phrase that already matched — "service design"
// becoming "service maps" — and the rewrite came back with fewer matches than
// the untouched resume.
function buildProtectedKeywordsBlock(protectedKeywords: string[]): string {
  if (protectedKeywords.length === 0) return "";
  return `\n\n### Job language already present — keep the phrase, not the sentence:\n` +
    `These exact phrases already appear in the text you are rewriting and already match the posting. Rewrite those lines as freely as any other — reorder, tighten, sharpen, change the framing — but make sure each phrase below still appears verbatim somewhere in the section that carried it. This is a constraint on wording, never a reason to leave a line unchanged.\n` +
    protectedKeywords.map((k) => `- ${k}`).join("\n");
}

function buildKeywordStrategyBlock(
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

function buildJobGapsBlock(gaps: string[], redFlags: string[]): string {
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

export async function tailorResumeWithAI(
  job: JobRecord,
  evaluation: EvaluationRecord,
  profile: UserProfileRecord,
  sourceResumeText: string,
  sourceDraft: ResumeTemplateInput,
  sectionModes: ResumeSectionModeInput[],
  gapResponses?: GapResponseContext[],
  supplements?: SupplementContext[],
  skills?: SkillRecord[],
  missingKeywords?: string[],
  confirmedKeywords?: string[],
  keywordSignals: JobKeywordSignal[] = [],
  protectedKeywords: string[] = []
): Promise<TailoredResumeSections> {
  const provider = getActiveProvider();
  // Resolved by the caller through the shared resolver (§25). Re-deriving the
  // chain here is how the tailorer and the generator drifted apart.
  const sortedKeywords = keywordSignals;
  const confirmed = confirmedKeywords ?? [];
  const keywordStrategyBlock = buildKeywordStrategyBlock(sortedKeywords, confirmed, missingKeywords ?? []);
  // Legacy blocks kept for fallback path when no confirmed keywords are supplied
  const keywordLines = confirmed.length === 0 ? buildKeywordsBlock(sortedKeywords.map((signal) => signal.keyword)) : "";
  const missingKeywordsBlock = confirmed.length === 0 ? buildMissingKeywordsBlock(missingKeywords ?? []) : "";
  const jobGapsBlock = buildJobGapsBlock(evaluation.gaps ?? [], evaluation.redFlags ?? []);
  const strengthLines = buildStrengthsBlock(evaluation.strengths.slice(0, 4));
  const archetype = evaluation.roleArchetype;
  const styleContextBlock = buildStyleContextBlock();
  const skillsPreferenceBlock = skills ? buildSkillsPreferenceBlock(skills) : "";
  const jobDescriptionBlock = buildJobDescriptionBlock(job);
  const gapContext = buildGapContext(gapResponses, supplements);
  const modeById = new Map(sectionModes.map((mode) => [mode.sectionId, mode.mode]));
  const userTuningPrompt = renderPromptTemplate(getAIPromptText("resume_tailoring"), {
    company: job.company,
    role: job.title,
    archetype,
    candidate: profile.name
  });
  const selectedSections = {
    summary: modeById.get("summary") === "update" ? sourceDraft.summary : undefined,
    impactItems: modeById.get("impact") === "update" ? sourceDraft.impactItems : undefined,
    experience: modeById.get("experience") === "update" ? sourceDraft.experience : undefined,
    extraSections: (sourceDraft.extraSections ?? []).filter((section) => modeById.get(section.id ?? `custom-${section.title}`) === "update")
  };

  // Scoped to the sections the model can actually see. A phrase that matches only
  // in a section left on "keep" is not something this call can preserve, and
  // listing it would make the instruction false.
  const selectedText = JSON.stringify(selectedSections);
  const protectedInSelection = protectedKeywords.filter(
    (keyword) => keywordMatchTier(selectedText, keyword) === "exact"
  );
  const protectedKeywordsBlock = buildProtectedKeywordsBlock(protectedInSelection);

  const resumeExcerpt =
    sourceResumeText.length > MAX_RESUME_PROMPT_CHARS
      ? `${sourceResumeText.slice(0, MAX_RESUME_PROMPT_CHARS)}\n\n[Resume excerpt truncated; only use claims supported by the text above.]`
      : sourceResumeText;

  const messages: AIMessage[] = [
	    {
	      role: "system",
      content: `You are a professional resume writer specializing in truthful, ATS-aware resume tailoring.

PRIMARY TASK:
Rewrite ONLY the selected resume sections supplied by the user.

WHAT REWRITING MEANS HERE:
The selected sections were selected because they need to speak to this specific posting. Lead with what this employer is hiring for, foreground the evidence that matches it, trim detail that is irrelevant to this role, and state the job's own supported language where it is accurate. Handing back the input text unchanged is not a rewrite — if a line is already right for this posting, sharpen or resequence it rather than leaving the whole section untouched. None of this licenses invention: the rules below still bind, and a truthful unchanged line is always better than an invented new one.

STRICT RULES — violating any rule is a failure:
1. Rewrite ONLY sections that are present in the selected sections JSON.
2. Do NOT add or remove key achievement items.
3. Do NOT add or remove experience entries.
4. Do NOT add or remove bullets within an experience entry.
5. Do NOT move, copy, merge, or reinterpret bullets between positions.
6. Do NOT change company names, job titles, locations, dates, education, credentials, awards, or recognition entries unless they are explicitly present as editable selected section content.
7. Do NOT invent, fabricate, exaggerate, or imply any achievement, metric, skill, company, title, industry, credential, degree, tool, certification, responsibility, date, or seniority that is not explicitly supported by the candidate source data.
8. Do NOT move content from one job role, project, company, or time period to another.
9. Do NOT describe the candidate as having held the target job title unless that title or equivalent seniority/domain is clearly supported by the resume.
10. Do NOT use vague hype such as "visionary," "world-class," "rockstar," "guru," "unparalleled," or "results-driven."
10a. Do NOT open a sentence with a self-assessment of ability. Ban "Expert at," "Expert in," "Proven record," "Proven track record," "Deep expertise," "Mastery of," "Fluent in," "Skilled at," "Adept at," "Passionate about," and "Seasoned." A recruiter discounts self-rating and an ATS gains nothing from it. State what the candidate designed, shipped, or led instead — "Designs multi-role workflows for data-heavy platforms" beats "Expert at workflow design."
11. Evidence-supported job language is a relevance guide, not a checklist. Use the highest-priority phrases only where they accurately describe the candidate's evidence and improve recruiter clarity.
12. Never copy the target title into the candidate's held titles. In the summary, use the exact target title only when the source resume supports that professional identity; otherwise use an honest adjacent description such as "product design leader."
13. Job requirements not confirmed in candidate evidence are gaps. Do not insert them, imply them, or hide them in the skills list.
14. Every rewritten section must be grounded solely in the candidate's actual background from the source resume and user-confirmed gap responses.

STYLE RULES:
- Keep summary to 2–4 sentences when summary is selected.
- Open the summary with the professional identity and evidence, not with a claim about how good the candidate is.
- Do not replace a named specific with a generic paraphrase. Rewriting "multi-persona IVF application" into "an application", or "healthcare, fintech, SaaS, and logistics" into "complex domains", costs recruiter interest and searchable terms for nothing. Cutting a specific that is irrelevant to this posting is fine; blurring one is not.
- Keep bullets concise and recruiter-readable.
- Use third person or implied third person; do not start with "I."
- Keep it specific, plain, and recruiter-readable.
- Prefer concrete domains, tools, methods, outcomes, and scope when supported.
- Use natural ATS language, not keyword dumping.

ATS KEYWORD PLACEMENT STRATEGY (apply only when evidence supports it):
- High-priority title and domain phrases may appear in the SUMMARY only when they truthfully describe the candidate's positioning.
- Tool and methodology keywords belong in SKILLS or within the experience bullet where that tool was actually used.
- Soft skill phrases (e.g. "cross-functional leadership") fit best in the summary or a high-impact bullet — not just the skills list.
- Preserve exact job wording when it is natural and accurate; literal searches benefit from it, while modern matching can also use skills and context.
- If the job title or a close variant is supported by the candidate's background, work it into the summary naturally.
- Avoid repetition and keyword dumping. One clear, contextual use is enough.

USER TUNING PROMPT:
${userTuningPrompt}${styleContextBlock}${skillsPreferenceBlock}`
	    },
	    {
	      role: "user",
      content: `Rewrite the selected resume sections for this candidate applying to the role below.

## Target Role
	Title: ${job.title}
	Company: ${job.company}
	Archetype: ${archetype}

${keywordStrategyBlock}${protectedKeywordsBlock}${keywordLines ? `\n\nATS keywords to consider (use only if supported):\n${keywordLines}${missingKeywordsBlock}` : ""}

Candidate strengths to consider (use only if supported):
${strengthLines}

## Candidate Source Resume
${resumeExcerpt}${gapContext}${jobGapsBlock}${jobDescriptionBlock}

## Selected Sections To Rewrite
${JSON.stringify(selectedSections, null, 2)}

## Output Requirements
Return valid JSON only.

JSON shape:
{
  "summary": "2–4 sentence tailored professional summary when selected",
  "impactItems": ["same number of items as input when selected"],
  "experience": [{ "index": 0, "bullets": ["same number of bullets as that input entry"] }],
  "extraSections": [{ "title": "same title as input", "items": ["same number of items as input"] }]
}`
	    }
		  ];

  const result = await withRetry(() =>
    provider.generateJSON<TailoredResumeSections>(
      messages,
      '{"summary":"string","impactItems":[],"experience":[],"extraSections":[]}'
    )
  );

  return result;
}
