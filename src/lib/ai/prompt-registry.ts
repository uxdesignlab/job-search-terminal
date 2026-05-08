import { getAIPromptOverride } from "../db/queries";
import type { AIPromptId } from "../db/types";

export type PromptDefinition = {
  id: AIPromptId;
  label: string;
  description: string;
  defaultPrompt: string;
};

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    id: "resume_tailoring",
    label: "Resume tailoring",
    description: "Controls tone and emphasis when the app updates selected resume sections.",
    defaultPrompt:
      "Tailor selected resume sections for the target role using plain, recruiter-readable language. Emphasize the strongest supported match signals, preserve the candidate's voice, and avoid hype."
  },
  {
    id: "application_answers",
    label: "Application answers",
    description: "Controls how copy-ready application answers are written.",
    defaultPrompt:
      "Write copy-paste ready answers for these job application questions. Each answer must sound like a real human wrote it: natural, specific, and interview-worthy.\n\nRole: {{role}} at {{company}}\nLocation: {{location}} / {{remoteType}}\nSalary context: {{salaryNotes}}\n\nQuestions to answer:\n{{questions}}\n\nReturn a JSON object: { \"answers\": [\"answer 1\", \"answer 2\", ...] }\nExactly one answer per question, in the same order. Vary the opening words across answers. Make each one feel distinct and authentic to this specific role at {{company}}."
  },
  {
    id: "outreach_recruiter",
    label: "Recruiter outreach",
    description: "Controls LinkedIn connection messages to recruiters.",
    defaultPrompt:
      "Write a LinkedIn connection request message from {{name}} to a recruiter at {{company}} for the {{role}} role. Requirements: under 300 characters, no opener like \"Hi [Name]\" because the user will add it, mention the role, one specific reason the candidate is a fit, end with a low-friction ask. First-person, no \"I am\" opener."
  },
  {
    id: "outreach_hiring_manager",
    label: "Hiring manager outreach",
    description: "Controls LinkedIn notes to hiring managers.",
    defaultPrompt:
      "Write a LinkedIn note from {{name}} to the hiring manager for the {{role}} role at {{company}}. Requirements: under 300 characters, lead with the candidate's most relevant strength for this specific role at {{company}}, not generic. First-person, no \"I am\" opener. Specific to {{company}}'s known work."
  },
  {
    id: "outreach_peer",
    label: "Peer outreach",
    description: "Controls LinkedIn messages to potential teammates.",
    defaultPrompt:
      "Write a LinkedIn message from {{name}} to a potential peer/team member at {{company}} (not a recruiter). Requirements: under 300 characters, professional but warm, mention genuine curiosity about the team's technical challenges or culture, not just asking for a referral. First-person, conversational."
  }
];

export function getPromptDefinition(promptId: AIPromptId): PromptDefinition {
  const definition = PROMPT_DEFINITIONS.find((prompt) => prompt.id === promptId);
  if (!definition) {
    throw new Error(`Unknown prompt id: ${promptId}`);
  }
  return definition;
}

export function getAIPromptText(promptId: AIPromptId): string {
  return getAIPromptOverride(promptId)?.customPrompt || getPromptDefinition(promptId).defaultPrompt;
}

export function renderPromptTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}
