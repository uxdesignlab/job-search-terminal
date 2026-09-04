import { getActiveProvider } from "../ai/factory";
import { getAIPromptText, renderPromptTemplate } from "../ai/prompt-registry";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { JobRecord, UserProfileRecord } from "../db/types";
import { getJobById, getUserProfile, getWritingStyle, saveOutreachDraft, deleteOutreachDraftsForJob } from "../db/queries";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";
import {
  assertOrganizationFirstMessage,
  ORGANIZATION_FIRST_MESSAGE_RULES,
  organizationNeedExcerpt,
  OutreachFramingError,
} from "./framing";

type ContactType = "recruiter" | "hiring_manager" | "peer";
type OutreachPromptId = "outreach_recruiter" | "outreach_hiring_manager" | "outreach_peer";

export type OutreachDraftResult = {
  contactType: ContactType;
  message: string;
  charCount: number;
  modelUsed: string;
  providerUsed: string;
};

	const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  recruiter: "Recruiter outreach",
  hiring_manager: "Hiring manager note",
  peer: "Peer / team member"
};

const CONTACT_PROMPT_IDS: Record<ContactType, OutreachPromptId> = {
  recruiter: "outreach_recruiter",
  hiring_manager: "outreach_hiring_manager",
  peer: "outreach_peer"
};

async function generateMessage(
  contactType: ContactType,
  job: JobRecord,
  profile: UserProfileRecord,
  provider: ReturnType<typeof getActiveProvider>,
  styleContext: string
): Promise<string> {
  const prompt = renderPromptTemplate(getAIPromptText(CONTACT_PROMPT_IDS[contactType]), {
    name: profile.name,
    company: job.company,
    role: job.title
  });

  const roleContext = organizationNeedExcerpt(job.parsedDescription || job.rawDescription);
  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a LinkedIn outreach specialist. Write concise, authentic connection messages. Hard limit: 300 characters. No placeholder text in brackets.

${ORGANIZATION_FIRST_MESSAGE_RULES}

Organization: ${job.company}
Role: ${job.title}
Role need summary: ${job.summary || "Not available"}
Role context: ${roleContext || "Not available"}

Candidate profile: ${profile.currentSearchGoal}. Candidate evidence: ${profile.strongestSkills.slice(0, 3).join(", ")}.${styleContext ? `\n\n${styleContext}` : ""}`
    },
    {
      role: "user",
      content: prompt
    }
  ];

  let framingIssue = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptMessages: AIMessage[] = framingIssue
      ? [
          ...messages,
          {
            role: "user",
            content: `Rewrite the draft. It was not saved because it broke this locked rule: ${framingIssue} Center ${job.company}'s need and how the candidate can help.`,
          },
        ]
      : messages;
    const text = (await withRetry(() => provider.generateText(attemptMessages))).trim().slice(0, 300);
    try {
      assertOrganizationFirstMessage(text, job.company);
      return text;
    } catch (error) {
      if (!(error instanceof OutreachFramingError)) throw error;
      framingIssue = error.message;
    }
  }

  throw new OutreachFramingError(
    `The model could not produce an organization-first draft after one automatic rewrite. ${framingIssue}`.trim(),
  );
}

export async function generateOutreachDrafts(jobId: string): Promise<OutreachDraftResult[]> {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const profile = getUserProfile();
  const provider = getActiveProvider();
  const writingStyle = getWritingStyle();
  const styleContext = writingStyle.toneProfile ? formatStyleForPrompt(writingStyle.toneProfile) : "";

  const contactTypes: ContactType[] = ["recruiter", "hiring_manager", "peer"];
  const results: OutreachDraftResult[] = [];

  for (const contactType of contactTypes) {
    const message = await generateMessage(contactType, job, profile, provider, styleContext);
    results.push({ contactType, message, charCount: message.length, modelUsed: provider.effectiveModel, providerUsed: provider.name });
  }

  // Keep the previous set intact unless every replacement passes generation and
  // organization-first validation. A partial failure must not erase usable work.
  deleteOutreachDraftsForJob(jobId);
  for (const result of results) {
    saveOutreachDraft({
      id: `outreach-${jobId}-${result.contactType}`,
      jobId,
      contactType: result.contactType,
      message: result.message,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
    });
  }

  return results;
}

export { CONTACT_TYPE_LABELS };
