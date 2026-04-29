export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type UserProfileRecord = {
  id: string;
  name: string;
  location: string;
  portfolio: string;
  currentSearchGoal: string;
  urgency: string;
  direction: string;
  desiredIndustries: string[];
  compensationNeeds: string;
  workPreferences: string[];
  dealBreakers: string[];
  careerIntent: string;
  careerChangeInterest: string;
  confidenceLevel: string;
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

export type ScannedJobInput = {
  id: string;
  company: string;
  title: string;
  url: string;
  source: string;
  location: string;
  datePosted: string | null;
  firstSeenDate: string;
};

export type EvaluationSections = {
  roleSummary: string[];
  matchWithResume: string[];
  levelStrategy: string[];
  compensationDemand: string[];
  tailoringPlan: string[];
  interviewPlan: string[];
  postingLegitimacy: string[];
};

export type EvaluationRecord = {
  id: string;
  jobId: string;
  fitScore: number;
  scoreLabel: string;
  roleArchetype: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  redFlags: string[];
  recommendation: string;
  resumeBaseRecommendation: string;
  requirementMatch: string[];
  resumeEvidence: string[];
  sections: EvaluationSections;
  legitimacyLabel: string;
  keywords: string[];
  userCorrection: Record<string, JsonValue>;
  createdAt: string;
};

export type JobEvaluationResultInput = Omit<EvaluationRecord, "createdAt"> & {
  whyItMatches: string;
  mainConcern: string;
  salaryNotes: string;
};

export type EvaluationCorrectionInput = {
  jobId: string;
  roleArchetype: string;
  fitScore: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  redFlags: string[];
  correctionNote: string;
};

export type EvaluationFeedbackRecord = {
  id: string;
  jobId: string;
  company: string;
  title: string;
  roleArchetype: string;
  correctedScore: number;
  correctedRecommendation: string;
  correctionNote: string;
  createdAt: string;
};

export type ScanRunRecord = {
  id: string;
  status: "completed" | "completed_with_errors" | "failed";
  startedAt: string;
  completedAt: string | null;
  companiesScanned: number;
  skippedCompanies: number;
  totalJobsFound: number;
  filteredCount: number;
  duplicateCount: number;
  newJobsCount: number;
  errors: Array<{ company: string; error: string }>;
};

export type ResumeRecord = {
  id: string;
  name: string;
  sourceFile: string;
  status: string;
  activeStatus: boolean;
  extractedText: string;
  extractedAt: string | null;
  wordCount: number;
  evidence: string[];
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
  htmlUrl: string;
  keywordCoverage: number;
  tailoringPlan: string[];
};

export type GeneratedDocumentInput = {
  id: string;
  jobId: string;
  documentType: string;
  title: string;
  content: string;
  pdfUrl: string;
  htmlUrl: string;
  baseResume: string;
  generatedDate: string;
  status: string;
  tailoringSummary: string;
  keywordCoverage: number;
  tailoringPlan: string[];
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

export type ProfileUpdateInput = {
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

export type RoleDirectionUpdateInput = {
  id: string;
  fitLevel: string;
  score: number;
  rationale: string;
  gaps: string[];
};
