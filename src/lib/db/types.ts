import type { BrowserBoardScanType, BrowserBoardSource } from "../scanner/browser-board-sources";

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
  /** Places the user would physically work — drives hybrid and on-site matching. */
  preferredLocations: string[];
  /** Countries/regions whose remote roles the user can take. Empty means unrestricted. */
  remoteLocations: string[];
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

/**
 * One STAR+Reflection story, as the retired seven-block evaluator produced them.
 * Retained because legacy evaluations still hold these; nothing writes them now.
 */
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
  /** Historical: structured stories from legacy evaluations. Fast Evaluation writes none. */
  storiesStructured?: StructuredStory[];
};

export type JobKeywordSignal = {
  keyword: string;
  priority: "critical" | "required" | "preferred";
  category: "title" | "technical" | "soft" | "domain" | "tool" | "methodology" | "credential";
  source: "job_title" | "basic_qualification" | "required_qualification" | "preferred_qualification" | "responsibility" | "description";
  rationale: string;
};

// ─── Fast Evaluation (fast-v2) ──────────────────────────────────────────────
// PRD v0.2.1 §12. The contract is split in two on purpose: the model returns
// component scores and observations, and JST calculates every value it intends
// to own deterministically (fit total, recommendation, confidence, scoreLabel).
// The model never returns a final judgment it could contradict on a re-run.

/** How well the role matches the direction the user is actually searching in. */
export type DirectionAlignment = "strong" | "partial" | "none";

export type FastEvaluationRecommendation =
  | "Priority apply"
  | "Strong apply"
  | "Review manually"
  | "Skip"
  | "Blocked";

export type EvaluationConfidence = "High" | "Medium" | "Low";

/** Derived from fitScore for the existing `score_label` column. Not a headline signal. */
export type EvaluationScoreLabel = "Strong fit" | "Review" | "Selective" | "Weak fit";

export type FitComponents = {
  coreRequirements: number;  // 0–40
  roleAndSeniority: number;  // 0–25
  relevantEvidence: number;  // 0–20
  userPreferences: number;   // 0–15
};

export type EvidenceMatch = {
  claim: string;
  evidence: string;
  strength: "strong" | "moderate" | "weak";
};

export type Gap = {
  requirement: string;
  detail: string;
};

export type RequirementMatch = {
  requirement: string;
  status: "supported" | "partial" | "unknown";
  evidence: string;
};

export type RequirementSummary = {
  supported: number;
  partial: number;
  unknown: number;
};

export type HardBlockerKind =
  | "relocation"
  | "credential"
  | "work_authorization"
  | "onsite_location"
  | "other";

/**
 * What the model proposes as a blocker. Never acted on directly — §15 requires
 * explicit evidence on both sides, so JST validates candidates before any of
 * them can turn a recommendation into `Blocked`.
 */
export type HardBlockerCandidate = {
  kind: HardBlockerKind;
  postingEvidence: string;
  candidateConstraint: string;
};

/** A candidate that survived validation, with the message shown to the user. */
export type HardBlocker = HardBlockerCandidate & {
  message: string;
};

export type FastEvaluationModelOutput = {
  roleArchetype: string;
  seniority: string;
  domain: string;

  directionAlignment: DirectionAlignment;
  directionAlignmentRationale: string;

  fitComponents: FitComponents;

  strengths: EvidenceMatch[];   // max 5
  gaps: Gap[];                  // max 3
  redFlags: string[];           // max 3, non-blocking concerns
  hardBlockerCandidates: HardBlockerCandidate[];

  requirementMatches: RequirementMatch[];
  requirementSummary: RequirementSummary;

  resumeEvidence: string[];
  resumeBaseRecommendation: string;
  postedCompensation: string;
  summary: string;
};

export type FastEvaluation = FastEvaluationModelOutput & {
  fitScore: number;
  recommendation: FastEvaluationRecommendation;
  confidence: EvaluationConfidence;
  scoreLabel: EvaluationScoreLabel;

  hardBlockers: HardBlocker[];
  /** Optional fields that degraded during normalization (§18.3). */
  completenessWarnings: string[];

  evaluationVersion: "fast-v2";
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

  // ─── fast-v2 (PRD v0.2.1 §20) ───────────────────────────────────────────
  // Present on every record. Rows written before Phase 1 report
  // `evaluationVersion: "legacy-v1"` and leave the rest at their empty values,
  // which is what tells the UI to render the old A–G sections instead.
  evaluationVersion: string;
  seniority: string;
  domain: string;
  directionAlignment: string;
  confidenceLabel: string;
  fitComponents: FitComponents | null;
  hardBlockers: HardBlocker[];
  requirementsSummary: RequirementSummary | null;
  jdHash: string;
  /** Normalized model output, for the inspectable detail view. */
  modelOutput: FastEvaluationModelOutput | null;
  completenessWarnings: string[];

  createdAt: string;
};

export type JobEvaluationResultInput = Omit<EvaluationRecord, "createdAt"> & {
  whyItMatches: string;
  mainConcern: string;
  salaryNotes: string;
};

// ─── Application Preparation (PRD v0.2.1 §22–§30) ──────────────────────────

export type ApplicationRequirementType =
  | "must_have"
  | "preferred"
  | "responsibility"
  | "tool"
  | "method"
  | "credential"
  | "domain";

export type EvidenceStatus = "supported" | "partial" | "unknown";

export type ApplicationRequirement = {
  text: string;
  type: ApplicationRequirementType;
  evidenceStatus: EvidenceStatus;
  /** Ids into the global evidence bank; empty when nothing supports the requirement. */
  evidenceIds: string[];
};

export type EvidenceMapEntry = {
  requirement: string;
  evidence: string;
  evidenceId: string;
  source: string;
  suggestedPlacement: string;
};

export type PostedCompensation = {
  raw: string;
  min?: number;
  max?: number;
  currency?: string;
  period?: string;
};

export type MarketCompensation = {
  summary: string;
  min?: number;
  max?: number;
  currency?: string;
};

export type CompensationSource = {
  title: string;
  url: string;
  snippet: string;
};

/**
 * Whether live market research ran, and if not, why. Never inferred at read
 * time: a range with no provenance must not be presentable as current research.
 */
export type CompensationResearchStatus =
  | "not_run"
  | "completed"
  | "unavailable"
  | "failed";

export type ApplicationPreparationRecord = {
  id: string;
  jobId: string;
  evaluationId: string;
  status: string;

  jdHash: string;
  evidenceHash: string;

  requirements: ApplicationRequirement[];
  keywordSignals: JobKeywordSignal[];
  evidenceMap: EvidenceMapEntry[];

  postedCompensation: PostedCompensation | null;
  marketCompensation: MarketCompensation | null;
  compensationSources: CompensationSource[];
  compensationResearchStatus: CompensationResearchStatus;
  suggestedCompensationResponse: string;

  providerUsed: string;
  modelUsed: string;
  researchProvider: string;
  generationMs: number;

  createdAt: string;
  updatedAt: string;
};

export type ApplicationPreparationInput = Omit<ApplicationPreparationRecord, "createdAt" | "updatedAt">;

/** What the model returns for Application Preparation — no hashes, no provenance. */
export type ApplicationPreparationModelOutput = {
  requirements: ApplicationRequirement[];
  keywordSignals: JobKeywordSignal[];
  evidenceMap: EvidenceMapEntry[];
  suggestedCompensationResponse: string;
};

// ─── External integrations (PRD v0.2.1 §61–§63) ────────────────────────────

export type IntegrationProvider = "clay";

export type IntegrationConnectionStatus =
  | "not_connected"
  | "connected"
  | "invalid_credential"
  | "unavailable";

export type ExternalIntegrationRecord = {
  id: string;
  provider: IntegrationProvider;
  authType: string;
  /** Always masked (••••last4) on read. The full value stays server-side. */
  maskedCredential: string;
  hasCredential: boolean;
  accountLabel: string;
  connectionStatus: IntegrationConnectionStatus;
  enabled: boolean;
  metadata: Record<string, JsonValue>;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Contacts (PRD v0.2.1 §36–§38) ─────────────────────────────────────────

export type ContactRole =
  | "hiring_manager"
  | "functional_leader"
  | "executive"
  | "recruiter"
  | "peer"
  | "referral"
  | "other";

export type ContactStatus =
  | "Found"
  | "Shortlisted"
  | "Drafted"
  | "Contacted"
  | "Responded"
  | "Not Relevant";

export type ContactRecord = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  companyDomain: string;
  linkedinUrl: string;
  workEmail: string;
  sourceProvider: string;
  sourceRecordId: string;
  profileConfidence: string;
  emailConfidence: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = Omit<ContactRecord, "createdAt" | "updatedAt">;

/** One person's relevance to one opportunity. Shared contact, per-job judgement. */
export type JobContactLinkRecord = {
  id: string;
  jobId: string;
  contactId: string;
  contactRole: ContactRole;
  relevanceScore: number;
  relevanceReasons: string[];
  status: ContactStatus;
  lastContactedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A contact joined to its link for one job — what the Outreach tab renders. */
export type JobContact = ContactRecord & {
  link: JobContactLinkRecord;
};

// ─── Outreach messages (PRD v0.2.1 §51, §55) ───────────────────────────────

/**
 * §55: length is a property of the channel, not a single universal limit. The
 * old code hard-coded 300 characters for everything because it only ever wrote
 * LinkedIn connection notes.
 */
export type OutreachChannel = "linkedin_connection" | "linkedin_message" | "email";

export type OutreachMessageStatus = "draft" | "sent" | "archived";

export type OutreachMessageRecord = {
  id: string;
  jobContactLinkId: string;
  channel: OutreachChannel;
  subject: string;
  message: string;
  status: OutreachMessageStatus;
  providerUsed: string;
  modelUsed: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachMessageInput = Omit<OutreachMessageRecord, "createdAt" | "updatedAt">;

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
  /**
   * Subset of `newJobsCount` that matched a role already in the app at a different
   * URL, admitted because the existing row was closed out. Re-posted requisitions.
   */
  repostCount?: number;
  /** "careerops" plus every browser/API board, taken from the shared registry. */
  scanType: "careerops" | BrowserBoardScanType;
};

export type ImportResult = {
  success: boolean;
  imported: number;
  duplicates: number;
  fresh: number;
  unknownDate: number;
  staleFiltered: number;
  /** Dropped because the location fell outside the profile's location preferences. */
  preferenceFiltered: number;
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
    // Sourced from the single registry in browser-board-sources rather than
    // duplicated inline; the previous hand-copied union silently drifted out of
    // sync whenever a board was added.
    source: BrowserBoardSource;
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
  remoteLocations: string[];
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
  /** Providers the user has switched on, as an unordered membership set — order lives
   *  in providerOrderJson. `null` means a row saved before the two were split, where
   *  providerOrderJson still carries both meanings. */
  providerEnabledJson: AIProviderName[] | null;
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
  /** Providers the user has switched on, as an unordered membership set — order lives
   *  in providerOrderJson. `null` means a row saved before the two were split, where
   *  providerOrderJson still carries both meanings. */
  providerEnabledJson: AIProviderName[] | null;
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
  storySource: string;
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
  storySource?: string;
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

/** A job's gap answer after the global evidence bank has been filled in behind it. */
export type ResolvedGapResponse = {
  rawResponse: string;
  polishedResponse: string;
  qualityStatus: GapAnswerQualityStatus;
  followUpQuestion: string;
  /** true when this came from the global bank rather than being written for this job. */
  fromBank: boolean;
};

/**
 * A gap's state in the global evidence bank. `unanswered` has no database
 * representation — it means the gap was raised by an evaluation and nothing has
 * been written for it yet.
 */
export type GapEvidenceStatus = GapAnswerQualityStatus | "unanswered";

export type GapEvidenceEntry = {
  gapText: string;
  status: GapEvidenceStatus;
  /** The reusable answer, empty when `status` is `unanswered`. */
  content: string;
  followUpQuestion: string;
  /** Persisted question list — re-read, never regenerated, so it stays stable. */
  followUpQuestions: string[];
  supplementId: string | null;
  /** Every role that raised this gap — the reason it is worth answering. */
  jobs: Array<{ id: string; position: string; company: string }>;
  updatedAt: string | null;
};

export type GapEvidenceCounts = {
  /** Answers the user started that the assessor judged too thin to use. */
  needsDetail: number;
  /** Untouched gaps that more than one role raised — worth answering once. */
  recurringUnanswered: number;
  addressed: number;
  /** Every untouched gap, including one-off ones best handled on the job page. */
  totalUnanswered: number;
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
