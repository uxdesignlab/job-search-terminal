import { randomUUID } from "node:crypto";
import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import { getResumes, saveSkills, updateUserProfile } from "../db/queries";
import type { ProfileUpdateInput, SkillRecord } from "../db/types";

type ExtractedProfile = {
  currentSearchGoal: string;
  urgency: string;
  direction: string;
  targetRoles: string[];
  desiredIndustries: string[];
  compensationNeeds: string;
  workPreferences: string[];
  constraints: string[];
  dealBreakers: string[];
  careerIntent: string;
  careerChangeInterest: string;
  confidenceLevel: string;
  skillsToUseMore: string[];
  skillsToUseLess: string[];
};

type ExtractedSkill = {
  skillName: string;
  skillCategory: string;
  evidenceSource: string;
  strengthLevel: string;
  marketRelevance: string;
  userInterestLevel: string;
  usePreference: string;
};

type ExtractionResult = {
  profile: ExtractedProfile;
  skills: ExtractedSkill[];
};

export async function extractProfileWithAI(): Promise<{ profileSaved: boolean; skillCount: number }> {
  const resumes = getResumes().filter((r) => r.extractedText && r.extractedText.length > 100);

  if (resumes.length === 0) {
    throw new Error("No resume text found. Run profile extraction from the terminal first (npm run profile:extract).");
  }

  const resumeText = resumes
    .map((r) => `=== ${r.name} ===\n${r.extractedText.slice(0, 4000)}`)
    .join("\n\n")
    .slice(0, 12000);

  const provider = getActiveProvider();

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a career profile extractor. Given resume text, extract structured career intelligence for a job search dashboard. Be accurate and specific — do not invent facts not in the resume.`
    },
    {
      role: "user",
      content: `Extract a career profile from these resume(s). Return a JSON object with two top-level keys:

"profile": {
  "currentSearchGoal": "one sentence describing what this person is looking for",
  "urgency": "Active search / Passive / Exploratory",
  "direction": "one phrase describing career direction",
  "targetRoles": ["role 1", "role 2", ...],
  "desiredIndustries": ["industry 1", ...],
  "compensationNeeds": "salary expectation if mentioned, else empty string",
  "workPreferences": ["Remote", "Hybrid", etc.],
  "constraints": ["constraint 1", ...],
  "dealBreakers": ["deal breaker 1", ...],
  "careerIntent": "one sentence on what they want from their career",
  "careerChangeInterest": "none / slight / moderate / strong",
  "confidenceLevel": "high / medium / low",
  "skillsToUseMore": ["skill 1", ...],
  "skillsToUseLess": ["skill 1", ...]
},
"skills": [
  {
    "skillName": "string",
    "skillCategory": "Core leadership | Specialized capability | Adjacent direction | Tool / platform",
    "evidenceSource": "short quote or paraphrase from resume text",
    "strengthLevel": "Expert | Proficient | Familiar",
    "marketRelevance": "High | Medium | Low",
    "userInterestLevel": "High | Medium | Low",
    "usePreference": "use_more | neutral | use_less"
  }
]

Resume text:
${resumeText}`
    }
  ];

  const result = await withRetry(() =>
    provider.generateJSON<ExtractionResult>(messages, '{"profile":{},"skills":[]}')
  );

  const profileUpdate: ProfileUpdateInput = {
    currentSearchGoal: result.profile.currentSearchGoal || "",
    urgency: result.profile.urgency || "Active search",
    direction: result.profile.direction || "",
    targetRoles: result.profile.targetRoles || [],
    desiredIndustries: result.profile.desiredIndustries || [],
    compensationNeeds: result.profile.compensationNeeds || "",
    workPreferences: result.profile.workPreferences || [],
    constraints: result.profile.constraints || [],
    dealBreakers: result.profile.dealBreakers || [],
    careerIntent: result.profile.careerIntent || "",
    careerChangeInterest: result.profile.careerChangeInterest || "",
    confidenceLevel: result.profile.confidenceLevel || "high",
    skillsToUseMore: result.profile.skillsToUseMore || [],
    skillsToUseLess: result.profile.skillsToUseLess || []
  };

  updateUserProfile(profileUpdate);

  const skills: SkillRecord[] = (result.skills || []).map((s) => ({
    id: `skill-${randomUUID().slice(0, 8)}`,
    skillName: s.skillName || "",
    skillCategory: s.skillCategory || "Core leadership",
    evidenceSource: s.evidenceSource || "",
    strengthLevel: s.strengthLevel || "Proficient",
    marketRelevance: s.marketRelevance || "Medium",
    userInterestLevel: s.userInterestLevel || "Medium",
    usePreference: s.usePreference || "neutral"
  })).filter((s) => s.skillName);

  if (skills.length > 0) {
    saveSkills(skills);
  }

  return { profileSaved: true, skillCount: skills.length };
}
