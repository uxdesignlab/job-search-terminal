import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { JobRecord, UserProfileRecord } from "../db/types";
import { getJobById, getUserProfile, saveOutreachDraft, deleteOutreachDraftsForJob } from "../db/queries";

type ContactType = "recruiter" | "hiring_manager" | "peer";

export type OutreachDraftResult = {
  contactType: ContactType;
  message: string;
  charCount: number;
};

const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  recruiter: "Recruiter outreach",
  hiring_manager: "Hiring manager note",
  peer: "Peer / team member"
};

async function generateMessage(
  contactType: ContactType,
  job: JobRecord,
  profile: UserProfileRecord,
  provider: ReturnType<typeof getActiveProvider>
): Promise<string> {
  const prompts: Record<ContactType, string> = {
    recruiter: `Write a LinkedIn connection request message from ${profile.name} to a recruiter at ${job.company} for the ${job.title} role. Requirements: under 300 characters, no opener like "Hi [Name]" (they'll add it), mention the role, one specific reason the candidate is a fit, end with a low-friction ask. First-person, no "I am" opener.`,
    hiring_manager: `Write a LinkedIn note from ${profile.name} to the hiring manager for the ${job.title} role at ${job.company}. Requirements: under 300 characters, lead with the candidate's most relevant strength for this specific role at ${job.company}, not generic. First-person, no "I am" opener. Specific to ${job.company}'s known work.`,
    peer: `Write a LinkedIn message from ${profile.name} to a potential peer/team member at ${job.company} (not a recruiter). Requirements: under 300 characters, professional but warm, mention genuine curiosity about the team's technical challenges or culture, not just asking for a referral. First-person, conversational.`
  };

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a LinkedIn outreach specialist. Write concise, authentic connection messages. Hard limit: 300 characters. No placeholder text in brackets. Candidate profile: ${profile.currentSearchGoal}. Target strengths: ${profile.strongestSkills.slice(0, 3).join(", ")}.`
    },
    {
      role: "user",
      content: prompts[contactType]
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

  const contactTypes: ContactType[] = ["recruiter", "hiring_manager", "peer"];
  const results: OutreachDraftResult[] = [];

  deleteOutreachDraftsForJob(jobId);

  for (const contactType of contactTypes) {
    const message = await generateMessage(contactType, job, profile, provider);
    results.push({ contactType, message, charCount: message.length });

    saveOutreachDraft({
      id: `outreach-${jobId}-${contactType}`,
      jobId,
      contactType,
      message
    });
  }

  return results;
}

export { CONTACT_TYPE_LABELS };
