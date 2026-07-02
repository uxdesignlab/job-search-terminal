import { randomUUID } from "node:crypto";
import { activeApplicationStatuses } from "../applications/status";
import { coerceResumeBaseToLane } from "../evaluation/resume-lane-picker";
import { normalizePreferredLocations } from "../profile/locations";
import type { ScanRunErrorEntry } from "../scan-error-category";
import { getDatabase } from "./client";
import { freshnessLabelFor } from "../scanner/freshness";
import { filterFreshScanMatches } from "../jobs/fresh-match-dedupe";
import type {
  AIProviderName,
  AIPromptId,
  AIPromptOverrideRecord,
  AISettingsRecord,
  AISettingsUpdateInput,
  ActivityRecord,
  ApplicationAnswerDraftInput,
  ApplicationAnswerDraftRecord,
  ApplicationRecord,
  ApplicationStatus,
  ApplicationStatusUpdateInput,
  CompanyResearchInput,
  CompanyResearchRecord,
  DashboardMetric,
  EvaluationCorrectionInput,
  EvaluationFeedbackRecord,
  EvaluationRecord,
  FunnelStage,
  GeneratedDocumentInput,
  GeneratedDocumentRecord,
  JobEvaluationResultInput,
  JobRecord,
  JsonValue,
  InterviewQuestionInput,
  InterviewQuestionRecord,
  OutreachDraftInput,
  OutreachDraftRecord,
  ProfileUpdateInput,
  ResumeBuilderSection,
  ResumeBuilderVersionRecord,
  ResumeBuilderVersionStatus,
  ResumeRecord,
  RoleDirectionRecord,
  RoleDirectionUpdateInput,
  ScannedJobInput,
  ScanRunRecord,
  SkillRecord,
  StoryInput,
  StoryRecord,
  StructuredStory,
  UserProfileRecord,
  WorkMode,
  WritingStyleRecord,
  JobGapResponseRecord,
  JobGapResponseInput,
  ProfileSupplementRecord,
  ProfileSupplementInput,
  ActionQueueData,
  FreshnessWindowHours,
  ScanScheduleRecord,
  ScanTrigger,
  PendingEmailJobCandidate,
  ConsolidationCanonical,
  ConsolidationPayload,
  ConsolidationRunRecord,
  EvaluationSuggestionDigest,
  PendingEmailJobCandidateInput,
  PracticeAttemptRecord,
  QuestionPracticeRecord,
  TaxonomyActivityRecord,
  TaxonomyAliasRecord,
  TaxonomyCandidateRecord,
  TaxonomyConceptInput,
  TaxonomyConceptRecord,
  StoryKind,
  StoryQualityStatus
} from "./types";

const parseJson = <T>(value: string | null | undefined, fallback?: T): T => {
  if (value == null || value === "") return (fallback ?? null) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    console.warn("[db] corrupt JSON column, returning fallback:", value.slice(0, 80));
    return (fallback ?? null) as T;
  }
};

const WORK_MODE_VALUES = new Set<WorkMode>(["remote", "hybrid", "onsite"]);

/** Application statuses eligible for interview-prep story assignment (manual or auto). */
const ELIGIBLE_ASSIGNMENT_STATUSES = new Set(["Applied", "Recruiter responded", "Interviewing"]);

type ProfileRow = {
  id: string;
  name: string;
  location: string;
  portfolio: string;
  current_search_goal: string;
  urgency: string;
  direction: string;
  desired_industries_json: string;
  compensation_needs: string;
  work_preferences_json: string;
  work_modes_json: string;
  deal_breakers_json: string;
  career_intent: string;
  career_change_interest: string;
  confidence_level: string;
  constraints_json: string;
  target_roles_json: string;
  strongest_skills_json: string;
  skills_to_use_more_json: string;
  skills_to_use_less_json: string;
  preferred_locations_json: string;
  remote_preference: string;
};

type JobRow = {
  id: string;
  company: string;
  title: string;
  url: string;
  source_url: string;
  original_posting_url: string;
  original_posting_key: string;
  source: string;
  location: string;
  remote_type: string;
  date_posted: string | null;
  first_seen_date: string;
  freshness_label: string;
  raw_description: string;
  parsed_description: string;
  status: string;
  fit_score: number;
  role_archetype: string;
  recommendation: string;
  summary: string;
  why_it_matches: string;
  main_concern: string;
  recommended_resume: string;
  salary_notes: string;
  requirement_match_json: string;
  resume_evidence_json: string;
  gaps_json: string;
  red_flags_json: string;
  liveness_status: string;
  liveness_checked_at: string;
  scope_status: string;
  review_status: string;
  posting_resolution_status: string;
  posting_search_query: string;
  archived: number;
  is_duplicate: number;
  duplicate_of: string | null;
};

type ScanRunRow = {
  id: string;
  status: "completed" | "completed_with_errors" | "failed";
  started_at: string;
  completed_at: string | null;
  companies_scanned: number;
  skipped_companies: number;
  total_jobs_found: number;
  filtered_count: number;
  duplicate_count: number;
  new_jobs_count: number;
  errors_json: string;
  scan_type: string;
  trigger?: string;
  freshness_window_hours?: number;
  fresh_count?: number;
  unknown_date_count?: number;
  stale_filtered_count?: number;
};

type ResumeBuilderVersionRow = {
  id: string;
  resume_id: string;
  status: string;
  sections_json: string;
  source_hash: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

type EvaluationRow = {
  id: string;
  job_id: string;
  fit_score: number;
  score_label: string;
  role_archetype: string;
  summary: string;
  strengths_json: string;
  gaps_json: string;
  red_flags_json: string;
  recommendation: string;
  resume_base_recommendation: string;
  requirement_match_json: string;
  resume_evidence_json: string;
  sections_json: string;
  legitimacy_label: string;
  keywords_json: string;
  user_correction_json: string;
  provider_used: string;
  model_used: string;
  tokens_used: number;
  generation_ms: number;
  created_at: string;
};

type GeneratedDocumentRow = {
  id: string;
  jobId: string;
  company: string;
  role: string;
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
  tailoringPlanJson: string;
  draftJson: string;
  baseResumeId: string;
  tailoringStatus: string;
  evidenceAuditJson: string;
  fallbackReason: string;
};

type ApplicationAnswerDraftRow = {
  id: string;
  job_id: string;
  question: string;
  answer: string;
  source: string;
  sort_order: number;
  provider_used: string;
  model_used: string;
  updated_at: string;
};

export function getUserProfile(): UserProfileRecord {
  const row = getDatabase().prepare("select * from user_profile order by created_at asc limit 1").get() as ProfileRow;

  return {
    id: row.id,
    name: row.name,
    location: row.location,
    portfolio: row.portfolio,
    currentSearchGoal: row.current_search_goal,
    urgency: row.urgency,
    direction: row.direction,
    desiredIndustries: parseJson<string[]>(row.desired_industries_json),
    compensationNeeds: row.compensation_needs,
    workPreferences: parseJson<string[]>(row.work_preferences_json),
    workModes: normalizeWorkModes(parseJson<string[]>(row.work_modes_json ?? "[]"), parseJson<string[]>(row.work_preferences_json), row.remote_preference),
    dealBreakers: parseJson<string[]>(row.deal_breakers_json),
    careerIntent: row.career_intent,
    careerChangeInterest: row.career_change_interest,
    confidenceLevel: row.confidence_level,
    constraints: parseJson<string[]>(row.constraints_json),
    targetRoles: parseJson<string[]>(row.target_roles_json),
    strongestSkills: parseJson<string[]>(row.strongest_skills_json),
    skillsToUseMore: parseJson<string[]>(row.skills_to_use_more_json),
    skillsToUseLess: parseJson<string[]>(row.skills_to_use_less_json),
    preferredLocations: normalizePreferredLocations(parseJson<string[]>(row.preferred_locations_json ?? "[]")),
    remotePreference: (row.remote_preference ?? "all") as UserProfileRecord["remotePreference"]
  };
}

export function getSkills(): SkillRecord[] {
  return getDatabase()
    .prepare(
      `select
        id,
        skill_name as skillName,
        skill_category as skillCategory,
        evidence_source as evidenceSource,
        strength_level as strengthLevel,
        market_relevance as marketRelevance,
        user_interest_level as userInterestLevel,
        use_preference as usePreference
      from skill_inventory
      order by skill_name`
    )
    .all() as SkillRecord[];
}

export function saveSkills(skills: SkillRecord[]) {
  const db = getDatabase();
  const insert = db.prepare(
    `insert or replace into skill_inventory
      (id, user_profile_id, skill_name, skill_category, evidence_source, strength_level, market_relevance, user_interest_level, use_preference)
     values
      (@id, 'pavel', @skillName, @skillCategory, @evidenceSource, @strengthLevel, @marketRelevance, @userInterestLevel, @usePreference)`
  );
  const run = db.transaction(() => {
    db.prepare("delete from skill_inventory where user_profile_id = 'pavel'").run();
    for (const skill of skills) insert.run(skill);
  });
  run();
  logActivity("profile", "pavel", `Skill inventory replaced: ${skills.length} skills`, { count: skills.length });
}

export function getRoleDirections(): RoleDirectionRecord[] {
  const rows = getDatabase()
    .prepare(
      `select
        id,
        role_family,
        fit_level,
        score,
        rationale,
        gaps_json,
        recommendation_type
      from role_directions
      order by score desc`
    )
    .all() as Array<{
    id: string;
    role_family: string;
    fit_level: string;
    score: number;
    rationale: string;
    gaps_json: string;
    recommendation_type: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    roleFamily: row.role_family,
    fitLevel: row.fit_level,
    score: row.score,
    rationale: row.rationale,
    gaps: parseJson<string[]>(row.gaps_json),
    recommendationType: row.recommendation_type
  }));
}

export function getJobs(): JobRecord[] {
  const rows = getDatabase().prepare("select * from jobs where archived = 0 order by fit_score desc, first_seen_date desc").all() as JobRow[];
  return rows.map(mapJob);
}

export function getArchivedJobs(): JobRecord[] {
  const rows = getDatabase().prepare("select * from jobs where archived = 1 order by liveness_checked_at desc, first_seen_date desc").all() as JobRow[];
  return rows.map(mapJob);
}

export function archiveJob(id: string) {
  getDatabase().prepare("update jobs set archived = 1, updated_at = current_timestamp where id = @id").run({ id });
  logActivity("job", id, "Job archived", {});
}

export function unarchiveJob(id: string) {
  getDatabase().prepare("update jobs set archived = 0, updated_at = current_timestamp where id = @id").run({ id });
  logActivity("job", id, "Job unarchived", {});
}

export function updateJobStatus(id: string, status: string) {
  if (status === "Skipped") {
    // Skipped jobs are auto-archived so they leave the active pipeline immediately.
    getDatabase()
      .prepare("update jobs set status = @status, archived = 1, updated_at = current_timestamp where id = @id")
      .run({ id, status });
    logActivity("job", id, "Job skipped and archived", {});
  } else {
    getDatabase().prepare("update jobs set status = @status where id = @id").run({ id, status });
  }
}

export function saveJobDescription(id: string, rawDescription: string) {
  getDatabase()
    .prepare("update jobs set raw_description = @rawDescription, parsed_description = @rawDescription where id = @id")
    .run({ id, rawDescription });
}

export function updateJobPostingResolution(
  id: string,
  fields: {
    url?: string;
    sourceUrl?: string;
    originalPostingUrl?: string;
    originalPostingKey?: string;
    rawDescription?: string;
    postingResolutionStatus?: "resolved" | "needs_resolution";
    reviewStatus?: "none" | "pending_review";
  }
) {
  const sets: string[] = ["updated_at = current_timestamp"];
  const params: Record<string, string> = { id };
  if (fields.url !== undefined) { sets.push("url = @url"); params.url = fields.url; }
  if (fields.sourceUrl !== undefined) { sets.push("source_url = @sourceUrl"); params.sourceUrl = fields.sourceUrl; }
  if (fields.originalPostingUrl !== undefined) { sets.push("original_posting_url = @originalPostingUrl"); params.originalPostingUrl = fields.originalPostingUrl; }
  if (fields.originalPostingKey !== undefined) { sets.push("original_posting_key = @originalPostingKey"); params.originalPostingKey = fields.originalPostingKey; }
  if (fields.rawDescription !== undefined) {
    sets.push("raw_description = @rawDescription, parsed_description = @rawDescription");
    params.rawDescription = fields.rawDescription;
  }
  if (fields.postingResolutionStatus !== undefined) {
    sets.push("posting_resolution_status = @postingResolutionStatus");
    params.postingResolutionStatus = fields.postingResolutionStatus;
  }
  if (fields.reviewStatus !== undefined) {
    sets.push("review_status = @reviewStatus");
    params.reviewStatus = fields.reviewStatus;
  }
  getDatabase().prepare(`update jobs set ${sets.join(", ")} where id = @id`).run(params);
  logActivity("job", id, "Job posting resolution updated", {
    postingResolutionStatus: fields.postingResolutionStatus,
    hasUrl: Boolean(fields.url),
    hasDescription: Boolean(fields.rawDescription),
  });
}

export function updateJobDetails(
  id: string,
  fields: { title?: string; company?: string; url?: string; rawDescription?: string }
) {
  const sets: string[] = ["updated_at = current_timestamp"];
  const params: Record<string, string> = { id };
  if (fields.title !== undefined) { sets.push("title = @title"); params.title = fields.title; }
  if (fields.company !== undefined) { sets.push("company = @company"); params.company = fields.company; }
  if (fields.url !== undefined) { sets.push("url = @url"); params.url = fields.url; }
  if (fields.rawDescription !== undefined) {
    sets.push("raw_description = @rawDescription, parsed_description = @rawDescription");
    params.rawDescription = fields.rawDescription;
  }
  getDatabase().prepare(`update jobs set ${sets.join(", ")} where id = @id`).run(params);
  logActivity("job", id, "Job details updated manually", {});
}

export function updateJobRecommendedResume(id: string, resumeName: string) {
  getDatabase().prepare("update jobs set recommended_resume = @resumeName where id = @id").run({ id, resumeName });
}

export function updateResumeName(id: string, name: string) {
  getDatabase().prepare("update resumes set name = @name where id = @id").run({ id, name });
}

export function updateResumeSource(id: string, sourceFile: string, extractedText: string, wordCount: number) {
  getDatabase()
    .prepare("update resumes set source_file = @sourceFile, extracted_text = @extractedText, word_count = @wordCount, extracted_at = datetime('now') where id = @id")
    .run({ id, sourceFile, extractedText, wordCount });
}

export function deleteResumeLane(id: string) {
  getDatabase().prepare("delete from resumes where id = @id").run({ id });
}

export function createResumeLane(name: string): string {
  const id = crypto.randomUUID();
  getDatabase()
    .prepare(
      "insert into resumes (id, name, source_file, status, active_status) values (@id, @name, '', 'active', 1)"
    )
    .run({ id, name });
  return id;
}

export function getJobById(id: string): JobRecord | undefined {
  const row = getDatabase().prepare("select * from jobs where id = ?").get(id) as JobRow | undefined;
  return row ? mapJob(row) : undefined;
}

export function getJobByUrl(url: string): JobRecord | undefined {
  const row = getDatabase().prepare("select * from jobs where url = ?").get(url) as JobRow | undefined;
  return row ? mapJob(row) : undefined;
}

export function getEvaluationByJobId(jobId: string): EvaluationRecord | undefined {
  const row = getDatabase()
    .prepare("select * from evaluations where job_id = ? order by created_at desc limit 1")
    .get(jobId) as EvaluationRow | undefined;

  return row ? mapEvaluation(row) : undefined;
}

export function getAllEvaluations(): EvaluationRecord[] {
  const rows = getDatabase()
    .prepare("select * from evaluations order by created_at desc")
    .all() as EvaluationRow[];
  return rows.map(mapEvaluation);
}

export function getEvaluationFeedback(limit = 5): EvaluationFeedbackRecord[] {
  return getDatabase()
    .prepare(
      `select
        evaluation_feedback.id,
        evaluation_feedback.job_id as jobId,
        coalesce(jobs.company, 'Unknown company') as company,
        coalesce(jobs.title, evaluation_feedback.job_id) as title,
        evaluation_feedback.role_archetype as roleArchetype,
        evaluation_feedback.corrected_score as correctedScore,
        evaluation_feedback.corrected_recommendation as correctedRecommendation,
        evaluation_feedback.correction_note as correctionNote,
        evaluation_feedback.created_at as createdAt
      from evaluation_feedback
      left join jobs on jobs.id = evaluation_feedback.job_id
      order by evaluation_feedback.created_at desc
      limit ?`
    )
    .all(limit) as EvaluationFeedbackRecord[];
}

export function getLatestScanRun(): ScanRunRecord | undefined {
  const row = getDatabase()
    .prepare("select * from scan_runs order by started_at desc limit 1")
    .get() as ScanRunRow | undefined;

  return row ? mapScanRun(row) : undefined;
}

export function getScanSchedule(): ScanScheduleRecord {
  const row = getDatabase()
    .prepare("select * from scan_schedule where id = 'singleton'")
    .get() as {
      enabled: number;
      interval_hours: number;
      freshness_window_hours: number;
      last_run_at: string | null;
      next_run_at: string | null;
      running_since: string | null;
    };
  return {
    enabled: row.enabled === 1,
    intervalHours: row.interval_hours,
    freshnessWindowHours: row.freshness_window_hours as FreshnessWindowHours,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    runningSince: row.running_since
  };
}

export function saveScanSchedule(input: Pick<ScanScheduleRecord, "enabled" | "intervalHours" | "freshnessWindowHours">) {
  const nextRunAt = input.enabled
    ? new Date(Date.now() + input.intervalHours * 60 * 60 * 1000).toISOString()
    : null;
  getDatabase()
    .prepare(
      `update scan_schedule set
        enabled = @enabled,
        interval_hours = @intervalHours,
        freshness_window_hours = @freshnessWindowHours,
        next_run_at = @nextRunAt,
        updated_at = current_timestamp
      where id = 'singleton'`
    )
    .run({ ...input, enabled: input.enabled ? 1 : 0, nextRunAt });
}

export function tryStartScheduledScan(now = new Date()): boolean {
  const result = getDatabase()
    .prepare(
      `update scan_schedule set running_since = @now, updated_at = current_timestamp
       where id = 'singleton'
         and enabled = 1
         and (next_run_at is null or next_run_at <= @now)
         and (running_since is null or running_since < @staleBefore)`
    )
    .run({
      now: now.toISOString(),
      staleBefore: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
    });
  return Number(result.changes) === 1;
}

export function completeScheduledScan(now = new Date()) {
  const schedule = getScanSchedule();
  getDatabase()
    .prepare(
      `update scan_schedule set
        last_run_at = @now,
        next_run_at = @nextRunAt,
        running_since = null,
        updated_at = current_timestamp
      where id = 'singleton'`
    )
    .run({
      now: now.toISOString(),
      nextRunAt: new Date(now.getTime() + schedule.intervalHours * 60 * 60 * 1000).toISOString()
    });
}

export function releaseScheduledScan() {
  getDatabase()
    .prepare("update scan_schedule set running_since = null, updated_at = current_timestamp where id = 'singleton'")
    .run();
}

export function getFreshMatches(windowHours: FreshnessWindowHours = 72): JobRecord[] {
  const applicationJobIds = new Set(getApplications().map((application) => application.jobId));
  return filterFreshScanMatches(getJobs(), applicationJobIds, windowHours)
    .slice(0, 12);
}

export function getResumes(): ResumeRecord[] {
  return getDatabase()
    .prepare(
      `select
        id,
        name,
        source_file as sourceFile,
        status,
        active_status as activeStatus,
        extracted_text as extractedText,
        extracted_at as extractedAt,
        word_count as wordCount,
        evidence_json as evidenceJson
      from resumes
      order by name`
    )
    .all()
    .map((row) => {
      const resume = row as Omit<ResumeRecord, "activeStatus" | "evidence"> & { activeStatus: number; evidenceJson: string };
      return {
        ...resume,
        activeStatus: Boolean(resume.activeStatus),
        evidence: parseJson<string[]>(resume.evidenceJson)
      };
	    });
}

function mapResumeBuilderVersion(row: ResumeBuilderVersionRow): ResumeBuilderVersionRecord {
  const statusValues: ResumeBuilderVersionStatus[] = ["needs_review", "approved", "missing_source"];
  const status = statusValues.includes(row.status as ResumeBuilderVersionStatus)
    ? row.status as ResumeBuilderVersionStatus
    : "needs_review";

  return {
    id: row.id,
    resumeId: row.resume_id,
    status,
    sections: parseJson<ResumeBuilderSection[]>(row.sections_json || "[]"),
    sourceHash: row.source_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at
  };
}

export function getResumeBuilderVersions(): ResumeBuilderVersionRecord[] {
  const rows = getDatabase()
    .prepare("select * from resume_builder_versions order by updated_at desc")
    .all() as ResumeBuilderVersionRow[];
  return rows.map(mapResumeBuilderVersion);
}

export function getResumeBuilderVersion(resumeId: string): ResumeBuilderVersionRecord | undefined {
  const row = getDatabase()
    .prepare("select * from resume_builder_versions where resume_id = ?")
    .get(resumeId) as ResumeBuilderVersionRow | undefined;
  return row ? mapResumeBuilderVersion(row) : undefined;
}

export function saveResumeBuilderVersion(input: {
  resumeId: string;
  status: ResumeBuilderVersionStatus;
  sections: ResumeBuilderSection[];
  sourceHash: string;
}) {
  const existing = getResumeBuilderVersion(input.resumeId);
  const id = existing?.id ?? `resume-version-${input.resumeId}`;
  const approvedAt = input.status === "approved"
    ? existing?.approvedAt ?? new Date().toISOString()
    : existing?.approvedAt ?? null;

  getDatabase()
    .prepare(
      `insert into resume_builder_versions (
        id,
        resume_id,
        status,
        sections_json,
        source_hash,
        approved_at
      ) values (
        @id,
        @resumeId,
        @status,
        @sectionsJson,
        @sourceHash,
        @approvedAt
      )
      on conflict(resume_id) do update set
        status = excluded.status,
        sections_json = excluded.sections_json,
        source_hash = excluded.source_hash,
        approved_at = excluded.approved_at,
        updated_at = current_timestamp`
    )
    .run({
      id,
      resumeId: input.resumeId,
      status: input.status,
      sectionsJson: JSON.stringify(input.sections),
      sourceHash: input.sourceHash,
      approvedAt
    });
}

export function approveResumeBuilderVersion(resumeId: string, sections: ResumeBuilderSection[], sourceHash: string) {
  saveResumeBuilderVersion({
    resumeId,
    status: "approved",
    sections,
    sourceHash
  });
  logActivity("resume", resumeId, "Resume builder version approved", {
    sectionCount: sections.length
  });
}

export function getApplications(): ApplicationRecord[] {
  return getDatabase()
    .prepare(
      `select
        applications.id,
        applications.job_id as jobId,
        coalesce(nullif(applications.company, ''), jobs.company, 'External opportunity') as company,
        coalesce(nullif(applications.role, ''), jobs.title, applications.job_id) as role,
        applications.status,
        applications.applied_date as appliedDate,
        applications.follow_up_date as followUpDate,
        applications.notes,
        applications.contact,
        applications.response_status as responseStatus,
        coalesce(nullif(applications.fit_score, 0), jobs.fit_score, 0) as fitScore
      from applications
      left join jobs on jobs.id = applications.job_id
      order by applications.created_at desc`
    )
    .all() as ApplicationRecord[];
}

export function getInterviewAssignmentJobs(): ApplicationRecord[] {
  return getApplications().filter((application) => ELIGIBLE_ASSIGNMENT_STATUSES.has(application.status));
}

export function getApplicationByJobId(jobId: string): ApplicationRecord | undefined {
  const application = getDatabase()
    .prepare(
      `select
        applications.id,
        applications.job_id as jobId,
        coalesce(nullif(applications.company, ''), jobs.company, 'External opportunity') as company,
        coalesce(nullif(applications.role, ''), jobs.title, applications.job_id) as role,
        applications.status,
        applications.applied_date as appliedDate,
        applications.follow_up_date as followUpDate,
        applications.notes,
        applications.contact,
        applications.response_status as responseStatus,
        coalesce(nullif(applications.fit_score, 0), jobs.fit_score, 0) as fitScore
      from applications
      left join jobs on jobs.id = applications.job_id
      where applications.job_id = ?
      limit 1`
    )
    .get(jobId) as ApplicationRecord | undefined;

  if (application) {
    return application;
  }

  const job = getJobById(jobId);
  if (!job) {
    return undefined;
  }

  return {
    id: `application-${job.id}`,
    jobId: job.id,
    company: job.company,
    role: job.title,
    status: job.status,
    appliedDate: null,
    followUpDate: "",
    notes: "",
    contact: "",
    responseStatus: job.status,
    fitScore: job.fitScore
  };
}

export function updateApplicationNotes(jobId: string, notes: string) {
  getDatabase()
    .prepare("update applications set notes = @notes, updated_at = current_timestamp where job_id = @jobId")
    .run({ jobId, notes });
  logActivity("application", jobId, "Application close notes recorded", { notes });
}

export function getApplicationAnswerDrafts(jobId: string): ApplicationAnswerDraftRecord[] {
  const rows = getDatabase()
    .prepare(
      `select id, job_id, question, answer, source, sort_order, updated_at
       from application_answer_drafts
       where job_id = ?
       order by sort_order asc, updated_at desc`
    )
    .all(jobId) as ApplicationAnswerDraftRow[];

  return rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    question: row.question,
    answer: row.answer,
    source: row.source,
    sortOrder: row.sort_order,
    providerUsed: row.provider_used ?? "",
    modelUsed: row.model_used ?? "",
    updatedAt: row.updated_at
  }));
}

export function saveApplicationAnswerDrafts(drafts: ApplicationAnswerDraftInput[]) {
  if (drafts.length === 0) {
    return;
  }

  const database = getDatabase();
  const save = database.transaction(() => {
    for (const draft of drafts) {
      database
        .prepare(
          `insert into application_answer_drafts (
            id, job_id, question, answer, source, sort_order, provider_used, model_used, updated_at
          ) values (
            @id, @jobId, @question, @answer, @source, @sortOrder, @providerUsed, @modelUsed, current_timestamp
          )
          on conflict(id) do update set
            question = excluded.question,
            answer = excluded.answer,
            source = excluded.source,
            sort_order = excluded.sort_order,
            provider_used = excluded.provider_used,
            model_used = excluded.model_used,
            updated_at = current_timestamp`
        )
        .run({ ...draft, providerUsed: draft.providerUsed ?? "", modelUsed: draft.modelUsed ?? "" });
    }
  });

  save();
  logActivity("application_answers", drafts[0].jobId, `Prepared ${drafts.length} application answer drafts`, {
    count: drafts.length,
    sources: [...new Set(drafts.map((draft) => draft.source))]
  });
}

export function updateApplicationStatus(input: ApplicationStatusUpdateInput) {
  const job = getJobById(input.jobId);
  if (!job) {
    throw new Error(`Job not found: ${input.jobId}`);
  }

  const database = getDatabase();
  const application = getApplicationByJobId(input.jobId);
  const appliedDate = input.status === "Applied" ? new Date().toISOString().slice(0, 10) : application?.appliedDate ?? null;
  const followUpDate = input.followUpDate ?? application?.followUpDate ?? "";
  const notes = input.notes ?? application?.notes ?? "";

  const save = database.transaction(() => {
    database
      .prepare(
        `insert into applications (
          id,
          job_id,
          company,
          role,
          status,
          applied_date,
          follow_up_date,
          notes,
          contact,
          response_status,
          fit_score,
          updated_at
        ) values (
          @id,
          @jobId,
          @company,
          @role,
          @status,
          @appliedDate,
          @followUpDate,
          @notes,
          @contact,
          @responseStatus,
          @fitScore,
          current_timestamp
        )
        on conflict(id) do update set
          status = excluded.status,
          applied_date = excluded.applied_date,
          follow_up_date = excluded.follow_up_date,
          notes = excluded.notes,
          response_status = excluded.response_status,
          fit_score = excluded.fit_score,
          updated_at = current_timestamp`
      )
      .run({
        id: application?.id ?? `application-${job.id}`,
        jobId: job.id,
        company: job.company,
        role: job.title,
        status: input.status,
        appliedDate,
        followUpDate,
        notes,
        contact: application?.contact ?? "",
        responseStatus: input.status,
        fitScore: job.fitScore
      });

    database
      .prepare("update jobs set status = @status, updated_at = current_timestamp where id = @jobId")
      .run({ jobId: job.id, status: input.status });
  });

  save();

  if (ELIGIBLE_ASSIGNMENT_STATUSES.has(input.status)) {
    autoMatchStoriesForJob(input.jobId);
  }

  logActivity("application", input.jobId, `Application status updated to ${input.status}`, {
    previousStatus: application?.status ?? job.status,
    status: input.status,
    followUpDate
  });
}

export function getGeneratedDocuments(): GeneratedDocumentRecord[] {
  const rows = getDatabase()
    .prepare(
      `select
        generated_documents.id,
        generated_documents.job_id as jobId,
        coalesce(jobs.company, 'External opportunity') as company,
        coalesce(jobs.title, generated_documents.title) as role,
        generated_documents.document_type as documentType,
        generated_documents.title,
        generated_documents.content,
        generated_documents.pdf_url as pdfUrl,
        generated_documents.html_url as htmlUrl,
        generated_documents.base_resume as baseResume,
        generated_documents.generated_date as generatedDate,
        generated_documents.status,
        generated_documents.tailoring_summary as tailoringSummary,
        generated_documents.keyword_coverage as keywordCoverage,
        generated_documents.tailoring_plan_json as tailoringPlanJson,
        generated_documents.draft_json as draftJson,
        generated_documents.base_resume_id as baseResumeId,
        generated_documents.tailoring_status as tailoringStatus,
        generated_documents.evidence_audit_json as evidenceAuditJson,
        generated_documents.fallback_reason as fallbackReason
      from generated_documents
      left join jobs on jobs.id = generated_documents.job_id
      order by generated_documents.created_at desc`
    )
    .all() as GeneratedDocumentRow[];

  return rows.map(mapGeneratedDocument);
}

export function getGeneratedDocumentById(id: string): GeneratedDocumentRecord | undefined {
  const row = getDatabase()
    .prepare(
      `select
        generated_documents.id,
        generated_documents.job_id as jobId,
        coalesce(jobs.company, 'External opportunity') as company,
        coalesce(jobs.title, generated_documents.title) as role,
        generated_documents.document_type as documentType,
        generated_documents.title,
        generated_documents.content,
        generated_documents.pdf_url as pdfUrl,
        generated_documents.html_url as htmlUrl,
        generated_documents.base_resume as baseResume,
        generated_documents.generated_date as generatedDate,
        generated_documents.status,
        generated_documents.tailoring_summary as tailoringSummary,
        generated_documents.keyword_coverage as keywordCoverage,
        generated_documents.tailoring_plan_json as tailoringPlanJson,
        generated_documents.draft_json as draftJson,
        generated_documents.base_resume_id as baseResumeId,
        generated_documents.tailoring_status as tailoringStatus,
        generated_documents.evidence_audit_json as evidenceAuditJson,
        generated_documents.fallback_reason as fallbackReason
      from generated_documents
      left join jobs on jobs.id = generated_documents.job_id
      where generated_documents.id = ?`
    )
    .get(id) as GeneratedDocumentRow | undefined;

  return row ? mapGeneratedDocument(row) : undefined;
}

export function getActivity(): ActivityRecord[] {
  const rows = getDatabase()
    .prepare("select * from activity_log order by timestamp desc limit 8")
    .all() as Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    timestamp: string;
    details_json: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    timestamp: row.timestamp,
    details: parseJson(row.details_json)
  }));
}

export function getDashboardMetrics(): DashboardMetric[] {
  const jobs = getJobs();
  const applications = getApplications();
  const documents = getGeneratedDocuments();
  const today = new Date().toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return [
    {
      label: "New jobs",
      value: String(jobs.filter((job) => job.firstSeenDate >= sevenDaysAgo).length),
      detail: "This week",
      tone: "success"
    },
    {
      label: "Priority matches",
      value: String(jobs.filter((job) => job.recommendation === "Priority apply").length),
      detail: "Needs review",
      tone: "warning"
    },
    {
      label: "PDFs generated",
      value: String(documents.length),
      detail: "Ready",
      tone: "neutral"
    },
    {
      label: "Applications sent",
      value: String(applications.filter((application) => application.status === "Applied").length),
      detail: "Tracked",
      tone: "neutral"
    },
    {
      label: "Follow-ups due",
      value: String(
        applications.filter((application) => application.followUpDate && application.followUpDate <= today && application.status !== "Archived").length
      ),
      detail: "Manual action",
      tone: "warning"
    },
    {
      label: "Interviews active",
      value: String(applications.filter((application) => application.status === "Interviewing").length),
      detail: "In progress",
      tone: "success"
    },
    {
      label: "Skipped",
      value: String(jobs.filter((job) => job.status === "Skipped").length),
      detail: "Weak fit",
      tone: "danger"
    }
  ];
}

export function getFunnelStages(): FunnelStage[] {
  const applications = getApplications();
  const counts = new Map<string, number>();

  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  return [
    { label: "Found", value: getJobs().length },
    { label: "Reviewed", value: getJobs().filter((job) => job.status === "Reviewed").length },
    { label: "Resume generated", value: getJobs().filter((job) => job.status === "Resume generated").length },
    { label: "Applied", value: counts.get("Applied") ?? 0 },
    { label: "Follow-up needed", value: counts.get("Follow-up needed") ?? 0 },
    { label: "Recruiter responded", value: counts.get("Recruiter responded") ?? 0 },
    { label: "Interviewing", value: counts.get("Interviewing") ?? 0 },
    { label: "Offer", value: counts.get("Offer") ?? 0 },
    { label: "Rejected", value: counts.get("Rejected") ?? 0 },
    { label: "Skipped", value: (counts.get("Skipped") ?? 0) + getJobs().filter((job) => job.status === "Skipped").length },
    { label: "Archived", value: counts.get("Archived") ?? 0 }
  ];
}

export function updateUserProfile(input: ProfileUpdateInput) {
  getDatabase()
    .prepare(
      `update user_profile set
        name = @name,
        location = @location,
        portfolio = @portfolio,
        strongest_skills_json = @strongestSkillsJson,
        current_search_goal = @currentSearchGoal,
        urgency = @urgency,
        direction = @direction,
        target_roles_json = @targetRolesJson,
        desired_industries_json = @desiredIndustriesJson,
        compensation_needs = @compensationNeeds,
        work_preferences_json = @workPreferencesJson,
        work_modes_json = @workModesJson,
        constraints_json = @constraintsJson,
        deal_breakers_json = @dealBreakersJson,
        career_intent = @careerIntent,
        career_change_interest = @careerChangeInterest,
        confidence_level = @confidenceLevel,
        skills_to_use_more_json = @skillsToUseMoreJson,
        skills_to_use_less_json = @skillsToUseLessJson,
        preferred_locations_json = @preferredLocationsJson,
        remote_preference = @remotePreference,
        updated_at = current_timestamp
      where id = 'pavel'`
    )
    .run({
      ...input,
      strongestSkillsJson: JSON.stringify(input.strongestSkills),
      targetRolesJson: JSON.stringify(input.targetRoles),
      desiredIndustriesJson: JSON.stringify(input.desiredIndustries),
      workPreferencesJson: JSON.stringify(input.workPreferences),
      workModesJson: JSON.stringify(input.workModes),
      constraintsJson: JSON.stringify(input.constraints),
      dealBreakersJson: JSON.stringify(input.dealBreakers),
      skillsToUseMoreJson: JSON.stringify(input.skillsToUseMore),
      skillsToUseLessJson: JSON.stringify(input.skillsToUseLess),
      preferredLocationsJson: JSON.stringify(input.preferredLocations),
      remotePreference: input.remotePreference
    });

  logActivity("profile", "pavel", "Profile updated from dashboard", { fields: Object.keys(input) });
}

export function replaceRoleDirections(
  directions: Array<{
    id: string;
    roleFamily: string;
    fitLevel: string;
    score: number;
    rationale: string;
    gaps: string[];
    recommendationType: string;
  }>,
) {
  const db = getDatabase();
  const stmt = db.prepare(
    `insert into role_directions
       (id, user_profile_id, role_family, fit_level, score, rationale, gaps_json, recommendation_type)
     values (@id, 'pavel', @roleFamily, @fitLevel, @score, @rationale, @gapsJson, @recommendationType)
     on conflict(id) do update set
       role_family = excluded.role_family,
       fit_level = excluded.fit_level,
       score = excluded.score,
       rationale = excluded.rationale,
       gaps_json = excluded.gaps_json,
       recommendation_type = excluded.recommendation_type`,
  );
  db.transaction(() => {
    db.prepare("delete from role_directions").run();
    for (const d of directions) {
      stmt.run({ ...d, gapsJson: JSON.stringify(d.gaps) });
    }
  })();
  logActivity("profile", "pavel", "Role directions generated by AI", { count: directions.length });
}

export function updateRoleDirection(input: RoleDirectionUpdateInput) {
  getDatabase()
    .prepare(
      `update role_directions set
        fit_level = @fitLevel,
        score = @score,
        rationale = @rationale,
        gaps_json = @gapsJson
      where id = @id`
    )
    .run({ ...input, gapsJson: JSON.stringify(input.gaps) });

  logActivity("role_direction", input.id, "Role direction updated from dashboard", {
    fitLevel: input.fitLevel,
    score: input.score
  });
}

export function saveJobEvaluation(input: JobEvaluationResultInput) {
  const database = getDatabase();
  const resumeNames = getResumes().map((r) => r.name);
  const normalized = {
    ...input,
    resumeBaseRecommendation: coerceResumeBaseToLane(
      input.resumeBaseRecommendation,
      input.roleArchetype,
      resumeNames
    )
  };
  const job = getJobById(input.jobId);
  const syncRecommended =
    !job ||
    job.recommendedResume === "To be selected" ||
    !resumeNames.includes(job.recommendedResume);

  const save = database.transaction(() => {
    database
      .prepare(
        `insert or replace into evaluations (
          id,
          job_id,
          fit_score,
          score_label,
          role_archetype,
          summary,
          strengths_json,
          gaps_json,
          red_flags_json,
          recommendation,
          resume_base_recommendation,
          requirement_match_json,
          resume_evidence_json,
          sections_json,
          legitimacy_label,
          keywords_json,
          user_correction_json
        ) values (
          @id,
          @jobId,
          @fitScore,
          @scoreLabel,
          @roleArchetype,
          @summary,
          @strengthsJson,
          @gapsJson,
          @redFlagsJson,
          @recommendation,
          @resumeBaseRecommendation,
          @requirementMatchJson,
          @resumeEvidenceJson,
          @sectionsJson,
          @legitimacyLabel,
          @keywordsJson,
          @userCorrectionJson
        )`
      )
      .run({
        ...normalized,
        strengthsJson: JSON.stringify(normalized.strengths),
        gapsJson: JSON.stringify(normalized.gaps),
        redFlagsJson: JSON.stringify(normalized.redFlags),
        requirementMatchJson: JSON.stringify(normalized.requirementMatch),
        resumeEvidenceJson: JSON.stringify(normalized.resumeEvidence),
        sectionsJson: JSON.stringify(normalized.sections),
        keywordsJson: JSON.stringify(normalized.keywords),
        userCorrectionJson: JSON.stringify(normalized.userCorrection)
      });

    database
      .prepare(
        `update jobs set
          fit_score = @fitScore,
          role_archetype = @roleArchetype,
          recommendation = @recommendation,
          summary = @summary,
          why_it_matches = @whyItMatches,
          main_concern = @mainConcern,
          recommended_resume = case when @syncRecommended = 1 then @resumeBaseRecommendation else recommended_resume end,
          salary_notes = @salaryNotes,
          requirement_match_json = @requirementMatchJson,
          resume_evidence_json = @resumeEvidenceJson,
          gaps_json = @gapsJson,
          red_flags_json = @redFlagsJson,
          status = 'Reviewed',
          updated_at = current_timestamp
        where id = @jobId`
      )
      .run({
        ...normalized,
        syncRecommended: syncRecommended ? 1 : 0,
        requirementMatchJson: JSON.stringify(normalized.requirementMatch),
        resumeEvidenceJson: JSON.stringify(normalized.resumeEvidence),
        gapsJson: JSON.stringify(normalized.gaps),
        redFlagsJson: JSON.stringify(normalized.redFlags)
      });
  });

  save();
  linkJobKeywordConcepts(input.jobId, input.id, [input.roleArchetype, ...normalized.keywords], "job_evaluation");
  logActivity("job", input.jobId, `Job evaluated: ${input.fitScore}% ${input.recommendation}`, {
    roleArchetype: input.roleArchetype,
    legitimacy: input.legitimacyLabel
  });
}

export function saveEvaluationCorrection(input: EvaluationCorrectionInput) {
  const database = getDatabase();
  const correction = {
    correctedScore: input.fitScore,
    correctedRecommendation: input.recommendation,
    correctionNote: input.correctionNote,
    correctedAt: new Date().toISOString()
  };

  const save = database.transaction(() => {
    database
      .prepare(
        `update evaluations set
          fit_score = @fitScore,
          score_label = @scoreLabel,
          role_archetype = @roleArchetype,
          summary = @summary,
          strengths_json = @strengthsJson,
          gaps_json = @gapsJson,
          red_flags_json = @redFlagsJson,
          recommendation = @recommendation,
          user_correction_json = @userCorrectionJson
        where job_id = @jobId`
      )
      .run({
        ...input,
        scoreLabel: scoreLabelFor(input.fitScore),
        strengthsJson: JSON.stringify(input.strengths),
        gapsJson: JSON.stringify(input.gaps),
        redFlagsJson: JSON.stringify(input.redFlags),
        userCorrectionJson: JSON.stringify(correction)
      });

    database
      .prepare(
        `update jobs set
          fit_score = @fitScore,
          role_archetype = @roleArchetype,
          recommendation = @recommendation,
          summary = @summary,
          requirement_match_json = @strengthsJson,
          gaps_json = @gapsJson,
          red_flags_json = @redFlagsJson,
          updated_at = current_timestamp
        where id = @jobId`
      )
      .run({
        ...input,
        strengthsJson: JSON.stringify(input.strengths),
        gapsJson: JSON.stringify(input.gaps),
        redFlagsJson: JSON.stringify(input.redFlags)
      });

    database
      .prepare(
        `insert into evaluation_feedback (
          id,
          job_id,
          role_archetype,
          corrected_score,
          corrected_recommendation,
          correction_note
        ) values (
          @id,
          @jobId,
          @roleArchetype,
          @fitScore,
          @recommendation,
          @correctionNote
        )`
      )
      .run({
        id: `feedback-${input.jobId}-${Date.now()}`,
        ...input
      });
  });

  save();
  logActivity("evaluation_feedback", input.jobId, "Evaluation corrected from dashboard", correction);
}

export function saveGeneratedDocument(input: GeneratedDocumentInput) {
  getDatabase()
    .prepare(
      `insert or replace into generated_documents (
        id,
        job_id,
        document_type,
        title,
        content,
        pdf_url,
        html_url,
        base_resume,
        generated_date,
        status,
        tailoring_summary,
        keyword_coverage,
        tailoring_plan_json,
        draft_json,
        base_resume_id,
        tailoring_status,
        evidence_audit_json,
        fallback_reason
      ) values (
        @id,
        @jobId,
        @documentType,
        @title,
        @content,
        @pdfUrl,
        @htmlUrl,
        @baseResume,
        @generatedDate,
        @status,
        @tailoringSummary,
        @keywordCoverage,
        @tailoringPlanJson,
        @draftJson,
        @baseResumeId,
        @tailoringStatus,
        @evidenceAuditJson,
        @fallbackReason
      )`
    )
    .run({
      ...input,
      tailoringPlanJson: JSON.stringify(input.tailoringPlan),
      baseResumeId: input.baseResumeId ?? "",
      tailoringStatus: input.tailoringStatus ?? "source-only",
      evidenceAuditJson: input.evidenceAuditJson ?? "{}",
      fallbackReason: input.fallbackReason ?? ""
    });

  getDatabase()
    .prepare("update jobs set status = 'Resume generated', recommended_resume = @baseResume, updated_at = current_timestamp where id = @jobId")
    .run({
      jobId: input.jobId,
      baseResume: input.baseResume
    });

  logActivity("generated_document", input.id, `Tailored resume generated for ${input.title}`, {
    jobId: input.jobId,
    baseResume: input.baseResume,
    keywordCoverage: input.keywordCoverage
  });
}

export function getJobDedupKeys() {
  const rows = getDatabase()
    .prepare("select id, url, source_url, original_posting_url, original_posting_key, company, title, location from jobs")
    .all() as Array<{
      id: string;
      url: string;
      source_url: string;
      original_posting_url: string;
      original_posting_key: string;
      company: string;
      title: string;
      location: string;
    }>;

  const urlToIds = new Map<string, string[]>();
  const originalPostingKeyToIds = new Map<string, string[]>();
  const companyRoleLocationToIds = new Map<string, string[]>();

  const add = (map: Map<string, string[]>, key: string, id: string) => {
    if (!key) return;
    const existing = map.get(key) ?? [];
    existing.push(id);
    map.set(key, existing);
  };

  for (const row of rows) {
    add(urlToIds, row.url, row.id);
    add(urlToIds, row.original_posting_url, row.id);
    add(originalPostingKeyToIds, row.original_posting_key, row.id);
    add(companyRoleLocationToIds, `${row.company.toLowerCase()}::${row.title.toLowerCase()}::${row.location.toLowerCase()}`, row.id);
  }

  return {
    urls: new Set(rows.flatMap((row) => [row.url, row.original_posting_url]).filter(Boolean)),
    companyRoles: new Set(rows.map((row) => `${row.company.toLowerCase()}::${row.title.toLowerCase()}`)),
    companyRoleLocations: new Set(
      rows.map((row) => `${row.company.toLowerCase()}::${row.title.toLowerCase()}::${row.location.toLowerCase()}`)
    ),
    urlToIds,
    originalPostingKeyToIds,
    companyRoleLocationToIds
  };
}

export function insertScannedJobs(jobs: ScannedJobInput[]) {
  if (jobs.length === 0) {
    return 0;
  }

  const database = getDatabase();
  const insert = database.prepare(
    `insert or ignore into jobs (
      id,
      company,
      title,
      url,
      source,
      location,
      remote_type,
      date_posted,
      first_seen_date,
      freshness_label,
      raw_description,
      parsed_description,
      status,
      fit_score,
      role_archetype,
      recommendation,
      summary,
      why_it_matches,
      main_concern,
      recommended_resume,
      salary_notes,
      requirement_match_json,
      resume_evidence_json,
      gaps_json,
      red_flags_json
    ) values (
      @id,
      @company,
      @title,
      @url,
      @source,
      @location,
      @remoteType,
      @datePosted,
      @firstSeenDate,
      @freshnessLabel,
      @rawDescription,
      @parsedDescription,
      @status,
      @fitScore,
      @roleArchetype,
      @recommendation,
      @summary,
      @whyItMatches,
      @mainConcern,
      @recommendedResume,
      @salaryNotes,
      @requirementMatchJson,
      @resumeEvidenceJson,
      @gapsJson,
      @redFlagsJson
    )`
  );

  const insertMany = database.transaction((items: ScannedJobInput[]) => {
    let inserted = 0;
    for (const job of items) {
      const result = insert.run({
        ...job,
        remoteType: inferRemoteType(job.location),
        freshnessLabel: freshnessLabelFor(job.datePosted),
        rawDescription: "",
        parsedDescription: "",
        status: "Found",
        fitScore: 0,
        roleArchetype: "Unreviewed",
        recommendation: "Needs review",
        summary: "Discovered by the CareerOps scanner pattern. Evaluate this role before acting.",
        whyItMatches: "Pending evaluation against profile, resume lanes, and constraints.",
        mainConcern: "Not evaluated yet.",
        recommendedResume: "To be selected",
        salaryNotes: "Not captured by scanner.",
        requirementMatchJson: JSON.stringify([]),
        resumeEvidenceJson: JSON.stringify([]),
        gapsJson: JSON.stringify([]),
        redFlagsJson: JSON.stringify([])
      });
      inserted += Number(result.changes);
    }
    return inserted;
  });

  return insertMany(jobs);
}

export type BrowserBoardJobInput = {
  id: string;
  company: string;
  title: string;
  url: string;
  sourceUrl: string;
  originalPostingUrl: string;
  originalPostingKey: string;
  source:
    | "linkedin-claude-scan"
    | "wellfound-browser-scan"
    | "workatastartup-browser-scan"
    | "glassdoor-browser-scan"
    | "indeed-browser-scan"
    | "monster-browser-scan"
    | "adzuna-api-scan"
    | "email-alert-import"
    | "dice-mcp-scan";
  location: string;
  rawDescription: string;
  datePosted: string | null;
  firstSeenDate: string;
  salaryNotes: string;
  isDuplicate: boolean;
  duplicateOf: string[] | null;
  reviewStatus?: "none" | "pending_review";
  postingResolutionStatus?: "resolved" | "needs_resolution";
  postingSearchQuery?: string;
};

export type LinkedInJobInput = Omit<
  BrowserBoardJobInput,
  "source" | "sourceUrl" | "originalPostingUrl" | "originalPostingKey" | "salaryNotes"
>;

export function insertBrowserBoardJobs(jobs: BrowserBoardJobInput[]): { inserted: number; jobIds: string[] } {
  if (jobs.length === 0) return { inserted: 0, jobIds: [] };

  const database = getDatabase();
  const insert = database.prepare(
    `insert or ignore into jobs (
      id, company, title, url, source_url, original_posting_url, original_posting_key, source, location, remote_type,
      date_posted, first_seen_date, freshness_label, raw_description,
      parsed_description, status, fit_score, role_archetype, recommendation,
      summary, why_it_matches, main_concern, recommended_resume, salary_notes,
      requirement_match_json, resume_evidence_json, gaps_json, red_flags_json,
      is_duplicate, duplicate_of, review_status, posting_resolution_status, posting_search_query
    ) values (
      @id, @company, @title, @url, @sourceUrl, @originalPostingUrl, @originalPostingKey, @source, @location, @remoteType,
      @datePosted, @firstSeenDate, @freshnessLabel, @rawDescription,
      '', 'Found', 0, 'Unreviewed', 'Needs review',
      @summary,
      'Pending evaluation against profile, resume lanes, and constraints.',
      'Not evaluated yet.', 'To be selected', @salaryNotes,
      '[]', '[]', '[]', '[]',
      @isDuplicate, @duplicateOf, @reviewStatus, @postingResolutionStatus, @postingSearchQuery
    )`
  );

  const jobIds: string[] = [];
  const insertMany = database.transaction((items: BrowserBoardJobInput[]) => {
    let inserted = 0;
    for (const job of items) {
      const result = insert.run({
        ...job,
        freshnessLabel: freshnessLabelFor(job.datePosted),
        remoteType: inferRemoteType(job.location),
        summary: `Discovered via ${sourceNameForSummary(job.source)} browser scan. Evaluate this role before acting.`,
        salaryNotes: job.salaryNotes || "Not captured by scanner.",
        isDuplicate: job.isDuplicate ? 1 : 0,
        duplicateOf: job.duplicateOf ? JSON.stringify(job.duplicateOf) : null,
        reviewStatus: job.reviewStatus ?? "none",
        postingResolutionStatus: job.postingResolutionStatus ?? "resolved",
        postingSearchQuery: job.postingSearchQuery ?? ""
      });
      if (Number(result.changes) > 0) {
        inserted++;
        jobIds.push(job.id);
      }
    }
    return inserted;
  });

  const inserted = insertMany(jobs);
  return { inserted, jobIds };
}

export function insertLinkedInJobs(jobs: LinkedInJobInput[]): { inserted: number; jobIds: string[] } {
  return insertBrowserBoardJobs(
    jobs.map((job) => ({
      ...job,
      source: "linkedin-claude-scan",
      sourceUrl: job.url,
      originalPostingUrl: "",
      originalPostingKey: "",
      salaryNotes: "Not captured by scanner."
    }))
  );
}

export function getLatestLinkedInImport() {
  return getDatabase()
    .prepare(
      `select id, new_jobs_count, duplicate_count, completed_at
       from scan_runs
       where scan_type = 'linkedin-claude-scan'
       order by started_at desc
       limit 1`
    )
    .get() as
    | { id: string; new_jobs_count: number; duplicate_count: number; completed_at: string | null }
    | undefined;
}

export function getLatestBrowserBoardImport() {
  return getDatabase()
    .prepare(
      `select id, new_jobs_count, duplicate_count, completed_at, scan_type
       from scan_runs
       where scan_type in (
         'linkedin-claude-scan',
         'wellfound-browser-scan',
         'workatastartup-browser-scan',
         'glassdoor-browser-scan',
         'indeed-browser-scan',
         'monster-browser-scan',
         'adzuna-api-scan',
         'email-alert-import',
         'dice-mcp-scan'
       )
       order by started_at desc
       limit 1`
    )
    .get() as
    | {
      id: string;
      new_jobs_count: number;
      duplicate_count: number;
      completed_at: string | null;
      scan_type: string;
    }
    | undefined;
}

export type EmailImportEvidenceInput = {
  id: string;
  jobId: string;
  sourceFilename: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: string;
  extractedSnippet: string;
  candidateLinks: string[];
  confidence: "high" | "medium" | "low";
  extractionNotes: string;
};

export type EmailImportEvidenceRecord = Omit<EmailImportEvidenceInput, "jobId"> & {
  jobId: string;
  createdAt: string;
};

export function saveEmailImportEvidence(items: EmailImportEvidenceInput[]) {
  if (items.length === 0) return;
  const insert = getDatabase().prepare(
    `insert or ignore into job_email_import_evidence (
      id, job_id, source_filename, email_subject, email_from, email_date,
      extracted_snippet, candidate_links_json, confidence, extraction_notes
    ) values (
      @id, @jobId, @sourceFilename, @emailSubject, @emailFrom, @emailDate,
      @extractedSnippet, @candidateLinksJson, @confidence, @extractionNotes
    )`
  );
  const tx = getDatabase().transaction((records: EmailImportEvidenceInput[]) => {
    for (const item of records) {
      insert.run({
        ...item,
        candidateLinksJson: JSON.stringify(item.candidateLinks),
      });
    }
  });
  tx(items);
}

export function getEmailImportEvidence(jobId: string): EmailImportEvidenceRecord[] {
  const rows = getDatabase()
    .prepare(
      `select
        id,
        job_id,
        source_filename,
        email_subject,
        email_from,
        email_date,
        extracted_snippet,
        candidate_links_json,
        confidence,
        extraction_notes,
        created_at
      from job_email_import_evidence
      where job_id = @jobId
      order by created_at desc`
    )
    .all({ jobId }) as Array<{
      id: string;
      job_id: string;
      source_filename: string;
      email_subject: string;
      email_from: string;
      email_date: string;
      extracted_snippet: string;
      candidate_links_json: string;
      confidence: "high" | "medium" | "low";
      extraction_notes: string;
      created_at: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    sourceFilename: row.source_filename,
    emailSubject: row.email_subject,
    emailFrom: row.email_from,
    emailDate: row.email_date,
    extractedSnippet: row.extracted_snippet,
    candidateLinks: parseJson<string[]>(row.candidate_links_json, []),
    confidence: row.confidence,
    extractionNotes: row.extraction_notes,
    createdAt: row.created_at,
  }));
}

// ─── Pending Email Candidates ────────────────────────────────────────────────

export function savePendingEmailCandidates(candidates: PendingEmailJobCandidateInput[]): void {
  if (candidates.length === 0) return;
  const insert = getDatabase().prepare(
    `insert or ignore into pending_email_job_candidates (
      id, batch_id, email_subject, email_from, email_date, source_filename,
      company, position, location, url, source_url, original_posting_url,
      job_description, salary_notes, snippet, confidence, extraction_notes,
      posting_resolution_status, posting_search_query, candidate_links_json,
      discovered_at, title_match
    ) values (
      @id, @batchId, @emailSubject, @emailFrom, @emailDate, @sourceFilename,
      @company, @position, @location, @url, @sourceUrl, @originalPostingUrl,
      @jobDescription, @salaryNotes, @snippet, @confidence, @extractionNotes,
      @postingResolutionStatus, @postingSearchQuery, @candidateLinksJson,
      @discoveredAt, @titleMatch
    )`
  );
  const tx = getDatabase().transaction((items: PendingEmailJobCandidateInput[]) => {
    for (const c of items) {
      insert.run({ ...c, candidateLinksJson: JSON.stringify(c.candidateLinks) });
    }
  });
  tx(candidates);
}

type PendingEmailCandidateRow = {
  id: string;
  batch_id: string;
  email_subject: string;
  email_from: string;
  email_date: string;
  source_filename: string;
  company: string;
  position: string;
  location: string;
  url: string;
  source_url: string;
  original_posting_url: string;
  job_description: string;
  salary_notes: string;
  snippet: string;
  confidence: "high" | "medium" | "low";
  extraction_notes: string;
  posting_resolution_status: "resolved" | "needs_resolution";
  posting_search_query: string;
  candidate_links_json: string;
  discovered_at: string;
  title_match: "good" | "weak" | "unknown";
  created_at: string;
};

function rowToPendingEmailCandidate(row: PendingEmailCandidateRow): PendingEmailJobCandidate {
  return {
    id: row.id,
    batchId: row.batch_id,
    emailSubject: row.email_subject,
    emailFrom: row.email_from,
    emailDate: row.email_date,
    sourceFilename: row.source_filename,
    company: row.company,
    position: row.position,
    location: row.location,
    url: row.url,
    sourceUrl: row.source_url,
    originalPostingUrl: row.original_posting_url,
    jobDescription: row.job_description,
    salaryNotes: row.salary_notes,
    snippet: row.snippet,
    confidence: row.confidence,
    extractionNotes: row.extraction_notes,
    postingResolutionStatus: row.posting_resolution_status,
    postingSearchQuery: row.posting_search_query,
    candidateLinks: parseJson<string[]>(row.candidate_links_json, []),
    discoveredAt: row.discovered_at,
    titleMatch: row.title_match,
    createdAt: row.created_at,
  };
}

export function getPendingEmailCandidates(): PendingEmailJobCandidate[] {
  const rows = getDatabase()
    .prepare(
      `select * from pending_email_job_candidates
       order by title_match asc, created_at asc`
    )
    .all() as PendingEmailCandidateRow[];
  return rows.map(rowToPendingEmailCandidate);
}

export function countPendingEmailCandidates(): number {
  const row = getDatabase()
    .prepare("select count(*) as n from pending_email_job_candidates")
    .get() as { n: number };
  return row.n;
}

export function getPendingEmailCandidatesByIds(ids: string[]): PendingEmailJobCandidate[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDatabase()
    .prepare(`select * from pending_email_job_candidates where id in (${placeholders})`)
    .all(...ids) as PendingEmailCandidateRow[];
  return rows.map(rowToPendingEmailCandidate);
}

export function deletePendingEmailCandidates(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  getDatabase()
    .prepare(`delete from pending_email_job_candidates where id in (${placeholders})`)
    .run(...ids);
}

export function deleteAllPendingEmailCandidates(): void {
  getDatabase().prepare("delete from pending_email_job_candidates").run();
}

export function insertManualJob(job: {
  id: string;
  company: string;
  title: string;
  url: string;
  rawDescription: string;
  datePosted: string | null;
  firstSeenDate: string;
}) {
  const database = getDatabase();
  const insert = database.prepare(
    `insert or ignore into jobs (
      id,
      company,
      title,
      url,
      source,
      location,
      remote_type,
      date_posted,
      first_seen_date,
      freshness_label,
      raw_description,
      parsed_description,
      status,
      fit_score,
      role_archetype,
      recommendation,
      summary,
      why_it_matches,
      main_concern,
      recommended_resume,
      salary_notes,
      requirement_match_json,
      resume_evidence_json,
      gaps_json,
      red_flags_json
    ) values (
      @id,
      @company,
      @title,
      @url,
      @source,
      @location,
      @remoteType,
      @datePosted,
      @firstSeenDate,
      @freshnessLabel,
      @rawDescription,
      @parsedDescription,
      @status,
      @fitScore,
      @roleArchetype,
      @recommendation,
      @summary,
      @whyItMatches,
      @mainConcern,
      @recommendedResume,
      @salaryNotes,
      @requirementMatchJson,
      @resumeEvidenceJson,
      @gapsJson,
      @redFlagsJson
    )`
  );

  const result = insert.run({
    ...job,
    source: "manual",
    location: "Not specified",
    remoteType: "Not specified",
    freshnessLabel: "New today",
    parsedDescription: "",
    status: "Found",
    fitScore: 0,
    roleArchetype: "Unreviewed",
    recommendation: "Needs review",
    summary: "Manually added. Evaluate this role before acting.",
    whyItMatches: "Pending evaluation against profile, resume lanes, and constraints.",
    mainConcern: "Not evaluated yet.",
    recommendedResume: "To be selected",
    salaryNotes: "Not captured.",
    requirementMatchJson: JSON.stringify([]),
    resumeEvidenceJson: JSON.stringify([]),
    gapsJson: JSON.stringify([]),
    redFlagsJson: JSON.stringify([])
  });

  return Number(result.changes);
}

export function recordScanRun(run: ScanRunRecord) {
  getDatabase()
    .prepare(
      `insert into scan_runs (
        id,
        status,
        started_at,
        completed_at,
        companies_scanned,
        skipped_companies,
        total_jobs_found,
        filtered_count,
        duplicate_count,
        new_jobs_count,
        errors_json,
        scan_type,
        trigger,
        freshness_window_hours,
        fresh_count,
        unknown_date_count,
        stale_filtered_count
      ) values (
        @id,
        @status,
        @startedAt,
        @completedAt,
        @companiesScanned,
        @skippedCompanies,
        @totalJobsFound,
        @filteredCount,
        @duplicateCount,
        @newJobsCount,
        @errorsJson,
        @scanType,
        @trigger,
        @freshnessWindowHours,
        @freshCount,
        @unknownDateCount,
        @staleFilteredCount
      )`
    )
    .run({
      ...run,
      errorsJson: JSON.stringify(run.errors),
      scanType: run.scanType ?? "careerops",
      trigger: run.trigger ?? "manual",
      freshnessWindowHours: run.freshnessWindowHours ?? 72,
      freshCount: run.freshCount ?? run.newJobsCount,
      unknownDateCount: run.unknownDateCount ?? 0,
      staleFilteredCount: run.staleFilteredCount ?? 0
    });

  logActivity("scan", run.id, scanActivityLabel(run), {
    companiesScanned: run.companiesScanned,
    newJobs: run.newJobsCount,
    duplicates: run.duplicateCount,
    errors: run.errors.length
  });
}

export function logActivity(entityType: string, entityId: string, action: string, details: Record<string, unknown>) {
  getDatabase()
    .prepare(
      `insert into activity_log (id, entity_type, entity_id, action, timestamp, details_json)
       values (@id, @entityType, @entityId, @action, @timestamp, @detailsJson)`
    )
    .run({
      id: `${entityType}-${entityId}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      entityType,
      entityId,
      action,
      timestamp: new Date().toISOString(),
      detailsJson: JSON.stringify(details)
    });
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    url: row.url,
    sourceUrl: row.source_url ?? "",
    originalPostingUrl: row.original_posting_url ?? "",
    originalPostingKey: row.original_posting_key ?? "",
    source: row.source,
    location: row.location,
    remoteType: row.remote_type,
    datePosted: row.date_posted,
    firstSeenDate: row.first_seen_date,
    freshnessLabel: row.freshness_label,
    rawDescription: row.raw_description,
    parsedDescription: row.parsed_description,
    status: row.status,
    fitScore: row.fit_score,
    roleArchetype: row.role_archetype,
    recommendation: row.recommendation,
    summary: row.summary,
    whyItMatches: row.why_it_matches,
    mainConcern: row.main_concern,
    recommendedResume: row.recommended_resume,
    salaryNotes: row.salary_notes,
    requirementMatch: parseJson<string[]>(row.requirement_match_json),
    resumeEvidence: parseJson<string[]>(row.resume_evidence_json),
    gaps: parseJson<string[]>(row.gaps_json),
    redFlags: parseJson<string[]>(row.red_flags_json),
    livenessStatus: row.liveness_status ?? "",
    livenessCheckedAt: row.liveness_checked_at ?? "",
    scopeStatus: row.scope_status ?? "",
    reviewStatus: (row.review_status === "pending_review" ? "pending_review" : "none") as "none" | "pending_review",
    postingResolutionStatus: (row.posting_resolution_status === "needs_resolution" ? "needs_resolution" : "resolved") as "resolved" | "needs_resolution",
    postingSearchQuery: row.posting_search_query ?? "",
    archived: (row.archived ?? 0) === 1,
    isDuplicate: (row.is_duplicate ?? 0) === 1,
    duplicateOf: row.duplicate_of ? (parseJson<string[]>(row.duplicate_of)) : null
  };
}

function normalizeWorkModes(values: string[], workPreferences: string[], remotePreference: string): WorkMode[] {
  const explicit = values.filter((value): value is WorkMode => WORK_MODE_VALUES.has(value as WorkMode));
  if (explicit.length > 0) {
    return [...new Set(explicit)];
  }

  const inferred = new Set<WorkMode>();
  const normalizedPreferences = workPreferences.map((item) => item.toLowerCase());
  if (remotePreference === "remote-only" || normalizedPreferences.some((item) => item.includes("remote"))) inferred.add("remote");
  if (remotePreference === "local-or-remote" || normalizedPreferences.some((item) => item.includes("hybrid"))) inferred.add("hybrid");
  if (remotePreference === "all" || normalizedPreferences.some((item) => item.includes("on-site") || item.includes("onsite"))) inferred.add("onsite");
  return [...inferred];
}

function mapScanRun(row: ScanRunRow): ScanRunRecord {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    companiesScanned: row.companies_scanned,
    skippedCompanies: row.skipped_companies,
    totalJobsFound: row.total_jobs_found,
    filteredCount: row.filtered_count,
    duplicateCount: row.duplicate_count,
    newJobsCount: row.new_jobs_count,
    errors: parseJson<ScanRunErrorEntry[]>(row.errors_json),
    scanType: (row.scan_type ?? "careerops") as ScanRunRecord["scanType"],
    trigger: (row.trigger ?? "manual") as ScanTrigger,
    freshnessWindowHours: (row.freshness_window_hours ?? 72) as FreshnessWindowHours,
    freshCount: row.fresh_count ?? row.new_jobs_count,
    unknownDateCount: row.unknown_date_count ?? 0,
    staleFilteredCount: row.stale_filtered_count ?? 0
  };
}

function mapEvaluation(row: EvaluationRow): EvaluationRecord {
  const sections = {
    ...parseJson<Partial<EvaluationRecord["sections"]>>(row.sections_json || "{}")
  };

  return {
    id: row.id,
    jobId: row.job_id,
    fitScore: row.fit_score,
    scoreLabel: row.score_label,
    roleArchetype: row.role_archetype,
    summary: row.summary,
    strengths: parseJson<string[]>(row.strengths_json),
    gaps: parseJson<string[]>(row.gaps_json),
    redFlags: parseJson<string[]>(row.red_flags_json),
    recommendation: row.recommendation,
    resumeBaseRecommendation: row.resume_base_recommendation,
    requirementMatch: parseJson<string[]>(row.requirement_match_json),
    resumeEvidence: parseJson<string[]>(row.resume_evidence_json),
    sections: {
      roleSummary: sections.roleSummary ?? [],
      matchWithResume: sections.matchWithResume ?? [],
      levelStrategy: sections.levelStrategy ?? [],
      compensationDemand: sections.compensationDemand ?? [],
      tailoringPlan: sections.tailoringPlan ?? [],
      interviewPlan: sections.interviewPlan ?? [],
      postingLegitimacy: sections.postingLegitimacy ?? []
    },
    legitimacyLabel: row.legitimacy_label,
    keywords: parseJson<string[]>(row.keywords_json || "[]"),
    userCorrection: parseJson<Record<string, JsonValue>>(row.user_correction_json || "{}"),
    providerUsed: row.provider_used ?? "",
    modelUsed: row.model_used ?? "",
    tokensUsed: row.tokens_used ?? 0,
    generationMs: row.generation_ms ?? 0,
    createdAt: row.created_at
  };
}

function mapGeneratedDocument(row: GeneratedDocumentRow): GeneratedDocumentRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    company: row.company,
    role: row.role,
    documentType: row.documentType,
    title: row.title,
    content: row.content,
    pdfUrl: row.pdfUrl,
    htmlUrl: row.htmlUrl,
    baseResume: row.baseResume,
    generatedDate: row.generatedDate,
    status: row.status,
    tailoringSummary: row.tailoringSummary,
    keywordCoverage: row.keywordCoverage,
    tailoringPlan: parseJson<string[]>(row.tailoringPlanJson || "[]"),
    draftJson: row.draftJson || "{}",
    baseResumeId: row.baseResumeId || "",
    tailoringStatus: row.tailoringStatus || "source-only",
    evidenceAuditJson: row.evidenceAuditJson || "{}",
    fallbackReason: row.fallbackReason || ""
  };
}

export function updateDocumentDraft(id: string, draftJson: string) {
  getDatabase()
    .prepare("update generated_documents set draft_json = @draftJson where id = @id")
    .run({ id, draftJson });
}

export function updateDocumentPdf(id: string, html: string, htmlUrl: string, pdfUrl: string) {
  getDatabase()
    .prepare(
      `update generated_documents set
        content = @html,
        html_url = @htmlUrl,
        pdf_url = @pdfUrl,
        status = 'Ready'
      where id = @id`
    )
    .run({ id, html, htmlUrl, pdfUrl });
  getDatabase()
    .prepare("update jobs set status = 'Resume generated' where id = (select job_id from generated_documents where id = @id)")
    .run({ id });
}

function scoreLabelFor(score: number) {
  if (score >= 85) return "Strong fit";
  if (score >= 70) return "Review";
  if (score >= 55) return "Selective";
  return "Weak fit";
}

function inferRemoteType(location: string) {
  return location.toLowerCase().includes("remote") ? "Remote" : "Not specified";
}

function sourceNameForSummary(source: BrowserBoardJobInput["source"]) {
  if (source === "linkedin-claude-scan") return "LinkedIn";
  if (source === "wellfound-browser-scan") return "Wellfound";
  if (source === "workatastartup-browser-scan") return "Work at a Startup";
  if (source === "glassdoor-browser-scan") return "Glassdoor";
  if (source === "indeed-browser-scan") return "Indeed";
  if (source === "monster-browser-scan") return "Monster";
  if (source === "adzuna-api-scan") return "Adzuna";
  if (source === "dice-mcp-scan") return "Dice";
  return "Email";
}

function scanActivityLabel(run: ScanRunRecord) {
  if (run.status === "failed") {
    return "Job scan failed";
  }

  if (run.errors.length > 0) {
    return `Job scan completed with ${run.newJobsCount} new jobs and ${run.errors.length} errors`;
  }

  return `Job scan completed with ${run.newJobsCount} new jobs`;
}

// ─── AI Settings ─────────────────────────────────────────────────────────────

type AISettingsRow = {
  id: string;
  active_provider: string;
  anthropic_api_key: string;
  gemini_api_key: string;
  openai_api_key: string;
  anthropic_model: string;
  gemini_model: string;
  openai_model: string;
  ollama_base_url: string;
  ollama_model: string;
  fallback_provider: string;
  provider_order_json: string;
  onboarding_dismissed: number;
  onboarding_preferences_confirmed: number;
  brave_search_api_key: string;
  adzuna_app_id: string;
  adzuna_api_key: string;
  updated_at: string;
};

export function getAISettings(): AISettingsRecord {
  const row = getDatabase().prepare("select * from ai_settings where id = 'singleton'").get() as AISettingsRow | undefined;
  if (!row) {
    return {
      id: "singleton",
      activeProvider: "openai",
      anthropicApiKey: "",
      geminiApiKey: "",
      openaiApiKey: "",
      anthropicModel: "claude-sonnet-4-6",
      geminiModel: "gemini-2.5-flash",
      openaiModel: "gpt-5.4-mini",
      ollamaBaseUrl: "http://localhost:11434",
      ollamaModel: "llama3.1:8b",
      fallbackProvider: "",
      providerOrderJson: ["openai", "anthropic", "gemini"],
      onboardingDismissed: false,
      onboardingPreferencesConfirmed: false,
      braveSearchApiKey: "",
      adzunaAppId: "",
      adzunaApiKey: "",
      updatedAt: new Date().toISOString()
    };
  }
  let providerOrderJson: AIProviderName[];
  try {
    providerOrderJson = JSON.parse(row.provider_order_json || "[]") as AIProviderName[];
  } catch {
    providerOrderJson = ["openai", "anthropic", "gemini"];
  }
  return {
    id: row.id,
    activeProvider: row.active_provider as AIProviderName,
    anthropicApiKey: row.anthropic_api_key,
    geminiApiKey: row.gemini_api_key,
    openaiApiKey: row.openai_api_key,
    anthropicModel: row.anthropic_model,
    geminiModel: row.gemini_model,
    openaiModel: row.openai_model,
    ollamaBaseUrl: row.ollama_base_url ?? "http://localhost:11434",
    ollamaModel: row.ollama_model ?? "llama3.1:8b",
    fallbackProvider: row.fallback_provider,
    providerOrderJson,
    onboardingDismissed: Boolean(row.onboarding_dismissed),
    onboardingPreferencesConfirmed: Boolean(row.onboarding_preferences_confirmed),
    braveSearchApiKey: row.brave_search_api_key ?? "",
    adzunaAppId: row.adzuna_app_id ?? "",
    adzunaApiKey: row.adzuna_api_key ?? "",
    updatedAt: row.updated_at
  };
}

export function saveAISettings(input: AISettingsUpdateInput) {
  const existing = getAISettings();
  getDatabase()
    .prepare(
      `update ai_settings set
        active_provider = @activeProvider,
        anthropic_api_key = @anthropicApiKey,
        gemini_api_key = @geminiApiKey,
        openai_api_key = @openaiApiKey,
        anthropic_model = @anthropicModel,
        gemini_model = @geminiModel,
        openai_model = @openaiModel,
        ollama_base_url = @ollamaBaseUrl,
        ollama_model = @ollamaModel,
        fallback_provider = @fallbackProvider,
        provider_order_json = @providerOrderJson,
        onboarding_dismissed = @onboardingDismissed,
        onboarding_preferences_confirmed = @onboardingPreferencesConfirmed,
        brave_search_api_key = @braveSearchApiKey,
        adzuna_app_id = @adzunaAppId,
        adzuna_api_key = @adzunaApiKey,
        updated_at = current_timestamp
      where id = 'singleton'`
    )
    .run({
      ...input,
      providerOrderJson: JSON.stringify(input.providerOrderJson),
      onboardingDismissed: input.onboardingDismissed ? 1 : 0,
      onboardingPreferencesConfirmed: input.onboardingPreferencesConfirmed ? 1 : 0,
      braveSearchApiKey: input.braveSearchApiKey ?? existing.braveSearchApiKey,
      adzunaAppId: input.adzunaAppId ?? existing.adzunaAppId,
      adzunaApiKey: input.adzunaApiKey ?? existing.adzunaApiKey,
    });
}

export function setOnboardingPreferencesConfirmed(confirmed: boolean) {
  getDatabase()
    .prepare(
      `update ai_settings set
        onboarding_preferences_confirmed = @confirmed,
        onboarding_dismissed = 0,
        updated_at = current_timestamp
      where id = 'singleton'`
    )
	    .run({ confirmed: confirmed ? 1 : 0 });
}

type AIPromptOverrideRow = {
  prompt_id: string;
  custom_prompt: string;
  updated_at: string;
};

function mapPromptOverride(row: AIPromptOverrideRow): AIPromptOverrideRecord {
  return {
    promptId: row.prompt_id as AIPromptId,
    customPrompt: row.custom_prompt,
    updatedAt: row.updated_at
  };
}

export function getAIPromptOverrides(): AIPromptOverrideRecord[] {
  const rows = getDatabase()
    .prepare("select * from ai_prompt_overrides order by prompt_id")
    .all() as AIPromptOverrideRow[];
  return rows.map(mapPromptOverride);
}

export function getAIPromptOverride(promptId: AIPromptId): AIPromptOverrideRecord | undefined {
  const row = getDatabase()
    .prepare("select * from ai_prompt_overrides where prompt_id = ?")
    .get(promptId) as AIPromptOverrideRow | undefined;
  return row ? mapPromptOverride(row) : undefined;
}

export function saveAIPromptOverride(promptId: AIPromptId, customPrompt: string) {
  getDatabase()
    .prepare(
      `insert into ai_prompt_overrides (prompt_id, custom_prompt)
      values (@promptId, @customPrompt)
      on conflict(prompt_id) do update set
        custom_prompt = excluded.custom_prompt,
        updated_at = current_timestamp`
    )
    .run({ promptId, customPrompt });
  logActivity("ai_prompt", promptId, "AI prompt override updated", {});
}

export function resetAIPromptOverride(promptId: AIPromptId) {
  getDatabase()
    .prepare("delete from ai_prompt_overrides where prompt_id = ?")
    .run(promptId);
  logActivity("ai_prompt", promptId, "AI prompt override reset", {});
}

// ─── Story Bank ───────────────────────────────────────────────────────────────

type StoryRow = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  skills_json: string;
  themes_json: string;
  tags_json: string;
  source_job_id: string | null;
  source_block_f: string;
  story_kind: string;
  question_id: string | null;
  prompt_text: string;
  quality_status: string;
  quality_notes: string;
  last_evaluated_at: string | null;
  source_job_company?: string | null;
  source_job_title?: string | null;
  created_at: string;
  updated_at: string;
};

type InterviewQuestionRow = {
  id: string;
  prompt: string;
  category: string;
  source: string;
  active: number;
  created_at: string;
  updated_at: string;
};

type StoryJobLinkRow = {
  story_id: string;
  job_id: string;
  company: string;
  role: string;
  status: string;
  source: string;
};

type TaxonomyConceptRow = {
  id: string;
  label: string;
  normalized_label: string;
  parent_id: string | null;
  depth: number;
  description: string;
  status: string;
  created_from: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  story_count?: number;
  job_count?: number;
};

type TaxonomyAliasRow = {
  id: string;
  concept_id: string;
  raw_phrase: string;
  normalized_phrase: string;
  source: string;
  confidence: number;
  verified_at: string | null;
  created_at: string;
};

type StoryConceptRow = {
  story_id: string;
  raw_keyword: string;
  normalized_keyword: string;
  concept_id: string;
  source: string;
  confidence: number;
  label: string;
  normalized_label: string;
  parent_id: string | null;
  depth: number;
  description: string;
  status: string;
  created_from: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type TaxonomyActivityRow = {
  id: string;
  action: string;
  concept_id: string | null;
  related_id: string | null;
  details_json: string;
  actor: string;
  created_at: string;
};

const TAXONOMY_MAX_DEPTH = 5;
const GENERIC_CONCEPTS = new Set([
  "collaboration",
  "communication",
  "leadership",
  "strategy",
  "management",
  "teamwork",
  "execution",
  "planning"
]);

function normalizeKeywordPhrase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bux\b/g, "user experience")
    .trim();
}

function titleCasePhrase(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const acronyms = new Set(["ai", "api", "ats", "b2b", "b2c", "crm", "css", "html", "kpi", "ml", "saas", "sql", "ui", "ux"]);
  return normalized
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (acronyms.has(lower)) return lower.toUpperCase();
      if (lower === "and" || lower === "or" || lower === "with") return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function canonicalConceptLabel(raw: string): string {
  const normalized = normalizeKeywordPhrase(raw);
  if (normalized === "ux" || normalized === "user experience" || normalized === "user-experience") return "User experience";
  if (normalized === "user interview" || normalized === "user interviews" || normalized === "interviewing users") return "User interviews";
  if (normalized === "shadowing" || normalized === "field shadowing") return "Contextual inquiry";
  if (normalized === "contextual inquiries") return "Contextual inquiry";
  if (normalized === "diary study" || normalized === "diary studies") return "Diary studies";
  if (normalized === "ethnographic studies" || normalized === "ethnographic research") return "Ethnographic research";
  return titleCasePhrase(raw);
}

function inferConceptPath(raw: string): string[] {
  const normalized = normalizeKeywordPhrase(raw);
  const label = canonicalConceptLabel(raw);
  const has = (pattern: RegExp) => pattern.test(normalized);

  if (has(/\b(user research|research|interview|diary stud|contextual|ethnograph|shadowing|usability test|survey|quantitative|qualitative)\b/)) {
    if (normalized === "research") return ["Research"];
    if (normalized === "user research") return ["Research", "User research"];
    if (normalized === "qualitative research") return ["Research", "User research", "Qualitative research"];
    if (normalized === "quantitative research") return ["Research", "User research", "Quantitative research"];
    if (has(/\b(survey|quantitative|analytics|experiment|a\/b|ab test|metrics|statistical)\b/)) {
      return ["Research", "User research", "Quantitative research", label].slice(0, TAXONOMY_MAX_DEPTH);
    }
    if (has(/\b(interview|diary stud|contextual|ethnograph|shadowing|qualitative|usability test)\b/)) {
      return ["Research", "User research", "Qualitative research", label].slice(0, TAXONOMY_MAX_DEPTH);
    }
    return ["Research", "User research"].slice(0, TAXONOMY_MAX_DEPTH);
  }

  if (has(/\b(design system|component librar|figma|prototype|wireframe|interaction design|information architecture|visual design|product design|user experience)\b/)) {
    if (normalized === "product design") return ["Design", "Product design"];
    if (normalized === "design systems" || normalized === "design system") return ["Design", "Product design", "Design systems"];
    if (normalized === "user experience") return ["Design", "User experience"];
    if (has(/\b(design system|component librar)\b/)) return ["Design", "Product design", "Design systems", label].slice(0, TAXONOMY_MAX_DEPTH);
    if (has(/\bfigma|prototype|wireframe|visual design|interaction design|information architecture\b/)) return ["Design", "Product design", label].slice(0, TAXONOMY_MAX_DEPTH);
    return ["Design", "Product design"].slice(0, TAXONOMY_MAX_DEPTH);
  }

  if (has(/\b(stakeholder|cross-functional|alignment|facilitation|workshop|communication|influence)\b/)) {
    return ["Collaboration", "Stakeholder management", label].slice(0, TAXONOMY_MAX_DEPTH);
  }

  if (has(/\b(leadership|manager|management|mentoring|coaching|hiring|director|vp|head of|principal|staff)\b/)) {
    return ["Leadership", label].slice(0, TAXONOMY_MAX_DEPTH);
  }

  if (has(/\b(strategy|roadmap|vision|prioritization|planning|go-to-market|business)\b/)) {
    return ["Strategy", label].slice(0, TAXONOMY_MAX_DEPTH);
  }

  if (has(/\b(data|analytics|metric|dashboard|sql|experiment|a\/b|insight)\b/)) {
    return ["Data and analytics", label].slice(0, TAXONOMY_MAX_DEPTH);
  }

  if (has(/\b(engineering|developer|software|architecture|api|frontend|backend|platform|technical)\b/)) {
    return ["Technology", label].slice(0, TAXONOMY_MAX_DEPTH);
  }

  if (has(/\b(healthcare|medical|device|compliance|quality|risk|security|privacy|regulated)\b/)) {
    return ["Domain knowledge", label].slice(0, TAXONOMY_MAX_DEPTH);
  }

  return ["Other keywords", label].slice(0, TAXONOMY_MAX_DEPTH);
}

function mapTaxonomyAlias(row: TaxonomyAliasRow): TaxonomyAliasRecord {
  return {
    id: row.id,
    conceptId: row.concept_id,
    rawPhrase: row.raw_phrase,
    normalizedPhrase: row.normalized_phrase,
    source: row.source,
    confidence: row.confidence,
    verifiedAt: row.verified_at,
    createdAt: row.created_at
  };
}

function mapConceptRow(row: TaxonomyConceptRow, aliases: TaxonomyAliasRecord[] = []): TaxonomyConceptRecord {
  return {
    id: row.id,
    label: row.label,
    normalizedLabel: row.normalized_label,
    parentId: row.parent_id,
    depth: row.depth,
    description: row.description,
    status: row.status === "archived" ? "archived" : row.status === "candidate" ? "candidate" : "active",
    createdFrom: row.created_from,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    aliases,
    storyCount: row.story_count ?? 0,
    jobCount: row.job_count ?? 0,
    path: [],
    children: []
  };
}

function logTaxonomyActivity(action: string, conceptId: string | null, relatedId: string | null, details: Record<string, unknown>, actor = "system") {
  getDatabase()
    .prepare(
      `insert into taxonomy_activity_log (id, action, concept_id, related_id, details_json, actor)
       values (@id, @action, @conceptId, @relatedId, @detailsJson, @actor)`
    )
    .run({
      id: `taxonomy-${Date.now()}-${randomUUID().slice(0, 8)}`,
      action,
      conceptId,
      relatedId,
      detailsJson: JSON.stringify(details),
      actor
    });
}

function findConceptByLabel(label: string, parentId: string | null): TaxonomyConceptRow | undefined {
  return getDatabase()
    .prepare("select * from keyword_concepts where normalized_label = @label and coalesce(parent_id, '') = coalesce(@parentId, '') limit 1")
    .get({ label: normalizeKeywordPhrase(label), parentId }) as TaxonomyConceptRow | undefined;
}

function getConceptDepth(parentId: string | null): number {
  if (!parentId) return 1;
  const row = getDatabase().prepare("select depth from keyword_concepts where id = @parentId").get({ parentId }) as { depth: number } | undefined;
  return Math.min((row?.depth ?? 0) + 1, TAXONOMY_MAX_DEPTH);
}

/**
 * Sources whose concepts are born as 'candidate' rather than 'active'. Machine
 * extraction from job postings (Block E keywords, status-based fallbacks) fills the
 * candidate pool; real user story tags and hand-authored concepts go straight to
 * active. A candidate is promoted the moment it earns a story link or recurs across
 * enough jobs (see promoteConceptWithAncestors / linkJobKeywordConcepts).
 */
const CANDIDATE_CONCEPT_SOURCES = new Set(["job_evaluation", "job_status", "job_evaluation_story"]);

/** Story tags injected purely as UI filler by normalizeTags — never real skills. */
const FILLER_TAG_PHRASES = new Set(["interview prep", "interview answer", "standalone story"]);

function statusForConceptSource(source: string): "active" | "candidate" {
  return CANDIDATE_CONCEPT_SOURCES.has(source) ? "candidate" : "active";
}

const CREDENTIAL_KEYWORD_RE =
  /\b(bachelor|bachelors|master|masters|mba|phd|ph\.?d|doctorate|degree|diploma|ged|associate'?s? degree|certification|certificate|licensure)\b/;
// Role-agnostic seniority-title shape: seniority prefix + generic role noun. Not a
// design/UX word list — the role nouns span industries so a fresh non-design user is
// covered too. Best-effort only; the candidate status is the real safety net.
const SENIORITY_TITLE_RE =
  /^(senior|sr|junior|jr|staff|principal|lead|director|vp|vice president|head of|chief|entry[ -]?level|mid[ -]?level|associate)\b.*\b(designer|engineer|manager|researcher|analyst|developer|scientist|architect|consultant|specialist|director|officer|strategist|marketer|writer|producer|coordinator|administrator|technician|accountant|recruiter|nurse|lead)s?$/;

// Cached and self-invalidating: a cheap count query rebuilds the set only when the
// jobs table changes, so a newly-tracked company starts being blocked without a restart.
let companyNamePhraseCache: { count: number; set: Set<string> } | null = null;
function getCompanyNamePhrases(): Set<string> {
  const count = (getDatabase().prepare("select count(*) as n from jobs").get() as { n: number }).n;
  if (companyNamePhraseCache && companyNamePhraseCache.count === count) return companyNamePhraseCache.set;
  const rows = getDatabase().prepare("select distinct company from jobs").all() as Array<{ company: string }>;
  const set = new Set(rows.map((row) => normalizeKeywordPhrase(row.company)).filter((value) => value.length > 2));
  companyNamePhraseCache = { count, set };
  return set;
}

/**
 * True when a raw keyword should never become a taxonomy concept — credentials, job
 * titles, and the user's own tracked company names. Blocked phrases are dropped from
 * concept/alias creation only; they remain in evaluations.keywords_json and still
 * participate in rawKeywordMatchesHaystack, so job matching and resume tailoring are
 * unaffected.
 */
function isBlockedKeywordPhrase(normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return true;
  if (CREDENTIAL_KEYWORD_RE.test(normalizedPhrase)) return true;
  if (SENIORITY_TITLE_RE.test(normalizedPhrase)) return true;
  if (getCompanyNamePhrases().has(normalizedPhrase)) return true;
  return false;
}

/**
 * Promotes a candidate concept (and any candidate ancestors, so the tree stays
 * connected) to active. No-op for concepts that are already active or archived —
 * archived concepts stay rejected.
 */
function promoteConceptWithAncestors(conceptId: string, reason: string, actor = "system") {
  let current: string | null = conceptId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = getDatabase()
      .prepare("select parent_id, status from keyword_concepts where id = @id")
      .get({ id: current }) as { parent_id: string | null; status: string } | undefined;
    if (!row) break;
    if (row.status === "candidate") {
      getDatabase()
        .prepare("update keyword_concepts set status = 'active', updated_at = current_timestamp where id = @id")
        .run({ id: current });
      logTaxonomyActivity("promoted", current, null, { reason }, actor);
    }
    current = row.parent_id;
  }
}

function ensureConcept(label: string, parentId: string | null, createdFrom: string, status: "active" | "candidate" = "active"): TaxonomyConceptRow {
  const existing = findConceptByLabel(label, parentId);
  if (existing) {
    // Never let a machine re-encounter resurrect an archived (user-rejected) concept.
    // Only an explicit user action restores it (see restoreTaxonomyConcept / saveTaxonomyConcept).
    if (existing.status === "archived" && createdFrom === "user") {
      getDatabase()
        .prepare("update keyword_concepts set status = 'active', archived_at = null, updated_at = current_timestamp where id = @id")
        .run({ id: existing.id });
      logTaxonomyActivity("restored", existing.id, null, { label: existing.label }, "user");
      return { ...existing, status: "active", archived_at: null };
    }
    return existing;
  }

  const id = `concept-${randomUUID()}`;
  const depth = getConceptDepth(parentId);
  getDatabase()
    .prepare(
      `insert into keyword_concepts (
        id, label, normalized_label, parent_id, depth, created_from, status
      ) values (
        @id, @label, @normalizedLabel, @parentId, @depth, @createdFrom, @status
      )`
    )
    .run({
      id,
      label,
      normalizedLabel: normalizeKeywordPhrase(label),
      parentId,
      depth,
      createdFrom,
      status
    });
  logTaxonomyActivity("created", id, parentId, { label, parentId, depth, createdFrom, status }, createdFrom === "user" ? "user" : "system");
  return getDatabase().prepare("select * from keyword_concepts where id = @id").get({ id }) as TaxonomyConceptRow;
}

function ensureConceptPath(path: string[], createdFrom: string, status: "active" | "candidate" = "active"): TaxonomyConceptRow | null {
  let parentId: string | null = null;
  let current: TaxonomyConceptRow | null = null;
  for (const segment of path.slice(0, TAXONOMY_MAX_DEPTH)) {
    const label = segment.trim();
    if (!label) continue;
    // Ancestors of a candidate leaf are created as candidates too; they promote
    // together with the leaf. Existing ancestors keep their current status.
    current = ensureConcept(label, parentId, createdFrom, status);
    parentId = current.id;
  }
  return current;
}

function ensureAlias(conceptId: string, rawPhrase: string, source: string, confidence = 0.75) {
  const normalized = normalizeKeywordPhrase(rawPhrase);
  if (!normalized) return;
  getDatabase()
    .prepare(
      `insert into keyword_aliases (
        id, concept_id, raw_phrase, normalized_phrase, source, confidence, verified_at
      ) values (
        @id, @conceptId, @rawPhrase, @normalizedPhrase, @source, @confidence, @verifiedAt
      )
      on conflict(normalized_phrase) do update set
        concept_id = excluded.concept_id,
        raw_phrase = excluded.raw_phrase,
        source = case when keyword_aliases.source = 'user' then keyword_aliases.source else excluded.source end,
        confidence = max(keyword_aliases.confidence, excluded.confidence)`
    )
    .run({
      id: `alias-${randomUUID()}`,
      conceptId,
      rawPhrase,
      normalizedPhrase: normalized,
      source,
      confidence,
      verifiedAt: source === "user" ? new Date().toISOString() : null
    });
}

function conceptForKeyword(rawKeyword: string, source: string): TaxonomyConceptRow | null {
  const normalized = normalizeKeywordPhrase(rawKeyword);
  if (!normalized) return null;
  const alias = getDatabase()
    .prepare(
      `select keyword_concepts.*
       from keyword_aliases
       join keyword_concepts on keyword_concepts.id = keyword_aliases.concept_id
       where keyword_aliases.normalized_phrase = @normalized
       limit 1`
    )
    .get({ normalized }) as TaxonomyConceptRow | undefined;
  if (alias) return alias;

  // Filler and blocked phrases (credentials, job titles, company names) never mint a
  // concept. User- and story-sourced keywords bypass the blocklist so a deliberate tag
  // is always honored.
  const fromUserOrStory = source === "user" || source === "story_tag";
  if (FILLER_TAG_PHRASES.has(normalized)) return null;
  if (!fromUserOrStory && isBlockedKeywordPhrase(normalized)) return null;

  const status = statusForConceptSource(source);
  const concept = ensureConceptPath(inferConceptPath(rawKeyword), source, status);
  if (concept) ensureAlias(concept.id, rawKeyword, source, 0.75);
  return concept;
}

function linkStoryConcepts(storyId: string, rawKeywords: string[], source = "story_tag") {
  const unique = Array.from(new Set(rawKeywords.map((item) => item.trim()).filter(Boolean)));
  getDatabase().prepare("delete from story_keyword_concepts where story_id = @storyId").run({ storyId });
  const stmt = getDatabase().prepare(
    `insert or ignore into story_keyword_concepts (
      story_id, raw_keyword, normalized_keyword, concept_id, source, confidence
    ) values (
      @storyId, @rawKeyword, @normalizedKeyword, @conceptId, @source, @confidence
    )`
  );
  for (const rawKeyword of unique) {
    const concept = conceptForKeyword(rawKeyword, source);
    if (!concept) continue;
    stmt.run({
      storyId,
      rawKeyword,
      normalizedKeyword: normalizeKeywordPhrase(rawKeyword),
      conceptId: concept.id,
      source,
      confidence: 0.75
    });
    // A story link is the strongest possible signal — promote the concept (and its
    // candidate ancestors) into the curated active taxonomy.
    promoteConceptWithAncestors(concept.id, "story_link");
  }
}

/** Distinct-job threshold at which a recurring candidate concept auto-promotes to active. */
const CANDIDATE_JOB_PROMOTION_THRESHOLD = 3;

function linkJobKeywordConcepts(jobId: string, evaluationId: string | null, rawKeywords: string[], source = "job_evaluation") {
  const unique = Array.from(new Set(rawKeywords.map((item) => item.trim()).filter(Boolean)));
  getDatabase().prepare("delete from job_keyword_concepts where job_id = @jobId").run({ jobId });
  const stmt = getDatabase().prepare(
    `insert or ignore into job_keyword_concepts (
      job_id, evaluation_id, raw_keyword, normalized_keyword, concept_id, source, confidence
    ) values (
      @jobId, @evaluationId, @rawKeyword, @normalizedKeyword, @conceptId, @source, @confidence
    )`
  );
  for (const rawKeyword of unique) {
    const concept = conceptForKeyword(rawKeyword, source);
    if (!concept) continue;
    stmt.run({
      jobId,
      evaluationId,
      rawKeyword,
      normalizedKeyword: normalizeKeywordPhrase(rawKeyword),
      conceptId: concept.id,
      source,
      confidence: 0.75
    });
    // Recurrence across enough distinct jobs signals a genuinely relevant concept.
    if (concept.status === "candidate") {
      const jobCount = getDatabase()
        .prepare("select count(distinct job_id) as n from job_keyword_concepts where concept_id = @conceptId")
        .get({ conceptId: concept.id }) as { n: number };
      if (jobCount.n >= CANDIDATE_JOB_PROMOTION_THRESHOLD) {
        promoteConceptWithAncestors(concept.id, "job_recurrence");
      }
    }
  }
}

function getConceptAncestorIds(conceptIds: string[]): Set<string> {
  const all = new Set<string>(conceptIds);
  const queue = [...conceptIds];
  const stmt = getDatabase().prepare("select parent_id from keyword_concepts where id = @id");
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id) continue;
    const row = stmt.get({ id }) as { parent_id: string | null } | undefined;
    if (row?.parent_id && !all.has(row.parent_id)) {
      all.add(row.parent_id);
      queue.push(row.parent_id);
    }
  }
  return all;
}

function getStoryConceptIds(storyId: string): Set<string> {
  const rows = getDatabase()
    .prepare("select concept_id from story_keyword_concepts where story_id = @storyId")
    .all({ storyId }) as Array<{ concept_id: string }>;
  return getConceptAncestorIds(rows.map((row) => row.concept_id));
}

function getJobConceptIds(jobId: string): Set<string> {
  const rows = getDatabase()
    .prepare("select concept_id from job_keyword_concepts where job_id = @jobId")
    .all({ jobId }) as Array<{ concept_id: string }>;
  return getConceptAncestorIds(rows.map((row) => row.concept_id));
}

function hasSpecificConceptOverlap(a: Set<string>, b: Set<string>): boolean {
  const rows = getDatabase()
    .prepare(`select id, normalized_label, depth from keyword_concepts where id in (${Array.from(new Set([...a, ...b])).map(() => "?").join(",") || "''"})`)
    .all(...Array.from(new Set([...a, ...b]))) as Array<{ id: string; normalized_label: string; depth: number }>;
  const meta = new Map(rows.map((row) => [row.id, row]));
  for (const id of a) {
    if (!b.has(id)) continue;
    const row = meta.get(id);
    if (!row) continue;
    if (row.depth > 1 || !GENERIC_CONCEPTS.has(row.normalized_label)) return true;
  }
  return false;
}

function rawKeywordMatchesHaystack(rawKeywords: string[], haystackParts: string[]): boolean {
  const haystack = haystackParts.map(normalizeKeywordPhrase).join(" ");
  return rawKeywords.some((keyword) => {
    const normalized = normalizeKeywordPhrase(keyword);
    return normalized.length > 4 && !GENERIC_CONCEPTS.has(normalized) && haystack.includes(normalized);
  });
}

/**
 * Auto-links a story to eligible application positions (Applied, Recruiter responded,
 * Interviewing) whose title/role archetype/ATS keywords overlap with the story's tags.
 * Positions the user has only found, reviewed, or generated a resume for are never
 * matched. Existing links (manual or auto) are left untouched — this only adds new ones.
 */
function autoMatchJobsForStory(storyId: string, tags: string[]) {
  if (tags.length === 0) return;
  linkStoryConcepts(storyId, tags, "story_tag");
  const storyConcepts = getStoryConceptIds(storyId);
  if (storyConcepts.size === 0) return;
  const eligibleJobs = getInterviewAssignmentJobs();
  if (eligibleJobs.length === 0) return;

  const stmt = getDatabase().prepare(
    "insert or ignore into story_job_links (story_id, job_id, source) values (@storyId, @jobId, 'auto')"
  );
  for (const application of eligibleJobs) {
    const job = getJobById(application.jobId);
    if (!job) continue;
    const evaluation = getEvaluationByJobId(application.jobId);
    const jobKeywords = evaluation?.keywords ?? [];
    if (evaluation?.keywords.length) {
      linkJobKeywordConcepts(application.jobId, evaluation.id, [job.title, job.roleArchetype, ...evaluation.keywords], "job_evaluation");
    } else {
      linkJobKeywordConcepts(application.jobId, null, [job.title, job.roleArchetype], "job_status");
    }
    const jobConcepts = getJobConceptIds(application.jobId);
    if (hasSpecificConceptOverlap(storyConcepts, jobConcepts) || rawKeywordMatchesHaystack(tags, [job.title, job.roleArchetype, ...jobKeywords])) {
      stmt.run({ storyId, jobId: application.jobId });
    }
  }
}

/**
 * Auto-links existing stories to a job the moment it becomes an eligible application
 * position. Called from updateApplicationStatus whenever a job's status enters
 * Applied, Recruiter responded, or Interviewing.
 */
function autoMatchStoriesForJob(jobId: string) {
  const job = getJobById(jobId);
  if (!job) return;
  const evaluation = getEvaluationByJobId(jobId);
  const jobKeywords = evaluation?.keywords ?? [];
  if (evaluation?.keywords.length) {
    linkJobKeywordConcepts(jobId, evaluation.id, [job.title, job.roleArchetype, ...evaluation.keywords], "job_evaluation");
  } else {
    linkJobKeywordConcepts(jobId, null, [job.title, job.roleArchetype], "job_status");
  }
  const jobConcepts = getJobConceptIds(jobId);
  if (jobConcepts.size === 0) return;

  const rows = getDatabase().prepare("select id, tags_json from story_bank").all() as Array<{ id: string; tags_json: string }>;
  if (rows.length === 0) return;

  const stmt = getDatabase().prepare(
    "insert or ignore into story_job_links (story_id, job_id, source) values (@storyId, @jobId, 'auto')"
  );
  for (const row of rows) {
    const tags = parseJson<string[]>(row.tags_json || "[]", []);
    if (tags.length > 0 && getStoryConceptIds(row.id).size === 0) {
      linkStoryConcepts(row.id, tags, "story_tag");
    }
    const storyConcepts = getStoryConceptIds(row.id);
    if (hasSpecificConceptOverlap(storyConcepts, jobConcepts) || rawKeywordMatchesHaystack(tags, [job.title, job.roleArchetype, ...jobKeywords])) {
      stmt.run({ storyId: row.id, jobId });
    }
  }
}

/**
 * Existing core stories (never evaluation-suggestion rows) that plausibly answer this
 * job's interview questions, ranked by taxonomy-concept / raw-keyword overlap. Powers
 * the "you may already have a story for this role" review panel on the job page, so a
 * user can link an existing story instead of drafting a duplicate. Read-only except for
 * lazily backfilling concept links; it does not create story_job_links itself.
 */
export function getMatchingStoriesForJob(jobId: string): Array<{
  id: string;
  title: string;
  qualityStatus: StoryQualityStatus;
  alreadyLinked: boolean;
}> {
  const job = getJobById(jobId);
  if (!job) return [];
  const evaluation = getEvaluationByJobId(jobId);
  const jobKeywords = evaluation?.keywords ?? [];
  if (evaluation?.keywords.length) {
    linkJobKeywordConcepts(jobId, evaluation.id, [job.title, job.roleArchetype, ...evaluation.keywords], "job_evaluation");
  } else {
    linkJobKeywordConcepts(jobId, null, [job.title, job.roleArchetype], "job_status");
  }
  const jobConcepts = getJobConceptIds(jobId);

  const linkedRows = getDatabase()
    .prepare("select story_id from story_job_links where job_id = @jobId")
    .all({ jobId }) as Array<{ story_id: string }>;
  const linked = new Set(linkedRows.map((row) => row.story_id));

  const rows = getDatabase()
    .prepare(
      "select id, title, tags_json, quality_status, situation, task, action, result from story_bank where story_kind <> 'evaluation_suggestion'"
    )
    .all() as Array<Pick<StoryRow, "id" | "title" | "tags_json" | "quality_status" | "situation" | "task" | "action" | "result">>;

  const matches: Array<{ id: string; title: string; qualityStatus: StoryQualityStatus; alreadyLinked: boolean }> = [];
  for (const row of rows) {
    const tags = parseJson<string[]>(row.tags_json || "[]", []);
    if (tags.length > 0 && getStoryConceptIds(row.id).size === 0) {
      linkStoryConcepts(row.id, tags, "story_tag");
    }
    const overlap =
      hasSpecificConceptOverlap(getStoryConceptIds(row.id), jobConcepts) ||
      rawKeywordMatchesHaystack(tags, [job.title, job.roleArchetype, ...jobKeywords]);
    if (overlap) {
      matches.push({
        id: row.id,
        title: row.title,
        qualityStatus: inferQualityStatus(row),
        alreadyLinked: linked.has(row.id)
      });
    }
  }
  // Already-linked first (so the user sees existing coverage), then by title.
  return matches.sort((a, b) => Number(b.alreadyLinked) - Number(a.alreadyLinked) || a.title.localeCompare(b.title));
}

/** Manually links or unlinks a single existing story to a job (source 'manual'). */
export function setStoryJobLink(storyId: string, jobId: string, linked: boolean) {
  if (linked) {
    getDatabase()
      .prepare("insert or ignore into story_job_links (story_id, job_id, source) values (@storyId, @jobId, 'manual')")
      .run({ storyId, jobId });
  } else {
    getDatabase().prepare("delete from story_job_links where story_id = @storyId and job_id = @jobId").run({ storyId, jobId });
  }
  logActivity("story_bank", storyId, linked ? "Story linked to job" : "Story unlinked from job", { jobId });
}

const STORY_KIND_VALUES = new Set<StoryKind>(["answered_question", "standalone_story", "evaluation_suggestion"]);
const STORY_QUALITY_VALUES = new Set<StoryQualityStatus>(["ready", "needs_detail", "missing_result"]);

function coerceStoryKind(value: string | null | undefined): StoryKind {
  return STORY_KIND_VALUES.has(value as StoryKind) ? (value as StoryKind) : "standalone_story";
}

function inferQualityStatus(row: Pick<StoryRow, "situation" | "task" | "action" | "result" | "quality_status">): StoryQualityStatus {
  if (STORY_QUALITY_VALUES.has(row.quality_status as StoryQualityStatus)) {
    return row.quality_status as StoryQualityStatus;
  }
  if (!row.result.trim()) return "missing_result";
  if (!row.situation.trim() || !row.task.trim() || !row.action.trim()) return "needs_detail";
  return "ready";
}

function assessStoryInput(input: Pick<StoryInput, "situation" | "task" | "action" | "result">): { status: StoryQualityStatus; notes: string } {
  if (!input.result.trim()) {
    return { status: "missing_result", notes: "Add a concrete outcome or impact before using this in an interview." };
  }
  if (!input.situation.trim() || !input.task.trim() || !input.action.trim()) {
    return { status: "needs_detail", notes: "Add missing STAR details before using this in an interview." };
  }
  return { status: "ready", notes: "" };
}

function normalizeTags(input: Pick<StoryInput, "tags" | "skills" | "themes" | "storyKind">, limit = 8): string[] {
  const seen = new Set<string>();
  const source = [...(input.tags ?? []), ...input.skills, ...input.themes];
  for (const item of source) {
    const normalized = item.trim().replace(/\s+/g, " ");
    if (normalized) seen.add(normalized);
    if (seen.size >= limit) break;
  }
  if (seen.size === 0) {
    seen.add(input.storyKind === "standalone_story" ? "standalone story" : "interview answer");
  }
  if (seen.size === 1) {
    seen.add("interview prep");
  }
  return Array.from(seen).slice(0, limit);
}

function ensureTaxonomyForStories(rows: Array<Pick<StoryRow, "id" | "tags_json" | "skills_json" | "themes_json" | "story_kind">>) {
  if (rows.length === 0) return;
  const existing = getDatabase().prepare("select story_id from story_keyword_concepts").all() as Array<{ story_id: string }>;
  const alreadyMapped = new Set(existing.map((row) => row.story_id));
  for (const row of rows) {
    if (alreadyMapped.has(row.id)) continue;
    const tags = parseJson<string[]>(row.tags_json || "[]", []);
    const skills = parseJson<string[]>(row.skills_json || "[]", []);
    const themes = parseJson<string[]>(row.themes_json || "[]", []);
    const rawKeywords = tags.length > 0 ? tags : normalizeTags({ tags: [], skills, themes, storyKind: coerceStoryKind(row.story_kind) });
    linkStoryConcepts(row.id, rawKeywords, "story_tag");
  }
}

function mapInterviewQuestion(row: InterviewQuestionRow): InterviewQuestionRecord {
  return {
    id: row.id,
    prompt: row.prompt,
    category: row.category,
    source: row.source === "default" ? "default" : "custom",
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStory(row: StoryRow): StoryRecord {
  const tags = parseJson<string[]>(row.tags_json || "[]", []);
  const skills = parseJson<string[]>(row.skills_json || "[]", []);
  const themes = parseJson<string[]>(row.themes_json || "[]", []);
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    reflection: row.reflection,
    skills,
    themes,
    tags: tags.length > 0 ? tags : normalizeTags({ tags: [], skills, themes, storyKind: coerceStoryKind(row.story_kind) }),
    conceptTags: [],
    rawKeywords: tags,
    sourceJobId: row.source_job_id,
    sourceBlockF: row.source_block_f,
    storyKind: coerceStoryKind(row.story_kind),
    questionId: row.question_id,
    promptText: row.prompt_text,
    qualityStatus: inferQualityStatus(row),
    qualityNotes: row.quality_notes,
    lastEvaluatedAt: row.last_evaluated_at,
    sourceJobCompany: row.source_job_company ?? "",
    sourceJobTitle: row.source_job_title ?? "",
    assignedJobs: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function loadStoryConcepts(storyIds: string[]): Map<string, { concepts: TaxonomyConceptRecord[]; rawKeywords: string[] }> {
  if (storyIds.length === 0) return new Map();
  const placeholders = storyIds.map(() => "?").join(",");
  const rows = getDatabase()
    .prepare(
      `select
        story_keyword_concepts.story_id,
        story_keyword_concepts.raw_keyword,
        story_keyword_concepts.normalized_keyword,
        story_keyword_concepts.concept_id,
        story_keyword_concepts.source,
        story_keyword_concepts.confidence,
        keyword_concepts.label,
        keyword_concepts.normalized_label,
        keyword_concepts.parent_id,
        keyword_concepts.depth,
        keyword_concepts.description,
        keyword_concepts.status,
        keyword_concepts.created_from,
        keyword_concepts.created_at,
        keyword_concepts.updated_at,
        keyword_concepts.archived_at
       from story_keyword_concepts
       join keyword_concepts on keyword_concepts.id = story_keyword_concepts.concept_id
       where story_keyword_concepts.story_id in (${placeholders})
         and keyword_concepts.status <> 'archived'
       order by keyword_concepts.depth, keyword_concepts.label collate nocase`
    )
    .all(...storyIds) as StoryConceptRow[];

  const byStory = new Map<string, { concepts: TaxonomyConceptRecord[]; rawKeywords: string[] }>();
  for (const row of rows) {
    const entry = byStory.get(row.story_id) ?? { concepts: [], rawKeywords: [] };
    if (!entry.concepts.some((concept) => concept.id === row.concept_id)) {
      entry.concepts.push(mapConceptRow({
        id: row.concept_id,
        label: row.label,
        normalized_label: row.normalized_label,
        parent_id: row.parent_id,
        depth: row.depth,
        description: row.description,
        status: row.status,
        created_from: row.created_from,
        created_at: row.created_at,
        updated_at: row.updated_at,
        archived_at: row.archived_at
      }));
    }
    if (!entry.rawKeywords.includes(row.raw_keyword)) entry.rawKeywords.push(row.raw_keyword);
    byStory.set(row.story_id, entry);
  }
  return byStory;
}

function loadStoryAssignments(storyIds: string[]): Map<string, StoryRecord["assignedJobs"]> {
  if (storyIds.length === 0) return new Map();
  const placeholders = storyIds.map(() => "?").join(",");
  const rows = getDatabase()
    .prepare(
      `select
        story_job_links.story_id,
        story_job_links.job_id,
        story_job_links.source,
        coalesce(nullif(applications.company, ''), jobs.company, 'External opportunity') as company,
        coalesce(nullif(applications.role, ''), jobs.title, story_job_links.job_id) as role,
        coalesce(applications.status, jobs.status, '') as status
       from story_job_links
       left join applications on applications.job_id = story_job_links.job_id
       left join jobs on jobs.id = story_job_links.job_id
       where story_job_links.story_id in (${placeholders})
       order by company collate nocase, role collate nocase`
    )
    .all(...storyIds) as StoryJobLinkRow[];

  const byStory = new Map<string, StoryRecord["assignedJobs"]>();
  for (const row of rows) {
    const existing = byStory.get(row.story_id) ?? [];
    existing.push({
      jobId: row.job_id,
      company: row.company,
      role: row.role,
      status: row.status,
      source: row.source === "auto" ? "auto" : "manual"
    });
    byStory.set(row.story_id, existing);
  }
  return byStory;
}

function attachStoryAssignments(stories: StoryRecord[]): StoryRecord[] {
  const assignments = loadStoryAssignments(stories.map((story) => story.id));
  const concepts = loadStoryConcepts(stories.map((story) => story.id));
  return stories.map((story) => ({
    ...story,
    assignedJobs: assignments.get(story.id) ?? [],
    conceptTags: concepts.get(story.id)?.concepts ?? [],
    rawKeywords: concepts.get(story.id)?.rawKeywords ?? story.rawKeywords
  }));
}

export function getInterviewQuestions(includeInactive = false): InterviewQuestionRecord[] {
  const where = includeInactive ? "" : "where active = 1";
  const rows = getDatabase()
    .prepare(`select * from interview_questions ${where} order by source = 'custom' desc, category collate nocase asc, updated_at desc, prompt collate nocase asc`)
    .all() as InterviewQuestionRow[];
  return rows.map(mapInterviewQuestion);
}

export function saveInterviewQuestion(input: InterviewQuestionInput) {
  getDatabase()
    .prepare(
      `insert into interview_questions (
        id, prompt, category, source, active, updated_at
      ) values (
        @id, @prompt, @category, @source, @active, current_timestamp
      )
      on conflict(id) do update set
        prompt = excluded.prompt,
        category = excluded.category,
        source = excluded.source,
        active = excluded.active,
        updated_at = current_timestamp`
    )
    .run({
      id: input.id,
      prompt: input.prompt.trim(),
      category: input.category.trim() || "General",
      source: input.source ?? "custom",
      active: input.active === false ? 0 : 1
    });
  logActivity("interview_question", input.id, `Interview question saved: ${input.prompt.trim()}`, {});
}

export function setInterviewQuestionActive(id: string, active: boolean) {
  getDatabase()
    .prepare("update interview_questions set active = @active, updated_at = current_timestamp where id = @id")
    .run({ id, active: active ? 1 : 0 });
  logActivity("interview_question", id, active ? "Interview question restored" : "Interview question hidden", {});
}

// ─── Practice attempts & question↔story links ─────────────────────────────────

type PracticeAttemptRow = {
  id: string;
  question_id: string | null;
  story_id: string | null;
  transcript: string;
  parsed_json: string;
  quality_status: string;
  coaching_notes_json: string;
  created_at: string;
};

function mapPracticeAttempt(row: PracticeAttemptRow): PracticeAttemptRecord {
  const parsed = parseJson<Record<string, string>>(row.parsed_json || "{}", {});
  return {
    id: row.id,
    questionId: row.question_id,
    storyId: row.story_id,
    transcript: row.transcript,
    parsed: {
      title: parsed.title ?? "",
      situation: parsed.situation ?? "",
      task: parsed.task ?? "",
      action: parsed.action ?? "",
      result: parsed.result ?? "",
      reflection: parsed.reflection ?? ""
    },
    qualityStatus: STORY_QUALITY_VALUES.has(row.quality_status as StoryQualityStatus)
      ? (row.quality_status as StoryQualityStatus)
      : "needs_detail",
    coachingNotes: parseJson<string[]>(row.coaching_notes_json || "[]", []),
    createdAt: row.created_at
  };
}

/** Records one rehearsal of a question. Re-practicing appends; nothing is overwritten. */
export function savePracticeAttempt(input: {
  questionId: string | null;
  storyId: string | null;
  transcript: string;
  parsed: { title: string; situation: string; task: string; action: string; result: string; reflection: string };
  qualityStatus: StoryQualityStatus;
  coachingNotes: string[];
}): string {
  const id = `attempt-${randomUUID()}`;
  getDatabase()
    .prepare(
      `insert into practice_attempts (
        id, question_id, story_id, transcript, parsed_json, quality_status, coaching_notes_json
      ) values (
        @id, @questionId, @storyId, @transcript, @parsedJson, @qualityStatus, @coachingNotesJson
      )`
    )
    .run({
      id,
      questionId: input.questionId,
      storyId: input.storyId,
      transcript: input.transcript,
      parsedJson: JSON.stringify(input.parsed),
      qualityStatus: input.qualityStatus,
      coachingNotesJson: JSON.stringify(input.coachingNotes ?? [])
    });
  return id;
}

export function linkQuestionStory(questionId: string, storyId: string, source = "manual") {
  if (!questionId || !storyId) return;
  getDatabase()
    .prepare(
      "insert or ignore into question_story_links (question_id, story_id, source) values (@questionId, @storyId, @source)"
    )
    .run({ questionId, storyId, source });
}

export function unlinkQuestionStory(questionId: string, storyId: string) {
  getDatabase()
    .prepare("delete from question_story_links where question_id = @questionId and story_id = @storyId")
    .run({ questionId, storyId });
}

/**
 * Per-question practice state for the interview-prep workspace: linked canonical
 * stories plus full attempt history, keyed by question id. One query feeds every
 * question row's history drawer and the coverage matrix.
 */
export function getQuestionPracticeMap(): Map<string, QuestionPracticeRecord> {
  const attemptRows = getDatabase()
    .prepare("select * from practice_attempts where question_id is not null order by created_at asc")
    .all() as PracticeAttemptRow[];
  const linkRows = getDatabase()
    .prepare(
      `select qsl.question_id, qsl.story_id, story_bank.title, story_bank.quality_status,
              story_bank.situation, story_bank.task, story_bank.action, story_bank.result
       from question_story_links qsl
       join story_bank on story_bank.id = qsl.story_id`
    )
    .all() as Array<{
      question_id: string;
      story_id: string;
      title: string;
      quality_status: string;
      situation: string;
      task: string;
      action: string;
      result: string;
    }>;

  const map = new Map<string, QuestionPracticeRecord>();
  const ensure = (questionId: string): QuestionPracticeRecord => {
    let entry = map.get(questionId);
    if (!entry) {
      entry = { questionId, attemptCount: 0, lastPracticedAt: null, linkedStories: [], attempts: [] };
      map.set(questionId, entry);
    }
    return entry;
  };

  for (const row of linkRows) {
    ensure(row.question_id).linkedStories.push({
      id: row.story_id,
      title: row.title,
      qualityStatus: inferQualityStatus(row)
    });
  }
  for (const row of attemptRows) {
    if (!row.question_id) continue;
    const entry = ensure(row.question_id);
    entry.attempts.push(mapPracticeAttempt(row));
    entry.attemptCount += 1;
    entry.lastPracticedAt = row.created_at;
  }
  // Newest attempts first for display.
  for (const entry of map.values()) entry.attempts.reverse();
  return map;
}

// ─── Story consolidation wizard ───────────────────────────────────────────────

export function getEvaluationSuggestionCount(): number {
  const row = getDatabase()
    .prepare("select count(*) as n from story_bank where story_kind = 'evaluation_suggestion'")
    .get() as { n: number };
  return row.n;
}

/** Compact digests of the legacy evaluation-suggestion stories, for LLM clustering. */
export function getEvaluationSuggestionDigests(): EvaluationSuggestionDigest[] {
  const rows = getDatabase()
    .prepare(
      `select story_bank.id, story_bank.title, story_bank.situation, story_bank.action, story_bank.result,
              story_bank.tags_json, story_bank.source_job_id,
              coalesce(jobs.company || ' — ' || jobs.title, '') as source_job_title
       from story_bank
       left join jobs on jobs.id = story_bank.source_job_id
       where story_bank.story_kind = 'evaluation_suggestion'
       order by story_bank.created_at asc`
    )
    .all() as Array<{
      id: string;
      title: string;
      situation: string;
      action: string;
      result: string;
      tags_json: string;
      source_job_id: string | null;
      source_job_title: string;
    }>;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    situation: row.situation,
    action: row.action,
    result: row.result,
    tags: parseJson<string[]>(row.tags_json || "[]", []),
    sourceJobId: row.source_job_id,
    sourceJobTitle: row.source_job_title
  }));
}

export function saveConsolidationRun(id: string, payload: ConsolidationPayload, status: ConsolidationRunRecord["status"] = "review") {
  getDatabase()
    .prepare(
      `insert into story_consolidation_runs (id, status, payload_json, updated_at)
       values (@id, @status, @payloadJson, current_timestamp)
       on conflict(id) do update set status = excluded.status, payload_json = excluded.payload_json, updated_at = current_timestamp`
    )
    .run({ id, status, payloadJson: JSON.stringify(payload) });
}

export function getLatestConsolidationRun(): ConsolidationRunRecord | null {
  const row = getDatabase()
    .prepare("select * from story_consolidation_runs order by created_at desc limit 1")
    .get() as { id: string; status: string; payload_json: string; created_at: string; updated_at: string } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    status: (["review", "committed", "abandoned"].includes(row.status) ? row.status : "review") as ConsolidationRunRecord["status"],
    payload: parseJson<ConsolidationPayload>(row.payload_json || "{}", { totalSuggestions: 0, clusters: [] }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Commits approved clusters: each becomes a canonical standalone story, the members'
 * job links are re-pointed to it, and the member suggestion rows are deleted. Runs in a
 * single transaction. Unapproved clusters are left untouched (their members stay).
 */
export function commitConsolidation(
  runId: string,
  approved: Array<{ canonical: ConsolidationCanonical; memberIds: string[] }>
): { createdStories: number; removedSuggestions: number } {
  const db = getDatabase();
  let removedSuggestions = 0;

  db.transaction(() => {
    for (const cluster of approved) {
      const memberIds = cluster.memberIds.filter(Boolean);
      if (memberIds.length === 0) continue;
      const storyId = `story-${randomUUID()}`;

      // Collect the members' job links so the new canonical inherits them.
      const placeholders = memberIds.map(() => "?").join(",");
      const jobLinks = db
        .prepare(`select distinct job_id from story_job_links where story_id in (${placeholders})`)
        .all(...memberIds) as Array<{ job_id: string }>;
      const sourceJobId = (db
        .prepare(`select source_job_id from story_bank where id in (${placeholders}) and source_job_id is not null limit 1`)
        .get(...memberIds) as { source_job_id: string | null } | undefined)?.source_job_id ?? null;

      saveStory(
        {
          id: storyId,
          title: cluster.canonical.title,
          situation: cluster.canonical.situation,
          task: cluster.canonical.task,
          action: cluster.canonical.action,
          result: cluster.canonical.result,
          reflection: cluster.canonical.reflection,
          skills: [],
          themes: [],
          tags: cluster.canonical.tags,
          sourceJobId,
          sourceBlockF: "",
          storyKind: "standalone_story",
          assignedJobIds: jobLinks.map((row) => row.job_id)
        },
        { skipAutoMatch: false }
      );

      const del = db.prepare("delete from story_bank where id = ?");
      for (const id of memberIds) {
        del.run(id);
        removedSuggestions += 1;
      }
    }
  })();

  const run = getLatestConsolidationRun();
  if (run && run.id === runId) saveConsolidationRun(runId, run.payload, "committed");

  return { createdStories: approved.filter((c) => c.memberIds.length > 0).length, removedSuggestions };
}

export function getStories(): StoryRecord[] {
  const rows = getDatabase()
    .prepare(
      `select
        story_bank.*,
        jobs.company as source_job_company,
        jobs.title as source_job_title
       from story_bank
       left join jobs on jobs.id = story_bank.source_job_id
       order by story_bank.updated_at desc`
    )
    .all() as StoryRow[];
  ensureTaxonomyForStories(rows);
  return attachStoryAssignments(rows.map(mapStory));
}

export function getStoriesByJobId(jobId: string): StoryRecord[] {
  const rows = getDatabase()
    .prepare(
      `select
        story_bank.*,
        jobs.company as source_job_company,
        jobs.title as source_job_title
       from story_bank
       left join jobs on jobs.id = story_bank.source_job_id
       where story_bank.source_job_id = @jobId
       order by story_bank.updated_at desc`
    )
    .all({ jobId }) as StoryRow[];
  ensureTaxonomyForStories(rows);
  return attachStoryAssignments(rows.map(mapStory));
}

export function saveStory(input: StoryInput, options?: { skipAutoMatch?: boolean }) {
  const assessed = assessStoryInput(input);
  const storyKind = input.storyKind ?? (input.sourceBlockF === "evaluation" ? "evaluation_suggestion" : input.sourceBlockF === "voice-practice" ? "answered_question" : "standalone_story");
  const tags = normalizeTags({ tags: input.tags, skills: input.skills, themes: input.themes, storyKind });
  getDatabase().transaction(() => {
    getDatabase()
      .prepare(
        `insert into story_bank (
          id, title, situation, task, action, result, reflection,
          skills_json, themes_json, tags_json, source_job_id, source_block_f,
          story_kind, question_id, prompt_text, quality_status, quality_notes,
          last_evaluated_at, updated_at
        ) values (
          @id, @title, @situation, @task, @action, @result, @reflection,
          @skillsJson, @themesJson, @tagsJson, @sourceJobId, @sourceBlockF,
          @storyKind, @questionId, @promptText, @qualityStatus, @qualityNotes,
          @lastEvaluatedAt, current_timestamp
        )
        on conflict(id) do update set
          title = excluded.title,
          situation = excluded.situation,
          task = excluded.task,
          action = excluded.action,
          result = excluded.result,
          reflection = excluded.reflection,
          skills_json = excluded.skills_json,
          themes_json = excluded.themes_json,
          tags_json = excluded.tags_json,
          source_job_id = excluded.source_job_id,
          source_block_f = excluded.source_block_f,
          story_kind = excluded.story_kind,
          question_id = excluded.question_id,
          prompt_text = excluded.prompt_text,
          quality_status = excluded.quality_status,
          quality_notes = excluded.quality_notes,
          last_evaluated_at = excluded.last_evaluated_at,
          updated_at = current_timestamp`
      )
      .run({
        ...input,
        skillsJson: JSON.stringify(input.skills),
        themesJson: JSON.stringify(input.themes),
        tagsJson: JSON.stringify(tags),
        sourceJobId: input.sourceJobId ?? null,
        sourceBlockF: input.sourceBlockF ?? "",
        storyKind,
        questionId: input.questionId ?? null,
        promptText: input.promptText ?? "",
        qualityStatus: input.qualityStatus ?? assessed.status,
        qualityNotes: input.qualityNotes ?? assessed.notes,
        lastEvaluatedAt: input.lastEvaluatedAt ?? null
      });
    linkStoryConcepts(input.id, tags, storyKind === "evaluation_suggestion" ? "job_evaluation_story" : "story_tag");

    if (input.assignedJobIds) {
      // Diff against existing links rather than delete-and-reinsert, so re-saving
      // unrelated fields doesn't collapse auto-matched links back to "manual".
      const desired = new Set(input.assignedJobIds.filter(Boolean));
      const existingRows = getDatabase()
        .prepare("select job_id from story_job_links where story_id = @storyId")
        .all({ storyId: input.id }) as Array<{ job_id: string }>;
      const existing = new Set(existingRows.map((row) => row.job_id));

      const removeStmt = getDatabase().prepare("delete from story_job_links where story_id = @storyId and job_id = @jobId");
      for (const jobId of existing) {
        if (!desired.has(jobId)) removeStmt.run({ storyId: input.id, jobId });
      }

      const addStmt = getDatabase().prepare("insert or ignore into story_job_links (story_id, job_id, source) values (@storyId, @jobId, 'manual')");
      for (const jobId of desired) {
        if (!existing.has(jobId)) addStmt.run({ storyId: input.id, jobId });
      }
    }

    // Skipped when this save *is* a manual assignment toggle — otherwise re-matching
    // would immediately re-add a position the user just unchecked.
    if (!options?.skipAutoMatch) {
      autoMatchJobsForStory(input.id, tags);
    }
  })();
  logActivity("story_bank", input.id, `Story saved: ${input.title}`, { sourceJobId: input.sourceJobId });
}

export function deleteStory(id: string) {
  getDatabase().prepare("delete from story_bank where id = @id").run({ id });
  logActivity("story_bank", id, "Story deleted", {});
}

function ensureTaxonomyForEvaluations() {
  const rows = getDatabase()
    .prepare(
      `select
        evaluations.id as evaluation_id,
        evaluations.job_id,
        evaluations.role_archetype,
        evaluations.keywords_json,
        jobs.title
       from evaluations
       left join jobs on jobs.id = evaluations.job_id`
    )
    .all() as Array<{ evaluation_id: string; job_id: string; role_archetype: string; keywords_json: string; title: string | null }>;
  for (const row of rows) {
    const existing = getDatabase().prepare("select 1 from job_keyword_concepts where job_id = @jobId limit 1").get({ jobId: row.job_id });
    if (existing) continue;
    linkJobKeywordConcepts(row.job_id, row.evaluation_id, [row.title ?? "", row.role_archetype, ...parseJson<string[]>(row.keywords_json || "[]", [])], "job_evaluation");
  }
}

function buildTaxonomyTree(rows: TaxonomyConceptRow[], aliasRows: TaxonomyAliasRow[]): TaxonomyConceptRecord[] {
  const aliasesByConcept = new Map<string, TaxonomyAliasRecord[]>();
  for (const row of aliasRows) {
    const aliases = aliasesByConcept.get(row.concept_id) ?? [];
    aliases.push(mapTaxonomyAlias(row));
    aliasesByConcept.set(row.concept_id, aliases);
  }

  const byId = new Map<string, TaxonomyConceptRecord>();
  for (const row of rows) {
    byId.set(row.id, mapConceptRow(row, aliasesByConcept.get(row.id) ?? []));
  }

  for (const concept of byId.values()) {
    concept.path = [concept.label];
    if (concept.parentId && byId.has(concept.parentId)) {
      byId.get(concept.parentId)?.children.push(concept);
    }
  }

  function hydratePath(concept: TaxonomyConceptRecord, parentPath: string[]) {
    concept.path = [...parentPath, concept.label];
    concept.children.sort((a, b) => a.label.localeCompare(b.label));
    concept.children.forEach((child) => hydratePath(child, concept.path));
  }

  const roots = Array.from(byId.values())
    .filter((concept) => !concept.parentId || !byId.has(concept.parentId))
    .sort((a, b) => a.label.localeCompare(b.label));
  roots.forEach((root) => hydratePath(root, []));
  return roots;
}

export function getKeywordTaxonomy(options?: { includeArchived?: boolean; includeCandidates?: boolean }): TaxonomyConceptRecord[] {
  ensureTaxonomyForEvaluations();
  // The default tree is the curated set: active (and archived when asked, so the user
  // can restore). Candidate concepts — the machine-generated pool — are excluded here
  // and surfaced separately through the review queue (getTaxonomyCandidates).
  const excluded: string[] = [];
  if (!options?.includeArchived) excluded.push("archived");
  if (!options?.includeCandidates) excluded.push("candidate");
  const statusWhere = excluded.length ? `where keyword_concepts.status not in (${excluded.map(() => "?").join(",")})` : "";
  const rows = getDatabase()
    .prepare(
      `select
        keyword_concepts.*,
        (select count(distinct story_id) from story_keyword_concepts where story_keyword_concepts.concept_id = keyword_concepts.id) as story_count,
        (select count(distinct job_id) from job_keyword_concepts where job_keyword_concepts.concept_id = keyword_concepts.id) as job_count
       from keyword_concepts
       ${statusWhere}
       order by depth asc, label collate nocase asc`
    )
    .all(...excluded) as TaxonomyConceptRow[];
  const aliases = getDatabase()
    .prepare("select * from keyword_aliases order by raw_phrase collate nocase asc")
    .all() as TaxonomyAliasRow[];
  return buildTaxonomyTree(rows, aliases);
}

export function getTaxonomyStatusCounts(): { active: number; candidate: number; archived: number } {
  const rows = getDatabase()
    .prepare("select status, count(*) as n from keyword_concepts group by status")
    .all() as Array<{ status: string; n: number }>;
  const counts = { active: 0, candidate: 0, archived: 0 };
  for (const row of rows) {
    if (row.status === "candidate") counts.candidate = row.n;
    else if (row.status === "archived") counts.archived = row.n;
    else counts.active += row.n;
  }
  return counts;
}

/**
 * Flat review-queue feed of machine-generated candidate concepts, ranked by how many
 * distinct jobs referenced each (strongest promotion signal first). Used by the
 * taxonomy review queue for bulk approve / archive.
 */
export function getTaxonomyCandidates(limit = 500): TaxonomyCandidateRecord[] {
  const allRows = getDatabase()
    .prepare("select id, label, parent_id from keyword_concepts")
    .all() as Array<{ id: string; label: string; parent_id: string | null }>;
  const byId = new Map(allRows.map((row) => [row.id, row]));
  const pathFor = (id: string): string[] => {
    const path: string[] = [];
    let current: string | null = id;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const row = byId.get(current);
      if (!row) break;
      path.unshift(row.label);
      current = row.parent_id;
    }
    return path;
  };
  const rows = getDatabase()
    .prepare(
      `select
        keyword_concepts.id,
        keyword_concepts.label,
        (select count(distinct story_id) from story_keyword_concepts where story_keyword_concepts.concept_id = keyword_concepts.id) as story_count,
        (select count(distinct job_id) from job_keyword_concepts where job_keyword_concepts.concept_id = keyword_concepts.id) as job_count
       from keyword_concepts
       where status = 'candidate'
       order by job_count desc, label collate nocase asc
       limit @limit`
    )
    .all({ limit }) as Array<{ id: string; label: string; story_count: number; job_count: number }>;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    path: pathFor(row.id),
    storyCount: row.story_count,
    jobCount: row.job_count
  }));
}

/** User approves a candidate (or a machine-promotion path) into the active taxonomy. */
export function promoteTaxonomyConcept(id: string) {
  promoteConceptWithAncestors(id, "user_approved", "user");
}

export function bulkArchiveTaxonomyConcepts(ids: string[]) {
  const stmt = getDatabase().prepare(
    "update keyword_concepts set status = 'archived', archived_at = current_timestamp, updated_at = current_timestamp where id = @id"
  );
  getDatabase().transaction(() => {
    for (const id of ids) {
      stmt.run({ id });
      logTaxonomyActivity("archived", id, null, { bulk: true }, "user");
    }
  })();
}

/**
 * Archives every candidate concept with no story links and fewer than the promotion
 * threshold of distinct jobs — the "clear the noise" action. Returns the count archived.
 */
export function archiveUnusedTaxonomyConcepts(): number {
  const rows = getDatabase()
    .prepare(
      `select id from keyword_concepts
       where status = 'candidate'
         and id not in (select distinct concept_id from story_keyword_concepts)
         and (select count(distinct job_id) from job_keyword_concepts j where j.concept_id = keyword_concepts.id) < @threshold`
    )
    .all({ threshold: CANDIDATE_JOB_PROMOTION_THRESHOLD }) as Array<{ id: string }>;
  bulkArchiveTaxonomyConcepts(rows.map((row) => row.id));
  return rows.length;
}

export function getTaxonomyActivity(limit = 20): TaxonomyActivityRecord[] {
  const rows = getDatabase()
    .prepare("select * from taxonomy_activity_log order by created_at desc limit @limit")
    .all({ limit }) as TaxonomyActivityRow[];
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    conceptId: row.concept_id,
    relatedId: row.related_id,
    details: parseJson<JsonValue>(row.details_json || "{}", {}),
    actor: row.actor,
    createdAt: row.created_at
  }));
}

function getDescendantConceptIds(id: string): string[] {
  const rows = getDatabase().prepare("select id from keyword_concepts where parent_id = @id").all({ id }) as Array<{ id: string }>;
  return rows.flatMap((row) => [row.id, ...getDescendantConceptIds(row.id)]);
}

function refreshDescendantDepths(parentId: string) {
  const parent = getDatabase().prepare("select id, depth from keyword_concepts where id = @id").get({ id: parentId }) as { id: string; depth: number } | undefined;
  if (!parent) return;
  const children = getDatabase().prepare("select id from keyword_concepts where parent_id = @id").all({ id: parentId }) as Array<{ id: string }>;
  for (const child of children) {
    const depth = Math.min(parent.depth + 1, TAXONOMY_MAX_DEPTH);
    getDatabase().prepare("update keyword_concepts set depth = @depth, updated_at = current_timestamp where id = @id").run({ id: child.id, depth });
    refreshDescendantDepths(child.id);
  }
}

export function saveTaxonomyConcept(input: TaxonomyConceptInput) {
  const label = input.label.trim();
  if (!label) return null;
  const parentId = input.parentId || null;
  const parentDepth = parentId ? getConceptDepth(parentId) : 1;
  if (parentDepth > TAXONOMY_MAX_DEPTH) {
    throw new Error(`Taxonomy depth cannot exceed ${TAXONOMY_MAX_DEPTH} levels.`);
  }

  if (!input.id) {
    const concept = ensureConcept(label, parentId, "user");
    ensureAlias(concept.id, label, "user", 1);
    if (input.description) {
      getDatabase()
        .prepare("update keyword_concepts set description = @description, updated_at = current_timestamp where id = @id")
        .run({ id: concept.id, description: input.description.trim() });
    }
    return concept.id;
  }

  const descendants = new Set(getDescendantConceptIds(input.id));
  if (parentId && (parentId === input.id || descendants.has(parentId))) {
    throw new Error("A taxonomy tag cannot be moved under itself or one of its children.");
  }

  getDatabase()
    .prepare(
      `update keyword_concepts
       set label = @label,
           normalized_label = @normalizedLabel,
           parent_id = @parentId,
           depth = @depth,
           description = @description,
           status = 'active',
           archived_at = null,
           updated_at = current_timestamp
       where id = @id`
    )
    .run({
      id: input.id,
      label,
      normalizedLabel: normalizeKeywordPhrase(label),
      parentId,
      depth: parentDepth,
      description: input.description?.trim() ?? ""
    });
  refreshDescendantDepths(input.id);
  ensureAlias(input.id, label, "user", 1);
  logTaxonomyActivity("updated", input.id, parentId, { label, parentId }, "user");
  return input.id;
}

export function archiveTaxonomyConcept(id: string) {
  getDatabase()
    .prepare("update keyword_concepts set status = 'archived', archived_at = current_timestamp, updated_at = current_timestamp where id = @id")
    .run({ id });
  logTaxonomyActivity("archived", id, null, {}, "user");
}

export function restoreTaxonomyConcept(id: string) {
  getDatabase()
    .prepare("update keyword_concepts set status = 'active', archived_at = null, updated_at = current_timestamp where id = @id")
    .run({ id });
  logTaxonomyActivity("restored", id, null, {}, "user");
}

export function addTaxonomyAlias(conceptId: string, rawPhrase: string) {
  ensureAlias(conceptId, rawPhrase, "user", 1);
  logTaxonomyActivity("alias_added", conceptId, null, { rawPhrase }, "user");
}

export function removeTaxonomyAlias(aliasId: string) {
  const row = getDatabase().prepare("select * from keyword_aliases where id = @aliasId").get({ aliasId }) as TaxonomyAliasRow | undefined;
  if (!row) return;
  getDatabase().prepare("delete from keyword_aliases where id = @aliasId").run({ aliasId });
  logTaxonomyActivity("alias_removed", row.concept_id, aliasId, { rawPhrase: row.raw_phrase }, "user");
}

export function mergeTaxonomyConcept(sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const source = getDatabase().prepare("select * from keyword_concepts where id = @sourceId").get({ sourceId }) as TaxonomyConceptRow | undefined;
  const target = getDatabase().prepare("select * from keyword_concepts where id = @targetId").get({ targetId }) as TaxonomyConceptRow | undefined;
  if (!source || !target) return;

  const aliases = getDatabase().prepare("select * from keyword_aliases where concept_id = @sourceId").all({ sourceId }) as TaxonomyAliasRow[];
  for (const alias of aliases) {
    ensureAlias(targetId, alias.raw_phrase, alias.source, alias.confidence);
  }

  const storyLinks = getDatabase().prepare("select * from story_keyword_concepts where concept_id = @sourceId").all({ sourceId }) as Array<{
    story_id: string;
    raw_keyword: string;
    normalized_keyword: string;
    source: string;
    confidence: number;
  }>;
  const storyStmt = getDatabase().prepare(
    `insert or ignore into story_keyword_concepts (story_id, raw_keyword, normalized_keyword, concept_id, source, confidence)
     values (@storyId, @rawKeyword, @normalizedKeyword, @targetId, @source, @confidence)`
  );
  for (const link of storyLinks) {
    storyStmt.run({
      storyId: link.story_id,
      rawKeyword: link.raw_keyword,
      normalizedKeyword: link.normalized_keyword,
      targetId,
      source: link.source,
      confidence: link.confidence
    });
  }

  const jobLinks = getDatabase().prepare("select * from job_keyword_concepts where concept_id = @sourceId").all({ sourceId }) as Array<{
    job_id: string;
    evaluation_id: string | null;
    raw_keyword: string;
    normalized_keyword: string;
    source: string;
    confidence: number;
  }>;
  const jobStmt = getDatabase().prepare(
    `insert or ignore into job_keyword_concepts (job_id, evaluation_id, raw_keyword, normalized_keyword, concept_id, source, confidence)
     values (@jobId, @evaluationId, @rawKeyword, @normalizedKeyword, @targetId, @source, @confidence)`
  );
  for (const link of jobLinks) {
    jobStmt.run({
      jobId: link.job_id,
      evaluationId: link.evaluation_id,
      rawKeyword: link.raw_keyword,
      normalizedKeyword: link.normalized_keyword,
      targetId,
      source: link.source,
      confidence: link.confidence
    });
  }

  getDatabase().prepare("delete from story_keyword_concepts where concept_id = @sourceId").run({ sourceId });
  getDatabase().prepare("delete from job_keyword_concepts where concept_id = @sourceId").run({ sourceId });
  getDatabase().prepare("delete from keyword_aliases where concept_id = @sourceId").run({ sourceId });
  archiveTaxonomyConcept(sourceId);
  logTaxonomyActivity("merged", targetId, sourceId, { sourceLabel: source.label, targetLabel: target.label }, "user");
}

/** Cap on how many of a job's extracted ATS keywords carry over as story tags. */
const EVALUATION_STORY_KEYWORD_TAG_LIMIT = 12;

/**
 * Replaces all auto-saved Block F stories for a job with the new set.
 * Called automatically after every LLM evaluation via runAndSaveJobWithAI.
 * Manually-added or voice-practice stories are never touched.
 *
 * Tags reuse the job's own ATS keywords (Block E) rather than a generic
 * fallback — same vocabulary on both sides is what lets autoMatchJobsForStory
 * connect a story back to *other* positions that share that keyword.
 */
export function autoSaveEvaluationStories(jobId: string, stories: StructuredStory[], jobKeywords: string[] = []) {
  const db = getDatabase();
  const tags = normalizeTags(
    {
      tags: jobKeywords,
      skills: [],
      themes: [],
      storyKind: "evaluation_suggestion"
    },
    EVALUATION_STORY_KEYWORD_TAG_LIMIT
  );
  const tagsJson = JSON.stringify(tags);

  db.transaction(() => {
    // Delete previously auto-saved stories for this job only
    db.prepare("delete from story_bank where source_job_id = @jobId and source_block_f = 'evaluation'").run({ jobId });
    const stmt = db.prepare(
      `insert into story_bank (
        id, title, situation, task, action, result, reflection,
        skills_json, themes_json, tags_json, source_job_id, source_block_f,
        story_kind, prompt_text, quality_status, quality_notes,
        last_evaluated_at, updated_at
      ) values (
        @id, @title, @situation, @task, @action, @result, @reflection,
        @tagsJson, @tagsJson, @tagsJson, @sourceJobId, 'evaluation',
        'evaluation_suggestion', @title, @qualityStatus, @qualityNotes,
        current_timestamp, current_timestamp
      )`
    );
    for (const story of stories) {
      const qualityStatus = story.result.trim() ? "ready" : "missing_result";
      const id = `eval-story-${jobId}-${randomUUID().slice(0, 8)}`;
      stmt.run({
        id,
        title: story.question,
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        reflection: story.reflection,
        sourceJobId: jobId,
        tagsJson,
        qualityStatus,
        qualityNotes: qualityStatus === "missing_result" ? "Add a concrete outcome or impact before using this in an interview." : ""
      });
      linkStoryConcepts(id, tags, "job_evaluation_story");
    }
  })();
}

// ─── Company Research ─────────────────────────────────────────────────────────

type CompanyResearchRow = {
  id: string;
  job_id: string;
  company: string;
  ai_strategy: string;
  recent_movements: string;
  engineering_culture: string;
  technical_challenges: string;
  competitive_position: string;
  candidate_angle: string;
  provider_used: string;
  model_used: string;
  created_at: string;
};

function mapCompanyResearch(row: CompanyResearchRow): CompanyResearchRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    company: row.company,
    aiStrategy: row.ai_strategy,
    recentMovements: row.recent_movements,
    engineeringCulture: row.engineering_culture,
    technicalChallenges: row.technical_challenges,
    competitivePosition: row.competitive_position,
    candidateAngle: row.candidate_angle,
    providerUsed: row.provider_used,
    modelUsed: row.model_used,
    createdAt: row.created_at
  };
}

export function getCompanyResearch(jobId: string): CompanyResearchRecord | null {
  const row = getDatabase().prepare("select * from company_research where job_id = @jobId").get({ jobId }) as CompanyResearchRow | undefined;
  return row ? mapCompanyResearch(row) : null;
}

export function saveCompanyResearch(input: CompanyResearchInput) {
  getDatabase()
    .prepare(
      `insert or replace into company_research (
        id, job_id, company, ai_strategy, recent_movements,
        engineering_culture, technical_challenges, competitive_position,
        candidate_angle, provider_used, model_used
      ) values (
        @id, @jobId, @company, @aiStrategy, @recentMovements,
        @engineeringCulture, @technicalChallenges, @competitivePosition,
        @candidateAngle, @providerUsed, @modelUsed
      )`
    )
    .run(input);
  logActivity("company_research", input.jobId, `Company research generated for ${input.company}`, {
    providerUsed: input.providerUsed,
    modelUsed: input.modelUsed
  });
}

// ─── Outreach Drafts ──────────────────────────────────────────────────────────

type OutreachDraftRow = {
  id: string;
  job_id: string;
  contact_type: string;
  message: string;
  char_count: number;
  status: string;
  provider_used: string;
  model_used: string;
  created_at: string;
};

function mapOutreachDraft(row: OutreachDraftRow): OutreachDraftRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    contactType: row.contact_type as OutreachDraftRecord["contactType"],
    message: row.message,
    charCount: row.char_count,
    status: row.status,
    providerUsed: row.provider_used ?? "",
    modelUsed: row.model_used ?? "",
    createdAt: row.created_at
  };
}

export function getOutreachDrafts(jobId: string): OutreachDraftRecord[] {
  const rows = getDatabase().prepare("select * from outreach_drafts where job_id = @jobId order by created_at desc").all({ jobId }) as OutreachDraftRow[];
  return rows.map(mapOutreachDraft);
}

export function saveOutreachDraft(input: OutreachDraftInput) {
  getDatabase()
    .prepare(
      `insert or replace into outreach_drafts (
        id, job_id, contact_type, message, char_count, provider_used, model_used
      ) values (
        @id, @jobId, @contactType, @message, @charCount, @providerUsed, @modelUsed
      )`
    )
    .run({ ...input, charCount: input.message.length, providerUsed: input.providerUsed ?? "", modelUsed: input.modelUsed ?? "" });
  logActivity("outreach", input.jobId, `Outreach draft saved for ${input.contactType}`, { charCount: input.message.length });
}

export function deleteOutreachDraftsForJob(jobId: string) {
  getDatabase().prepare("delete from outreach_drafts where job_id = @jobId").run({ jobId });
}

// ─── Writing Style Cache ──────────────────────────────────────────────────────

type WritingStyleRow = {
  id: string;
  tone_profile: string;
  sample_count: number;
  last_updated: string;
};

export function getWritingStyle(): WritingStyleRecord {
  const row = getDatabase().prepare("select * from writing_style_cache where id = 'singleton'").get() as WritingStyleRow | undefined;
  return {
    id: "singleton",
    toneProfile: row?.tone_profile ?? "",
    sampleCount: row?.sample_count ?? 0,
    lastUpdated: row?.last_updated ?? new Date().toISOString()
  };
}

export function saveWritingStyle(toneProfile: string, sampleCount: number) {
  getDatabase()
    .prepare(
      `update writing_style_cache set
        tone_profile = @toneProfile,
        sample_count = @sampleCount,
        last_updated = current_timestamp
      where id = 'singleton'`
    )
    .run({ toneProfile, sampleCount });
  logActivity("writing_style", "singleton", "Writing style cache updated", { sampleCount });
}

export function saveJobLiveness(id: string, status: string, reason: string) {
  const db = getDatabase();
  db.prepare(
    `update jobs set
      liveness_status = @status,
      liveness_checked_at = current_timestamp
    where id = @id`
  ).run({ id, status });
  logActivity("job", id, `Liveness check: ${status}`, { reason });
}

export function saveJobScopeStatus(id: string, scopeStatus: string) {
  getDatabase()
    .prepare("update jobs set scope_status = @scopeStatus where id = @id")
    .run({ id, scopeStatus });
}

export function setJobReviewStatus(id: string, status: "none" | "pending_review") {
  getDatabase()
    .prepare("update jobs set review_status = @status where id = @id")
    .run({ id, status });
}

export function getReviewQueueCount(): number {
  const row = getDatabase()
    .prepare("select count(*) as n from jobs where review_status = 'pending_review' and archived = 0")
    .get() as { n: number };
  return row.n;
}

export function getScanSourceOverrides(): Record<string, boolean> {
  const rows = getDatabase()
    .prepare("select name, enabled from scan_source_overrides")
    .all() as Array<{ name: string; enabled: number }>;
  return Object.fromEntries(rows.map((r) => [r.name, r.enabled === 1]));
}

export function setScanSourceEnabled(name: string, enabled: boolean) {
  getDatabase()
    .prepare(
      `insert or replace into scan_source_overrides (name, enabled, updated_at)
       values (@name, @enabled, current_timestamp)`
    )
    .run({ name, enabled: enabled ? 1 : 0 });
}

export type CustomScanSource = {
  name: string;
  careersUrl: string;
  api: string;
  enabled: boolean;
};

export function getCustomScanSources(): CustomScanSource[] {
  const rows = getDatabase()
    .prepare("select name, careers_url, api, enabled from scan_sources_custom order by name")
    .all() as Array<{ name: string; careers_url: string; api: string; enabled: number }>;
  return rows.map((r) => ({ name: r.name, careersUrl: r.careers_url, api: r.api, enabled: r.enabled === 1 }));
}

export function addCustomScanSource(name: string, careersUrl: string, api: string) {
  getDatabase()
    .prepare(
      `insert or replace into scan_sources_custom (name, careers_url, api, enabled)
       values (@name, @careersUrl, @api, 1)`
    )
    .run({ name, careersUrl, api });
}

export function deleteCustomScanSource(name: string) {
  getDatabase().prepare("delete from scan_sources_custom where name = @name").run({ name });
  getDatabase().prepare("delete from scan_source_overrides where name = @name").run({ name });
}

export function deleteAllCustomScanSources() {
  const db = getDatabase();
  const names = (db.prepare("select name from scan_sources_custom").all() as Array<{ name: string }>).map((r) => r.name);
  db.prepare("delete from scan_sources_custom").run();
  if (names.length > 0) {
    // Remove overrides only for sources that were custom (not yaml)
    for (const name of names) {
      db.prepare("delete from scan_source_overrides where name = @name").run({ name });
    }
  }
}

export type CompanyProfile = {
  name: string;
  industry: string;
  tags: string[];
  updatedAt: string;
};

export function getCompanyProfiles(): Map<string, CompanyProfile> {
  const rows = getDatabase()
    .prepare("select name, industry, tags_json, updated_at from company_profiles order by name")
    .all() as Array<{ name: string; industry: string; tags_json: string; updated_at: string }>;
  return new Map(
    rows.map((r) => [r.name, { name: r.name, industry: r.industry, tags: parseJson<string[]>(r.tags_json), updatedAt: r.updated_at }])
  );
}

export function upsertCompanyProfile(name: string, industry: string): void {
  getDatabase()
    .prepare(
      `insert or replace into company_profiles (name, industry, tags_json, updated_at)
       values (@name, @industry, '[]', current_timestamp)`
    )
    .run({ name, industry });
}

export function syncCompanyProfilesFromYaml(companies: Array<{ name: string; industry?: string }>): void {
  const stmt = getDatabase().prepare(
    `insert or ignore into company_profiles (name, industry, tags_json, updated_at)
     values (@name, @industry, '[]', current_timestamp)`
  );
  for (const c of companies) {
    stmt.run({ name: c.name, industry: c.industry ?? "" });
  }
}

export function deleteJob(jobId: string) {
  const db = getDatabase();
  db.transaction(() => {
    db.prepare("delete from application_answer_drafts where job_id = @jobId").run({ jobId });
    db.prepare("delete from outreach_drafts where job_id = @jobId").run({ jobId });
    db.prepare("delete from company_research where job_id = @jobId").run({ jobId });
    db.prepare("delete from evaluation_feedback where job_id = @jobId").run({ jobId });
    db.prepare("delete from evaluations where job_id = @jobId").run({ jobId });
    db.prepare("delete from applications where job_id = @jobId").run({ jobId });
    db.prepare("delete from generated_documents where job_id = @jobId").run({ jobId });
    db.prepare("delete from job_gap_responses where job_id = @jobId").run({ jobId });
    db.prepare("update story_bank set source_job_id = null where source_job_id = @jobId").run({ jobId });
    db.prepare("delete from jobs where id = @jobId").run({ jobId });
  })();
}

export type PurgeJobsCriteria = {
  belowScore?: number;
  statuses?: string[];
  locationKeywords?: string[];
  excludeLocationKeywords?: string[];
  includeArchived?: boolean;
};

type PurgeCandidateJob = {
  fit_score: number;
  status: string;
  location: string;
  archived: number;
};

export function shouldPurgeJob(job: PurgeCandidateJob, criteria: PurgeJobsCriteria): boolean {
  if (criteria.belowScore !== undefined && job.fit_score >= criteria.belowScore) return false;
  if (criteria.statuses?.length) {
    const statusMatch = criteria.statuses.includes(job.status);
    const archivedMatch = criteria.includeArchived && job.archived === 1;
    if (!statusMatch && !archivedMatch) return false;
  }
  if (criteria.locationKeywords?.length) {
    const loc = job.location.toLowerCase();
    const isRemote = loc.includes("remote");
    const isLocal = criteria.locationKeywords.some((kw) => loc.includes(kw.toLowerCase()));
    if (isRemote || isLocal) return false;
  }
  return true;
}

export function purgeJobs(criteria: PurgeJobsCriteria): number {
  const db = getDatabase();
  let jobs = db.prepare("select id, fit_score, status, location, archived from jobs").all() as Array<{
    id: string;
    fit_score: number;
    status: string;
    location: string;
    archived: number;
  }>;

  jobs = jobs.filter((j) => shouldPurgeJob(j, criteria));

  for (const job of jobs) deleteJob(job.id);
  return jobs.length;
}

export function purgeAllArchivedJobs(): number {
  const db = getDatabase();
  const jobs = db.prepare("select id from jobs where archived = 1").all() as Array<{ id: string }>;
  for (const job of jobs) deleteJob(job.id);
  return jobs.length;
}

// ─── Title filters ────────────────────────────────────────────────────────────

type TitleFiltersRow = { positive_json: string; negative_json: string };

export function getTitleFilters(): { positive: string[]; negative: string[] } {
  const row = getDatabase()
    .prepare("select positive_json, negative_json from title_filters where id = 'singleton'")
    .get() as TitleFiltersRow | undefined;
  return {
    positive: parseJson<string[]>(row?.positive_json ?? "[]"),
    negative: parseJson<string[]>(row?.negative_json ?? "[]"),
  };
}

export function saveTitleFilters(positive: string[], negative: string[]) {
  getDatabase()
    .prepare(
      `update title_filters set
        positive_json = @positiveJson,
        negative_json = @negativeJson,
        updated_at = current_timestamp
      where id = 'singleton'`
    )
    .run({
      positiveJson: JSON.stringify(positive),
      negativeJson: JSON.stringify(negative),
    });
}

// ─── Job Gap Responses ────────────────────────────────────────────────────────

type JobGapResponseRow = {
  id: string;
  job_id: string;
  gap_text: string;
  raw_response: string;
  polished_response: string;
  source: string;
  quality_status: string;
  follow_up_question: string;
  assessment_json: string;
  assessed_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeGapQualityStatus(value: string | undefined): JobGapResponseRecord["qualityStatus"] {
  return value === "needs_followup" ? "needs_followup" : "addressed";
}

function mapGapResponse(row: JobGapResponseRow): JobGapResponseRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    gapText: row.gap_text,
    rawResponse: row.raw_response,
    polishedResponse: row.polished_response,
    source: row.source,
    qualityStatus: normalizeGapQualityStatus(row.quality_status),
    followUpQuestion: row.follow_up_question,
    assessment: parseJson<JsonValue>(row.assessment_json),
    assessedAt: row.assessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getJobGapResponses(jobId: string): JobGapResponseRecord[] {
  const rows = getDatabase()
    .prepare("select * from job_gap_responses where job_id = @jobId order by updated_at desc")
    .all({ jobId }) as JobGapResponseRow[];
  return rows.map(mapGapResponse);
}

export function saveJobGapResponse(input: JobGapResponseInput): void {
  const qualityStatus = input.qualityStatus ?? "addressed";
  const followUpQuestion = input.followUpQuestion ?? "";
  const assessmentJson = JSON.stringify(input.assessment ?? {});
  getDatabase()
    .prepare(
      `insert into job_gap_responses (
         id, job_id, gap_text, raw_response, polished_response, source,
         quality_status, follow_up_question, assessment_json, assessed_at, updated_at
       )
       values (
         @id, @jobId, @gapText, @rawResponse, @polishedResponse, 'user-added',
         @qualityStatus, @followUpQuestion, @assessmentJson, current_timestamp, current_timestamp
       )
       on conflict(job_id, gap_text) do update set
         raw_response = excluded.raw_response,
         polished_response = excluded.polished_response,
         quality_status = excluded.quality_status,
         follow_up_question = excluded.follow_up_question,
         assessment_json = excluded.assessment_json,
         assessed_at = excluded.assessed_at,
         updated_at = current_timestamp`
    )
    .run({ ...input, qualityStatus, followUpQuestion, assessmentJson });
  logActivity("gap_response", input.jobId, "Gap response saved", { gapText: input.gapText, qualityStatus });
}

export function deleteJobGapResponse(jobId: string, gapText: string): void {
  getDatabase()
    .prepare("delete from job_gap_responses where job_id = @jobId and gap_text = @gapText")
    .run({ jobId, gapText });
}

// ─── Profile Supplements ──────────────────────────────────────────────────────

type ProfileSupplementRow = {
  id: string;
  content: string;
  tags_json: string;
  quality_status: string;
  follow_up_question: string;
  assessment_json: string;
  assessed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function getProfileSupplements(): ProfileSupplementRecord[] {
  const rows = getDatabase()
    .prepare("select * from profile_gap_supplements order by updated_at desc")
    .all() as ProfileSupplementRow[];
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    tags: parseJson<string[]>(r.tags_json),
    qualityStatus: normalizeGapQualityStatus(r.quality_status),
    followUpQuestion: r.follow_up_question,
    assessment: parseJson<JsonValue>(r.assessment_json),
    assessedAt: r.assessed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function saveProfileSupplement(input: ProfileSupplementInput): void {
  const qualityStatus = input.qualityStatus ?? "addressed";
  const followUpQuestion = input.followUpQuestion ?? "";
  const assessmentJson = JSON.stringify(input.assessment ?? {});
  getDatabase()
    .prepare(
      `insert into profile_gap_supplements (
         id, content, tags_json, quality_status, follow_up_question, assessment_json, assessed_at, updated_at
       )
       values (
         @id, @content, @tagsJson, @qualityStatus, @followUpQuestion, @assessmentJson, current_timestamp, current_timestamp
       )
       on conflict(id) do update set
         content = excluded.content,
         tags_json = excluded.tags_json,
         quality_status = excluded.quality_status,
         follow_up_question = excluded.follow_up_question,
         assessment_json = excluded.assessment_json,
         assessed_at = excluded.assessed_at,
         updated_at = current_timestamp`
    )
    .run({
      id: input.id,
      content: input.content,
      tagsJson: JSON.stringify(input.tags),
      qualityStatus,
      followUpQuestion,
      assessmentJson,
    });
  logActivity("profile_supplement", input.id, "Profile supplement saved", { qualityStatus });
}

export function deleteProfileSupplement(id: string): void {
  getDatabase().prepare("delete from profile_gap_supplements where id = @id").run({ id });
  logActivity("profile_supplement", id, "Profile supplement deleted", {});
}

export function getDashboardActionQueue(): ActionQueueData {
  const jobs = getJobs();
  const applications = getApplications();

  const activeStatuses = new Set<string>(activeApplicationStatuses);
  const excludeFromApplyNext = new Set<ApplicationStatus>([
    ...activeApplicationStatuses,
    "Skipped",
    "Rejected",
  ]);

  const activePipelineJobIds = new Set(
    applications.filter((a) => activeStatuses.has(a.status)).map((a) => a.jobId),
  );

  const toApply = jobs
    .filter(
      (j) =>
        (j.recommendation === "Priority apply" || j.recommendation === "Strong apply") &&
        !excludeFromApplyNext.has(j.status as ApplicationStatus) &&
        !activePipelineJobIds.has(j.id),
    )
    .slice(0, 7);

  const recentlyApplied = applications
    .filter((a) => activeStatuses.has(a.status))
    .sort((a, b) => (b.appliedDate ?? "").localeCompare(a.appliedDate ?? ""))
    .slice(0, 7);

  return { toApply, recentlyApplied };
}

export function getJobSourceBreakdown(): { scanned: number; manual: number } {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recentJobs = getJobs().filter((j) => j.firstSeenDate >= sevenDaysAgo);
  return recentJobs.reduce(
    (acc, j) => {
      if (j.source === "manual") acc.manual++;
      else acc.scanned++;
      return acc;
    },
    { scanned: 0, manual: 0 }
  );
}

// ─── Table saved filter presets (dashboard column filters) ─────────────────

export function getTableSavedFiltersPayload(tableKey: string): string | null {
  const row = getDatabase()
    .prepare("select payload_json from table_saved_filters where table_key = @tableKey")
    .get({ tableKey }) as { payload_json: string } | undefined;
  return row?.payload_json ?? null;
}

export function upsertTableSavedFiltersPayload(tableKey: string, payloadJson: string): void {
  getDatabase()
    .prepare(
      `insert into table_saved_filters (table_key, payload_json, updated_at)
       values (@tableKey, @payloadJson, current_timestamp)
       on conflict(table_key) do update set
         payload_json = excluded.payload_json,
         updated_at = current_timestamp`,
    )
    .run({ tableKey, payloadJson });
}
