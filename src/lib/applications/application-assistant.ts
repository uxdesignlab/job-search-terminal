import { createHash } from "node:crypto";
import {
  getApplicationAnswerDrafts,
  getEvaluationByJobId,
  getGeneratedDocumentById,
  getJobById,
  getJobGapResponses,
  getUserProfile,
  saveApplicationAnswerDrafts
} from "../db/queries";
import type { ApplicationAnswerDraftInput, EvaluationRecord, JobRecord, UserProfileRecord } from "../db/types";
import { evaluateJob } from "../evaluation/job-evaluator";

type AddressedGap = { gapText: string; response: string };

type AnswerContext = {
  job: JobRecord;
  evaluation: EvaluationRecord;
  profile: UserProfileRecord;
  generatedResumeTitle: string;
  addressedGaps: AddressedGap[];
};

const commonQuestions = [
  "Why are you interested in this role?",
  "Why are you a strong fit for this role?",
  "Tell us about yourself.",
  "What compensation range are you looking for?",
  "Do you have any location or work authorization constraints?"
];

export function prepareApplicationAnswers(jobId: string, customQuestions: string[] = []) {
  const job = getJobById(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  let evaluation = getEvaluationByJobId(jobId);
  if (!evaluation) {
    evaluateJob(jobId);
    evaluation = getEvaluationByJobId(jobId);
  }

  if (!evaluation) {
    throw new Error(`Evaluation not found: ${jobId}`);
  }

  const profile = getUserProfile();
  const generatedDocument = getGeneratedDocumentById(`document-${jobId}`);
  const gapResponses = getJobGapResponses(jobId).filter((r) => r.qualityStatus === "addressed");
  const context: AnswerContext = {
    job,
    evaluation,
    profile,
    generatedResumeTitle: generatedDocument?.title ?? "No generated resume is attached yet",
    addressedGaps: gapResponses.map((r) => ({ gapText: r.gapText, response: r.polishedResponse || r.rawResponse })),
  };
  const questions = [
    ...commonQuestions,
    ...customQuestions.map(cleanQuestion).filter(Boolean) as string[]
  ];
  const drafts = questions.map((question, index) => buildDraft(context, question, index));

  saveApplicationAnswerDrafts(drafts);
  return getApplicationAnswerDrafts(jobId);
}

function buildDraft(context: AnswerContext, question: string, index: number): ApplicationAnswerDraftInput {
  return {
    id: `answer-${context.job.id}-${stableId(question)}`,
    jobId: context.job.id,
    question,
    answer: answerQuestion(context, question),
    source: index < commonQuestions.length ? "CareerOps common application prompt" : "Custom pasted question",
    sortOrder: index
  };
}

function answerQuestion(context: AnswerContext, question: string) {
  const normalized = question.toLowerCase();

  if (hasAny(normalized, ["why", "interested", "company", "role"])) {
    return whyRole(context);
  }

  if (hasAny(normalized, ["fit", "qualified", "strength", "experience"])) {
    return whyFit(context);
  }

  if (hasAny(normalized, ["tell us", "about yourself", "background", "bio"])) {
    return aboutCandidate(context);
  }

  if (hasAny(normalized, ["salary", "compensation", "range", "pay"])) {
    return compensation(context);
  }

  if (hasAny(normalized, ["authorization", "visa", "sponsor", "location", "remote", "hybrid", "relocate"])) {
    return workPreferences(context);
  }

  return customAnswer(context, question);
}

function whyRole({ job, evaluation }: AnswerContext) {
  const proof = first(evaluation.sections.roleSummary, evaluation.summary);
  const signal = first(evaluation.sections.levelStrategy, job.whyItMatches);

  return `I am interested in ${job.company}'s ${job.title} role because it aligns with the kind of strategic product and experience work I am prioritizing. The role appears to connect ${proof.toLowerCase()} with ${signal.toLowerCase()}. That combination is where I can bring senior product design judgment, systems thinking, and practical execution without treating the role as a generic design opening.`;
}

function whyFit({ job, evaluation, addressedGaps }: AnswerContext) {
  const strengths = evaluation.strengths.slice(0, 3);
  const evidence = evaluation.resumeEvidence.slice(0, 2);
  const proof = [...strengths, ...evidence].slice(0, 4).join(" ");
  const gapSuffix = addressedGaps.length > 0
    ? ` I can also speak directly to ${addressedGaps[0].gapText}: ${firstSentence(addressedGaps[0].response)}.`
    : "";

  return `I am a strong fit for ${job.title} because my background maps directly to the role's core needs: ${proof || evaluation.summary}.${gapSuffix} I would bring a mix of product strategy, UX leadership, research-informed decision making, and design-system rigor, while staying focused on measurable product outcomes rather than presentation-only design work.`;
}

function aboutCandidate({ profile, evaluation }: AnswerContext) {
  return `${profile.name} is a senior product design and UX leader focused on ${profile.currentSearchGoal.toLowerCase()}. His strongest areas include ${profile.strongestSkills.slice(0, 4).join(", ")}, with current emphasis on ${profile.skillsToUseMore.slice(0, 3).join(", ")}. For this role, the saved evaluation highlights ${first(evaluation.strengths, evaluation.summary).toLowerCase()}.`;
}

function compensation({ job, profile }: AnswerContext) {
  const salary = job.salaryNotes && !job.salaryNotes.toLowerCase().includes("not captured") ? job.salaryNotes : "the posted range was not captured in the current job record";

  return `My compensation expectations depend on the full scope, level, benefits, and location model. Based on my current search, I am targeting ${profile.compensationNeeds.toLowerCase()}. For this role, ${salary}; I would be happy to align on a range once the level and responsibilities are confirmed.`;
}

function workPreferences({ job, profile }: AnswerContext) {
  return `My current work preferences are ${profile.workPreferences.join(", ").toLowerCase()}. This opportunity is listed as ${job.location} / ${job.remoteType}, so I would want to confirm the expected working model during the process. I can provide any work authorization details directly in the application or with the recruiter as required.`;
}

function customAnswer(context: AnswerContext, question: string) {
  const proof = [...context.evaluation.strengths, ...context.evaluation.resumeEvidence].slice(0, 3).join(" ");
  const relevantGap = context.addressedGaps.find((g) =>
    question.toLowerCase().includes(g.gapText.toLowerCase().split(" ").slice(0, 3).join(" "))
  );
  const gapNote = relevantGap
    ? ` Relevant addressed gap: "${relevantGap.gapText}" — ${relevantGap.response}.`
    : context.addressedGaps.length > 0
    ? ` Addressed gaps available as supporting evidence: ${context.addressedGaps.map((g) => g.gapText).join(", ")}.`
    : "";

  return `For "${question}", I would answer by connecting the role's needs to the strongest saved evidence: ${proof || context.evaluation.summary}.${gapNote} I would keep the response specific to ${context.job.company}, avoid unsupported claims, and reference the tailored resume context: ${context.generatedResumeTitle}.`;
}

function cleanQuestion(question?: string) {
  return question?.trim().replace(/\s+/g, " ");
}

function stableId(value: string) {
  return createHash("sha1").update(value.toLowerCase()).digest("hex").slice(0, 12);
}

function first(values: string[], fallback: string) {
  return values.find((value) => value.trim().length > 0) ?? fallback;
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function firstSentence(text: string, maxLength = 180): string {
  const line = text.split(/[\n.!?]/)[0].trim();
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 1)}…`;
}

