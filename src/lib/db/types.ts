export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type WorkMode = "remote" | "hybrid" | "onsite";

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
  workModes: WorkMode[];
  dealBreakers: string[];
  careerIntent: string;
  careerChangeInterest: string;
  confidenceLevel: string;
  constraints: string[];
  targetRoles: string[];
  strongestSkills: string[];
  skillsToUseMore: string[];
  skillsToUseLess: string[];
  preferredLocations: string[];
  remotePreference: "remote-only" | "local-or-remote" | "all";
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
  sourceUrl: string;
  originalPostingUrl: string;
  originalPostingKey: string;
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
  livenessStatus: string;
  livenessCheckedAt: string;
  scopeStatus: string;
  archived: boolean;
  isDuplicate: boolean;
  duplicateOf: string[] | null;
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
  providerUsed: string;
  modelUsed: string;
  tokensUsed: number;
  generationMs: number;
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
  scanType: "careerops" | "linkedin-claude-scan" | "wellfound-browser-scan" | "workatastartup-browser-scan";
};

export type ImportResult = {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: string[];
  summary: string;
  jobIds: string[];
  scanRunId: string;
};

export type LinkedInScanFile = {
  metadata: {
    scanTimestamp: string;
    scanDurationSeconds: number;
    totalJobsDiscovered: number;
    totalJobsValid: number;
    totalJobsSkipped: number;
    searchCriteria: Record<string, unknown>;
  };
  jobs: Array<{
    id: string;
    company: string;
    position: string;
    jobDescription?: string;
    url: string;
    discoveredAt: string;
    location?: string;
    dataQuality?: Record<string, boolean | number | string | string[]>;
  }>;
};

export type BrowserBoardScanFile = {
  metadata: {
    source: "linkedin" | "wellfound" | "workatastartup";
    scanTimestamp: string;
    scanDurationSeconds: number;
    totalJobsDiscovered: number;
    totalJobsValid?: number;
    totalJobsSkipped?: number;
    searchCriteria: Record<string, unknown>;
    generatedBy?: string;
  };
  jobs: Array<{
    id?: string;
    company: string;
    title?: string;
    position?: string;
    jobDescription?: string;
    description?: string;
    url?: string;
    platformUrl?: string;
    sourceUrl?: string;
    originalPostingUrl?: string;
    applyUrl?: string;
    externalApplyUrl?: string;
    discoveredAt: string;
    location?: string;
    datePosted?: string | null;
    salaryNotes?: string;
    dataQuality?: Record<string, boolean | number | string | string[]>;
  }>;
  validationSummary?: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    errors: string[];
  };
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

export type ResumeBuilderSectionType =
  | "header"
  | "summary"
  | "impact"
  | "experience"
  | "skills"
  | "recognition"
  | "education"
  | "custom";

export type ResumeBuilderSection = {
  id: string;
  type: ResumeBuilderSectionType;
  title: string;
  text?: string;
  items?: string[];
  header?: {
    name: string;
    headline: string;
    contactItems: string[];
  };
  experience?: Array<{
    title: string;
    organization: string;
    location?: string;
    dateRange: string;
    bullets: string[];
  }>;
  education?: Array<{
    degree: string;
    school: string;
    focus?: string;
  }>;
};

export type ResumeBuilderVersionStatus = "needs_review" | "approved" | "missing_source";

export type ResumeBuilderVersionRecord = {
  id: string;
  resumeId: string;
  status: ResumeBuilderVersionStatus;
  sections: ResumeBuilderSection[];
  sourceHash: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

export type ResumeSectionMode = "keep" | "update" | "hide";

export type ResumeSectionModeInput = {
  sectionId: string;
  mode: ResumeSectionMode;
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
  draftJson: string;
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
  draftJson: string;
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

export type ApplicationStatus =
  | "Found"
  | "Reviewed"
  | "Resume generated"
  | "Applied"
  | "Follow-up needed"
  | "Recruiter responded"
  | "Interviewing"
  | "Offer"
  | "Rejected"
  | "Skipped"
  | "Archived";

export type ApplicationAnswerDraftRecord = {
  id: string;
  jobId: string;
  question: string;
  answer: string;
  source: string;
  sortOrder: number;
  updatedAt: string;
};

export type ApplicationAnswerDraftInput = {
  id: string;
  jobId: string;
  question: string;
  answer: string;
  source: string;
  sortOrder: number;
};

export type ApplicationStatusUpdateInput = {
  jobId: string;
  status: ApplicationStatus;
  followUpDate?: string;
  notes?: string;
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
  name: string;
  location: string;
  portfolio: string;
  strongestSkills: string[];
  currentSearchGoal: string;
  urgency: string;
  direction: string;
  targetRoles: string[];
  desiredIndustries: string[];
  compensationNeeds: string;
  workPreferences: string[];
  workModes: WorkMode[];
  constraints: string[];
  dealBreakers: string[];
  careerIntent: string;
  careerChangeInterest: string;
  confidenceLevel: string;
  skillsToUseMore: string[];
  skillsToUseLess: string[];
  preferredLocations: string[];
  remotePreference: "remote-only" | "local-or-remote" | "all";
};

export type RoleDirectionUpdateInput = {
  id: string;
  fitLevel: string;
  score: number;
  rationale: string;
  gaps: string[];
};

export type AIProviderName = "anthropic" | "gemini" | "openai";

export type AISettingsRecord = {
  id: string;
  activeProvider: AIProviderName;
  anthropicApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicModel: string;
  geminiModel: string;
  openaiModel: string;
  fallbackProvider: string;
  onboardingDismissed: boolean;
  onboardingPreferencesConfirmed: boolean;
  updatedAt: string;
};

export type AISettingsUpdateInput = {
  activeProvider: AIProviderName;
  anthropicApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicModel: string;
  geminiModel: string;
  openaiModel: string;
  fallbackProvider: string;
  onboardingDismissed?: boolean;
  onboardingPreferencesConfirmed?: boolean;
};

export type AIPromptId =
  | "resume_tailoring"
  | "application_answers"
  | "outreach_recruiter"
  | "outreach_hiring_manager"
  | "outreach_peer";

export type AIPromptOverrideRecord = {
  promptId: AIPromptId;
  customPrompt: string;
  updatedAt: string;
};

export type StoryRecord = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  skills: string[];
  themes: string[];
  sourceJobId: string | null;
  sourceBlockF: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryInput = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  skills: string[];
  themes: string[];
  sourceJobId?: string | null;
  sourceBlockF?: string;
};

export type CompanyResearchRecord = {
  id: string;
  jobId: string;
  company: string;
  aiStrategy: string;
  recentMovements: string;
  engineeringCulture: string;
  technicalChallenges: string;
  competitivePosition: string;
  candidateAngle: string;
  providerUsed: string;
  modelUsed: string;
  createdAt: string;
};

export type CompanyResearchInput = {
  id: string;
  jobId: string;
  company: string;
  aiStrategy: string;
  recentMovements: string;
  engineeringCulture: string;
  technicalChallenges: string;
  competitivePosition: string;
  candidateAngle: string;
  providerUsed: string;
  modelUsed: string;
};

export type OutreachDraftRecord = {
  id: string;
  jobId: string;
  contactType: "recruiter" | "hiring_manager" | "peer";
  message: string;
  charCount: number;
  status: string;
  createdAt: string;
};

export type OutreachDraftInput = {
  id: string;
  jobId: string;
  contactType: "recruiter" | "hiring_manager" | "peer";
  message: string;
};

export type WritingStyleRecord = {
  id: string;
  toneProfile: string;
  sampleCount: number;
  lastUpdated: string;
};

export type JobGapResponseRecord = {
  id: string;
  jobId: string;
  gapText: string;
  rawResponse: string;
  polishedResponse: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type JobGapResponseInput = {
  id: string;
  jobId: string;
  gapText: string;
  rawResponse: string;
  polishedResponse: string;
};

export type ProfileSupplementRecord = {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProfileSupplementInput = {
  id: string;
  content: string;
  tags: string[];
};

export type ActionQueueData = {
  toApply: JobRecord[];
  recentlyApplied: ApplicationRecord[];
};
