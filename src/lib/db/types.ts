export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type UserProfileRecord = {
  id: string;
  name: string;
  location: string;
  portfolio: string;
  currentSearchGoal: string;
  urgency: string;
  direction: string;
  constraints: string[];
  targetRoles: string[];
  strongestSkills: string[];
  skillsToUseMore: string[];
  skillsToUseLess: string[];
};

export type SkillRecord = {
  id: string;
  skillName: string;
  skillCategory: string;
  evidenceSource: string;
  strengthLevel: string;
  marketRelevance: string;
  userInterestLevel: string;
  usePreference: string;
};

export type RoleDirectionRecord = {
  id: string;
  roleFamily: string;
  fitLevel: string;
  score: number;
  rationale: string;
  gaps: string[];
  recommendationType: string;
};

export type JobRecord = {
  id: string;
  company: string;
  title: string;
  url: string;
  source: string;
  location: string;
  remoteType: string;
  datePosted: string | null;
  firstSeenDate: string;
  freshnessLabel: string;
  rawDescription: string;
  parsedDescription: string;
  status: string;
  fitScore: number;
  roleArchetype: string;
  recommendation: string;
  summary: string;
  whyItMatches: string;
  mainConcern: string;
  recommendedResume: string;
  salaryNotes: string;
  requirementMatch: string[];
  resumeEvidence: string[];
  gaps: string[];
  redFlags: string[];
};

export type ResumeRecord = {
  id: string;
  name: string;
  sourceFile: string;
  status: string;
  activeStatus: boolean;
};

export type GeneratedDocumentRecord = {
  id: string;
  jobId: string;
  company: string;
  role: string;
  documentType: string;
  title: string;
  content: string;
  pdfUrl: string;
  baseResume: string;
  generatedDate: string;
  status: string;
  tailoringSummary: string;
};

export type ApplicationRecord = {
  id: string;
  jobId: string;
  company: string;
  role: string;
  status: string;
  appliedDate: string | null;
  followUpDate: string;
  notes: string;
  contact: string;
  responseStatus: string;
  fitScore: number;
};

export type ActivityRecord = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  timestamp: string;
  details: JsonValue;
};

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

export type FunnelStage = {
  label: string;
  value: number;
};
