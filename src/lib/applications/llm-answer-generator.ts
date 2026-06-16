import { createHash } from "node:crypto";
import { getAIPromptText, renderPromptTemplate } from "../ai/prompt-registry";
import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import {
  getApplicationAnswerDrafts,
  getEvaluationByJobId,
  getJobById,
  getJobGapResponses,
  getStories,
  getUserProfile,
  getWritingStyle,
  saveApplicationAnswerDrafts
} from "../db/queries";
import type { ApplicationAnswerDraftInput } from "../db/types";
import { evaluateJob } from "../evaluation/job-evaluator";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";

export async function prepareApplicationAnswersWithAI(jobId: string, customQuestions: string[] = []) {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  let evaluation = getEvaluationByJobId(jobId);
  if (!evaluation) {
    evaluateJob(jobId);
    evaluation = getEvaluationByJobId(jobId);
  }
  if (!evaluation) throw new Error(`Evaluation not found: ${jobId}`);

  const profile = getUserProfile();
  const stories = getStories().slice(0, 5);
  const writingStyle = getWritingStyle();
  const gapResponses = getJobGapResponses(jobId).filter((r) => r.qualityStatus === "addressed");

  const provider = getActiveProvider();

  const storyContext = stories.length > 0
    ? `\n\nSTAR Stories available:\n${stories.map((s) => `- ${s.title}: ${s.situation} → ${s.result}`).join("\n")}`
    : "";

  const styleContext = writingStyle.toneProfile
    ? `\n\n${formatStyleForPrompt(writingStyle.toneProfile)}`
    : "";

  const gapContext = gapResponses.length > 0
    ? `\n\nAddressed gaps and red flags (use these to strengthen answers where relevant — treat as verified evidence the candidate can speak to):\n${gapResponses.map((r) => `- Gap: "${r.gapText}"\n  Response: ${r.polishedResponse || r.rawResponse}`).join("\n")}`
    : "";

  const systemPrompt = `You are an experienced career coach helping a candidate write authentic, compelling job application answers. Your goal is to craft responses that sound genuinely human — not AI-generated — and are specific enough to earn an interview callback.

Rules:
- Write in first person with a natural, conversational-yet-professional voice
- Never open with "I am", "I'm", "As a", or "With X years of experience"
- Vary sentence length; mix short punchy statements with longer elaborations
- Be concrete: name the company and role, cite real evidence from the candidate's background
- Avoid corporate buzzwords (leverage, synergize, passionate about, etc.)
- Each answer should feel like it came from a thoughtful human who has done their research
- Keep answers 2–5 sentences; under 150 words
- Draw only from the candidate context provided — never fabricate credentials

Candidate: ${profile.name}
Goal: ${profile.currentSearchGoal}
Strengths: ${profile.strongestSkills.slice(0, 5).join(", ")}
Compensation target: ${profile.compensationNeeds || "flexible"}
Work preferences: ${profile.workPreferences.join(", ")}
Role evaluation: ${evaluation.summary}
Top strengths for this role: ${evaluation.strengths.slice(0, 4).join("; ")}
Resume evidence: ${evaluation.resumeEvidence.slice(0, 3).join("; ")}${storyContext}${gapContext}${styleContext}`;

  const commonQuestions = [
    "Why are you interested in this role?",
    "Why are you a strong fit for this role?",
    "Tell us about yourself.",
    "What compensation range are you looking for?",
    "Do you have any location or work authorization constraints?"
  ];

  for (const q of customQuestions) {
    if (q.trim()) commonQuestions.push(q.trim());
  }

  const userPrompt = renderPromptTemplate(getAIPromptText("application_answers"), {
    role: job.title,
    company: job.company,
    location: job.location,
    remoteType: job.remoteType,
    salaryNotes: job.salaryNotes,
    questions: commonQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
  });

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: userPrompt
    }
  ];

  const result = await withRetry(() =>
    provider.generateJSON<{ answers: string[] }>(messages, '{"answers":[]}')
  );

  const answers = result.answers ?? [];

  const drafts: ApplicationAnswerDraftInput[] = commonQuestions.map((question, index) => ({
    id: `answer-${jobId}-${stableId(question)}`,
    jobId,
    question,
    answer: answers[index] ?? fallbackAnswer(question, job.company, job.title, profile.name),
    source: `AI-generated · ${provider.name} / ${provider.effectiveModel}`,
    sortOrder: index,
    providerUsed: provider.name,
    modelUsed: provider.effectiveModel
  }));

  saveApplicationAnswerDrafts(drafts);
  return getApplicationAnswerDrafts(jobId);
}

function fallbackAnswer(question: string, company: string, role: string, name: string) {
  return `[Answer for "${question}" at ${company} — ${role}] — ${name}`;
}

function stableId(value: string) {
  return createHash("sha1").update(value.toLowerCase()).digest("hex").slice(0, 12);
}
