export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type WorkMode = "remote" | "hybrid" | "onsite";
export type FreshnessWindowHours = 24 | 72 | 168;
export type ScanTrigger = "manual" | "scheduled";

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
  hasExplicitWorkModes: boolean;
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
  reviewStatus: "none" | "pending_review";
  postingResolutionStatus: "resolved" | "needs_resolution";
  postingSearchQuery: string;
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

/** One STAR+Reflection story as returned by Block F before it is flattened to strings. */
export type StructuredStory = {
  question: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
};

export type EvaluationSections = {
  roleSummary: string[];
  matchWithResume: string[];
  levelStrategy: string[];
  compensationDemand: string[];
  tailoringPlan: string[];
  interviewPlan: string[];
  postingLegitimacy: string[];
  /** Structured STAR stories preserved from Block F before flattening. Auto-saved to story_bank. */
  storiesStructured?: StructuredStory[];
};

export type JobKeywordSignal = {
  keyword: string;
  priority: "critical" | "required" | "preferred";
  category: "title" | "technical" | "soft" | "domain" | "tool" | "methodology" | "credential";
  source: "job_title" | "basic_qualification" | "required_qualification" | "preferred_qualification" | "responsibility" | "description";
  rationale: string;
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
  keywordSignals: JobKeywordSignal[];
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

import type { ScanRunErrorEntry } from "../scan-error-category";

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
  errors: ScanRunErrorEntry[];
  trigger?: ScanTrigger;
  freshnessWindowHours?: FreshnessWindowHours;
  freshCount?: number;
  unknownDateCount?: number;
  staleFilteredCount?: number;
  scanType:
    | "careerops"
    | "linkedin-claude-scan"
    | "wellfound-browser-scan"
    | "workatastartup-browser-scan"
    | "glassdoor-browser-scan"
    | "indeed-browser-scan"
    | "monster-browser-scan"
    | "adzuna-api-scan"
    | "email-alert-import"
    | "dice-mcp-scan";
};

export type ImportResult = {
  success: boolean;
  imported: number;
  duplicates: number;
  fresh: number;
  unknownDate: number;
  staleFiltered: number;
  errors: string[];
  summary: string;
  jobIds: string[];
  importedJobs: Array<{ id: string; title: string; url: string; company: string }>;
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
    source: "linkedin" | "wellfound" | "workatastartup" | "glassdoor" | "indeed" | "monster" | "adzuna" | "email" | "dice";
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
    postingResolutionStatus?: "resolved" | "needs_resolution";
    postingSearchQuery?: string;
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
  baseResumeId: string;
  tailoringStatus: string;
  evidenceAuditJson: string;
  fallbackReason: string;
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
  baseResumeId?: string;
  tailoringStatus?: string;
  evidenceAuditJson?: string;
  fallbackReason?: string;
};

export type ScanScheduleRecord = {
  enabled: boolean;
  intervalHours: number;
  freshnessWindowHours: FreshnessWindowHours;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runningSince: string | null;
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
  providerUsed: string;
  modelUsed: string;
  updatedAt: string;
};

export type ApplicationAnswerDraftInput = {
  id: string;
  jobId: string;
  question: string;
  answer: string;
  source: string;
  sortOrder: number;
  providerUsed?: string;
  modelUsed?: string;
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
  hasExplicitWorkModes: boolean;
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

export type AIProviderName = "anthropic" | "gemini" | "openai" | "ollama";

export type AISettingsRecord = {
  id: string;
  /** @deprecated Use providerOrderJson instead. */
  activeProvider: AIProviderName;
  anthropicApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicModel: string;
  geminiModel: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  /** @deprecated Use providerOrderJson instead. */
  fallbackProvider: string;
  providerOrderJson: AIProviderName[];
  onboardingDismissed: boolean;
  onboardingPreferencesConfirmed: boolean;
  braveSearchApiKey: string;
  adzunaAppId: string;
  adzunaApiKey: string;
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
  ollamaBaseUrl: string;
  ollamaModel: string;
  fallbackProvider: string;
  providerOrderJson: AIProviderName[];
  onboardingDismissed?: boolean;
  onboardingPreferencesConfirmed?: boolean;
  braveSearchApiKey?: string;
  adzunaAppId?: string;
  adzunaApiKey?: string;
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
  tags: string[];
  conceptTags: TaxonomyConceptRecord[];
  rawKeywords: string[];
  sourceJobId: string | null;
  sourceBlockF: string;
  storyKind: StoryKind;
  questionId: string | null;
  promptText: string;
  qualityStatus: StoryQualityStatus;
  qualityNotes: string;
  lastEvaluatedAt: string | null;
  sourceJobCompany: string;
  sourceJobTitle: string;
  assignedJobs: StoryJobAssignmentRecord[];
  createdAt: string;
  updatedAt: string;
};

export type StoryKind = "answered_question" | "standalone_story" | "evaluation_suggestion";

export type StoryQualityStatus = "ready" | "needs_detail" | "missing_result";

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
  tags?: string[];
  conceptTags?: string[];
  sourceJobId?: string | null;
  sourceBlockF?: string;
  storyKind?: StoryKind;
  questionId?: string | null;
  promptText?: string;
  qualityStatus?: StoryQualityStatus;
  qualityNotes?: string;
  lastEvaluatedAt?: string | null;
  assignedJobIds?: string[];
};

export type StoryJobAssignmentRecord = {
  jobId: string;
  company: string;
  role: string;
  status: string;
  source: "auto" | "manual";
};

export type TaxonomyConceptStatus = "active" | "candidate" | "archived";

export type TaxonomyConceptRecord = {
  id: string;
  label: string;
  normalizedLabel: string;
  parentId: string | null;
  depth: number;
  description: string;
  status: TaxonomyConceptStatus;
  createdFrom: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  aliases: TaxonomyAliasRecord[];
  storyCount: number;
  jobCount: number;
  path: string[];
  children: TaxonomyConceptRecord[];
};

export type ConsolidationCanonical = {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  tags: string[];
};

export type ConsolidationCluster = {
  key: string;
  canonical: ConsolidationCanonical;
  members: Array<{ id: string; title: string; sourceJobId: string | null; sourceJobTitle: string }>;
};

export type ConsolidationPayload = {
  totalSuggestions: number;
  clusters: ConsolidationCluster[];
};

export type ConsolidationRunRecord = {
  id: string;
  status: "review" | "committed" | "abandoned";
  payload: ConsolidationPayload;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationSuggestionDigest = {
  id: string;
  title: string;
  situation: string;
  action: string;
  result: string;
  tags: string[];
  sourceJobId: string | null;
  sourceJobTitle: string;
};

export type PracticeAttemptRecord = {
  id: string;
  questionId: string | null;
  storyId: string | null;
  transcript: string;
  parsed: {
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
    reflection: string;
  };
  qualityStatus: StoryQualityStatus;
  coachingNotes: string[];
  createdAt: string;
};

export type QuestionPracticeRecord = {
  questionId: string;
  attemptCount: number;
  lastPracticedAt: string | null;
  linkedStories: Array<{ id: string; title: string; qualityStatus: StoryQualityStatus }>;
  attempts: PracticeAttemptRecord[];
};

export type TaxonomyCandidateRecord = {
  id: string;
  label: string;
  path: string[];
  storyCount: number;
  jobCount: number;
};

export type TaxonomyAliasRecord = {
  id: string;
  conceptId: string;
  rawPhrase: string;
  normalizedPhrase: string;
  source: string;
  confidence: number;
  verifiedAt: string | null;
  createdAt: string;
};

export type TaxonomyActivityRecord = {
  id: string;
  action: string;
  conceptId: string | null;
  relatedId: string | null;
  details: JsonValue;
  actor: string;
  createdAt: string;
};

export type TaxonomyConceptInput = {
  id?: string;
  label: string;
  parentId?: string | null;
  description?: string;
};

export type InterviewQuestionSource = "default" | "custom";

export type InterviewQuestionRecord = {
  id: string;
  prompt: string;
  category: string;
  source: InterviewQuestionSource;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InterviewQuestionInput = {
  id: string;
  prompt: string;
  category: string;
  source?: InterviewQuestionSource;
  active?: boolean;
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
  providerUsed: string;
  modelUsed: string;
  createdAt: string;
};

export type OutreachDraftInput = {
  id: string;
  jobId: string;
  contactType: "recruiter" | "hiring_manager" | "peer";
  message: string;
  providerUsed?: string;
  modelUsed?: string;
};

export type WritingStyleRecord = {
  id: string;
  toneProfile: string;
  sampleCount: number;
  lastUpdated: string;
};

export type GapAnswerQualityStatus = "addressed" | "needs_followup";

export type JobGapResponseRecord = {
  id: string;
  jobId: string;
  gapText: string;
  rawResponse: string;
  polishedResponse: string;
  source: string;
  qualityStatus: GapAnswerQualityStatus;
  followUpQuestion: string;
  assessment: JsonValue;
  assessedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobGapResponseInput = {
  id: string;
  jobId: string;
  gapText: string;
  rawResponse: string;
  polishedResponse: string;
  qualityStatus?: GapAnswerQualityStatus;
  followUpQuestion?: string;
  assessment?: JsonValue;
};

export type ProfileSupplementRecord = {
  id: string;
  content: string;
  tags: string[];
  qualityStatus: GapAnswerQualityStatus;
  followUpQuestion: string;
  assessment: JsonValue;
  assessedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfileSupplementInput = {
  id: string;
  content: string;
  tags: string[];
  qualityStatus?: GapAnswerQualityStatus;
  followUpQuestion?: string;
  assessment?: JsonValue;
};

export type ActionQueueData = {
  toApply: JobRecord[];
  recentlyApplied: ApplicationRecord[];
};

export type PendingEmailJobCandidate = {
  id: string;
  batchId: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: string;
  sourceFilename: string;
  company: string;
  position: string;
  location: string;
  url: string;
  sourceUrl: string;
  originalPostingUrl: string;
  jobDescription: string;
  salaryNotes: string;
  snippet: string;
  confidence: "high" | "medium" | "low";
  extractionNotes: string;
  postingResolutionStatus: "resolved" | "needs_resolution";
  postingSearchQuery: string;
  candidateLinks: string[];
  discoveredAt: string;
  titleMatch: "good" | "weak" | "unknown";
  createdAt: string;
};

export type PendingEmailJobCandidateInput = Omit<PendingEmailJobCandidate, "createdAt">;
