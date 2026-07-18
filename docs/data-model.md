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
| `0031_linkedin_scan_support` | Adds `is_duplicate`, `duplicate_of` to `jobs`; adds `scan_type` to `scan_runs`; adds compound index on `(company, title, location)` |
| `0032_resume_builder_versions` | Adds approved structured resume versions per uploaded lane |
| `0033_ai_prompt_overrides` | Adds local overrides for user-tunable AI prompts |
| `0034_remove_legacy_demo_resumes` | Removes five hard-coded demo resume lane records left behind by `0030` (IDs: `accessibility-design-systems`, `ux-design`, `design-operations`, `principal-product-design`, `teaching-ux-education`); cascades to `resume_builder_versions` |
| `0035_browser_board_job_provenance` | Adds `source_url`, `original_posting_url`, and `original_posting_key` to support browser-assisted LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster imports |
| `0036_gap_answer_quality` | Adds quality-status, follow-up question, and assessment metadata to gap responses and profile supplements |
| `0037_discovery_and_aggregator_keys` | Adds `brave_search_api_key`, `adzuna_app_id`, and `adzuna_api_key` to `ai_settings` to support search-based source discovery (Brave) and the Adzuna job aggregator scanner |
| `0038_daily_scan_and_resume_audit` | Adds scheduled-scan freshness metadata and generated-resume evidence audit fields |
| `0039_generated_document_resume_lane_id` | Adds stable resume-lane IDs to generated documents so lane renames do not break export |
| `0040_job_review_status` | Adds `review_status` text column to `jobs` (default `'none'`) for the low-confidence review queue |
| `0042_email_job_alert_imports` | Adds email-import posting resolution fields and the `job_email_import_evidence` provenance table |
| `0041_ollama_settings` | Adds `ollama_base_url`, `ollama_model`, `provider_order_json` to `ai_settings`; adds `provider_used`, `model_used` to `outreach_drafts` and `application_answer_drafts` |
| `0043_pending_email_candidates` | Adds the `pending_email_job_candidates` table for the approval-gated email import queue |
| `0044_interview_prep_workspace` | Interview-prep workspace: seeds 10 default `interview_questions`, extends `story_bank` with `story_kind`, `question_id`, `prompt_text`, quality fields, `tags_json` |
| `0045_story_tags_and_job_assignments` – `0049_story_job_link_backfill_v2` | Story tag/keyword plumbing and `story_job_links` auto-matching backfills |
| `0050_private_keyword_taxonomy` / `0051_group_generated_misc_taxonomy_roots` | Private keyword taxonomy tables and the "Other keywords" holding root |
| `0052_taxonomy_candidate_status` | Adds the `candidate` concept lifecycle: rule-based demotion of unused generated concepts (0 stories, <3 jobs, no active children), run in three passes to cascade up parent chains. No schema column change — reuses `keyword_concepts.status` |
| `0054_practice_attempts` | Adds `practice_attempts` (durable per-question rehearsal history) and `question_story_links` (question↔story matrix), and backfills both from existing `answered_question` stories |
| `0055_story_consolidation_runs` | Adds `story_consolidation_runs`, a resumable JSON-blob state store for the one-time story consolidation wizard |
| `0056_evaluation_keyword_signals` | Adds `evaluations.keyword_signals_json` (`text not null default '[]'`): structured ATS keyword signals with priority/category/source/rationale (the `JobKeywordSignal` type). Existing rows default to `'[]'` and fall back to signals reconstructed from `keywords_json` at read time (`legacyKeywordSignals`) |

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

### resume_builder_versions

Editable structured resume source for each uploaded lane. Existing lanes are
backfilled from stored `resumes.extracted_text` before falling back to the
stored PDF file.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `resume_id` | Source lane in `resumes` |
| `status` | `needs_review`, `approved`, or `missing_source` |
| `sections_json` | Ordered builder sections, including custom sections |
| `source_hash` | Hash of the source text used for backfill/change detection |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |
| `approved_at` | ISO timestamp for the active approved version |

### jobs

Every job discovered by scanning or added manually.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `company` | Company name |
| `title` | Job title |
| `url` | Primary job posting URL opened by the app; browser-board imports prefer a visible employer/ATS URL and fall back to the platform URL |
| `source_url` | Platform URL where a browser-board job was found |
| `original_posting_url` | Visible job-specific employer/ATS apply URL when available |
| `original_posting_key` | Canonical dedupe key, preferring ATS provider + job ID |
| `source` | ATS source, manual source, or browser-board source (`linkedin-claude-scan`, `wellfound-browser-scan`, `workatastartup-browser-scan`, `glassdoor-browser-scan`, `indeed-browser-scan`, `monster-browser-scan`) |
| `location` | Job location text |
| `remote_type` | `remote` / `hybrid` / `onsite` / `unknown` |
| `date_posted` | Date from ATS if available (`YYYY-MM-DD` in user's local timezone) |
| `first_seen_date` | Date Job Search Terminal first discovered this job (`YYYY-MM-DD` in user's local timezone — never UTC) |
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
| `review_status` | `none` (default) or `pending_review` — set to `pending_review` by the importer when a job's raw description is under 100 characters (low-confidence import); cleared to `none` when the user approves the job from the review queue banner |
| `posting_resolution_status` | `resolved` (default) or `needs_resolution` for email leads that do not yet have a real posting URL |
| `posting_search_query` | Saved company/title/location query used by on-demand posting resolution |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

The Jobs table Preference column is derived at render time from the current
profile preferences and constraints. It is not persisted on `jobs`; displayed
values are `Match` and `Out of scope`. Saving profile Preferences or
Constraints revalidates the Jobs page so this column reflects the latest profile
rules.

### job_email_import_evidence

Minimal provenance for jobs imported from dropped email alerts.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `job_id` | Imported job or unresolved email lead |
| `source_filename` | Original dropped email filename |
| `email_subject` | Email subject line |
| `email_from` | Sender header when available |
| `email_date` | Date header when available |
| `extracted_snippet` | Short text snippet used to identify the job |
| `candidate_links_json` | Extracted candidate posting links |
| `confidence` | `high`, `medium`, or `low` extraction confidence |
| `extraction_notes` | Short parser note |
| `created_at` | ISO timestamp |

**Job status values:** `found` → `reviewed` → `resume_generated` → `applied`
→ `follow_up_needed` → `recruiter_responded` → `interviewing` → `offer` →
`rejected` / `skipped` / `archived`

### pending_email_job_candidates

Temporary approval queue populated when email files are dropped into
`data/email-job-alert-imports/`. Rows are deleted once the user approves or
dismisses them — they never persist beyond the approval modal session.

| Column | Purpose |
|---|---|
| `id` | Stable hash of the candidate (same algorithm as the final job ID) |
| `batch_id` | Groups all candidates from a single dropped email file |
| `email_subject` | Subject line of the source email |
| `email_from` | Sender header |
| `email_date` | Date header |
| `source_filename` | Original dropped email filename |
| `company` | Extracted company name |
| `position` | Extracted job title |
| `location` | Extracted or inferred location |
| `url` | Best available URL (direct posting or synthetic `email-alert://` URI) |
| `source_url` | Same as `url` |
| `original_posting_url` | Direct ATS/employer link when found in the email |
| `job_description` | Full extracted text (may be empty for low-confidence leads) |
| `salary_notes` | Extracted salary string if any |
| `snippet` | Short surrounding text used to identify the job |
| `confidence` | `high` (has direct link) or `low` (no link) |
| `extraction_notes` | Short parser note |
| `posting_resolution_status` | `resolved` or `needs_resolution` |
| `posting_search_query` | Pre-built query for Brave Search / posting resolution |
| `candidate_links_json` | Extracted links from the email |
| `discovered_at` | ISO timestamp from the email date header |
| `title_match` | `good`, `weak`, or `unknown` — match against user's target roles + positive filters |
| `created_at` | ISO timestamp when row was inserted |

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
| `keywords_json` | 12–18 high-signal keyword phrases extracted verbatim from the posting (Block E, `runBlockE` in `src/lib/evaluation/llm-evaluator.ts`), weight-sorted (critical → required → preferred). Equal to `keyword_signals_json.map(s => s.keyword)` for AI evaluations. Used for resume-tailoring keyword coverage and as the job-side matching haystack in `story_job_links` auto-matching (see `story_bank` above). Block F stories are **no longer auto-inserted** as `evaluation_suggestion` rows — they are reviewed per question on the job page (`getMatchingStoriesForJob`); existing suggestion rows persist until the consolidation wizard folds them into core stories |
| `keyword_signals_json` | Array of `JobKeywordSignal` (migration `0056`): each has `keyword`, `priority` (`critical` \| `required` \| `preferred`), `category` (`title` \| `technical` \| `soft` \| `domain` \| `tool` \| `methodology` \| `credential`), `source` (`job_title` \| `basic_qualification` \| `required_qualification` \| `preferred_qualification` \| `responsibility` \| `description`), and `rationale`. Produced by `normalizeKeywordSignals` in `src/lib/evaluation/keyword-signals.ts`, which drops phrases not present in the posting, invented title variants, low-signal/marketing wording, and phrases over six words, then weight-sorts and caps at 18. Drives priority-weighted "job keyword alignment" (weights 5/3/1, related wording earns half credit) in the resume draft editor and the tailoring prompt. Empty (`[]`) for pre-`0056` rows and rule-based (non-AI) evaluations; consumers fall back to `legacyKeywordSignals` reconstructed from `keywords_json` |
| `user_correction_json` | User-applied corrections to evaluation |
| `provider_used` | AI provider that ran the evaluation. When the fallback chain is active, this reflects the provider that actually served the last block, not necessarily the configured active provider. |
| `model_used` | Model ID used (matches `provider_used`) |
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
| `base_resume_id` | Stable source resume lane ID used for export after lane renames |
| `generated_date` | ISO date |
| `status` | `draft` / `final` |
| `tailoring_summary` | Human-readable tailoring notes |
| `keyword_coverage` | Percentage of JD keywords covered |
| `tailoring_plan_json` | Array of tailoring decisions |
| `draft_json` | Editable draft content structure |
| `tailoring_status` | Evidence-audit result or source-only fallback marker |
| `evidence_audit_json` | Unsupported-claim audit details |
| `fallback_reason` | AI-tailoring fallback reason, when present |
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
| `provider_used` | AI provider that generated the answer (added in 0041) |
| `model_used` | Model ID used (added in 0041) |
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
| `errors_json` | Array of `{ company, error, category? }` — `category` is `dead_or_unreachable`, `timeout_or_slow`, or `other` when set (CareerOps / Adzuna); older rows may omit it |
| `scan_type` | `careerops`, `linkedin-claude-scan`, `wellfound-browser-scan`, `workatastartup-browser-scan`, `glassdoor-browser-scan`, `indeed-browser-scan`, or `monster-browser-scan` |

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
| `active_provider` | Legacy primary provider slug (derived from `provider_order_json[0]`). Kept for backward compatibility. |
| `anthropic_api_key` | Anthropic key |
| `gemini_api_key` | Google key |
| `openai_api_key` | OpenAI key |
| `anthropic_model` | Default Anthropic model slug |
| `gemini_model` | Default Gemini model slug |
| `openai_model` | Default OpenAI model slug |
| `ollama_base_url` | Ollama server base URL (default `http://localhost:11434`) |
| `ollama_model` | Selected Ollama model name (default `llama3.1:8b`) |
| `fallback_provider` | Legacy fallback (derived from `provider_order_json[1]`). Kept for backward compatibility. |
| `provider_order_json` | JSON array of `AIProviderName` values in user-configured priority order. Only enabled providers appear. The factory tries them left to right. |
| `onboarding_dismissed` | 0 = show onboarding, 1 = dismissed |
| `onboarding_preferences_confirmed` | 0 = first-run job preferences still need user confirmation, 1 = confirmed |
| `brave_search_api_key` | Optional Brave Search API key for search-based ATS source discovery |
| `adzuna_app_id` | Optional Adzuna App ID for the job aggregator scanner |
| `adzuna_api_key` | Optional Adzuna API key for the job aggregator scanner |
| `updated_at` | ISO timestamp |

### ai_prompt_overrides

User-edited prompt text for tunable AI workflows. Missing rows mean the app uses
the default prompt from code.

| Column | Purpose |
|---|---|
| `prompt_id` | Prompt identifier, e.g. `resume_tailoring` |
| `custom_prompt` | User-edited prompt text |
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
| `skills_json` | Legacy skill tags retained for compatibility |
| `themes_json` | Legacy theme tags retained for compatibility |
| `tags_json` | Raw story keywords. These stay close to ATS/job-description language and are preserved for matching provenance. Grouped user-facing tags are stored through the private taxonomy tables below |
| `source_job_id` | Optional FK → `jobs` (if sourced from a job) |
| `source_block_f` | Source block reference |
| `story_kind` | `answered_question`, `standalone_story`, or `evaluation_suggestion` |
| `question_id` | Optional FK-like reference to `interview_questions.id` |
| `prompt_text` | Interview prompt text used when the story came from a question |
| `quality_status` | `ready`, `needs_detail`, or `missing_result` |
| `quality_notes` | Short coaching note explaining missing or ready details |
| `last_evaluated_at` | Last time AI/user quality metadata was refreshed |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### story_job_links

Many-to-many links between reusable interview stories and active application positions.

| Column | Purpose |
|---|---|
| `story_id` | FK → `story_bank.id` |
| `job_id` | FK → `jobs.id` |
| `source` | `manual` (user checked the position) or `auto` (system-matched by tag overlap) |
| `created_at` | ISO timestamp |

Stories can only be linked to jobs with application statuses `Applied`, `Recruiter
responded`, or `Interviewing` — never to jobs that are merely found, reviewed, or have
only had a resume generated. This eligibility set lives in
`ELIGIBLE_ASSIGNMENT_STATUSES` in `src/lib/db/queries.ts` and backs
`getInterviewAssignmentJobs()`.

**Auto-matching.** In addition to manual checkbox assignment in the Interview Prep UI,
two triggers automatically link a story to a position when its taxonomy concepts
overlap the job's locally classified title, role archetype, or extracted ATS keywords:

- `saveStory()` — after saving a story, it is matched against all currently-eligible
  jobs (`autoMatchJobsForStory`), unless the save is itself a manual assignment toggle
  (`skipAutoMatch: true` — see below).
- `updateApplicationStatus()` — when a job's status changes to `Applied`, `Recruiter
  responded`, or `Interviewing`, all stories are matched against it
  (`autoMatchStoriesForJob`).

The matcher deliberately excludes the job's free-text `summary`/`requirement_match_json`
— matching against prose makes nearly every job match a generic tag like
"collaboration". `evaluations.keywords_json` remains the raw ATS phrase source, but
matching is mediated through `keyword_concepts` so related wording can group together
without destroying exact keyword coverage. Parent/child overlap counts, so a story
classified as `User interviews` can match a job classified as `User research`.

Auto-matching only ever adds links (`insert or ignore`) — it never removes a link the
user manually cleared. Manual assignment updates are diffed against the existing link
set rather than deleted-and-reinserted, so re-saving unrelated story fields does not
downgrade an `auto` link to `manual` or vice versa. Unchecking a position in the UI
sends `skipAutoMatch: true` to `POST /api/interview/save-story`, which skips the
auto-matcher for that save — otherwise the same save that removes the link would
immediately re-add it. Unchecking a position removes its link regardless of source.

Migrations `0047_story_job_link_backfill` and `0049_story_job_link_backfill_v2` run the
same matching heuristic once, in pure SQL (`json_each` over `tags_json`), against all
pre-existing stories and eligible positions so historical data isn't left unmatched
after the feature shipped. `0049` re-runs after `0048_evaluation_story_keyword_tags`
backfills real keyword tags onto existing `evaluation_suggestion` stories (they
previously had only generic placeholder tags, since the story bank predates keyword
reuse) — it only adds links `0047`'s narrower haystack (title/role-archetype only)
missed; it never removes anything `0047` already created.

### private keyword taxonomy

The keyword taxonomy is local and user-specific. The app ships only schema; a fresh
install has no taxonomy concepts or aliases. Concepts are created from the user's own
evaluated jobs, story tags, resumes, and interview-prep material.

| Table | Purpose |
|---|---|
| `keyword_concepts` | Canonical concept tags in a tree up to five levels deep. `status` is `active`, `candidate`, or `archived` |
| `keyword_aliases` | Raw phrases and synonyms mapped to a concept, with source and confidence |
| `job_keyword_concepts` | Links a job/evaluation raw keyword to a concept while preserving the raw keyword |
| `story_keyword_concepts` | Links a story raw keyword to a concept while preserving the raw keyword |
| `keyword_mapping_suggestions` | Reserved review queue for uncertain AI-suggested mappings |
| `taxonomy_activity_log` | Local audit trail for created, moved, promoted, archived, restored, aliased, and merged concepts |

Raw keywords and concept tags are intentionally separate:

- Raw keywords remain exact phrases for ATS/resume tailoring and provenance.
- Concept tags organize search, Story Bank filters, taxonomy browsing, and semantic story-to-job matching.
- User edits in the Taxonomy Manager are saved as local authoritative aliases/moves/merges and reused by future classification.

#### Concept lifecycle: active, candidate, archived (migration `0052`)

Job-evaluation keywords used to create an `active` concept for every unseen phrase,
which grew the taxonomy without bound (~12 per evaluated job) and buried the useful
tags. Concepts now have a three-state lifecycle:

- **`candidate`** — machine-generated from a job evaluation (`created_from` other than
  `user`/`system`). Candidates are excluded from the default taxonomy tree but still
  participate fully in job↔story matching (`getStoryConceptIds`/`getJobConceptIds`
  ignore status). They surface in the **Review queue** for approve/archive.
- **`active`** — the curated set shown in the tree. A candidate is **promoted** to
  active automatically when it (a) is linked to a story, or (b) recurs across ≥3
  distinct jobs; or manually when the user approves it. User-authored and story-tag
  concepts are born active.
- **`archived`** — user-rejected. Migration `0052` demotes existing unused generated
  concepts (0 story links, <3 jobs, no active children) to `candidate` in three passes
  (to cascade up parent chains). It is rule-based, so a fresh install with no generated
  concepts demotes nothing.

**Blocklist:** credentials (degree/certificate phrasing), job titles (seniority-prefix
shapes), and the user's own tracked company names never mint a concept. These are
role-agnostic patterns plus company names read from the user's `jobs` table — not a
fixed vocabulary — so non-design users are covered too. Blocked phrases still live in
`evaluations.keywords_json` and still match via raw-keyword matching, so resume
tailoring and job matching are unaffected.

**Resurrection fix:** re-encountering an archived concept during a job evaluation no
longer restores it to active — only an explicit user action does. This keeps a cleanup
from being undone by the next evaluation.

Query helpers: `getKeywordTaxonomy({ includeArchived?, includeCandidates? })` (default
excludes both), `getTaxonomyCandidates()` (flat review-queue feed ranked by job count),
`getTaxonomyStatusCounts()`. Mutations: `promoteTaxonomyConcept`,
`bulkArchiveTaxonomyConcepts`, `archiveUnusedTaxonomyConcepts`.

### interview_questions

Reusable interview prompts for the Interview Prep workspace.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `prompt` | Question text shown in the practice workflow |
| `category` | User-facing grouping label |
| `source` | `default` for bundled prompts, `custom` for user-added prompts |
| `active` | Hidden prompts are retained with `active = 0` |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### practice_attempts

Durable history of every rehearsal of an interview question (migration `0054`). Re-practicing appends a row; nothing is overwritten. Written by `POST /api/interview/save-story` when a practice save carries a transcript, and read by `getQuestionPracticeMap`.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `question_id` | The practiced `interview_questions` row (nullable; set null if the question is deleted) |
| `story_id` | The canonical story this attempt refined (nullable) |
| `transcript` | Raw typed/spoken answer for this rep |
| `parsed_json` | AI-structured STAR fields for this rep (`title`/`situation`/`task`/`action`/`result`/`reflection`) |
| `quality_status` | `ready` / `needs_detail` / `missing_result` at the time of the rep |
| `coaching_notes_json` | AI coaching suggestions captured for this rep |
| `created_at` | ISO timestamp |

### question_story_links

Many-to-many map of which stories answer which questions (migration `0054`). A story can cover several questions; a question can have several candidate stories. Powers the per-question history drawer and the coverage matrix.

| Column | Purpose |
|---|---|
| `question_id` | `interview_questions` row (cascade delete) |
| `story_id` | `story_bank` row (cascade delete) |
| `source` | `practice` (created by practicing), `manual`, etc. |
| `created_at` | ISO timestamp |

### story_consolidation_runs

Resumable state for the one-time story consolidation wizard (migration `0055`), which clusters legacy `evaluation_suggestion` stories into a small set of canonical core stories.

| Column | Purpose |
|---|---|
| `id` | Run identifier |
| `status` | `review` (draft awaiting approval), `committed`, or `abandoned` |
| `payload_json` | The full clustering draft: `{ totalSuggestions, clusters: [{ key, canonical STAR, members[] }] }` |
| `created_at` / `updated_at` | ISO timestamps |

The wizard flow: `POST /api/interview/consolidate/analyze` runs LLM clustering + synthesis over `getEvaluationSuggestionDigests()` and saves a `review` run; the client review page edits clusters and approves; `POST /api/interview/consolidate/commit` (`commitConsolidation`) inserts each approved cluster as a `standalone_story`, re-points the members' `story_job_links` onto it, deletes the member suggestion rows, and marks the run `committed`. Clustering is LLM-driven (`src/lib/interview/consolidation.ts`, via `getActiveProvider`), so a configured AI provider is required.

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
| `provider_used` | AI provider that generated the draft (added in 0041) |
| `model_used` | Model ID used (added in 0041) |
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
| `quality_status` | `addressed` when the answer is concrete enough for resume tailoring, otherwise `needs_followup` |
| `follow_up_question` | Targeted question shown when the answer needs more detail |
| `assessment_json` | Assessment rationale and signal metadata |
| `assessed_at` | Timestamp for the latest quality assessment |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

### profile_gap_supplements

Supplemental profile content used to fill skill gaps in evaluations and resumes.

| Column | Purpose |
|---|---|
| `id` | Row identifier |
| `content` | Supplement text |
| `tags_json` | Array of tags for matching |
| `quality_status` | `addressed` when the supplement is concrete enough for resume tailoring, otherwise `needs_followup` |
| `follow_up_question` | Targeted question shown when the supplement needs more detail |
| `assessment_json` | Assessment rationale and signal metadata |
| `assessed_at` | Timestamp for the latest quality assessment |
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

Persisted data-table view settings. One row per table key, storing a JSON
payload for either the latest automatic sort/filter state or up to 5 named
sort/filter presets. Read and written via
`src/lib/table-saved-filters-actions.ts` (Next.js server actions).

| Column | Purpose |
|---|---|
| `table_key` | Stable identifier for the table (PK) — see `src/lib/table-saved-filter-storage-keys.ts` |
| `payload_json` | Versioned JSON blob containing the array of saved filter entries |
| `updated_at` | ISO timestamp of last save |

**Registered saved-preset keys:** `jst.dt.savedFilters.mainJobs` ·
`jst.dt.savedFilters.archivedJobs` · `jst.dt.savedFilters.applications` ·
`jst.dt.savedFilters.generatedDocs` · `jst.dt.savedFilters.scanSources` ·
`jst.dt.savedFilters.discoveredSources`

**Registered last-state keys:** `jst.dt.state.mainJobs` ·
`jst.dt.state.archivedJobs` · `jst.dt.state.applications` ·
`jst.dt.state.generatedDocs` · `jst.dt.state.scanSources` ·
`jst.dt.state.discoveredSources`

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

## Runtime Files

In addition to the SQLite database, the app maintains several files under `data/`:

| Path | Purpose |
|---|---|
| `data/job-search-terminal.sqlite` | Primary database (excluded from git) |
| `data/job-board-imports/` | Drop zone for browser-board JSON scan files; processed and archived automatically by the file watcher |
| `data/job-board-imports/archive/YYYY-MM-DD/` | Successfully imported scan files, organized by date |
| `data/linkedin-imports/` | Legacy LinkedIn-only import directory, still watched for backward compatibility |
| `data/.restore-recovery.json` | Transient restore-recovery marker. Written by `applyStagedRestore` before the file swap begins and deleted after a successful swap. If this file exists when the server starts and the database is unhealthy, the server automatically rolls back to the rollback archive recorded in the marker. Normally absent. |

**`data/.restore-recovery.json` schema:**
```json
{ "rollbackArchivePath": "path/to/rollback.jst-backup", "startedAt": "ISO timestamp" }
```

---

## Notes on Schema Values

**`generated_documents.document_type`:** Accepts `'resume'` or `'cover_letter'`.
The `'cover_letter'` value is reserved in the schema but no current pipeline writes it — only tailored resumes are generated. It is available for a future cover-letter generation feature.

---

## Runtime Behavior

- `getDatabase()` runs migrations and initializes base local rows only if the database is empty.
- Server-rendered pages read through `src/lib/db/queries.ts`.
- `db:reset` deletes the SQLite file, re-runs all migrations, and initializes empty local state.
- The database file is `data/job-search-terminal.sqlite` by default. Override with
  `JST_DATABASE_PATH` environment variable.
- Do not delete or move `data/job-search-terminal.sqlite` while the dev server is running.
- Create a backup with `npm run data:backup` before any risky local changes.
