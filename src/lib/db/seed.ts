import type Database from "better-sqlite3";
import {
  seedActivity,
  seedApplications,
  seedEvaluations,
  seedGeneratedDocuments,
  seedJobs,
  seedResumes,
  seedRoleDirections,
  seedSkills,
  seedUserProfile
} from "./seed-data";

const toJson = (value: unknown) => JSON.stringify(value);

export function seedDatabaseIfEmpty(database: Database.Database) {
  const existing = database.prepare("select count(*) as count from user_profile").get() as { count: number };
  if (existing.count > 0) {
    return false;
  }

  seedDatabase(database);
  return true;
}

export function seedDatabase(database: Database.Database) {
  const insertProfile = database.prepare(`
    insert or replace into user_profile (
      id, name, location, portfolio, current_search_goal, urgency, direction,
      constraints_json, target_roles_json, strongest_skills_json,
      skills_to_use_more_json, skills_to_use_less_json,
      desired_industries_json, compensation_needs, work_preferences_json,
      deal_breakers_json, career_intent, career_change_interest, confidence_level
    ) values (
      @id, @name, @location, @portfolio, @currentSearchGoal, @urgency, @direction,
      @constraintsJson, @targetRolesJson, @strongestSkillsJson,
      @skillsToUseMoreJson, @skillsToUseLessJson,
      @desiredIndustriesJson, @compensationNeeds, @workPreferencesJson,
      @dealBreakersJson, @careerIntent, @careerChangeInterest, @confidenceLevel
    )
  `);

  const insertSkill = database.prepare(`
    insert or replace into skill_inventory (
      id, user_profile_id, skill_name, skill_category, evidence_source,
      strength_level, market_relevance, user_interest_level, use_preference
    ) values (
      @id, @userProfileId, @skillName, @skillCategory, @evidenceSource,
      @strengthLevel, @marketRelevance, @userInterestLevel, @usePreference
    )
  `);

  const insertRoleDirection = database.prepare(`
    insert or replace into role_directions (
      id, user_profile_id, role_family, fit_level, score, rationale, gaps_json, recommendation_type
    ) values (
      @id, @userProfileId, @roleFamily, @fitLevel, @score, @rationale, @gapsJson, @recommendationType
    )
  `);

  const insertResume = database.prepare(`
    insert or replace into resumes (id, name, source_file, status, active_status)
    values (@id, @name, @sourceFile, @status, @activeStatus)
  `);

  const insertJob = database.prepare(`
    insert or replace into jobs (
      id, company, title, url, source, location, remote_type, date_posted,
      first_seen_date, freshness_label, raw_description, parsed_description,
      status, fit_score, role_archetype, recommendation, summary, why_it_matches,
      main_concern, recommended_resume, salary_notes, requirement_match_json,
      resume_evidence_json, gaps_json, red_flags_json
    ) values (
      @id, @company, @title, @url, @source, @location, @remoteType, @datePosted,
      @firstSeenDate, @freshness, @rawDescription, @parsedDescription,
      @status, @fitScore, @roleArchetype, @recommendation, @summary, @whyItMatches,
      @mainConcern, @recommendedResume, @salaryNotes, @requirementMatchJson,
      @resumeEvidenceJson, @gapsJson, @redFlagsJson
    )
  `);

  const insertEvaluation = database.prepare(`
    insert or replace into evaluations (
      id, job_id, fit_score, score_label, role_archetype, summary,
      strengths_json, gaps_json, red_flags_json, recommendation,
      resume_base_recommendation, requirement_match_json, resume_evidence_json
    ) values (
      @id, @jobId, @fitScore, @scoreLabel, @roleArchetype, @summary,
      @strengthsJson, @gapsJson, @redFlagsJson, @recommendation,
      @resumeBaseRecommendation, @requirementMatchJson, @resumeEvidenceJson
    )
  `);

  const insertDocument = database.prepare(`
    insert or replace into generated_documents (
      id, job_id, document_type, title, content, pdf_url, base_resume,
      generated_date, status, tailoring_summary
    ) values (
      @id, @jobId, @documentType, @title, @content, @pdfUrl, @baseResume,
      @generatedDate, @status, @tailoringSummary
    )
  `);

  const insertApplication = database.prepare(`
    insert or replace into applications (
      id, job_id, company, role, status, applied_date, follow_up_date, notes, contact, response_status, fit_score
    ) values (
      @id, @jobId, @company, @role, @status, @appliedDate, @followUpDate, @notes, @contact, @responseStatus, @fitScore
    )
  `);

  const insertActivity = database.prepare(`
    insert or replace into activity_log (
      id, entity_type, entity_id, action, timestamp, details_json
    ) values (
      @id, @entityType, @entityId, @action, @timestamp, @detailsJson
    )
  `);

  const seed = database.transaction(() => {
    insertProfile.run({
      ...seedUserProfile,
      constraintsJson: toJson(seedUserProfile.constraints),
      targetRolesJson: toJson(seedUserProfile.targetRoles),
      strongestSkillsJson: toJson(seedUserProfile.strongestSkills),
      skillsToUseMoreJson: toJson(seedUserProfile.skillsToUseMore),
      skillsToUseLessJson: toJson(seedUserProfile.skillsToUseLess),
      desiredIndustriesJson: toJson(seedUserProfile.desiredIndustries),
      workPreferencesJson: toJson(seedUserProfile.workPreferences),
      dealBreakersJson: toJson(seedUserProfile.dealBreakers)
    });

    for (const skill of seedSkills) {
      insertSkill.run(skill);
    }

    for (const direction of seedRoleDirections) {
      insertRoleDirection.run({ ...direction, gapsJson: toJson(direction.gaps) });
    }

    for (const resume of seedResumes) {
      insertResume.run({ ...resume, activeStatus: resume.activeStatus ? 1 : 0 });
    }

    for (const job of seedJobs) {
      insertJob.run({
        ...job,
        requirementMatchJson: toJson(job.requirementMatch),
        resumeEvidenceJson: toJson(job.resumeEvidence),
        gapsJson: toJson(job.gaps),
        redFlagsJson: toJson(job.redFlags)
      });
    }

    for (const evaluation of seedEvaluations) {
      insertEvaluation.run({
        ...evaluation,
        strengthsJson: toJson(evaluation.strengths),
        gapsJson: toJson(evaluation.gaps),
        redFlagsJson: toJson(evaluation.redFlags),
        requirementMatchJson: toJson(evaluation.requirementMatch),
        resumeEvidenceJson: toJson(evaluation.resumeEvidence)
      });
    }

    for (const document of seedGeneratedDocuments) {
      insertDocument.run(document);
    }

    for (const application of seedApplications) {
      insertApplication.run(application);
    }

    for (const activity of seedActivity) {
      insertActivity.run({ ...activity, detailsJson: toJson(activity.details) });
    }
  });

  seed();
}
