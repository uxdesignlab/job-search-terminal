export const migrations = [
  {
    id: "0001_initial_schema",
    sql: `
      create table if not exists user_profile (
        id text primary key,
        name text not null,
        location text not null,
        portfolio text not null,
        current_search_goal text not null,
        urgency text not null,
        direction text not null,
        constraints_json text not null,
        target_roles_json text not null,
        strongest_skills_json text not null,
        skills_to_use_more_json text not null,
        skills_to_use_less_json text not null,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );

      create table if not exists skill_inventory (
        id text primary key,
        user_profile_id text not null references user_profile(id),
        skill_name text not null,
        skill_category text not null,
        evidence_source text not null,
        strength_level text not null,
        market_relevance text not null,
        user_interest_level text not null,
        use_preference text not null
      );

      create table if not exists role_directions (
        id text primary key,
        user_profile_id text not null references user_profile(id),
        role_family text not null,
        fit_level text not null,
        score integer not null,
        rationale text not null,
        gaps_json text not null,
        recommendation_type text not null
      );

      create table if not exists resumes (
        id text primary key,
        name text not null,
        source_file text not null,
        status text not null,
        active_status integer not null default 1,
        created_at text not null default current_timestamp
      );

      create table if not exists jobs (
        id text primary key,
        company text not null,
        title text not null,
        url text not null,
        source text not null,
        location text not null,
        remote_type text not null,
        date_posted text,
        first_seen_date text not null,
        freshness_label text not null,
        raw_description text not null,
        parsed_description text not null,
        status text not null,
        fit_score integer not null,
        role_archetype text not null,
        recommendation text not null,
        summary text not null,
        why_it_matches text not null,
        main_concern text not null,
        recommended_resume text not null,
        salary_notes text not null,
        requirement_match_json text not null,
        resume_evidence_json text not null,
        gaps_json text not null,
        red_flags_json text not null,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );

      create table if not exists evaluations (
        id text primary key,
        job_id text not null references jobs(id),
        fit_score integer not null,
        score_label text not null,
        role_archetype text not null,
        summary text not null,
        strengths_json text not null,
        gaps_json text not null,
        red_flags_json text not null,
        recommendation text not null,
        resume_base_recommendation text not null,
        requirement_match_json text not null,
        resume_evidence_json text not null,
        created_at text not null default current_timestamp
      );

      create table if not exists generated_documents (
        id text primary key,
        job_id text not null,
        document_type text not null,
        title text not null,
        content text not null,
        pdf_url text not null,
        base_resume text not null,
        generated_date text not null,
        status text not null,
        tailoring_summary text not null,
        created_at text not null default current_timestamp
      );

      create table if not exists applications (
        id text primary key,
        job_id text not null,
        status text not null,
        applied_date text,
        follow_up_date text not null,
        notes text not null,
        contact text not null,
        response_status text not null,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );

      create table if not exists activity_log (
        id text primary key,
        entity_type text not null,
        entity_id text not null,
        action text not null,
        timestamp text not null,
        details_json text not null
      );

      create index if not exists idx_jobs_status on jobs(status);
      create index if not exists idx_jobs_fit_score on jobs(fit_score);
      create index if not exists idx_evaluations_job_id on evaluations(job_id);
      create index if not exists idx_applications_job_id on applications(job_id);
      create index if not exists idx_activity_entity on activity_log(entity_type, entity_id);
    `
  },
  {
    id: "0002_application_tracker_fields",
    sql: `
      alter table applications add column company text not null default '';
      alter table applications add column role text not null default '';
      alter table applications add column fit_score integer not null default 0;
    `
  },
  {
    id: "0003_profile_resume_intelligence",
    sql: `
      alter table user_profile add column desired_industries_json text not null default '[]';
      alter table user_profile add column compensation_needs text not null default '';
      alter table user_profile add column work_preferences_json text not null default '[]';
      alter table user_profile add column deal_breakers_json text not null default '[]';
      alter table user_profile add column career_intent text not null default '';
      alter table user_profile add column career_change_interest text not null default '';
      alter table user_profile add column confidence_level text not null default '';

      alter table resumes add column extracted_text text not null default '';
      alter table resumes add column extracted_at text;
      alter table resumes add column word_count integer not null default 0;
      alter table resumes add column evidence_json text not null default '[]';
    `
  },
  {
    id: "0004_scanner_history",
    sql: `
      create table if not exists scan_runs (
        id text primary key,
        status text not null,
        started_at text not null,
        completed_at text,
        companies_scanned integer not null default 0,
        skipped_companies integer not null default 0,
        total_jobs_found integer not null default 0,
        filtered_count integer not null default 0,
        duplicate_count integer not null default 0,
        new_jobs_count integer not null default 0,
        errors_json text not null default '[]'
      );

      create unique index if not exists idx_jobs_url_unique on jobs(url);
      create index if not exists idx_jobs_company_title on jobs(company, title);
      create index if not exists idx_scan_runs_started_at on scan_runs(started_at);
    `
  },
  {
    id: "0005_evaluation_sections",
    sql: `
      alter table evaluations add column sections_json text not null default '{}';
      alter table evaluations add column legitimacy_label text not null default '';
      alter table evaluations add column keywords_json text not null default '[]';
      alter table evaluations add column user_correction_json text not null default '{}';

      create table if not exists evaluation_feedback (
        id text primary key,
        job_id text not null references jobs(id),
        role_archetype text not null,
        corrected_score integer not null,
        corrected_recommendation text not null,
        correction_note text not null,
        created_at text not null default current_timestamp
      );

      create index if not exists idx_evaluation_feedback_job_id on evaluation_feedback(job_id);
    `
  },
  {
    id: "0006_generated_document_outputs",
    sql: `
      alter table generated_documents add column html_url text not null default '';
      alter table generated_documents add column keyword_coverage integer not null default 0;
      alter table generated_documents add column tailoring_plan_json text not null default '[]';

      create index if not exists idx_generated_documents_job_id on generated_documents(job_id);
    `
  },
  {
    id: "0007_application_assistant_tracker",
    sql: `
      create table if not exists application_answer_drafts (
        id text primary key,
        job_id text not null references jobs(id),
        question text not null,
        answer text not null,
        source text not null,
        sort_order integer not null default 0,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );

      create index if not exists idx_application_answer_drafts_job_id on application_answer_drafts(job_id);
    `
  },
  {
    id: "0008_ai_settings",
    sql: `
      create table if not exists ai_settings (
        id text primary key default 'singleton',
        active_provider text not null default 'openai',
        anthropic_api_key text not null default '',
        gemini_api_key text not null default '',
        openai_api_key text not null default '',
        anthropic_model text not null default 'claude-sonnet-4-6',
        gemini_model text not null default 'gemini-2.5-flash',
        openai_model text not null default 'gpt-5.4-mini',
        fallback_provider text not null default '',
        onboarding_dismissed integer not null default 0,
        updated_at text not null default current_timestamp
      );

      insert or ignore into ai_settings (id) values ('singleton');
    `
  },
  {
    id: "0009_story_bank",
    sql: `
      create table if not exists story_bank (
        id text primary key,
        title text not null,
        situation text not null,
        task text not null,
        action text not null,
        result text not null,
        reflection text not null,
        skills_json text not null default '[]',
        themes_json text not null default '[]',
        source_job_id text references jobs(id),
        source_block_f text not null default '',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );

      create index if not exists idx_story_bank_source_job on story_bank(source_job_id);
    `
  },
  {
    id: "0010_company_research",
    sql: `
      create table if not exists company_research (
        id text primary key,
        job_id text not null references jobs(id),
        company text not null,
        ai_strategy text not null default '',
        recent_movements text not null default '',
        engineering_culture text not null default '',
        technical_challenges text not null default '',
        competitive_position text not null default '',
        candidate_angle text not null default '',
        provider_used text not null default '',
        model_used text not null default '',
        created_at text not null default current_timestamp
      );

      create unique index if not exists idx_company_research_job_id on company_research(job_id);
    `
  },
  {
    id: "0011_outreach_drafts",
    sql: `
      create table if not exists outreach_drafts (
        id text primary key,
        job_id text not null references jobs(id),
        contact_type text not null,
        message text not null,
        char_count integer not null default 0,
        status text not null default 'draft',
        created_at text not null default current_timestamp
      );

      create index if not exists idx_outreach_drafts_job_id on outreach_drafts(job_id);
    `
  },
  {
    id: "0012_writing_style_cache",
    sql: `
      create table if not exists writing_style_cache (
        id text primary key default 'singleton',
        tone_profile text not null default '',
        sample_count integer not null default 0,
        last_updated text not null default current_timestamp
      );

      insert or ignore into writing_style_cache (id) values ('singleton');
    `
  },
  {
    id: "0013_evaluation_metadata",
    sql: `
      alter table evaluations add column provider_used text not null default '';
      alter table evaluations add column model_used text not null default '';
      alter table evaluations add column tokens_used integer not null default 0;
      alter table evaluations add column generation_ms integer not null default 0;
    `
  },
  {
    id: "0015_default_provider_openai",
    sql: `
      update ai_settings set active_provider = 'openai' where id = 'singleton' and active_provider = 'anthropic';
    `
  },
  {
    id: "0014_latest_model_defaults",
    sql: `
      update ai_settings set gemini_model = 'gemini-2.5-flash' where id = 'singleton' and gemini_model = 'gemini-2.0-flash';
      update ai_settings set openai_model = 'gpt-5.4-mini' where id = 'singleton' and openai_model = 'gpt-4o';
    `
  },
  {
    id: "0016_location_preferences",
    sql: `
      alter table user_profile add column preferred_locations_json text not null default '[]';
      alter table user_profile add column remote_preference text not null default 'all';
    `
  },
  {
    id: "0017_scan_source_overrides",
    sql: `
      create table if not exists scan_source_overrides (
        name text primary key,
        enabled integer not null default 1,
        updated_at text not null default current_timestamp
      );
    `
  },
  {
    id: "0019_document_draft_json",
    sql: `alter table generated_documents add column draft_json text not null default '{}'`
  },
  {
    id: "0018_custom_scan_sources",
    sql: `
      create table if not exists scan_sources_custom (
        name text primary key,
        careers_url text not null,
        api text not null default '',
        enabled integer not null default 1,
        created_at text not null default current_timestamp
      );
    `
  },
  {
    id: "0020_job_liveness",
    sql: `
      alter table jobs add column liveness_status text not null default '';
      alter table jobs add column liveness_checked_at text not null default '';
    `
  },
  {
    id: "0021_job_archived",
    sql: `alter table jobs add column archived integer not null default 0`
  },
  {
    id: "0022_title_filters",
    sql: `
      create table if not exists title_filters (
        id text primary key default 'singleton',
        positive_json text not null default '[]',
        negative_json text not null default '[]',
        updated_at text not null default current_timestamp
      );
      insert or ignore into title_filters (id) values ('singleton');
    `
  },
  {
    id: "0023_job_gap_responses",
    sql: `
      create table if not exists job_gap_responses (
        id text primary key,
        job_id text not null references jobs(id),
        gap_text text not null,
        raw_response text not null default '',
        polished_response text not null default '',
        source text not null default 'user-added',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );
      create index if not exists idx_job_gap_responses_job_id on job_gap_responses(job_id);
      create unique index if not exists idx_job_gap_responses_job_gap on job_gap_responses(job_id, gap_text);
    `
  },
  {
    id: "0024_profile_gap_supplements",
    sql: `
      create table if not exists profile_gap_supplements (
        id text primary key,
        content text not null,
        tags_json text not null default '[]',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );
    `
  },
  {
    id: "0025_company_profiles",
    sql: `
      create table if not exists company_profiles (
        name text primary key,
        industry text not null default '',
        tags_json text not null default '[]',
        updated_at text not null default current_timestamp
      );
    `
  },
  {
    id: "0026_table_saved_filters",
    sql: `
      create table if not exists table_saved_filters (
        table_key text primary key,
        payload_json text not null,
        updated_at text not null default current_timestamp
      );
    `
  },
  {
    id: "0027_work_modes",
    sql: `
      alter table user_profile add column work_modes_json text not null default '[]';
    `
  },
  {
    id: "0028_onboarding_preferences_confirmation",
    sql: `
      alter table ai_settings add column onboarding_preferences_confirmed integer not null default 0;
    `
  },
  {
    id: "0029_job_scope_status",
    sql: `alter table jobs add column scope_status text not null default '';`
  },
  {
    id: "0030_remove_legacy_demo_seed_data",
    sql: `
      delete from application_answer_drafts where job_id in (
        'northstar-principal-product-designer',
        'atlas-designops-lead',
        'civic-accessibility-systems',
        'academy-ux-educator',
        'startup-brand-designer'
      );
      delete from outreach_drafts where job_id in (
        'northstar-principal-product-designer',
        'atlas-designops-lead',
        'civic-accessibility-systems',
        'academy-ux-educator',
        'startup-brand-designer'
      );
      delete from company_research where job_id in (
        'northstar-principal-product-designer',
        'atlas-designops-lead',
        'civic-accessibility-systems',
        'academy-ux-educator',
        'startup-brand-designer'
      );
      delete from job_gap_responses where job_id in (
        'northstar-principal-product-designer',
        'atlas-designops-lead',
        'civic-accessibility-systems',
        'academy-ux-educator',
        'startup-brand-designer'
      );
      update story_bank
      set source_job_id = null
      where source_job_id in (
        'northstar-principal-product-designer',
        'atlas-designops-lead',
        'civic-accessibility-systems',
        'academy-ux-educator',
        'startup-brand-designer'
      );
      delete from generated_documents where id in ('document-1', 'document-2')
        or job_id in (
          'northstar-principal-product-designer',
          'atlas-designops-lead',
          'civic-accessibility-systems',
          'academy-ux-educator',
          'startup-brand-designer',
          'external-document-1',
          'external-document-2'
        );
      delete from applications where id in ('application-1', 'application-2', 'application-3', 'application-4')
        or job_id in (
          'northstar-principal-product-designer',
          'atlas-designops-lead',
          'civic-accessibility-systems',
          'academy-ux-educator',
          'startup-brand-designer',
          'external-application-1',
          'external-application-2',
          'external-application-3',
          'external-application-4'
        );
      delete from evaluation_feedback where job_id in (
        'northstar-principal-product-designer',
        'atlas-designops-lead',
        'civic-accessibility-systems',
        'academy-ux-educator',
        'startup-brand-designer'
      );
      delete from evaluations where id in (
        'evaluation-northstar-principal-product-designer',
        'evaluation-atlas-designops-lead',
        'evaluation-civic-accessibility-systems',
        'evaluation-academy-ux-educator',
        'evaluation-startup-brand-designer'
      );
      delete from jobs where id in (
        'northstar-principal-product-designer',
        'atlas-designops-lead',
        'civic-accessibility-systems',
        'academy-ux-educator',
        'startup-brand-designer'
      );
      delete from role_directions where id in (
        'principal-product-design',
        'design-operations',
        'accessibility-and-design-systems',
        'ux-education'
      );
      delete from skill_inventory where evidence_source = 'Resume lane source';
      delete from activity_log where json_extract(details_json, '$.source') = 'seed'
        or id in ('activity-1', 'activity-2', 'activity-3', 'activity-4');
      update user_profile
      set
        name = '',
        location = '',
        current_search_goal = '',
        urgency = '',
        direction = '',
        constraints_json = '[]',
        target_roles_json = '[]',
        strongest_skills_json = '[]',
        skills_to_use_more_json = '[]',
        skills_to_use_less_json = '[]',
        desired_industries_json = '[]',
        compensation_needs = '',
        work_preferences_json = '[]',
        work_modes_json = '[]',
        deal_breakers_json = '[]',
        career_intent = '',
        career_change_interest = '',
        confidence_level = '',
        updated_at = current_timestamp
      where id = 'pavel'
        and name = 'Alex Jordan'
        and current_search_goal = 'Find senior product design leadership roles with strong strategic scope.';
    `
  },
  {
    id: "0031_linkedin_scan_support",
    sql: `
      alter table jobs add column is_duplicate integer not null default 0;
      alter table jobs add column duplicate_of text default null;
      alter table scan_runs add column scan_type text not null default 'careerops';
      create index if not exists idx_jobs_company_title_location on jobs(company, title, location);
    `
  },
  {
    id: "0032_resume_builder_versions",
    sql: `
      create table if not exists resume_builder_versions (
        id text primary key,
        resume_id text not null references resumes(id) on delete cascade,
        status text not null default 'needs_review',
        sections_json text not null default '[]',
        source_hash text not null default '',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp,
        approved_at text
      );

      create unique index if not exists idx_resume_builder_versions_resume_id on resume_builder_versions(resume_id);
    `
  },
  {
    id: "0033_ai_prompt_overrides",
    sql: `
      create table if not exists ai_prompt_overrides (
        prompt_id text primary key,
        custom_prompt text not null,
        updated_at text not null default current_timestamp
      );
    `
  },
  {
    id: "0034_remove_legacy_demo_resumes",
    sql: `
      delete from resumes where id in (
        'accessibility-design-systems',
        'ux-design',
        'design-operations',
        'principal-product-design',
        'teaching-ux-education'
      );
    `
  },
  {
    id: "0035_browser_board_job_provenance",
    sql: `
      alter table jobs add column source_url text not null default '';
      alter table jobs add column original_posting_url text not null default '';
      alter table jobs add column original_posting_key text not null default '';
      create index if not exists idx_jobs_original_posting_key on jobs(original_posting_key);
    `
  },
  {
    id: "0036_gap_answer_quality",
    sql: `
      alter table job_gap_responses add column quality_status text not null default 'addressed';
      alter table job_gap_responses add column follow_up_question text not null default '';
      alter table job_gap_responses add column assessment_json text not null default '{}';
      alter table job_gap_responses add column assessed_at text;

      alter table profile_gap_supplements add column quality_status text not null default 'addressed';
      alter table profile_gap_supplements add column follow_up_question text not null default '';
      alter table profile_gap_supplements add column assessment_json text not null default '{}';
      alter table profile_gap_supplements add column assessed_at text;
    `
  },
  {
    id: "0037_discovery_and_aggregator_keys",
    sql: `
      alter table ai_settings add column brave_search_api_key text not null default '';
      alter table ai_settings add column adzuna_app_id text not null default '';
      alter table ai_settings add column adzuna_api_key text not null default '';
    `
  },
  {
    id: "0038_daily_scan_and_resume_audit",
    sql: `
      create table if not exists scan_schedule (
        id text primary key default 'singleton',
        enabled integer not null default 0,
        interval_hours integer not null default 6,
        freshness_window_hours integer not null default 72,
        last_run_at text,
        next_run_at text,
        running_since text,
        updated_at text not null default current_timestamp
      );
      insert or ignore into scan_schedule (id) values ('singleton');

      alter table scan_runs add column trigger text not null default 'manual';
      alter table scan_runs add column freshness_window_hours integer not null default 72;
      alter table scan_runs add column fresh_count integer not null default 0;
      alter table scan_runs add column unknown_date_count integer not null default 0;
      alter table scan_runs add column stale_filtered_count integer not null default 0;

      alter table generated_documents add column tailoring_status text not null default 'source-only';
      alter table generated_documents add column evidence_audit_json text not null default '{}';
      alter table generated_documents add column fallback_reason text not null default '';
    `
  },
  {
    id: "0039_generated_document_resume_lane_id",
    sql: `
      alter table generated_documents add column base_resume_id text not null default '';
    `
  },
  {
    id: "0040_job_review_status",
    sql: `
      alter table jobs add column review_status text not null default 'none';
    `
  },
  {
    id: "0041_ollama_settings",
    sql: `
      alter table ai_settings add column ollama_base_url text not null default 'http://localhost:11434';
      alter table ai_settings add column ollama_model text not null default 'llama3.1:8b';
      alter table ai_settings add column provider_order_json text not null default '["openai","anthropic","gemini"]';
      alter table outreach_drafts add column provider_used text not null default '';
      alter table outreach_drafts add column model_used text not null default '';
      alter table application_answer_drafts add column provider_used text not null default '';
      alter table application_answer_drafts add column model_used text not null default '';
    `
  },
  {
    id: "0042_email_job_alert_imports",
    sql: `
      alter table jobs add column posting_resolution_status text not null default 'resolved';
      alter table jobs add column posting_search_query text not null default '';

      create table if not exists job_email_import_evidence (
        id text primary key,
        job_id text not null references jobs(id) on delete cascade,
        source_filename text not null,
        email_subject text not null default '',
        email_from text not null default '',
        email_date text not null default '',
        extracted_snippet text not null default '',
        candidate_links_json text not null default '[]',
        confidence text not null default 'low',
        extraction_notes text not null default '',
        created_at text not null default current_timestamp
      );

      create index if not exists idx_job_email_import_evidence_job_id on job_email_import_evidence(job_id);
    `
  },
  {
    id: "0043_pending_email_candidates",
    sql: `
      create table if not exists pending_email_job_candidates (
        id text primary key,
        batch_id text not null,
        email_subject text not null default '',
        email_from text not null default '',
        email_date text not null default '',
        source_filename text not null default '',
        company text not null,
        position text not null,
        location text not null,
        url text not null,
        source_url text not null,
        original_posting_url text not null default '',
        job_description text not null default '',
        salary_notes text not null default '',
        snippet text not null default '',
        confidence text not null default 'low',
        extraction_notes text not null default '',
        posting_resolution_status text not null default 'needs_resolution',
        posting_search_query text not null default '',
        candidate_links_json text not null default '[]',
        discovered_at text not null,
        title_match text not null default 'unknown',
        created_at text not null default current_timestamp
      );
      create index if not exists idx_pending_email_candidates_batch on pending_email_job_candidates(batch_id);
    `
  },
  {
    id: "0044_interview_prep_workspace",
    sql: `
      create table if not exists interview_questions (
        id text primary key,
        prompt text not null,
        category text not null default 'General',
        source text not null default 'custom',
        active integer not null default 1,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );

      insert or ignore into interview_questions (id, prompt, category, source, active) values
        ('default-cross-functional-leadership', 'Tell me about a time you led a cross-functional initiative.', 'Leadership', 'default', 1),
        ('default-influence-without-authority', 'Describe a situation where you had to influence without authority.', 'Influence', 'default', 1),
        ('default-incomplete-data', 'Give an example of a product decision you made with incomplete data.', 'Decision making', 'default', 1),
        ('default-ambiguity', 'Tell me about a time you had to navigate ambiguity.', 'Ambiguity', 'default', 1),
        ('default-project-failure', 'Describe how you''ve handled a significant project failure.', 'Failure and learning', 'default', 1),
        ('default-senior-stakeholders', 'Give an example of how you built alignment with senior stakeholders.', 'Stakeholders', 'default', 1),
        ('default-proud-project', 'Tell me about a project you''re most proud of.', 'Impact', 'default', 1),
        ('default-difficult-feedback', 'Describe a time you had to give difficult feedback.', 'Feedback', 'default', 1),
        ('default-prioritization', 'How do you prioritize when everything feels urgent?', 'Prioritization', 'default', 1),
        ('default-changed-mind-data', 'Tell me about a time you changed someone''s mind with data.', 'Data and influence', 'default', 1);

      alter table story_bank add column story_kind text not null default 'standalone_story';
      alter table story_bank add column question_id text;
      alter table story_bank add column prompt_text text not null default '';
      alter table story_bank add column quality_status text not null default 'needs_detail';
      alter table story_bank add column quality_notes text not null default '';
      alter table story_bank add column last_evaluated_at text;

      update story_bank
        set story_kind = case
          when source_block_f = 'evaluation' then 'evaluation_suggestion'
          when source_block_f = 'voice-practice' then 'answered_question'
          else 'standalone_story'
        end,
        prompt_text = case
          when source_block_f in ('evaluation', 'voice-practice') then title
          else ''
        end,
        quality_status = case
          when length(trim(result)) = 0 then 'missing_result'
          when length(trim(situation)) = 0 or length(trim(task)) = 0 or length(trim(action)) = 0 then 'needs_detail'
          else 'ready'
        end,
        quality_notes = case
          when length(trim(result)) = 0 then 'Add a concrete outcome or impact before using this in an interview.'
          when length(trim(situation)) = 0 or length(trim(task)) = 0 or length(trim(action)) = 0 then 'Add missing STAR details before using this in an interview.'
          else ''
        end,
        last_evaluated_at = current_timestamp;

      create index if not exists idx_interview_questions_active on interview_questions(active, source, updated_at);
      create index if not exists idx_story_bank_kind on story_bank(story_kind);
      create index if not exists idx_story_bank_quality on story_bank(quality_status);
      create index if not exists idx_story_bank_question on story_bank(question_id);
    `
  },
  {
    id: "0045_story_tags_and_job_assignments",
    sql: `
      alter table story_bank add column tags_json text not null default '[]';

      update story_bank
        set tags_json = case
          when skills_json <> '[]' then skills_json
          when themes_json <> '[]' then themes_json
          else '[]'
        end;

      create table if not exists story_job_links (
        story_id text not null references story_bank(id) on delete cascade,
        job_id text not null references jobs(id) on delete cascade,
        created_at text not null default current_timestamp,
        primary key (story_id, job_id)
      );

      create index if not exists idx_story_job_links_story on story_job_links(story_id);
      create index if not exists idx_story_job_links_job on story_job_links(job_id);
    `
  },
  {
    id: "0046_story_job_link_source",
    sql: `
      alter table story_job_links add column source text not null default 'manual';
    `
  },
  {
    id: "0047_story_job_link_backfill",
    sql: `
      insert or ignore into story_job_links (story_id, job_id, source)
      select distinct story_bank.id, applications.job_id, 'auto'
      from story_bank
      join json_each(story_bank.tags_json) as tag
      join applications on applications.status in ('Applied', 'Recruiter responded', 'Interviewing')
      join jobs on jobs.id = applications.job_id
      where length(trim(tag.value)) > 2
        and instr(
          lower(coalesce(jobs.title, '') || ' ' || coalesce(jobs.role_archetype, '')),
          lower(trim(tag.value))
        ) > 0;
    `
  },
  {
    id: "0048_evaluation_story_keyword_tags",
    sql: `
      update story_bank
      set tags_json = (
        select json_group_array(kw.value)
        from (
          select value
          from json_each((
            select evaluations.keywords_json
            from evaluations
            where evaluations.job_id = story_bank.source_job_id
            order by evaluations.created_at desc
            limit 1
          ))
          limit 12
        ) as kw
      )
      where story_kind = 'evaluation_suggestion'
        and source_job_id is not null
        and exists (select 1 from evaluations where evaluations.job_id = story_bank.source_job_id);
    `
  },
  {
    id: "0049_story_job_link_backfill_v2",
    sql: `
      insert or ignore into story_job_links (story_id, job_id, source)
      select distinct story_bank.id, applications.job_id, 'auto'
      from story_bank
      join json_each(story_bank.tags_json) as tag
      join applications on applications.status in ('Applied', 'Recruiter responded', 'Interviewing')
      join jobs on jobs.id = applications.job_id
      where length(trim(tag.value)) > 2
        and instr(
          lower(
            coalesce(jobs.title, '') || ' ' || coalesce(jobs.role_archetype, '') || ' ' ||
            coalesce((
              select group_concat(kw.value, ' ')
              from json_each((
                select evaluations.keywords_json
                from evaluations
                where evaluations.job_id = jobs.id
                order by evaluations.created_at desc
                limit 1
              )) as kw
            ), '')
          ),
          lower(trim(tag.value))
        ) > 0;
    `
  },
  {
    id: "0050_private_keyword_taxonomy",
    sql: `
      create table if not exists keyword_concepts (
        id text primary key,
        label text not null,
        normalized_label text not null,
        parent_id text references keyword_concepts(id) on delete set null,
        depth integer not null default 1,
        description text not null default '',
        status text not null default 'active',
        created_from text not null default 'system',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp,
        archived_at text
      );

      create unique index if not exists idx_keyword_concepts_parent_label
        on keyword_concepts(coalesce(parent_id, ''), normalized_label);
      create index if not exists idx_keyword_concepts_parent on keyword_concepts(parent_id);
      create index if not exists idx_keyword_concepts_status on keyword_concepts(status);

      create table if not exists keyword_aliases (
        id text primary key,
        concept_id text not null references keyword_concepts(id) on delete cascade,
        raw_phrase text not null,
        normalized_phrase text not null,
        source text not null default 'system',
        confidence real not null default 0.7,
        verified_at text,
        created_at text not null default current_timestamp
      );

      create unique index if not exists idx_keyword_aliases_phrase
        on keyword_aliases(normalized_phrase);
      create index if not exists idx_keyword_aliases_concept on keyword_aliases(concept_id);

      create table if not exists job_keyword_concepts (
        job_id text not null references jobs(id) on delete cascade,
        evaluation_id text,
        raw_keyword text not null,
        normalized_keyword text not null,
        concept_id text not null references keyword_concepts(id) on delete cascade,
        source text not null default 'job_evaluation',
        confidence real not null default 0.7,
        created_at text not null default current_timestamp,
        primary key (job_id, normalized_keyword, concept_id)
      );

      create index if not exists idx_job_keyword_concepts_job on job_keyword_concepts(job_id);
      create index if not exists idx_job_keyword_concepts_concept on job_keyword_concepts(concept_id);

      create table if not exists story_keyword_concepts (
        story_id text not null references story_bank(id) on delete cascade,
        raw_keyword text not null,
        normalized_keyword text not null,
        concept_id text not null references keyword_concepts(id) on delete cascade,
        source text not null default 'story_tag',
        confidence real not null default 0.7,
        created_at text not null default current_timestamp,
        primary key (story_id, normalized_keyword, concept_id)
      );

      create index if not exists idx_story_keyword_concepts_story on story_keyword_concepts(story_id);
      create index if not exists idx_story_keyword_concepts_concept on story_keyword_concepts(concept_id);

      create table if not exists keyword_mapping_suggestions (
        id text primary key,
        raw_phrase text not null,
        normalized_phrase text not null,
        suggested_concept_id text references keyword_concepts(id) on delete set null,
        suggested_label text not null default '',
        suggested_parent_id text references keyword_concepts(id) on delete set null,
        reason text not null default '',
        confidence real not null default 0.5,
        status text not null default 'pending',
        source text not null default 'ai',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );

      create index if not exists idx_keyword_mapping_suggestions_status
        on keyword_mapping_suggestions(status, updated_at);

      create table if not exists taxonomy_activity_log (
        id text primary key,
        action text not null,
        concept_id text,
        related_id text,
        details_json text not null default '{}',
        actor text not null default 'system',
        created_at text not null default current_timestamp
      );

      create index if not exists idx_taxonomy_activity_concept on taxonomy_activity_log(concept_id, created_at);
    `
  },
  {
    id: "0051_group_generated_misc_taxonomy_roots",
    sql: `
      insert or ignore into keyword_concepts (
        id, label, normalized_label, parent_id, depth, description, status, created_from
      )
      select
        'concept-other-keywords',
        'Other keywords',
        'other keywords',
        null,
        1,
        'Generated holding area for private keywords that do not yet have a more specific taxonomy branch.',
        'active',
        'system'
      where exists (
        select 1
        from keyword_concepts
        where parent_id is null
          and created_from <> 'user'
          and normalized_label not in (
            'research',
            'design',
            'collaboration',
            'leadership',
            'strategy',
            'data and analytics',
            'technology',
            'domain knowledge',
            'other keywords'
          )
      );

      update keyword_concepts
      set parent_id = (
            select id
            from keyword_concepts as other
            where other.parent_id is null
              and other.normalized_label = 'other keywords'
            limit 1
          ),
          depth = 2,
          updated_at = current_timestamp
      where parent_id is null
        and created_from <> 'user'
        and normalized_label not in (
          'research',
          'design',
          'collaboration',
          'leadership',
          'strategy',
          'data and analytics',
          'technology',
          'domain knowledge',
          'other keywords'
        );
    `
  },
  {
    id: "0052_taxonomy_candidate_status",
    sql: `
      -- Introduce a 'candidate' lifecycle for machine-generated taxonomy concepts.
      -- Job-evaluation keywords no longer clutter the active taxonomy: any active,
      -- non-user concept below the root level that has never been linked to a story
      -- and appears in fewer than 3 distinct jobs is demoted to 'candidate'. It stays
      -- fully queryable (job<->story matching ignores status), just out of the default
      -- active view until a story link or 3-job recurrence promotes it.
      --
      -- Rule-based only: on a fresh database with no generated concepts this demotes
      -- nothing. Run the statement 3x so parents whose only active children were just
      -- demoted also demote (taxonomy is at most 5 levels deep).
      update keyword_concepts
      set status = 'candidate', updated_at = current_timestamp
      where status = 'active'
        and created_from not in ('user', 'system')
        and depth > 1
        and id not in (select distinct concept_id from story_keyword_concepts)
        and (
          select count(distinct job_id) from job_keyword_concepts j
          where j.concept_id = keyword_concepts.id
        ) < 3
        and not exists (
          select 1 from keyword_concepts child
          where child.parent_id = keyword_concepts.id and child.status = 'active'
        );

      update keyword_concepts
      set status = 'candidate', updated_at = current_timestamp
      where status = 'active'
        and created_from not in ('user', 'system')
        and depth > 1
        and id not in (select distinct concept_id from story_keyword_concepts)
        and (
          select count(distinct job_id) from job_keyword_concepts j
          where j.concept_id = keyword_concepts.id
        ) < 3
        and not exists (
          select 1 from keyword_concepts child
          where child.parent_id = keyword_concepts.id and child.status = 'active'
        );

      update keyword_concepts
      set status = 'candidate', updated_at = current_timestamp
      where status = 'active'
        and created_from not in ('user', 'system')
        and depth > 1
        and id not in (select distinct concept_id from story_keyword_concepts)
        and (
          select count(distinct job_id) from job_keyword_concepts j
          where j.concept_id = keyword_concepts.id
        ) < 3
        and not exists (
          select 1 from keyword_concepts child
          where child.parent_id = keyword_concepts.id and child.status = 'active'
        );
    `
  },
  {
    id: "0054_practice_attempts",
    sql: `
      -- Durable practice history: every rehearsal of a question is recorded as an
      -- attempt (transcript + parsed STAR + coaching), so re-practicing appends instead
      -- of silently spawning duplicate stories. The story remains the canonical artifact.
      create table if not exists practice_attempts (
        id text primary key,
        question_id text references interview_questions(id) on delete set null,
        story_id text references story_bank(id) on delete set null,
        transcript text not null default '',
        parsed_json text not null default '{}',
        quality_status text not null default 'needs_detail',
        coaching_notes_json text not null default '[]',
        created_at text not null default current_timestamp
      );
      create index if not exists idx_practice_attempts_question on practice_attempts(question_id, created_at);
      create index if not exists idx_practice_attempts_story on practice_attempts(story_id);

      -- Which stories answer which questions (a story can cover several; a question can
      -- have several candidate stories). Powers the per-question view and coverage matrix.
      create table if not exists question_story_links (
        question_id text not null references interview_questions(id) on delete cascade,
        story_id text not null references story_bank(id) on delete cascade,
        source text not null default 'manual',
        created_at text not null default current_timestamp,
        primary key (question_id, story_id)
      );

      -- Backfill: existing answered-question stories become links + one seed attempt each.
      insert or ignore into question_story_links (question_id, story_id, source)
        select question_id, id, 'practice'
        from story_bank
        where story_kind = 'answered_question' and question_id is not null and question_id <> '';

      insert into practice_attempts (
        id, question_id, story_id, transcript, parsed_json, quality_status, coaching_notes_json, created_at
      )
        select
          'attempt-seed-' || id,
          question_id,
          id,
          '',
          json_object('title', title, 'situation', situation, 'task', task, 'action', action, 'result', result, 'reflection', reflection),
          quality_status,
          '[]',
          created_at
        from story_bank
        where story_kind = 'answered_question' and question_id is not null and question_id <> '';
    `
  },
  {
    id: "0055_story_consolidation_runs",
    sql: `
      -- Resumable state for the one-time story consolidation wizard, which clusters the
      -- legacy per-job evaluation_suggestion stories into a small set of canonical core
      -- stories. One JSON blob keeps the whole draft (clusters + members + edits) so the
      -- review survives reloads without a full relational model.
      create table if not exists story_consolidation_runs (
        id text primary key,
        status text not null default 'review',
        payload_json text not null default '{}',
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      );
    `
  },
  {
    id: "0056_evaluation_keyword_signals",
    sql: `
      alter table evaluations add column keyword_signals_json text not null default '[]';
    `
  }
];
