import { getDatabase } from "./client";
import type {
  ActivityRecord,
  ApplicationRecord,
  DashboardMetric,
  FunnelStage,
  GeneratedDocumentRecord,
  JobRecord,
  ResumeRecord,
  RoleDirectionRecord,
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

export function getResumes(): ResumeRecord[] {
  return getDatabase()
    .prepare(
      `select
        id,
        name,
        source_file as sourceFile,
        status,
        active_status as activeStatus
      from resumes
      order by name`
    )
    .all()
    .map((row) => {
      const resume = row as Omit<ResumeRecord, "activeStatus"> & { activeStatus: number };
      return { ...resume, activeStatus: Boolean(resume.activeStatus) };
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
