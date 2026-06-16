import { getActiveProvider } from "../ai/factory";
import { getAIPromptText, renderPromptTemplate } from "../ai/prompt-registry";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { JobRecord, UserProfileRecord } from "../db/types";
import { getJobById, getUserProfile, getWritingStyle, saveOutreachDraft, deleteOutreachDraftsForJob } from "../db/queries";
import { formatStyleForPrompt } from "../profile/writing-style-extractor";

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

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a LinkedIn outreach specialist. Write concise, authentic connection messages. Hard limit: 300 characters. No placeholder text in brackets. Candidate profile: ${profile.currentSearchGoal}. Target strengths: ${profile.strongestSkills.slice(0, 3).join(", ")}.${styleContext ? `\n\n${styleContext}` : ""}`
    },
    {
      role: "user",
      content: prompt
    }
  ];

  const text = await withRetry(() => provider.generateText(messages));
  return text.trim().slice(0, 300);
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

  deleteOutreachDraftsForJob(jobId);

  for (const contactType of contactTypes) {
    const message = await generateMessage(contactType, job, profile, provider, styleContext);
    results.push({ contactType, message, charCount: message.length, modelUsed: provider.effectiveModel, providerUsed: provider.name });

    saveOutreachDraft({
      id: `outreach-${jobId}-${contactType}`,
      jobId,
      contactType,
      message,
      providerUsed: provider.name,
      modelUsed: provider.effectiveModel
    });
  }

  return results;
}

export { CONTACT_TYPE_LABELS };
