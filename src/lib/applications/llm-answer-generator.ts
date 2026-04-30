import { createHash } from "node:crypto";
import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import {
  getApplicationAnswerDrafts,
  getEvaluationByJobId,
  getJobById,
  getStories,
  getUserProfile,
  saveApplicationAnswerDrafts
} from "../db/queries";
import type { ApplicationAnswerDraftInput } from "../db/types";
import { evaluateJob } from "../evaluation/job-evaluator";

export async function prepareApplicationAnswersWithAI(jobId: string, customQuestion?: string) {
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

  const provider = getActiveProvider();

  const storyContext = stories.length > 0
    ? `\n\nSTAR Stories available:\n${stories.map((s) => `- ${s.title}: ${s.situation} → ${s.result}`).join("\n")}`
    : "";

  const systemPrompt = `You are a job application coach writing copy-paste ready answers for a job seeker. Write in first person, professional but natural tone. Be specific — reference the actual company name and role. Draw only from the candidate context provided. Never start answers with "I am" or "I'm". Keep answers under 150 words each.

Candidate: ${profile.name}
Goal: ${profile.currentSearchGoal}
Strengths: ${profile.strongestSkills.slice(0, 5).join(", ")}
Compensation target: ${profile.compensationNeeds || "flexible"}
Work preferences: ${profile.workPreferences.join(", ")}
Role evaluation: ${evaluation.summary}
Top strengths for this role: ${evaluation.strengths.slice(0, 4).join("; ")}
Resume evidence: ${evaluation.resumeEvidence.slice(0, 3).join("; ")}${storyContext}`;

  const commonQuestions = [
    "Why are you interested in this role?",
    "Why are you a strong fit for this role?",
    "Tell us about yourself.",
    "What compensation range are you looking for?",
    "Do you have any location or work authorization constraints?"
  ];

  if (customQuestion?.trim()) {
    commonQuestions.push(customQuestion.trim());
  }

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Write copy-paste ready answers for these job application questions.

Job: ${job.title} at ${job.company}
Location: ${job.location} / ${job.remoteType}
Salary: ${job.salaryNotes}

Questions:
${commonQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return a JSON object: { "answers": ["answer 1", "answer 2", ...] }
One answer per question in the same order. Each answer should be 2-4 sentences, specific to ${job.company} and ${job.title}.`
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
    source: `AI-generated · ${provider.name} / ${provider.defaultModel}`,
    sortOrder: index
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
