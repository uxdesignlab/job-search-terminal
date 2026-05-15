import { randomUUID } from "node:crypto";
import { activeApplicationStatuses } from "../applications/status";
import { coerceResumeBaseToLane } from "../evaluation/resume-lane-picker";
import { normalizePreferredLocations } from "../profile/locations";
import { getDatabase } from "./client";
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
  UserProfileRecord,
  WorkMode,
  WritingStyleRecord,
  JobGapResponseRecord,
  JobGapResponseInput,
  ProfileSupplementRecord,
  ProfileSupplementInput,
  ActionQueueData
} from "./types";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const WORK_MODE_VALUES = new Set<WorkMode>(["remote", "hybrid", "onsite"]);

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
};

type ApplicationAnswerDraftRow = {
  id: string;
  job_id: string;
  question: string;
  answer: string;
  source: string;
  sort_order: number;
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
            id, job_id, question, answer, source, sort_order, updated_at
          ) values (
            @id, @jobId, @question, @answer, @source, @sortOrder, current_timestamp
          )
          on conflict(id) do update set
            question = excluded.question,
            answer = excluded.answer,
            source = excluded.source,
            sort_order = excluded.sort_order,
            updated_at = current_timestamp`
        )
        .run(draft);
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
        generated_documents.draft_json as draftJson
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
        generated_documents.draft_json as draftJson
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
        draft_json
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
        @draftJson
      )`
    )
    .run({
      ...input,
      tailoringPlanJson: JSON.stringify(input.tailoringPlan)
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
        freshnessLabel: "New today",
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
    | "adzuna-api-scan";
  location: string;
  rawDescription: string;
  datePosted: string | null;
  firstSeenDate: string;
  salaryNotes: string;
  isDuplicate: boolean;
  duplicateOf: string[] | null;
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
      is_duplicate, duplicate_of
    ) values (
      @id, @company, @title, @url, @sourceUrl, @originalPostingUrl, @originalPostingKey, @source, @location, @remoteType,
      @datePosted, @firstSeenDate, 'New today', @rawDescription,
      '', 'Found', 0, 'Unreviewed', 'Needs review',
      @summary,
      'Pending evaluation against profile, resume lanes, and constraints.',
      'Not evaluated yet.', 'To be selected', @salaryNotes,
      '[]', '[]', '[]', '[]',
      @isDuplicate, @duplicateOf
    )`
  );

  const jobIds: string[] = [];
  const insertMany = database.transaction((items: BrowserBoardJobInput[]) => {
    let inserted = 0;
    for (const job of items) {
      const result = insert.run({
        ...job,
        remoteType: inferRemoteType(job.location),
        summary: `Discovered via ${sourceNameForSummary(job.source)} browser scan. Evaluate this role before acting.`,
        salaryNotes: job.salaryNotes || "Not captured by scanner.",
        isDuplicate: job.isDuplicate ? 1 : 0,
        duplicateOf: job.duplicateOf ? JSON.stringify(job.duplicateOf) : null
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
         'monster-browser-scan'
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
        scan_type
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
        @scanType
      )`
    )
    .run({
      ...run,
      errorsJson: JSON.stringify(run.errors),
      scanType: run.scanType ?? "careerops"
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
    errors: parseJson<Array<{ company: string; error: string }>>(row.errors_json),
    scanType: (row.scan_type ?? "careerops") as ScanRunRecord["scanType"]
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
    draftJson: row.draftJson || "{}"
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
  return "Monster";
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
  fallback_provider: string;
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
      fallbackProvider: "",
      onboardingDismissed: false,
      onboardingPreferencesConfirmed: false,
      braveSearchApiKey: "",
      adzunaAppId: "",
      adzunaApiKey: "",
      updatedAt: new Date().toISOString()
    };
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
    fallbackProvider: row.fallback_provider,
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
        fallback_provider = @fallbackProvider,
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
  source_job_id: string | null;
  source_block_f: string;
  created_at: string;
  updated_at: string;
};

function mapStory(row: StoryRow): StoryRecord {
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    reflection: row.reflection,
    skills: parseJson<string[]>(row.skills_json || "[]"),
    themes: parseJson<string[]>(row.themes_json || "[]"),
    sourceJobId: row.source_job_id,
    sourceBlockF: row.source_block_f,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getStories(): StoryRecord[] {
  const rows = getDatabase().prepare("select * from story_bank order by updated_at desc").all() as StoryRow[];
  return rows.map(mapStory);
}

export function getStoriesByJobId(jobId: string): StoryRecord[] {
  const rows = getDatabase().prepare("select * from story_bank where source_job_id = @jobId order by updated_at desc").all({ jobId }) as StoryRow[];
  return rows.map(mapStory);
}

export function saveStory(input: StoryInput) {
  getDatabase()
    .prepare(
      `insert or replace into story_bank (
        id, title, situation, task, action, result, reflection,
        skills_json, themes_json, source_job_id, source_block_f,
        updated_at
      ) values (
        @id, @title, @situation, @task, @action, @result, @reflection,
        @skillsJson, @themesJson, @sourceJobId, @sourceBlockF,
        current_timestamp
      )`
    )
    .run({
      ...input,
      skillsJson: JSON.stringify(input.skills),
      themesJson: JSON.stringify(input.themes),
      sourceJobId: input.sourceJobId ?? null,
      sourceBlockF: input.sourceBlockF ?? ""
    });
  logActivity("story_bank", input.id, `Story saved: ${input.title}`, { sourceJobId: input.sourceJobId });
}

export function deleteStory(id: string) {
  getDatabase().prepare("delete from story_bank where id = @id").run({ id });
  logActivity("story_bank", id, "Story deleted", {});
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
        id, job_id, contact_type, message, char_count
      ) values (
        @id, @jobId, @contactType, @message, @charCount
      )`
    )
    .run({ ...input, charCount: input.message.length });
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
