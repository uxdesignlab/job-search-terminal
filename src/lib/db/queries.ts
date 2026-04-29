import { getDatabase } from "./client";
import type {
  ActivityRecord,
  ApplicationRecord,
  DashboardMetric,
  EvaluationCorrectionInput,
  EvaluationFeedbackRecord,
  EvaluationRecord,
  FunnelStage,
  GeneratedDocumentRecord,
  JobEvaluationResultInput,
  JobRecord,
  JsonValue,
  ProfileUpdateInput,
  ResumeRecord,
  RoleDirectionRecord,
  RoleDirectionUpdateInput,
  ScannedJobInput,
  ScanRunRecord,
  SkillRecord,
  UserProfileRecord
} from "./types";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

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
  deal_breakers_json: string;
  career_intent: string;
  career_change_interest: string;
  confidence_level: string;
  constraints_json: string;
  target_roles_json: string;
  strongest_skills_json: string;
  skills_to_use_more_json: string;
  skills_to_use_less_json: string;
};

type JobRow = {
  id: string;
  company: string;
  title: string;
  url: string;
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
  created_at: string;
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
    dealBreakers: parseJson<string[]>(row.deal_breakers_json),
    careerIntent: row.career_intent,
    careerChangeInterest: row.career_change_interest,
    confidenceLevel: row.confidence_level,
    constraints: parseJson<string[]>(row.constraints_json),
    targetRoles: parseJson<string[]>(row.target_roles_json),
    strongestSkills: parseJson<string[]>(row.strongest_skills_json),
    skillsToUseMore: parseJson<string[]>(row.skills_to_use_more_json),
    skillsToUseLess: parseJson<string[]>(row.skills_to_use_less_json)
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
  const rows = getDatabase().prepare("select * from jobs order by fit_score desc, first_seen_date desc").all() as JobRow[];
  return rows.map(mapJob);
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

export function getGeneratedDocuments(): GeneratedDocumentRecord[] {
  return getDatabase()
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
        generated_documents.base_resume as baseResume,
        generated_documents.generated_date as generatedDate,
        generated_documents.status,
        generated_documents.tailoring_summary as tailoringSummary
      from generated_documents
      left join jobs on jobs.id = generated_documents.job_id
      order by generated_documents.created_at desc`
    )
    .all() as GeneratedDocumentRecord[];
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

  return [
    {
      label: "New jobs",
      value: String(jobs.filter((job) => job.freshnessLabel === "New today" || job.freshnessLabel === "New this week").length),
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
    { label: "Applied", value: counts.get("Applied") ?? 0 },
    { label: "Interviewing", value: counts.get("Interviewing") ?? 0 },
    { label: "Offer", value: counts.get("Offer") ?? 0 },
    { label: "Rejected", value: counts.get("Rejected") ?? 0 }
  ];
}

export function updateUserProfile(input: ProfileUpdateInput) {
  getDatabase()
    .prepare(
      `update user_profile set
        current_search_goal = @currentSearchGoal,
        urgency = @urgency,
        direction = @direction,
        target_roles_json = @targetRolesJson,
        desired_industries_json = @desiredIndustriesJson,
        compensation_needs = @compensationNeeds,
        work_preferences_json = @workPreferencesJson,
        constraints_json = @constraintsJson,
        deal_breakers_json = @dealBreakersJson,
        career_intent = @careerIntent,
        career_change_interest = @careerChangeInterest,
        confidence_level = @confidenceLevel,
        skills_to_use_more_json = @skillsToUseMoreJson,
        skills_to_use_less_json = @skillsToUseLessJson,
        updated_at = current_timestamp
      where id = 'pavel'`
    )
    .run({
      ...input,
      targetRolesJson: JSON.stringify(input.targetRoles),
      desiredIndustriesJson: JSON.stringify(input.desiredIndustries),
      workPreferencesJson: JSON.stringify(input.workPreferences),
      constraintsJson: JSON.stringify(input.constraints),
      dealBreakersJson: JSON.stringify(input.dealBreakers),
      skillsToUseMoreJson: JSON.stringify(input.skillsToUseMore),
      skillsToUseLessJson: JSON.stringify(input.skillsToUseLess)
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
        ...input,
        strengthsJson: JSON.stringify(input.strengths),
        gapsJson: JSON.stringify(input.gaps),
        redFlagsJson: JSON.stringify(input.redFlags),
        requirementMatchJson: JSON.stringify(input.requirementMatch),
        resumeEvidenceJson: JSON.stringify(input.resumeEvidence),
        sectionsJson: JSON.stringify(input.sections),
        keywordsJson: JSON.stringify(input.keywords),
        userCorrectionJson: JSON.stringify(input.userCorrection)
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
          recommended_resume = @resumeBaseRecommendation,
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
        ...input,
        requirementMatchJson: JSON.stringify(input.requirementMatch),
        resumeEvidenceJson: JSON.stringify(input.resumeEvidence),
        gapsJson: JSON.stringify(input.gaps),
        redFlagsJson: JSON.stringify(input.redFlags)
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

export function getJobDedupKeys() {
  const rows = getDatabase()
    .prepare("select url, company, title from jobs")
    .all() as Array<{ url: string; company: string; title: string }>;

  return {
    urls: new Set(rows.map((row) => row.url).filter(Boolean)),
    companyRoles: new Set(rows.map((row) => `${row.company.toLowerCase()}::${row.title.toLowerCase()}`))
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
        errors_json
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
        @errorsJson
      )`
    )
    .run({
      ...run,
      errorsJson: JSON.stringify(run.errors)
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
      id: `${entityType}-${entityId}-${Date.now()}`,
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
    redFlags: parseJson<string[]>(row.red_flags_json)
  };
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
    errors: parseJson<Array<{ company: string; error: string }>>(row.errors_json)
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
    createdAt: row.created_at
  };
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

function scanActivityLabel(run: ScanRunRecord) {
  if (run.status === "failed") {
    return "Job scan failed";
  }

  if (run.errors.length > 0) {
    return `Job scan completed with ${run.newJobsCount} new jobs and ${run.errors.length} errors`;
  }

  return `Job scan completed with ${run.newJobsCount} new jobs`;
}
