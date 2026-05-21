import { randomUUID } from "node:crypto";
import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import { getResumes, getTitleFilters, getUserProfile, saveSkills, saveTitleFilters, updateUserProfile } from "../db/queries";
import type { ProfileUpdateInput, SkillRecord } from "../db/types";

type ExtractedProfile = {
  /** Full name as written at the top of the resume. */
  name: string;
  location: string;
  portfolio: string;
  /** 5–10 headline strengths for the overview; use evidence from the resume. */
  strongestSkills: string[];
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

/** Matches Overview tab urgency `<Select>` values so the dropdown stays in sync after extraction. */
function normalizeUrgency(raw: string): string {
  const allowed = new Set(["actively searching", "open to opportunities", "passively looking", "not searching"]);
  const t = raw.trim().toLowerCase();
  if (allowed.has(t)) return t;
  if (t.includes("not search")) return "not searching";
  if (t.includes("passive")) return "passively looking";
  if (t.includes("explor") || t.includes("open to opport")) return "open to opportunities";
  if (t.includes("active")) return "actively searching";
  return "actively searching";
}

function normalizeTitleKeywords(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function mergeTitleKeywords(existing: string[], additions: string[]) {
  return normalizeTitleKeywords([...existing, ...additions]);
}

export async function extractProfileWithAI(): Promise<{ profileSaved: boolean; skillCount: number }> {
  const previous = getUserProfile();
  const resumes = getResumes().filter((r) => r.extractedText && r.extractedText.length > 100);

  if (resumes.length === 0) {
    throw new Error("No resume text found. Upload a resume PDF first, then run extraction.");
  }

  // Keep each resume's text short so the combined prompt stays manageable.
  const resumeText = resumes
    .map((r) => `=== ${r.name} ===\n${r.extractedText.slice(0, 3000)}`)
    .join("\n\n")
    .slice(0, 8000);

  const provider = getActiveProvider();
  const systemMsg: AIMessage = {
    role: "system",
    content: "You are a career profile extractor. Given resume text, extract structured career intelligence. Be accurate — do not invent facts not present in the resume."
  };

  // ── Call 1: profile fields only (no skills list) ─────────────────────────
  // Keeping the response under ~800 chars prevents Gemini JSON-mode truncation.
  const profileMessages: AIMessage[] = [
    systemMsg,
    {
      role: "user",
      content: `Extract a career profile from this resume. Return ONLY a JSON object with these exact keys — no skills, no extra keys.

{
  "name": "full name from resume header",
  "location": "city/region from header; empty string if unknown",
  "portfolio": "personal site URL if listed; empty string if none",
  "strongestSkills": ["up to 6 concise headline strengths"],
  "currentSearchGoal": "one sentence on what this person is looking for",
  "urgency": "exactly one of: actively searching | open to opportunities | passively looking | not searching",
  "direction": "one short phrase describing career direction",
  "targetRoles": ["role 1", "role 2"],
  "desiredIndustries": ["industry 1"],
  "compensationNeeds": "salary expectation if stated; empty string if not",
  "workPreferences": ["Remote", "Hybrid", or "On-site"],
  "constraints": ["constraint 1"],
  "dealBreakers": ["deal breaker 1"],
  "careerIntent": "one sentence on what they want from their career",
  "careerChangeInterest": "none | slight | moderate | strong",
  "confidenceLevel": "high | medium | low",
  "skillsToUseMore": ["skill 1"],
  "skillsToUseLess": ["skill 1"]
}

Resume text:
${resumeText}`
    }
  ];

  const profileResult = await withRetry(() =>
    provider.generateJSON<ExtractedProfile>(profileMessages, '{}', { maxTokens: 4096 })
  );

  // ── Call 2: skills list only ──────────────────────────────────────────────
  // Capped at 20 skills with short evidenceSource to keep the JSON under ~1500 chars.
  const skillsMessages: AIMessage[] = [
    systemMsg,
    {
      role: "user",
      content: `Extract a skills list from this resume. Return ONLY a JSON array of up to 20 skill objects. Keep evidenceSource under 50 characters.

[
  {
    "skillName": "string",
    "skillCategory": "Core leadership | Specialized capability | Adjacent direction | Tool / platform",
    "evidenceSource": "brief phrase from resume (max 50 chars)",
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

  const skillsResult = await withRetry(() =>
    provider.generateJSON<ExtractedSkill[]>(skillsMessages, '[]', { maxTokens: 4096 })
  );

  const result: ExtractionResult = {
    profile: profileResult,
    skills: Array.isArray(skillsResult) ? skillsResult : [],
  };

  const topSkillNames = (result.skills ?? [])
    .map((s) => s.skillName?.trim())
    .filter((s): s is string => Boolean(s))
    .slice(0, 10);

  const extractedStrongest =
    Array.isArray(result.profile.strongestSkills) && result.profile.strongestSkills.length > 0
      ? result.profile.strongestSkills.map((s) => String(s).trim()).filter(Boolean)
      : topSkillNames;

  const profileUpdate: ProfileUpdateInput = {
    name: (result.profile.name ?? "").trim() || previous.name,
    location: (result.profile.location ?? "").trim() || previous.location,
    portfolio: (result.profile.portfolio ?? "").trim() || previous.portfolio,
    strongestSkills: extractedStrongest.length > 0 ? extractedStrongest : previous.strongestSkills,
    currentSearchGoal: result.profile.currentSearchGoal || "",
    urgency: normalizeUrgency(result.profile.urgency || "actively searching"),
    direction: result.profile.direction || "",
    targetRoles: result.profile.targetRoles || [],
    desiredIndustries: result.profile.desiredIndustries || [],
    compensationNeeds: result.profile.compensationNeeds || "",
    workPreferences: result.profile.workPreferences || [],
    workModes: [],
    constraints: result.profile.constraints || [],
    dealBreakers: result.profile.dealBreakers || [],
    careerIntent: result.profile.careerIntent || "",
    careerChangeInterest: result.profile.careerChangeInterest || "",
    confidenceLevel: result.profile.confidenceLevel || "high",
    skillsToUseMore: result.profile.skillsToUseMore || [],
    skillsToUseLess: result.profile.skillsToUseLess || [],
    preferredLocations: [],
    remotePreference: "all"
  };

  updateUserProfile(profileUpdate);

  const roleTitleFilters = normalizeTitleKeywords(profileUpdate.targetRoles);
  if (roleTitleFilters.length > 0) {
    const currentTitleFilters = getTitleFilters();
    saveTitleFilters(
      mergeTitleKeywords(currentTitleFilters.positive, roleTitleFilters),
      currentTitleFilters.negative
    );
  }

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
