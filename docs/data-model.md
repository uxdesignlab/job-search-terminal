# Data Model

Job Search Terminal stores all runtime data in a local SQLite database at `data/job-search-terminal.sqlite`.
The file is excluded from git. All schema changes are applied through a
sequential migration system defined in `src/lib/db/schema.ts`.

The database is initialized automatically on first server start via
`getDatabase()` in `src/lib/db/client.ts`, which runs all pending migrations
and initializes an empty local profile if the database is empty.

---

## Migration History

| Migration ID | What it adds or changes |
|---|---|
| `0001_initial_schema` | Core tables: `user_profile`, `skill_inventory`, `role_directions`, `resumes`, `jobs`, `evaluations`, `generated_documents`, `applications`, `activity_log` |
| `0002_application_tracker_fields` | Adds `company`, `role`, `fit_score` columns to `applications` |
| `0003_profile_resume_intelligence` | Adds profile intelligence columns to `user_profile`; adds `extracted_text`, `evidence_json` to `resumes` |
| `0004_scanner_history` | Adds `scan_runs` table; adds unique URL index to `jobs` |
| `0005_evaluation_sections` | Adds `sections_json`, `keywords_json`, `user_correction_json` to `evaluations`; adds `evaluation_feedback` table |
| `0006_generated_document_outputs` | Adds `html_url`, `keyword_coverage`, `tailoring_plan_json` to `generated_documents` |
| `0007_application_assistant_tracker` | Adds `application_answer_drafts` table |
| `0008_ai_settings` | Adds `ai_settings` singleton table |
| `0009_story_bank` | Adds `story_bank` table for interview prep |
| `0010_company_research` | Adds `company_research` table |
| `0011_outreach_drafts` | Adds `outreach_drafts` table |
| `0012_writing_style_cache` | Adds `writing_style_cache` singleton table |
| `0013_evaluation_metadata` | Adds `provider_used`, `model_used`, `tokens_used`, `generation_ms` to `evaluations` |
| `0014_latest_model_defaults` | Updates default model slugs in `ai_settings` |
| `0015_default_provider_openai` | Sets default active provider to `openai` |
| `0016_location_preferences` | Adds `preferred_locations_json`, `remote_preference` to `user_profile` |
| `0017_scan_source_overrides` | Adds `scan_source_overrides` table |
| `0018_custom_scan_sources` | Adds `scan_sources_custom` table |
| `0019_document_draft_json` | Adds `draft_json` to `generated_documents` |
| `0020_job_liveness` | Adds `liveness_status`, `liveness_checked_at` to `jobs` |
| `0021_job_archived` | Adds `archived` flag to `jobs` |
| `0022_title_filters` | Adds `title_filters` singleton table |
| `0023_job_gap_responses` | Adds `job_gap_responses` table |
| `0024_profile_gap_supplements` | Adds `profile_gap_supplements` table |
| `0025_company_profiles` | Adds `company_profiles` table |
| `0026_table_saved_filters` | Adds `table_saved_filters` table for persisted column-filter presets |
| `0027_work_modes` | Adds `work_modes_json` to `user_profile` |
| `0028_onboarding_preferences_confirmation` | Adds explicit first-run job-preference confirmation to `ai_settings` |
| `0029_job_scope_status` | Adds `scope_status` to `jobs` for maintenance labeling |
| `0030_remove_legacy_demo_seed_data` | Removes legacy demo jobs, applications, generated documents, activity, skills, and profile placeholders |

---

## Tables

### user_profile

Career profile for the job seeker. Singleton in practice — one row.

| Column | Type | Purpose |
|---|---|---|
| `id` | text PK | Row identifier |
| `name` | text | Full name |
| `location` | text | Current location |
| `portfolio` | text | Portfolio URL |
| `current_search_goal` | text | What the user is looking for |
| `urgency` | text | Search urgency level |
| `direction` | text | Career direction note |
| `constraints_json` | text | Array of job constraints / deal breakers |
| `target_roles_json` | text | Array of desired role titles |
| `strongest_skills_json` | text | Skills to lead with |
| `skills_to_use_more_json` | text | Skills to develop |
| `skills_to_use_less_json` | text | Skills to avoid |
| `desired_industries_json` | text | Target industries |
| `compensation_needs` | text | Salary / comp requirements |
| `work_preferences_json` | text | Work style preferences |
| `work_modes_json` | text | Selected location work modes: `remote`, `hybrid`, `onsite` |
| `deal_breakers_json` | text | Hard no conditions |
| `career_intent` | text | Stay on path vs. shift intent |
| `career_change_interest` | text | Specific change interest |
| `confidence_level` | text | Self-reported confidence |
| `preferred_locations_json` | text | Acceptable cities / regions |
| `remote_preference` | text | Legacy compatibility value derived from work modes |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

### skill_inventory

Skills extracted from resumes, tagged with strength and market signals.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `user_profile_id` | FK → `user_profile` |
| `skill_name` | Skill label |
| `skill_category` | Grouping category |
| `evidence_source` | Resume lane that proves this skill |
| `strength_level` | `strong` / `developing` / `aspirational` |
| `market_relevance` | Market demand signal |
| `user_interest_level` | How much the user wants to use it |
| `use_preference` | `use-more` / `neutral` / `use-less` |

### role_directions

Fit classification for role archetypes against the user profile.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `user_profile_id` | FK → `user_profile` |
| `role_family` | Role archetype name |
| `fit_level` | `direct` / `adjacent` / `selective` / `stretch` / `avoid` |
| `score` | 0–100 fit score |
| `rationale` | Explanation of fit decision |
| `gaps_json` | Array of gap notes |
| `recommendation_type` | Action recommendation |

### resumes

Source resume PDF lanes uploaded by the user.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `name` | Lane label (e.g., "Leadership", "IC / Individual Contributor") |
| `source_file` | Path to source PDF |
| `status` | Processing status |
| `active_status` | 1 = active, 0 = inactive |
| `extracted_text` | Full text extracted from PDF |
| `extracted_at` | ISO timestamp of last extraction |
| `word_count` | Word count of extracted text |
| `evidence_json` | Structured evidence blocks from extraction |
| `created_at` | ISO timestamp |

### jobs

Every job discovered by scanning or added manually.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `company` | Company name |
| `title` | Job title |
| `url` | Unique job posting URL |
| `source` | ATS source (Greenhouse / Ashby / Lever / custom) |
| `location` | Job location text |
| `remote_type` | `remote` / `hybrid` / `onsite` / `unknown` |
| `date_posted` | Date from ATS if available |
| `first_seen_date` | Date Job Search Terminal first discovered this job |
| `freshness_label` | Human-readable freshness (e.g., "3 days ago") |
| `raw_description` | Full raw job description text |
| `parsed_description` | Cleaned description for display |
| `status` | Workflow status (see status values below) |
| `fit_score` | 0–100 AI fit score |
| `role_archetype` | Matched role archetype from evaluation |
| `recommendation` | `apply` / `consider` / `skip` |
| `summary` | One-sentence job summary |
| `why_it_matches` | Match rationale text |
| `main_concern` | Primary concern text |
| `recommended_resume` | Which resume lane to use |
| `salary_notes` | Compensation context |
| `requirement_match_json` | JSON array of requirement match objects |
| `resume_evidence_json` | JSON array of resume evidence mappings |
| `gaps_json` | JSON array of gap items |
| `red_flags_json` | JSON array of red flags |
| `liveness_status` | `active` / `expired` / `uncertain` |
| `liveness_checked_at` | ISO timestamp of last liveness check |
| `scope_status` | Maintenance label such as `out_of_scope` when a verified active posting no longer matches saved title filters |
| `archived` | 0 = active, 1 = archived |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

The Jobs table Preference column is derived at render time from the current
profile preferences and constraints. It is not persisted on `jobs`; displayed
values are `Match` and `Out of scope`. Saving profile Preferences or
Constraints revalidates the Jobs page so this column reflects the latest profile
rules.

**Job status values:** `found` → `reviewed` → `resume_generated` → `applied`
→ `follow_up_needed` → `recruiter_responded` → `interviewing` → `offer` →
`rejected` / `skipped` / `archived`

### evaluations

AI-generated evaluation output for a job, stored separately from `jobs`.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` |
| `fit_score` | 0–100 score |
| `score_label` | Letter grade or label |
| `role_archetype` | Best-matching archetype |
| `summary` | Short evaluation summary |
| `strengths_json` | Array of strength items |
| `gaps_json` | Array of gap items |
| `red_flags_json` | Array of red flag items |
| `recommendation` | `apply` / `consider` / `skip` |
| `resume_base_recommendation` | Recommended resume lane |
| `requirement_match_json` | Structured requirement matches |
| `resume_evidence_json` | Evidence from resume lanes |
| `sections_json` | Full evaluation section breakdown |
| `legitimacy_label` | Job legitimacy signal |
| `keywords_json` | Extracted keywords |
| `user_correction_json` | User-applied corrections to evaluation |
| `provider_used` | AI provider that ran the evaluation |
| `model_used` | Model ID used |
| `tokens_used` | Token count for the evaluation run |
| `generation_ms` | Wall-clock generation time in ms |
| `created_at` | ISO timestamp |

### generated_documents

Tailored resumes and cover letters generated by AI.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` |
| `document_type` | `resume` / `cover_letter` |
| `title` | Document label |
| `content` | Document content (HTML or text) |
| `pdf_url` | Path to generated PDF |
| `html_url` | Path to HTML preview |
| `base_resume` | Source resume lane used |
| `generated_date` | ISO date |
| `status` | `draft` / `final` |
| `tailoring_summary` | Human-readable tailoring notes |
| `keyword_coverage` | Percentage of JD keywords covered |
| `tailoring_plan_json` | Array of tailoring decisions |
| `draft_json` | Editable draft content structure |
| `created_at` | ISO timestamp |

### applications

Application tracking record linked to a job.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` |
| `company` | Company name (for manually added apps) |
| `role` | Role title (for manually added apps) |
| `fit_score` | Score at time of application |
| `status` | Application status (matches job status values) |
| `applied_date` | ISO date when user applied |
| `follow_up_date` | ISO date for next follow-up |
| `notes` | Free-text notes |
| `contact` | Recruiter or contact info |
| `response_status` | `no_response` / `responded` / etc. |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### application_answer_drafts

Copy-paste answer drafts for application questions.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` |
| `question` | Application question text |
| `answer` | Generated or edited answer |
| `source` | `ai-generated` / `user-added` |
| `sort_order` | Display order |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### activity_log

Audit trail for all meaningful user actions.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `entity_type` | `job` / `application` / `profile` / etc. |
| `entity_id` | ID of the related entity |
| `action` | Action label |
| `timestamp` | ISO timestamp |
| `details_json` | Extra context for the action |

### scan_runs

History of job scan executions.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `status` | `running` / `completed` / `failed` |
| `started_at` | ISO timestamp |
| `completed_at` | ISO timestamp or null |
| `companies_scanned` | Count of companies checked |
| `skipped_companies` | Count of skipped companies |
| `total_jobs_found` | Raw jobs found before filtering |
| `filtered_count` | Jobs removed by title filters or profile preference filters |
| `duplicate_count` | Duplicate jobs skipped |
| `new_jobs_count` | Net new jobs added |
| `errors_json` | Array of per-company error objects |

### evaluation_feedback

User corrections to saved evaluations.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` |
| `role_archetype` | Archetype the correction targets |
| `corrected_score` | User-overridden score |
| `corrected_recommendation` | User-overridden recommendation |
| `correction_note` | Free-text reason |
| `created_at` | ISO timestamp |

### ai_settings

Singleton row holding AI provider configuration.

| Column | Purpose |
|---|---|
| `id` | `singleton` (fixed) |
| `active_provider` | `openai` / `anthropic` / `gemini` |
| `anthropic_api_key` | Anthropic key |
| `gemini_api_key` | Google key |
| `openai_api_key` | OpenAI key |
| `anthropic_model` | Default Anthropic model slug |
| `gemini_model` | Default Gemini model slug |
| `openai_model` | Default OpenAI model slug |
| `fallback_provider` | Optional fallback provider |
| `onboarding_dismissed` | 0 = show onboarding, 1 = dismissed |
| `onboarding_preferences_confirmed` | 0 = first-run job preferences still need user confirmation, 1 = confirmed |
| `updated_at` | ISO timestamp |

### story_bank

STAR stories for interview preparation.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `title` | Story title |
| `situation` | Situation context |
| `task` | Task or challenge |
| `action` | Actions taken |
| `result` | Outcome and impact |
| `reflection` | Personal takeaway |
| `skills_json` | Tagged skills |
| `themes_json` | Tagged themes |
| `source_job_id` | Optional FK → `jobs` (if sourced from a job) |
| `source_block_f` | Source block reference |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### company_research

AI-generated company analysis linked to a job.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` (unique) |
| `company` | Company name |
| `ai_strategy` | Company's AI / product strategy |
| `recent_movements` | Hiring signals, layoffs, expansions |
| `engineering_culture` | Team and culture notes |
| `technical_challenges` | Current challenges the company faces |
| `competitive_position` | Market positioning |
| `candidate_angle` | How the user should position themselves |
| `provider_used` | AI provider used |
| `model_used` | Model ID used |
| `created_at` | ISO timestamp |

### outreach_drafts

Draft outreach messages to recruiters or hiring managers.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` |
| `contact_type` | `recruiter` / `hiring_manager` / etc. |
| `message` | Draft message text |
| `char_count` | Character count |
| `status` | `draft` / `sent` |
| `created_at` | ISO timestamp |

### writing_style_cache

Singleton cache of the user's extracted writing style profile.

| Column | Purpose |
|---|---|
| `id` | `singleton` (fixed) |
| `tone_profile` | Extracted style description |
| `sample_count` | Number of samples analyzed |
| `last_updated` | ISO timestamp |

### scan_source_overrides

Enable / disable flags for built-in job sources.

| Column | Purpose |
|---|---|
| `name` | Source name (PK) |
| `enabled` | 1 = enabled, 0 = disabled |
| `updated_at` | ISO timestamp |

### scan_sources_custom

User-added custom ATS job board URLs.

| Column | Purpose |
|---|---|
| `name` | Source label (PK) |
| `careers_url` | Careers page URL |
| `api` | ATS API type if detectable |
| `enabled` | 1 = enabled, 0 = disabled |
| `created_at` | ISO timestamp |

### title_filters

Singleton row of positive and negative job title filter lists.

| Column | Purpose |
|---|---|
| `id` | `singleton` (fixed) |
| `positive_json` | Array of title strings to include |
| `negative_json` | Array of title strings to exclude |
| `updated_at` | ISO timestamp |

### job_gap_responses

User-written responses to job skill gaps, with optional AI polish.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | FK → `jobs` |
| `gap_text` | The gap being addressed |
| `raw_response` | User's initial response |
| `polished_response` | AI-polished version |
| `source` | `user-added` / `ai-generated` |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### profile_gap_supplements

Supplemental profile content used to fill skill gaps in evaluations and resumes.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `content` | Supplement text |
| `tags_json` | Array of tags for matching |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### company_profiles

Company metadata cache used to tag and cluster jobs.

| Column | Purpose |
|---|---|
| `name` | Company name (PK) |
| `industry` | Industry classification |
| `tags_json` | Array of company tags |
| `updated_at` | ISO timestamp |

### table_saved_filters

Persisted named sort + filter presets for data tables. One row per table key,
storing a JSON payload that contains up to 5 named presets. Read and written
via `src/lib/table-saved-filters-actions.ts` (Next.js server actions).

| Column | Purpose |
|---|---|
| `table_key` | Stable identifier for the table (PK) — see `src/lib/table-saved-filter-storage-keys.ts` |
| `payload_json` | Versioned JSON blob containing the array of saved filter entries |
| `updated_at` | ISO timestamp of last save |

**Registered table keys:** `jst.dt.savedFilters.mainJobs` ·
`jst.dt.savedFilters.archivedJobs` · `jst.dt.savedFilters.applications` ·
`jst.dt.savedFilters.generatedDocs` · `jst.dt.savedFilters.scanSources` ·
`jst.dt.savedFilters.discoveredSources`

---

## Database Scripts

```bash
npm run db:migrate        # apply pending migrations
npm run db:seed           # initialize an empty local profile
npm run db:reset          # drop, re-migrate, and initialize empty local state
npm run db:check          # verify database is readable and starts empty
npm run profile:extract   # extract resume PDFs into resumes table and refresh skills
npm run profile:check     # verify extracted profile intelligence
npm run scanner:check     # verify scanner adapter with mock ATS payloads
npm run evaluation:check  # verify evaluation storage and user correction flow
npm run document:check    # verify HTML/PDF resume generation
npm run application:check # verify answer generation, status transitions, funnel metrics
npm run quality:check     # run accessibility, contrast, and screenshot checks
npm run data:backup       # SQLite backup → output/backups/
npm run data:export       # JSON export → output/exports/
npm run discover:sources  # discover new job posting sources
```

---

## Runtime Behavior

- `getDatabase()` runs migrations and initializes base local rows only if the database is empty.
- Server-rendered pages read through `src/lib/db/queries.ts`.
- `db:reset` deletes the SQLite file, re-runs all migrations, and initializes empty local state.
- The database file is `data/job-search-terminal.sqlite` by default. Override with
  `JST_DATABASE_PATH` environment variable.
- Do not delete or move `data/job-search-terminal.sqlite` while the dev server is running.
- Create a backup with `npm run data:backup` before any risky local changes.
