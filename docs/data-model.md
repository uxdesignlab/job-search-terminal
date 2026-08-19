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
| `0057_openai_latest_model` | Moves the old default OpenAI model onto the auto-resolving `latest` alias; explicitly pinned models are left alone |
| `0058_remote_location_preferences` | Adds `user_profile.remote_locations_json` (`text not null default '[]'`) and seeds it from `preferred_locations_json`. Splits location preferences in two: `preferred_locations_json` now governs hybrid/on-site matching only, `remote_locations_json` governs which regions' remote roles are in scope. Seeding makes the migration behaviour-preserving — one list previously drove both |
| `0059_scan_run_repost_count` | Adds `scan_runs.repost_count` (`integer not null default 0`): the subset of `new_jobs_count` that re-posts a role already in the app at a different URL, admitted because the earlier row had been closed out. Existing rows default to `0` |
| `0060_fast_evaluation` | Adds 11 defaulted columns to `evaluations` for Fast Evaluation: `evaluation_version`, `seniority`, `domain`, `direction_alignment`, `confidence_label`, `fit_components_json`, `hard_blockers_json`, `requirements_summary_json`, `jd_hash`, `model_output_json`, `completeness_warnings_json` |
| `0061_application_preparation` | Adds `application_preparation` — detailed requirements, ATS keyword signals, evidence map, compensation context, and the JD/evidence hashes that decide reuse |
| `0062_external_integrations` | Adds `external_integrations` for third-party connections, seeded with a Clay row |
| `0063_contacts` | Adds `contacts`, `job_contact_links`, `contact_suppressions`; extends `company_profiles` with domain, employee count, Clay id, LinkedIn URL and intelligence provenance |
| `0064_outreach_messages` | Adds `outreach_messages` — per-contact, per-channel drafts, cascading from `job_contact_links` |
| `0065_latest_claude_gemini_models` | Moves installs still holding the app's own old default Claude/Gemini models (`claude-sonnet-4-6`, `gemini-2.5-flash`, `gemini-2.0-flash`) onto the auto-resolving `latest-sonnet` / `latest-flash` sentinels, keeping the same tier. Explicitly pinned models are left alone, and the `ai_settings` column defaults change to the sentinels for fresh installs |

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
| `preferred_locations_json` | text | Cities / regions the user would physically commute to. Matched against **hybrid and on-site** postings only |
| `remote_locations_json` | text | Countries / regions whose **remote** roles are in scope. Empty means remote from anywhere is acceptable |
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
values are `Match`, `Out of scope`, and `No location` (the board reported no
location, so no location judgement was made). Saving profile Preferences or
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

**Fast Evaluation columns (migration `0060`).** All defaulted, so pre-existing rows
migrate untouched and report `evaluation_version = 'legacy-v1'` — which is what the job
detail page keys off to render the original A–G sections instead of the new card. Rows
written by Fast Evaluation report `fast-v2`.

| Column | Holds |
|---|---|
| `evaluation_version` | `legacy-v1` or `fast-v2` |
| `seniority`, `domain` | Normalized role facets |
| `direction_alignment` | `strong` / `partial` / `none` — an input to the recommendation rules |
| `confidence_label` | `High` / `Medium` / `Low`, describing source quality |
| `fit_components_json` | The four component scores that sum to `fit_score` |
| `hard_blockers_json` | Validated blockers, each with posting evidence and the saved constraint it conflicts with |
| `requirements_summary_json` | Aggregate counts only — `{supported, partial, unknown}` |
| `jd_hash` | Reserved for staleness detection in Application Preparation |
| `model_output_json` | Normalized model output, powering the inspectable detail view |
| `completeness_warnings_json` | Optional fields that degraded during normalization |

`requirement_match_json` and `requirements_summary_json` are deliberately different:
the first is item-level display strings, the second is aggregate counts. Never write the
same structure to both.

**Metadata columns are now actually written.** `provider_used`, `model_used`,
`tokens_used` and `generation_ms` existed since `0013` but were absent from
`saveJobEvaluation()`'s insert, so — because the statement is `insert or replace` — every
row reset them to their defaults. All 138 pre-existing rows have an empty provider and
`0` ms for this reason. They are populated from Fast Evaluation onward.

**Legacy detail is carried forward, not blanked.** Fast Evaluation generates no A–G prose
and no keywords, and the insert is `insert or replace`. Writing a `fast-v2` result over a
`legacy-v1` row would therefore erase `sections_json`, `keywords_json`,
`keyword_signals_json` and `legitimacy_label`. The first is a straight loss of the old
analysis; the last three are worse, because they are the fallback tiers resume tailoring
reads when a job has no Application Preparation keywords — blanking them would leave a
re-evaluated legacy job with no keyword source at all. `saveJobEvaluation()` detects this
transition and copies all four forward. The UI hides them once the row reports `fast-v2`,
but nothing is destroyed.

**Taxonomy links survive re-evaluation.** `linkJobKeywordConcepts()` deletes a job's
existing `job_keyword_concepts` rows before re-inserting, so calling it with an empty
keyword list is a delete. Fast Evaluation extracts no keywords, so `saveJobEvaluation()`
skips the call entirely rather than wiping links the story/job matcher depends on.

**Evaluation no longer overwrites application status.** The `jobs` mirror update used to
set `status = 'Reviewed'` unconditionally, so re-evaluating a job you had already applied
to silently reset it and lost where you were. It now only advances jobs still in `Found`
or `Reviewed`.

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
| `filtered_count` | Jobs removed by title filters or profile preference filters. For browser-board imports this is malformed records plus jobs dropped by the location preference filter |
| `duplicate_count` | Duplicate jobs skipped |
| `repost_count` | Subset of `new_jobs_count` that re-posts a role already in the app at a different URL, admitted because the earlier row was closed out (`Applied`, `Rejected`, `Skipped`, `Archived`). Written by the CareerOps lane; other lanes leave it `0` |
| `new_jobs_count` | Net new jobs added |
| `errors_json` | Array of `{ company, error, category? }` — `category` is `dead_or_unreachable`, `timeout_or_slow`, or `other` when set (CareerOps / Adzuna); older rows may omit it |
| `scan_type` | `careerops` plus every board scan type. Current values: `linkedin-claude-scan`, `wellfound-browser-scan`, `workatastartup-browser-scan`, `glassdoor-browser-scan`, `indeed-browser-scan`, `monster-browser-scan`, `adzuna-api-scan`, `email-alert-import`, `dice-mcp-scan`, `himalayas-api-scan`. **Single source of truth:** `BrowserBoardScanType` in `src/lib/scanner/browser-board-sources.ts` — the TypeScript types now derive from that registry rather than restating it, so adding a board only requires editing the registry. Rows written by external agents may carry other values (for example `private-page-scan`). |

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
| `anthropic_model` | Claude model slug, or one of the sentinels `latest-sonnet` (default), `latest-opus`, `latest-haiku`, which resolve against Anthropic's `/v1/models` at request time (newest release within that tier, cached one hour) |
| `gemini_model` | Gemini model slug, or one of the sentinels `latest-flash` (default), `latest-pro`, `latest-flash-lite`, which resolve against Google's model list at request time (newest stable release within that tier, cached one hour) |
| `openai_model` | OpenAI model slug, or the sentinel `latest` (default) which resolves to the newest generation alias at request time |
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
| `assessment_json` | Assessment rationale, signals, and the persisted `followUpQuestions` array |
| `assessed_at` | Timestamp for the latest quality assessment |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |

`assessment_json.followUpQuestions` holds the open questions (max 2) so the UI re-reads
them instead of regenerating a different set on each visit. Rows written before this field
existed fall back to the single `follow_up_question` column via `followUpQuestionsFromJson()`.

#### Gap evidence rows (no migration required)

The global Evidence bank reuses this table rather than adding one. A supplement is a
gap answer when `tags_json` contains `gap-evidence`; the second tag is the verbatim gap
text. Its `id` is `gap-evidence-<sha1(gapText)>` (`gapEvidenceId()` in
`src/lib/gaps/evidence-id.ts`), so the same gap raised by any number of jobs resolves to
exactly one row and answering it once is enough.

SHA1 of the full gap text is used rather than truncated base64 because evaluator gap
sentences frequently share long opening clauses, which a truncated key would collide on.

Both `/api/gaps/[jobId]` and `/api/gap-evidence` write through this ID, so the job-level
gap panel and the Evidence bank edit the same record.

**`needs_followup` rows are stored here too.** Promotion is no longer gated on
`addressed`: an unfinished answer is still the user's work and belongs in one backlog they
can finish later. This is safe because every resume-generation path filters supplements to
`qualityStatus === "addressed"` (`resume-generator.ts`, `generated-documents/[id]/edit`),
so a parked answer never reaches a generated document.

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
npm run evaluation:benchmark      # capture A–G timing baseline (makes real AI calls)
npm run clay:routine -- <id>      # validate a Clay enrichment routine (spends 1 credit)
npm run document:check    # verify HTML/PDF resume generation
npm run application:check # verify answer generation, status transitions, funnel metrics
npm run quality:check     # run accessibility, contrast, and screenshot checks
npm run data:backup       # SQLite backup → output/backups/
npm run data:export       # JSON export → output/exports/
npm run discover:sources  # discover new job posting sources
npm run gaps:clear-stale-questions -- --dry-run   # preview; omit --dry-run to apply
```

### `gaps:clear-stale-questions`

One-off maintenance for gap follow-up questions written before the "only ask what a
resume needs" rules landed — questions that asked for employers, titles, and dates already
on the resume, ran four or five deep, and were regenerated differently on every visit.

Clears `follow_up_question` and `assessment_json.followUpQuestions` on `needs_followup`
rows in both `job_gap_responses` and `profile_gap_supplements`. **Answer text, quality
status, rationale, and signals are left untouched and no row is deleted.** Each gap is
re-asked properly the next time its answer is saved; until then the UI falls back to a
deterministic scale question via `followUpQuestionsFromJson(..., gapText)`, so no row
renders a "Needs detail" badge with nothing beside it.

Run `npm run data:backup` first. Supports `--dry-run` to report counts without writing.

---

### `evaluation:benchmark`

Captures how the current seven-block (A–G) evaluator performs, so the Fast Evaluation
work in PRD v0.2.1 can be measured against a real baseline instead of an impression.
Writes `docs/benchmarks/evaluation-v1-baseline.md` with wall-clock p50/p90, median
generated-output size, and the per-job samples behind them.

**This makes real provider calls and costs money.** It is never part of `npm test`.
Use `--dry-run` to print the job selection without calling anything, and `--limit=N`
to change the sample size (default 20).

Selection is deterministic — eligible jobs are those with a description of at least
`EVAL_JD_MIN_USABLE_CHARS`, sorted by id and sampled at an even stride. The stride
matters: the alphabetical head of the corpus is dominated by one aggregator's
500-character stubs, and timing those would describe truncated postings rather than a
representative mix.

Not measured: provider token counts and retry counts. The current evaluator writes
`tokens_used` as `0`, and `getActiveProvider()` is called inside `evaluateJobWithAI`,
so the script cannot wrap the provider to count requests without adding an
instrumentation hook to production code. Generated-character size is the stable proxy.

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

## Derived Types — Gap Evidence

Defined in `src/lib/db/types.ts`, built by `src/lib/db/queries.ts`. None of these are
stored; they are derived on read from `evaluations`, `job_gap_responses`, and
`profile_gap_supplements`.

**`GapEvidenceStatus`** — `"addressed" | "needs_followup" | "unanswered"`. The third value
has no database representation: it means an evaluation raised the gap and nothing has been
written for it yet.

**`GapEvidenceEntry`** — one distinct gap anywhere in the pipeline: `gapText`, `status`,
`content`, `followUpQuestion`, `followUpQuestions` (the persisted list, read back from
`assessment_json`), `supplementId`, `jobs` (every role that raised it, for "Raised in …"
links), `updatedAt`.

**`GapEvidenceCounts`** — `needsDetail`, `recurringUnanswered`, `addressed`,
`totalUnanswered`.

**`ResolvedGapResponse`** — one job's gap answer after the bank is filled in behind it.
Adds `fromBank: boolean`, which drives the `↻ From your evidence bank` badge.

### Functions

| Function | Purpose |
|---|---|
| `getAllJobGapResponses()` | Every gap response across all jobs |
| `getGapEvidenceBacklog()` | One `GapEvidenceEntry` per distinct gap, sorted `needs_followup` → `unanswered` → `addressed`, then by role count |
| `getGapEvidenceCounts()` | Headline counts for the Dashboard card and Evidence bank tiles |
| `getResolvedJobGapResponses(jobId, gapTexts)` | A job's answers with bank auto-fill applied |
| `isRecurringGap(entry)` | `entry.jobs.length >= RECURRING_GAP_MIN_ROLES` |

**Merge precedence in `getGapEvidenceBacklog()`:** evaluation gaps establish the entry set;
`job_gap_responses` back-fill content written before evidence went global (newest first);
`profile_gap_supplements` tagged `gap-evidence` overwrite both, being authoritative.
Gap strings of 10 characters or fewer are dropped as evaluation noise.

**Precedence in `getResolvedJobGapResponses()`:** a job-specific answer wins, so tailoring
a gap for one role never leaks to others — *except* when the job-level answer is still
`needs_followup` and the bank's is `addressed`. Without that exception, completing a gap in
the Evidence bank would leave the job page displaying the stale draft it replaced.

**`RECURRING_GAP_MIN_ROLES` (= 2):** how many roles must raise the same gap before it is
worth answering centrally. Evaluators phrase gaps per requisition, so exact-text matching
collapses very little and the raw unanswered pile runs to hundreds of one-off sentences;
those belong on their own job page, not in a global backlog.

---

### application_preparation

The work Fast Evaluation defers (PRD v0.2.1 §29), generated when the user asks for a
resume. One row per job (`unique(job_id)`).

| Column | Holds |
|---|---|
| `jd_hash`, `evidence_hash` | Reuse keys — see below |
| `requirements_json` | Extracted requirements, each with an evidence status and cited evidence ids |
| `keyword_signals_json` | ATS keyword signals — the work Block E used to do at evaluation time |
| `evidence_map_json` | Requirement → evidence → suggested resume placement |
| `posted_compensation_json` | Parsed from the posting only |
| `market_compensation_json`, `compensation_sources_json` | Live research and its citations |
| `compensation_research_status` | `not_run` / `completed` / `unavailable` / `failed` |
| `suggested_compensation_response` | The answer Apply offers, with its provenance stated |

**Hash broadly, use claims narrowly.** `evidence_hash` covers the *global* evidence bank —
active resume text, skill inventory, and every `profile_gap_supplements` row including
unfinished ones — because gap answers are keyed on the gap text, not the job that raised
them. Answering a gap on `/evidence` therefore invalidates every preparation it could
improve. Quality status is part of the hash: an answer moving from `needs_followup` to
`addressed` changes no text but changes whether a resume may use it. Generation then
filters to `addressed` only. A hash scoped to one job would leave the rest stale but
marked fresh.

**Compensation provenance is never inferred.** A model's recollection of salary bands is
not market research. Posted compensation is parsed from the posting; live research runs at
most once via Brave, falling back to the provider's `webSearch`; when neither is available
the status is `unavailable` and no range is stored. The suggested answer then falls back to
the user's saved target and says so.

**Taxonomy ingestion moved here** (§25.3). Saving a preparation links
`job_keyword_concepts` with `source = 'application_preparation'`. Evaluation no longer
contributes keywords at all.

---

### external_integrations

Third-party connections (PRD v0.2.1 §61), one row per provider, seeded with Clay. Kept
separate from `ai_settings` because these are not AI providers: they carry their own
connection state, per-provider metadata, and an `enabled` flag, and JST must keep working
normally when any of them is broken or absent (§63).

| Column | Holds |
|---|---|
| `provider`, `auth_type` | `clay` / `api_key` today |
| `credential` | The raw key. Never returned to a client — see below |
| `account_label` | Workspace or account name, from a successful test |
| `connection_status` | `not_connected` / `connected` / `invalid_credential` / `unavailable` |
| `enabled` | Set only by a successful test; cleared whenever the key changes or a test fails |
| `metadata_json` | Provider details — in Phase 6 this is where the Clay field-catalog cache lives |
| `last_tested_at` | When the connection was last checked |

**Credentials are masked on read.** `getIntegration()` returns `maskedCredential`
(`••••last4`) and a `hasCredential` boolean — there is deliberately no query that hands a
raw credential to a caller that might serialize it. Server code needing the real value
calls `getIntegrationCredential()` explicitly, which is easy to audit. The form echoes the
mask back on submit; `resolveMaskedKey()` reads that as "unchanged" rather than setting the
key to a row of bullets. Same practical model as the existing AI provider keys: stored
locally in the clear, never logged, only sent to the intended provider — **not** encryption
at rest, and not described as such (§62).

**Clay endpoint, verified 2026-08-18.** `GET https://api.clay.com/public/v0/me` with a
`clay-api-key` header, returning `{ user: { id, name }, workspace: { id } }`
([reference](https://developers.clay.com/api-reference/me/get-the-authenticated-user)).
Note `public/v0`, not `v1` — the wrong base returns 404, which the client reports as
*Clay unreachable*. The credential must be a **scoped** key (`clay_scoped_…`, Public API
scope) despite the docs specifying a personal key; the personal key returns 401. Only 401/403 is treated as a rejected key, so an API move can never be
mistaken for a bad credential, or vice versa.

**Saving is not connecting.** Storing a key clears `connection_status`, so a stale
"connected" badge cannot outlive the credential that earned it. Saving immediately runs a
test, and only a successful one sets `enabled`.

---

### contacts, job_contact_links, contact_suppressions

Real people around an opportunity (PRD v0.2.1 §36–§38). **Contacts are global; relevance is
per-job.** The same person can matter for several roles, so identity lives on `contacts`
and judgement — role, relevance score and reasons, outreach status — lives on
`job_contact_links`, unique per `(job_id, contact_id)`. A contact marked `Contacted` for one
role stays `Found` for another.

This is the first third-party PII in JST: names, titles, work emails and LinkedIn URLs of
people who never interacted with the app. Deletion and suppression are part of the schema
from the first release rather than a later addition.

**Deduplication** follows §37's priority — provider + record id, then normalized LinkedIn
URL, then normalized work email. Enforced by *partial* unique indexes so the many contacts
legitimately lacking an email or a LinkedIn URL do not all collide on the empty string.
LinkedIn normalization strips scheme, `www`, locale prefixes, trailing slashes, query
strings and case down to `linkedin.com/in/<slug>`, so four spellings of one profile do not
become four people. On update, a blank identifier never overwrites a known one — a thinner
source cannot erase what a richer one established.

**Delete vs Forget** are different promises:

| Action | Effect |
|---|---|
| Remove from this job | Drops the `job_contact_links` row; the person stays in your contacts |
| Delete contact | Deletes the person and cascades their links and outreach messages. A later search may legitimately find them again |
| Forget this person | Deletes as above **and** records one-way fingerprints so a later search recognises and discards them |

**`contact_suppressions` stores hashes only.** The point of forgetting is that JST stops
holding someone's details, so keeping the identifier in order to recognise it later would
defeat the request. Each is a SHA-256 of a type-prefixed identifier (`clay:…`,
`linkedin:…`, `email:…`) — recomputable from a future search result and comparable, but not
reversible into an email address or a name. One row per identifier, so *any* of them
suppresses. Verified: after forgetting a contact, the table contains no substring of their
name, company or profile URL.

**Clay search, verified 2026-08-18 against a live account.** Structured-filters mode:
`GET /search/filters-mode/fields?source_type=people` for the catalog,
`POST /search/filters-mode` to create a search, `POST /search/filters-mode/{id}/run` to
read results. People results carry `latest_experience_title`,
`latest_experience_company` and `url` — *not* `title`, `company` or `linkedin_url`, and
there is no stable record id, so dedupe falls to the normalized LinkedIn URL. The field
catalog is cached in `external_integrations.metadata_json` with a 24-hour TTL, a 7-day
stale fallback when Clay is unreachable, and a single invalidate-refetch-retry when a
filter name is rejected. `has_more` is deliberately ignored: the run endpoint is a stateful
iterator and continuing would spend more allowance than the user asked for.

**Why not Clay MCP?** Clay exposes an MCP server with its own find-and-enrich tools, which
would remove the need to author a routine. It was evaluated on 2026-08-18 and not adopted:
Clay states tools over MCP "consume the connected workspace's credits at the same rate as
the equivalent work done inside Clay — there is no surcharge for arriving over MCP", so it
saves nothing on a metered plan, while requiring OAuth 2.0 + PKCE with Dynamic Client
Registration and hourly token refresh — the session complexity §83 deferred. The API key
plus a user-authored routine costs the same credits with far less machinery. Revisit only
if the routine setup proves to be a real barrier, not as a cost measure.

**Enrichment is routine-based, not an endpoint.** Clay exposes no per-person enrichment
call; `POST /routines/{routine_id}/run` executes a routine the user authored in their own
workspace, asynchronously (202 + poll). The routine id lives in
`external_integrations.metadata_json.enrichmentRoutineId`. Because the routine's output
shape is defined by the user rather than by Clay, the response is walked for the first
value that looks like an email rather than bound to a field name. Results are stored with
`email_confidence = 'unverified'` — Clay reports no confidence for routine output, and
inventing a "verified" label would be worse than none.

`metadata_json` also carries `autoEnrichSearchResults`. The routine endpoint accepts 1-100
items, so automatic enrichment issues one run for the whole result set; results are keyed by
item id so an email lands on the right person even if the routine returns them out of order
or omits some. Enabling it is blocked without a routine id, which would otherwise silently
do nothing.

### story_bank provenance

`story_bank.source_block_f` records where a story came from. The column keeps its original
name — renaming it would be a data migration for cosmetics — but the TypeScript field is
`storySource`, and its values were never Block-F-specific:

| Value | Meaning |
|---|---|
| `interview-prep` | Written in the interview workspace (the current producer) |
| `voice-practice` | Captured from a practice attempt |
| `evaluation` | Proposed by the retired seven-block evaluator; historical only |

Fast Evaluation produces no stories, so nothing writes `evaluation` any more. Existing rows
keep their value and their `story_kind = 'evaluation_suggestion'`, so the Story Bank's
**Job suggestions** filter still resolves — it simply stops gaining new entries.

### outreach_messages

Drafts written to one person about one opportunity (§51). Keyed on
`job_contact_link_id` rather than `job_id`, because the same contact receives a different
message for a different role. Cascades from `job_contact_links`, so deleting or forgetting
a contact takes their drafts with them.

`channel` is one of `linkedin_connection`, `linkedin_message`, `email`. Length targets and
soft limits live in `src/lib/outreach/channels.ts` — §55 warns against encoding a third
party's changing limits as permanent product assumptions, so LinkedIn's ~300-character
connection-note cap is a *warning threshold* that drives a character count, never silent
truncation. Only email carries a subject.

One draft per contact per channel: regenerating replaces it rather than accumulating
variants. The legacy `outreach_drafts` table remains readable as "Previous generic drafts"
(§52); no fake "Hiring Manager" contacts were manufactured to migrate those rows.

Contacts render in the job workspace's Outreach tab; the standalone `/jobs/[id]/outreach`
route is kept as a redirect for existing links.

Clearing the list from Settings → Integrations lets those people be added again. It
restores nothing — their details were deleted, not archived.

---

## Derived Types — Effective Keywords

`resolveEffectiveKeywordSignals()` in `src/lib/evaluation/effective-keywords.ts` is the
single answer to "which keywords describe this job?" (§25.1), with
`getEffectiveKeywordSignals(jobId)` / `getEffectiveKeywords(jobId)` in `queries.ts` loading
each tier:

1. Application Preparation signals — the current source for `fast-v2` jobs
2. Legacy evaluation keyword signals — jobs evaluated under A–G
3. Legacy evaluation keywords, normalized through `legacyKeywordSignals()`

It began as a private helper inside `resume-generator.ts` while four other places read
`evaluation.keywords` directly, each with slightly different fallback behavior. Resume
tailoring, the resume editor, story matching, story creation from a job, taxonomy
ingestion and the AI tailorer all resolve through it now.

**Tier 3 is skipped when there are no legacy keywords.** Normalization always appends the
exact job title as a critical keyword, which is right when there are keywords to normalize
and wrong when there are none — a `fast-v2` job would otherwise resolve to a title-only
signal, which reads downstream as "this job has keywords" and causes its taxonomy links to
be replaced by a thin title-and-archetype set.

**Linking never replaces rich links with thin ones.** `linkJobKeywordConcepts()` clears a
job's rows before inserting, so the three story-matching call sites now link richly when
keywords exist, seed title and archetype only when the job has no links at all, and
otherwise leave what is there untouched.

---

## Derived Types — Fast Evaluation

Defined in `src/lib/db/types.ts` for PRD v0.2.1 Phase 1. The deterministic half is
implemented in `src/lib/evaluation/fast-evaluation.ts`, which is pure — no database, no
provider, no clock.

The contract is deliberately **split in two** so the model never owns a value JST intends
to calculate itself:

**`FastEvaluationModelOutput`** — what the provider returns. Component scores
(`fitComponents`), `directionAlignment` plus its rationale, observations (`strengths`,
`gaps`, `redFlags`, `requirementMatches`), and `hardBlockerCandidates`. It contains no
final `fitScore`, no `recommendation`, no `confidence` and no `scoreLabel`.

**`FastEvaluation`** — what is persisted. Extends the model output with the four values
JST derives, plus validated `hardBlockers`, `completenessWarnings`, and
`evaluationVersion: "fast-v2"`.

Supporting types: `DirectionAlignment` (`strong | partial | none`), `FitComponents`,
`EvidenceMatch`, `Gap`, `RequirementMatch`, `RequirementSummary`, `HardBlockerKind`,
`HardBlockerCandidate`, `HardBlocker`, `FastEvaluationRecommendation`,
`EvaluationConfidence`, `EvaluationScoreLabel`.

### Deterministic functions

| Function | Purpose |
|---|---|
| `clampFitComponents(raw)` | Clamp each component into its own range (40/25/20/15); non-numeric → 0 |
| `calculateFitScore(components)` | Sum the four components — the only place a total is produced |
| `deriveScoreLabel(fitScore)` | Compatibility label for the existing `score_label` column |
| `validateHardBlockers(candidates)` | Keep only candidates with explicit evidence on both sides |
| `deriveRecommendation({fitScore, directionAlignment, hardBlockers})` | Ordered rules, blockers first |
| `deriveConfidence({postingResolved, jdChars, evidenceChars, sourceIntegrityWarning})` | Ordered rules ending in an unconditional `Medium` |
| `normalizeModelOutput(raw)` | Split a provider response into core-valid or missing-core |

**Why the split.** A model-supplied total can disagree with the components shown beneath
it, and re-running can change a verdict the user already acted on. Deriving both from the
components makes the stored row and the UI agree by construction.

**`Blocked` vs `Skip`.** These are different answers and both exist.
`Blocked` means a saved non-negotiable rules the role out however well the candidate
scores; `Skip` means nothing blocks it but fit is below the pursue threshold. Collapsing
them would tell a 92%-fit candidate they were unqualified. Code that treats "not `Skip`"
as positive must be updated to handle `Blocked` separately.

**Blocker validation.** A blocker needs explicit evidence from the posting *and* an
explicit saved constraint. A candidate missing either half is an inference and is dropped
outright — not downgraded to a red flag, which would smuggle the guess back in.

**Confidence describes source quality, never candidate quality.** The rules are ordered
and terminate in an unconditional `Medium`, so every input lands in exactly one state.
Thresholds live as named constants (`EVAL_JD_HIGH_CHARS` = 800,
`EVAL_JD_MIN_USABLE_CHARS` = 300, `EVAL_EVIDENCE_HIGH_CHARS` = 500,
`EVAL_EVIDENCE_MIN_USABLE_CHARS` = 200) and are implementation values, not product
promises.

**Core vs optional fields.** `roleArchetype`, `directionAlignment` and all four components
decide whether an evaluation exists at all. Everything else degrades to an empty value and
records a `completenessWarnings` entry, so one malformed array no longer costs the user the
whole evaluation the way a failed block used to.

**`requirementSummary` is recounted**, never taken from the model. The tally drives the
"8 supported · 2 partial · 1 unknown" line, and a count that disagrees with the list
beneath it is worse than no count.

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
