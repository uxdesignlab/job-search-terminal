import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { CompanyResearchInput, JobRecord, UserProfileRecord } from "../db/types";
import { getCompanyResearch, getJobById, getUserProfile, saveCompanyResearch } from "../db/queries";

type ResearchAxis = "aiStrategy" | "recentMovements" | "engineeringCulture" | "technicalChallenges" | "competitivePosition" | "candidateAngle";

export type ResearchAxisResult = {
  axis: ResearchAxis;
  label: string;
  content: string;
};

const AXIS_LABELS: Record<ResearchAxis, string> = {
  aiStrategy: "AI & technology strategy",
  recentMovements: "Recent movements & news",
  engineeringCulture: "Engineering culture",
  technicalChallenges: "Technical challenges",
  competitivePosition: "Competitive position",
  candidateAngle: "Your angle for this company"
};

async function runResearchAxis(
  axis: ResearchAxis,
  job: JobRecord,
  profile: UserProfileRecord,
  provider: ReturnType<typeof getActiveProvider>
): Promise<string> {
  const prompts: Record<ResearchAxis, string> = {
    aiStrategy: `What is ${job.company}'s known AI and technology strategy? Cover: AI investments or products, tech stack signals from job postings, recent engineering blog posts or talks, cloud/infrastructure choices. Be specific to ${job.company}.`,
    recentMovements: `What are the most notable recent events at ${job.company}? Cover: funding rounds, acquisitions, leadership changes, layoffs or hiring waves, product launches, major partnerships. Use only well-known public information. If nothing notable, say so.`,
    engineeringCulture: `Describe ${job.company}'s engineering culture based on public signals. Cover: engineering blog presence, open-source contributions, conference talks, Glassdoor engineering themes, build-vs-buy philosophy, deployment frequency.`,
    technicalChallenges: `What are the key technical challenges facing ${job.company} in the context of the role "${job.title}"? Infer from: company scale, product complexity, known tech debt, industry-specific infrastructure challenges.`,
    competitivePosition: `How is ${job.company} positioned competitively in its market? Cover: primary competitors, differentiation, market share signals, recent wins or losses. Relate this to why a strong ${job.title} matters here.`,
    candidateAngle: `Given ${profile.name}'s background — ${profile.currentSearchGoal} — what is the most compelling angle for applying to ${job.company} for the role "${job.title}"? Identify: strongest alignment points, proof points to emphasize, questions to ask, and any concerns to proactively address.`
  };

  const messages: AIMessage[] = [
    {
      role: "system",
      content: "You are a company research analyst helping a job seeker prepare. Provide concise, specific, factual analysis. Acknowledge when information is uncertain rather than inventing details. 150–250 words per section."
    },
    {
      role: "user",
      content: prompts[axis]
    }
  ];

  return withRetry(() => provider.generateText(messages));
}

export async function researchCompanyStreaming(
  jobId: string,
  onAxis: (result: ResearchAxisResult) => void
): Promise<void> {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const profile = getUserProfile();
  const provider = getActiveProvider();

  const axes: ResearchAxis[] = ["aiStrategy", "recentMovements", "engineeringCulture", "technicalChallenges", "competitivePosition", "candidateAngle"];
  const results: Partial<Record<ResearchAxis, string>> = {};

  for (const axis of axes) {
    const content = await runResearchAxis(axis, job, profile, provider);
    results[axis] = content;
    onAxis({ axis, label: AXIS_LABELS[axis], content });
  }

  const research: CompanyResearchInput = {
    id: `research-${jobId}`,
    jobId,
    company: job.company,
    aiStrategy: results.aiStrategy ?? "",
    recentMovements: results.recentMovements ?? "",
    engineeringCulture: results.engineeringCulture ?? "",
    technicalChallenges: results.technicalChallenges ?? "",
    competitivePosition: results.competitivePosition ?? "",
    candidateAngle: results.candidateAngle ?? "",
    providerUsed: provider.name,
    modelUsed: provider.defaultModel
  };

  saveCompanyResearch(research);
}

export { getCompanyResearch, AXIS_LABELS };
