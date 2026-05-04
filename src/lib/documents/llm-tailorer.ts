import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { EvaluationRecord, JobRecord, UserProfileRecord } from "../db/types";
import { getWritingStyle } from "../db/queries";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";

type TailoredSummary = {
  summary: string;
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

export async function tailorResumeWithAI(
  job: JobRecord,
  evaluation: EvaluationRecord,
  _profile: UserProfileRecord,
  sourceResumeText: string,
  gapResponses?: GapResponseContext[],
  supplements?: SupplementContext[]
): Promise<TailoredSummary> {
  const provider = getActiveProvider();
  const keywordLines = buildKeywordsBlock(evaluation.keywords.slice(0, 12));
  const strengthLines = buildStrengthsBlock(evaluation.strengths.slice(0, 4));
  const archetype = evaluation.roleArchetype;
  const styleContextBlock = buildStyleContextBlock();
  const gapContext = buildGapContext(gapResponses, supplements);

  const resumeExcerpt =
    sourceResumeText.length > MAX_RESUME_PROMPT_CHARS
      ? `${sourceResumeText.slice(0, MAX_RESUME_PROMPT_CHARS)}\n\n[Resume excerpt truncated; only use claims supported by the text above.]`
      : sourceResumeText;

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a professional resume writer specializing in truthful, ATS-aware resume tailoring.

PRIMARY TASK:
Rewrite ONLY the Professional Summary section.

STRICT RULES — violating any rule is a failure:
1. Rewrite ONLY the Professional Summary section.
2. Do NOT touch, move, reorder, rewrite, summarize, or reinterpret any experience bullet points.
3. Do NOT invent, fabricate, exaggerate, or imply any achievement, metric, skill, company, title, industry, credential, degree, tool, certification, responsibility, date, or seniority that is not explicitly supported by the candidate source data.
4. Do NOT move content from one job role, project, company, or time period to another.
5. Do NOT describe the candidate as having held the target job title unless that title or equivalent seniority/domain is clearly supported by the resume.
6. Do NOT use vague hype such as "visionary," "world-class," "rockstar," "guru," "unparalleled," "proven track record," or "results-driven" unless the phrase is directly supported and still necessary.
7. ATS keywords, candidate strengths, archetype, and gap responses are suggestions only. You must verify each one against the source resume or user-confirmed gap responses before using it.
8. If fewer than 3 ATS keywords are genuinely supported, use fewer than 3. Truth beats keyword stuffing.
9. If the source evidence is thin, write a conservative summary rather than stretching the candidate's background.
10. The summary must be grounded solely in the candidate's actual background from the source resume and user-confirmed gap responses.

STYLE RULES:
- Use 2–4 sentences.
- Lead with the candidate's actual seniority, discipline, and domain.
- Write in third person or implied third person; do not start with "I."
- Keep it specific, plain, and recruiter-readable.
- Prefer concrete domains, tools, methods, outcomes, and scope when supported.
- Use natural ATS language, not keyword dumping.${styleContextBlock}`
    },
    {
      role: "user",
      content: `Write a tailored Professional Summary for this candidate applying to the role below.

## Target Role
Title: ${job.title}
Company: ${job.company}
Archetype: ${archetype}

## Candidate Signals to Verify Before Use
ATS keywords to consider (use only if supported by the source resume or gap responses):
${keywordLines}

Candidate strengths to consider (use only if supported):
${strengthLines}

## Candidate Source Resume
${resumeExcerpt}${gapContext}

## Output Requirements
Return valid JSON only.

JSON shape:
{ "summary": "2–4 sentence tailored professional summary." }`
    }
  ];

  const result = await withRetry(() =>
    provider.generateJSON<{ summary: string }>(
      messages,
      '{"summary":"string"}'
    )
  );

  return { summary: result.summary || "" };
}
