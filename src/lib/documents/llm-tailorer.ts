import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { EvaluationRecord, JobRecord, UserProfileRecord } from "../db/types";
import { getWritingStyle } from "../db/queries";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";

type TailoredSummary = {
  summary: string;
};

export async function tailorResumeWithAI(
  job: JobRecord,
  evaluation: EvaluationRecord,
  profile: UserProfileRecord,
  sourceResumeText: string
): Promise<TailoredSummary> {
  const provider = getActiveProvider();
  const keywords = evaluation.keywords.slice(0, 12).join(", ");
  const strengths = evaluation.strengths.slice(0, 4).join("; ");
  const archetype = evaluation.roleArchetype;
  const writingStyle = getWritingStyle();
  const styleContext = writingStyle.toneProfile
    ? `\n\n${formatStyleForPrompt(writingStyle.toneProfile)}`
    : "";

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a professional resume writer specializing in ATS-optimized tailoring.

STRICT RULES — violating any of these is a failure:
1. You may ONLY rewrite the Professional Summary section.
2. Do NOT touch, move, reorder, or rewrite any experience bullet points.
3. Do NOT invent, fabricate, or imply any achievement, metric, skill, company, title, or date that is not explicitly stated in the source resume text.
4. Do NOT move content from one job role to another.
5. The summary must be grounded solely in the candidate's actual background as written in the source resume.${styleContext}`
    },
    {
      role: "user",
      content: `Write a tailored Professional Summary for this candidate applying to the role below.

## Target Role
Title: ${job.title}
Company: ${job.company}
Archetype: ${archetype}
ATS keywords to weave in naturally (only where they already fit the candidate's background): ${keywords}
Candidate's relevant strengths for this role: ${strengths}

## Candidate's Source Resume
${sourceResumeText.slice(0, 5000)}

## Instructions
- Write 2–4 sentences.
- Lead with the candidate's actual seniority and domain.
- Incorporate 3–5 of the ATS keywords naturally only if they are supported by the source resume.
- Do not start with "I".
- Do not make up or imply any experience that is not in the source resume.

Return a JSON object: { "summary": "..." }`
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
