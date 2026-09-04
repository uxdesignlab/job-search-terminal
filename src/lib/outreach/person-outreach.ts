import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import {
  getApplicationPreparation,
  getEvaluationByJobId,
  getJobById,
  getResumes,
  getUserProfile,
  getWritingStyle,
  saveOutreachMessage,
} from "../db/queries";
import type { ContactRecord, JobContactLinkRecord, OutreachChannel } from "../db/types";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";
import { channelSpec } from "./channels";
import {
  assertOrganizationFirstMessage,
  assertOrganizationFirstSubject,
  ORGANIZATION_FIRST_MESSAGE_RULES,
  organizationNeedExcerpt,
  OutreachFramingError,
} from "./framing";

/**
 * Outreach written to an actual person (PRD v0.2.1 §53–§55).
 *
 * The previous generator wrote three messages per job addressed to abstract
 * personas — "a recruiter", "the hiring manager" — because there were no real
 * contacts to write to. It also capped everything at 300 characters, since it
 * only ever produced LinkedIn connection notes.
 */

export type PersonOutreachResult = {
  channel: OutreachChannel;
  subject: string;
  message: string;
  charCount: number;
  providerUsed: string;
  modelUsed: string;
};

/**
 * §54 in prompt form.
 *
 * The rules that matter most are the negative ones. An outreach message that
 * asserts something unverified about a company, or claims certainty that this
 * person is the hiring manager, damages the user in a way a bland message never
 * would — and they will not always catch it before sending.
 */
const MESSAGE_RULES = `Rules:
- Establish relevance in the first sentence. No warm-up.
- Use only the candidate evidence provided. Never invent experience, metrics or overlap.
- No generic praise ("I'm a huge fan of what you're building").
- No fake familiarity. You have never met this person.
- Make no claim about the company that is not in the context below.
- Do not assert this person is the hiring manager or owns the role unless the context says so.
- No placeholder text in brackets. The user must be able to send it as written.
- Do not invent mutual connections, shared schools or shared employers.

${ORGANIZATION_FIRST_MESSAGE_RULES}`;

function buildContext(input: {
  contact: ContactRecord;
  link: JobContactLinkRecord;
  jobId: string;
}): string {
  const job = getJobById(input.jobId);
  const evaluation = getEvaluationByJobId(input.jobId);
  const preparation = getApplicationPreparation(input.jobId);
  const profile = getUserProfile();

  const lines: string[] = [
    "## The opportunity",
    `Role: ${job?.title ?? "unknown"} at ${job?.company ?? "unknown"}`,
  ];

  if (job?.summary) lines.push(`Organization need summary: ${job.summary}`);
  const needExcerpt = organizationNeedExcerpt(job?.parsedDescription || job?.rawDescription || "");
  if (needExcerpt) {
    lines.push("", "## What the organization needs from this role", needExcerpt);
  }

  // §53: evaluation supplies why this role is worth pursuing at all.
  if (evaluation) {
    lines.push(`Assessed fit: ${evaluation.fitScore}% (${evaluation.recommendation})`);
    if (evaluation.roleArchetype) lines.push(`Role type: ${evaluation.roleArchetype}`);
    if (evaluation.strengths.length > 0) {
      lines.push("", "## Why the candidate fits (use these, and only these)");
      lines.push(...evaluation.strengths.slice(0, 4).map((item) => `- ${item}`));
    }
  }

  // Application Preparation sharpens the message when it exists, but outreach
  // never forces it to run (§34) — a user may reach out before applying.
  if (preparation && preparation.evidenceMap.length > 0) {
    lines.push("", "## Evidence mapped to this role");
    lines.push(...preparation.evidenceMap.slice(0, 3).map((entry) => `- ${entry.requirement}: ${entry.evidence}`));
  }

  lines.push(
    "",
    "## The person",
    `Name: ${input.contact.name}`,
    `Title: ${input.contact.title || "unknown"}`,
    `Company: ${input.contact.company || job?.company || "unknown"}`,
    `Their relationship to this role: ${input.link.contactRole.replace(/_/g, " ")}`,
  );
  if (input.link.relevanceReasons.length > 0) {
    lines.push(`Why they are relevant: ${input.link.relevanceReasons.join("; ")}`);
  }

  lines.push(
    "",
    "## The candidate",
    `Name: ${profile.name}`,
    `Searching for: ${profile.currentSearchGoal || "not specified"}`,
  );

  // Use the lane the evaluation recommended for this role, not whichever resume
  // sorts first. Drafting a director-level message from the Specialist lane cites
  // individual-contributor proof points for a leadership opening — resume
  // generation already honours this recommendation, and outreach should agree.
  const resumes = getResumes();
  const activeResume =
    resumes.find((resume) => resume.name === evaluation?.resumeBaseRecommendation && resume.extractedText)
    ?? resumes.find((resume) => resume.activeStatus && resume.extractedText);
  if (activeResume?.extractedText) {
    lines.push("", "## Candidate evidence base (the only claims you may make)");
    lines.push(activeResume.extractedText.slice(0, 1500));
  }

  return lines.join("\n");
}

export async function generatePersonOutreach(input: {
  jobId: string;
  contact: ContactRecord;
  link: JobContactLinkRecord;
  channel: OutreachChannel;
}): Promise<PersonOutreachResult> {
  const job = getJobById(input.jobId);
  if (!job) throw new Error(`Job not found: ${input.jobId}`);
  const provider = getActiveProvider();
  const spec = channelSpec(input.channel);
  const style = getWritingStyle();
  const styleContext = style.toneProfile ? formatStyleForPrompt(style.toneProfile) : "";

  const lengthLine = spec.softLimit
    ? `Hard constraint: stay under ${spec.softLimit} characters. Aim for about ${spec.targetChars}.`
    : `Aim for about ${spec.targetChars} characters. Do not pad to reach it.`;

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You write outreach for a job seeker contacting a specific person about a specific role.

Channel: ${spec.label}. ${spec.guidance}
${lengthLine}

${MESSAGE_RULES}${styleContext ? `\n\nMatch this writing style:\n${styleContext}` : ""}

${spec.hasSubject
  ? 'Return JSON: {"subject": "...", "message": "..."}'
  : 'Return JSON: {"message": "..."} — this channel has no subject line.'}`,
    },
    {
      role: "user",
      content: `${buildContext(input)}\n\nWrite the ${spec.label.toLowerCase()} to ${input.contact.name}.`,
    },
  ];

  let raw: { subject?: string; message?: string } | null = null;
  let framingIssue = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptMessages = framingIssue
      ? [
          ...messages,
          {
            role: "user" as const,
            content: `Rewrite the draft. It was not saved because it broke this locked rule: ${framingIssue} Center the organization need and how the candidate can help.`,
          },
        ]
      : messages;
    raw = await withRetry(() =>
      provider.generateJSON<{ subject?: string; message?: string }>(
        attemptMessages,
        spec.hasSubject ? '{"subject":"string","message":"string"}' : '{"message":"string"}'
      )
    );

    try {
      assertOrganizationFirstMessage((raw.message ?? "").trim(), job.company);
      if (spec.hasSubject) {
        assertOrganizationFirstSubject((raw.subject ?? "").trim(), job.company, job.title);
      }
      framingIssue = "";
      break;
    } catch (error) {
      if (!(error instanceof OutreachFramingError)) throw error;
      framingIssue = error.message;
      raw = null;
    }
  }
  if (!raw) {
    throw new OutreachFramingError(
      `The model could not produce an organization-first draft after one automatic rewrite. ${framingIssue}`.trim(),
    );
  }

  const message = (raw.message ?? "").trim();

  return {
    channel: input.channel,
    subject: spec.hasSubject ? (raw.subject ?? "").trim() : "",
    // Deliberately not truncated: §55 says show the count and let the user
    // decide. Silently cutting a message mid-sentence is worse than a long one.
    message,
    charCount: message.length,
    providerUsed: provider.name,
    modelUsed: provider.effectiveModel,
  };
}

export async function generateAndSavePersonOutreach(input: {
  jobId: string;
  contact: ContactRecord;
  link: JobContactLinkRecord;
  channel: OutreachChannel;
}): Promise<PersonOutreachResult> {
  const result = await generatePersonOutreach(input);
  saveOutreachMessage({
    // One draft per contact per channel: regenerating replaces that draft rather
    // than piling up variants the user has to sift through.
    id: `outreach-${input.link.id}-${input.channel}`,
    jobContactLinkId: input.link.id,
    channel: result.channel,
    subject: result.subject,
    message: result.message,
    status: "draft",
    providerUsed: result.providerUsed,
    modelUsed: result.modelUsed,
  });
  return result;
}
