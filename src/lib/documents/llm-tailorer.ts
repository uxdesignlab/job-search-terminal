import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { EvaluationRecord, JobRecord, UserProfileRecord } from "../db/types";
import type { ResumeTemplateInput } from "./resume-template";

type TailoredContent = Pick<ResumeTemplateInput, "summary"> & {
  reorderedBulletMap: Record<string, string[]>; // orgKey -> reordered bullets
  keywords: string[];
};

export async function tailorResumeWithAI(
  job: JobRecord,
  evaluation: EvaluationRecord,
  profile: UserProfileRecord,
  sourceResumeText: string
): Promise<TailoredContent> {
  const provider = getActiveProvider();
  const keywords = evaluation.keywords.slice(0, 12).join(", ");
  const strengths = evaluation.strengths.slice(0, 4).join("; ");
  const archetype = evaluation.roleArchetype;

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a professional resume writer specializing in ATS-optimized tailoring. Rewrite resume content to match a specific job posting. Be specific and evidence-based — only use information present in the source resume text. Do not invent achievements or skills.`
    },
    {
      role: "user",
      content: `Tailor this resume for the following job posting.

## Target Job
Title: ${job.title}
Company: ${job.company}
Role archetype: ${archetype}
Key keywords to weave in: ${keywords}
Candidate strengths for this role: ${strengths}

## Source Resume Text
${sourceResumeText.slice(0, 6000)}

Return a JSON object with:
- "summary": string — rewritten professional summary (2-4 sentences) that leads with the role archetype, incorporates 3-5 keywords naturally, and connects the candidate's strongest evidence to this specific job. Do not start with "I".
- "topBullets": string[] — the 6-8 most relevant existing bullet points from the experience section, lightly reworded to emphasize the role keywords where natural. Preserve the original achievement data exactly — only reorder words or swap synonyms to match keywords. Do not fabricate metrics.
- "keywords": string[] — the 10-15 ATS keywords from the job posting that appear in or were woven into the resume`
    }
  ];

  const result = await withRetry(() =>
    provider.generateJSON<{ summary: string; topBullets: string[]; keywords: string[] }>(
      messages,
      '{"summary":"string","topBullets":[],"keywords":[]}'
    )
  );

  return {
    summary: result.summary || "",
    reorderedBulletMap: { top: result.topBullets || [] },
    keywords: result.keywords || evaluation.keywords
  };
}
