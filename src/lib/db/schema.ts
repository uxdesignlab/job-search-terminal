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
  }
];
