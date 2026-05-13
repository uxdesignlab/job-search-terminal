# Features

This document describes every feature in the current application. Use it as a
reference for what the app does and how each section works.

---

## Navigation

The Shell header provides two navigation groups:

**Primary nav** (always visible): Dashboard · Jobs · Applications · Interview Prep · Analytics · Resumes

**Account dropdown** (hover on "Account"): Profile · Strategy · Settings

**Help link** appears immediately after Account and opens the in-app help site at
`/help`.

The Account menu shows a live AI provider health dot:
- Green: active provider has a key configured
- Yellow: a key exists but the active provider's key is missing
- Red: no AI keys configured at all

The app redirects `/` to `/dashboard` on load.

---

## Help Site `/help`

The in-app help site is a self-service documentation surface for open-source
users. It is designed as a mini website inside the product, with a landing page,
search, workflow cards, a persistent documentation sidebar, screenshots, related
guides, and per-topic pages.

**Help home:**
- Hero with product screenshot and calls to start the guide or open the resume
  and ATS guide.
- Search across all help pages.
- Workflow groups for setup, profile, jobs, applying, tracking, interview prep,
  privacy, and troubleshooting.

**Guide pages:**
- `/help/getting-started` — setup, onboarding, and daily workflow.
- `/help/ai-providers` — how to create and add OpenAI, Anthropic, or Google
  Gemini API keys, test the provider, and protect keys.
- `/help/resume-lanes` — resume lanes, resume upload, ATS-friendly formatting,
  PDF guidance, and bullet quality.
- `/help/job-search` — dashboard scans, job sources, manual job entry, filters,
  and saved presets.
- `/help/linkedin-scanner` — Claude/Codex browser-board scanning for LinkedIn,
  Wellfound, and Work at a Startup; imports, duplicates, limits, and safety notes.
- `/help/evaluate-tailor` — evaluation, tailored resume generation, PDF export,
  application answers, research, and outreach drafting.
- `/help/applications` — statuses, table and kanban tracking, follow-ups, and
  archive vs. delete behavior.
- `/help/interview-prep` — STAR stories and voice practice.
- `/help/privacy-data` — local data, AI-provider data flow, backups, and safety
  boundaries.
- `/help/troubleshooting` — common setup, AI, resume/PDF, scan, and LinkedIn
  fixes.

The help content is sourced from `src/lib/help/content.ts` and rendered through
the shared help components under `src/components/help/`.

---

## Dashboard `/dashboard`

The command center. Has two states depending on setup progress.

**First-run onboarding** (shown until setup is complete and dismissed): Opens as
an isolated dashboard modal so the user can finish setup without leaving the
flow. Closing before completion shows a warning that the app will fail to
generate useful matches, resumes, and answer drafts until setup is finished.

The modal has 4 gated steps:

1. **AI provider** — saves one OpenAI, Anthropic, or Google Gemini API key inline.
2. **Resume lanes** — uses the normal multi-lane resume upload cards. Uploading a
   PDF seeds desired positions and positive title filters from extracted resume
   titles, and AI extraction can enrich the full profile.
3. **Job preferences** — requires the user to review and explicitly save desired
   positions, include/exclude title filters, and location work modes. Resume
   upload or extraction may prefill these values, but the step does not become
   complete until the user confirms them.
4. **Ready** — explains the next operational steps: review scan sources in
   Settings, run Scan for new jobs on the Dashboard, then review and evaluate
   imported matches.

The normal dashboard and scan button are gated until an AI key exists, at least
one resume lane has extracted text, and job preferences have been confirmed.

**Normal dashboard** (after full setup):

- **Stat cards** — priority matches, applications sent, new jobs this week (from
  scans vs. manually added).
- **Action queue** — two lists: "Apply next" (high-score jobs not yet applied to)
  and "In flight" (active applications: interviewing, follow-up needed). Each card
  shows company, title, fit score, and recommended next action.
- **Latest scan card** — companies scanned, new jobs found, duplicates skipped,
  status badge. Per-source error list with inline "Disable source" button.
- **Recent activity log** — timestamped list of user actions.
- **Scan for new jobs** button in page header (hidden for new users).

---

## Jobs `/jobs`

The full job pipeline. Lists every discovered job with filtering, preference
status, posting maintenance, and bulk tools.

**Features:**
- Fit score badge, status badge, freshness label, and role archetype per row.
- Sort by fit score, date, company, preference, or workflow status.
- Filter by workflow status, preference status, score range, location, company,
  recommendation, posted date availability, and added date availability.
- The last sort and filter settings are restored automatically on the next
  visit; named presets are still available for recurring review modes.
- **Preference column** — shows `Match` when a job still fits the current
  profile preferences and constraints, or `Out of scope` when saved preferences
  have changed and the job no longer fits. This is a derived display/filter
  value, not a separate stored job status.
- **Posted column** — shows a short `MM/DD/YY` when a real posted date is known;
  the cell is left empty when there is no date or the stored value is not a
  parseable calendar date (no em dash or placeholder text).
- Text search across company and title.
- Bulk operations: change status on multiple jobs, archive, or delete in bulk.
- Marking a job **Skipped** (individually or in bulk) removes it from this list
  immediately — it is auto-archived and moves to the Archived page.
- Bulk delete asks for confirmation. If selected jobs have user activity, the
  confirmation warns before deleting.
- Maintenance tool to verify posting liveness, confirm deletion for expired
  untouched jobs, and identify active jobs whose titles no longer match saved
  title filters. Out-of-scope cleanup only bulk-deletes untouched jobs; jobs with
  user activity must be removed through explicit selected-job actions.
- Add job manually via modal (paste URL or fill in details). Jobs added this
  way are stored with `source = 'manual'` and display a **Manual** badge in
  the Source column.
- **Column filters** — click any column header to open a sort + multi-value
  checkbox filter dropdown. Active filters show a count summary ("X of Y jobs")
  with a "Clear all filters" link.
- **Saved filter presets** — name and save up to 5 filter+sort combinations as
  reusable chips above the table. Presets are persisted to the database and
  survive page reloads. Click a chip to re-apply; click × to delete.

---

## Job Detail `/jobs/[id]`

Tabbed view for a single job. Four tabs:

### Overview tab
- Company, title, location, remote type, ATS source, freshness.
- Fit score, recommendation badge, role archetype.
- Match rationale, main concern, salary notes.
- Requirement match table showing which JD requirements the profile covers.
- Gap list: requirements not yet addressed.
- Red flags list.
- **Job description** — collapsed panel showing the saved description text.
- **Edit job details** — collapsed form to overwrite position, company, job posting
  URL, and job description without creating a duplicate record. Useful when LinkedIn
  or other scanner sources capture only partial metadata. All four fields are
  pre-filled with the current values. A reminder to re-run evaluation is shown
  after saving, since any description change makes the existing AI analysis stale.

### Analysis tab
- Run evaluation: triggers AI streaming evaluation with real-time output.
- Evaluation sections: strengths, gaps, red flags, resume recommendation,
  keyword list, legitimacy signal.
- User correction: override the AI recommendation and score with a note.
- Provider and model metadata for the last evaluation run.

**AI evaluation data sources (all fed into the analysis):**
- Full job description (up to 6,000 characters — captures required qualifications
  that appear deep in the posting).
- Candidate profile: goal, urgency, direction, compensation needs, work preferences,
  target roles, deal breakers, constraints.
- Skill inventory (up to 30 skills with strength level and evidence source).
- Role strategy (role-fit scores and rationale from the profile).
- Active resume excerpts (up to 2 resumes × 1,800 chars each) — ensures Block B
  CV-match assessment and proof-point citations are grounded in actual resume text,
  not inferred from skill abstractions alone.

**ATS keyword extraction (Block E):**
- Extracts 10–15 keywords from the job posting.
- Each keyword carries a priority (`required` or `preferred`) based on which section
  of the JD it appears in, and a category (`technical`, `soft`, `domain`, `tool`,
  `methodology`).
- Keywords are stored in priority order (required first) and used during resume
  tailoring to rank emphasis decisions.

### Resume tab
- Generate tailored resume for this job: picks best base resume, produces
  HTML and PDF output with tailoring summary and keyword coverage %.
- Resume draft editor: edit the tailored resume before export.
- Keyword coverage progress bar.
- Download PDF button.

**Tailored resume AI context:**
- Source resume full text (up to 5,000 chars) — the AI must verify every keyword
  and strength against this text before using it.
- Evaluation keywords in priority order (required first, then preferred).
- **Missing keywords** — keywords absent from the pre-AI source draft are identified
  before the AI call and passed as a separate priority list so the AI knows exactly
  which terms to weave in where the source resume provides supporting evidence.
- **Job-specific gaps and red flags** — the evaluation's `gaps` (up to 5) and
  `redFlags` (up to 3) are included so the AI tailors content to address the
  specific shortfalls identified for this position, not just generic keyword coverage.
- Evaluation strengths (top 4) as suggested emphasis signals.
- Gap responses — user-supplied notes addressing identified experience gaps.
- Profile supplements — any extra context the user has added.
- Gap answer quality checks — vague gap responses and supplements are saved as
  drafts with a follow-up question, and only confirmed answers are used during
  resume tailoring.
- Job description excerpt (up to 3,000 chars) — allows the AI to verify keyword
  context and understand requirement weight, not just the extracted keyword list.
- Skills preference flags — skills the user wants to emphasize or de-emphasize
  (derived from `use_more` / `use_less` preference on each skill record).

**Keyword coverage metric:**
- For each evaluation keyword, first tries an exact phrase match in the resume text; if that
  fails, splits the keyword into significant words (stripping stop words and single-character
  tokens), then checks whether any of those words appears in the resume. This word-level
  fallback handles multi-word phrases like "agile methodologies" or "Healthcare SaaS" that
  the LLM evaluator commonly produces. Specific acronyms (HIPAA, HL7, FHIR) still require an
  exact match and correctly flag as gaps when missing.
- Displayed as a percentage on the edit-draft page subtitle and is recomputed live from the
  current evaluation keywords each time the page loads (not cached from generation time).
- Color-coded threshold: green ≥ 70% (target), orange 40–69%, red < 40%. The target label
  "(target: 70%+)" appears when coverage is below 70%.

### Apply tab
- Prepare application answers: paste common or custom application questions,
  generate AI answers for copy-paste. App never auto-submits anything.
  - Pressing **Prepare answers** opens a blocking progress modal ("Drafting
    answers grounded in your resume and evaluation…") while the request is in
    flight, mirroring the resume generator modal. The modal closes
    automatically when drafts are ready and shows an inline error dialog with
    a Close button if generation fails (questions are preserved).
  - After answers return, the question inputs reset to a single empty row and
    the drafts list refreshes in place — no page reload is required to submit
    another batch of questions.
- Application status selector: move the job through the 11-status funnel.
- Follow-up date picker.
- Contact field.

**Sub-pages from Job Detail:**

### Research `/jobs/[id]/research`
AI-generated company intelligence:
- AI strategy and product direction
- Recent company movements (hiring, layoffs, expansions)
- Engineering / design culture
- Technical and organizational challenges
- Candidate positioning angle

### Outreach `/jobs/[id]/outreach`
Generate a recruiter or hiring manager outreach message tailored to the job and
user profile. Shows character count. User copies the message manually.

---

## Applications `/applications`

Application funnel tracker with two view modes:

- **Table view** — sortable list of all active applications with status, company,
  role, score, follow-up date, and overdue indicator.
- **Kanban view** — drag-and-drop board organized by status column.

**Features:**
- Follow-up overdue alerts (highlighted when past the follow-up date).
- Status transition buttons inline in each row.
- Filter by status, overdue, or company.
- Column filters and saved filter presets (same system as the Jobs table).
- Summary funnel metrics at the top: applied, in progress, responded, interviewing.

---

## Archived `/archived`

Jobs that have been manually archived or skipped.

- Table of archived jobs with original score and archival date.
- Column filters and saved filter presets on the archived jobs table.
- Restore action: move a job back to active.
- Delete action: permanently remove the job and all associated records.

**Auto-archive on skip:** marking a job as **Skipped** automatically moves it to
the archive. The job leaves the active pipeline immediately — it will no longer
appear on the Jobs page or the Dashboard action queue. It remains visible on the
Archived page and can be restored at any time.

---

## Resumes `/resumes`

Resume studio showing all resume lanes and generated documents.

**Two sections:**

**Base resumes** — the source PDF lanes uploaded by the user, or resumes built
from scratch inside the app. Each lane represents a different career angle
(e.g., "Leadership", "IC / Individual Contributor", "Domain Specialist"). The
app ships with five default lane names that can be renamed; new lanes can be
added at any time.

Each lane shows extraction status, word count, and resume-builder approval
state. Existing uploaded resumes are backfilled from stored extracted text, so
current users do not need to upload them again.

The `/resumes` page uses the same dashboard table pattern as the Jobs page on
desktop, with compact cards on smaller screens. The table shows lane name,
builder status badge, source word count, extraction date, and an action button.
Each lane has a direct **Review and approve** or **Edit approved version** action
that opens the builder.

**Create new resume** button appears in the page header on `/resumes` and in the
Resumes tab of `/profile`. Clicking it creates a new blank lane with starter
sections (Contact, Summary, Experience, Skills, Education) pre-populated and
immediately opens the Resume Builder.

### Resume Builder `/profile/resumes/[id]/builder`
Structured source editor for each resume lane — works for both PDF-extracted and
from-scratch resumes:
- Parses the uploaded resume into editable sections, or starts from blank
  starter sections when the lane was created from scratch.
- Preserves custom sections such as Recognition when detected.
- Supports editing, adding, removing, renaming, and reordering sections.
- **Add section menu** — dropdown picker with section types: Summary, Key
  Achievements, Experience, Skills, Awards & Recognition, Education, Custom.
- **Add role / Add entry** buttons inside Experience and Education sections to
  append additional entries without leaving the section.
- **✨ Improve with AI** — available on Summary, Key Achievements, Skills,
  Awards & Recognition, Experience bullets, and Custom sections. Sends the
  section content to the active AI provider, which returns an improved version.
  The suggestion is shown inline with **Accept** and **Discard** buttons; the
  original is preserved until the user accepts.
- Helpful placeholder text in every input guides users building from scratch.
- Uses the same split editor/preview layout as the generated resume editor, so
  source edits can be checked against the rendered resume while reviewing.
- Saves a draft or approves the lane version used by job-specific generation.
- **Remove button** in the builder header — deletes the resume lane from the
  system after inline confirmation ("Delete this resume? / Yes, delete / Cancel").
  Available for all resumes, not just new ones.
- **Back button** — navigates to `/resumes`. For newly created (unsaved) resumes,
  clicking Back shows a leave confirmation dialog with four choices:
  - **Save draft and leave** — saves the current state as a draft, then navigates away.
  - **Delete and leave** — permanently deletes the resume lane.
  - **Leave without saving** — navigates away without saving (lane is kept but blank).
  - **Keep editing** — dismisses the dialog and stays on the page.
  The browser's native `beforeunload` prompt also fires if the user tries to close
  the tab or navigate directly while a new resume has not yet been saved.

The HTML resume template renders experience entries with the organization and
location left-aligned and the date range right-aligned on the same line, matching
standard resume layout conventions.

**Generated documents** — tailored resumes produced for specific jobs:
- Table showing job, lane used, keyword coverage %, generation date, and status.
- Column filters and saved filter presets on the generated documents table.
- Links to preview HTML and download PDF.
- Delete document action.

### Resume Editor `/generated-documents/[id]/edit`
Full draft editor for a tailored resume before exporting to PDF:
- Edit generated sections: summary, experience bullets, skills, recognition,
  and custom sections carried from the approved lane.
- Keyword coverage tracker updates as you edit.
- Save draft and regenerate PDF buttons.

### Resume Preview `/generated-documents/[id]/preview`
Read-only HTML preview of the tailored resume.

---

## Interview Prep `/interview-prep`

Tools to prepare for interviews using stored experience.

**STAR story bank:**
- Add stories manually or transcribe from voice recording.
- Each story has: title, situation, task, action, result, reflection.
- Tag stories with skills and themes.
- Stories can be linked to a specific job for context.

**Voice practice:**
- Record a spoken answer using the browser microphone.
- AI transcribes the answer using Whisper (OpenAI) or Gemini.
- AI parses the transcription into STAR structure.
- Save the parsed story to the story bank.

---

## Profile `/profile`

Career profile editor. The profile is the foundation for all evaluations and
resume tailoring. The page is split into **six tabs**, navigated via URL
(`?tab=<id>`), each with its own save action.

The AI extraction card is always visible on the Overview tab as a 2-step flow.
Step 1 shows active (blue) when no PDF has been uploaded, and green ✓ once a PDF
is ready. Step 2 (Extract button) is disabled until Step 1 is complete. The
Resumes tab shows an upload banner when no extracted resumes exist.

### Tab: Overview (`?tab=overview`)
- Summary card: name, current search goal, location, portfolio, urgency, direction.
- **AI profile extraction card** — 2-step flow: Step 1 (upload) shows active/✓
  state; Step 2 (Extract with AI button) is disabled until at least one resume
  PDF is uploaded. Runs AI extraction on all uploaded resumes and populates
  skills, role directions, and experience automatically.
- Edit form: current search goal, search direction, urgency (select), career
  intent, career change interest, confidence level.

### Tab: Resumes (`?tab=resumes`)
- **Upload banner** (shown when no extracted resumes exist): instructs the user to
  upload a PDF, then go to Overview to run extraction.
- **Resume lanes card** — each lane is a different resume version. Per-lane actions:
  - **Upload PDF** (blue solid button): shown when the lane has no PDF; opens file
    picker, uploads and auto-extracts text.
  - **Replace PDF** (outlined button): shown when the lane already has content;
    replaces the file and re-extracts.
  - **Edit resume** / **Edit approved version** (text link): always shown for
    every lane; opens the Resume Builder for that lane.
  - **Remove** (text link): always shown for every lane; deletes the entire resume
    lane after inline confirm ("Remove this resume? / Yes, remove / Cancel"). This
    replaces the old PDF-only removal behavior — the lane itself is deleted.
  - **Rename** (✎ pencil icon): inline rename with keyboard support (Enter saves,
    Escape cancels).
- **Add resume (PDF)** button at the bottom of the lanes list: creates a new
  empty lane named "New Resume". User then renames it and uploads a PDF.
- **Create new resume** button: creates a blank lane with starter sections
  (Contact, Summary, Experience, Skills, Education) and opens the Resume Builder
  immediately — no PDF required. User types or pastes their content directly.
- **Skill inventory card** (shown only after at least one AI extraction): lists
  extracted skills with category and evidence source.

### Tab: Skills & Roles (`?tab=skills`)
- Read-only badge displays for: strongest skills (from AI extraction), skills to
  use more, skills to use less, target roles.
- Edit form: target roles (one per line), skills to use more (one per line),
  skills to use less (one per line).

### Tab: Preferences (`?tab=preferences`)
- Summary cards: location mode, compensation, desired industries, preferred
  locations.
- Edit form: location mode checkboxes (`Remote`, `Hybrid`, `On-site`),
  preferred locations, desired industries, compensation needs, and free-form
  work preferences.
- Preferred locations use a city lookup field backed by OpenStreetMap
  Nominatim. The selected saved value should include city, state/region when
  available, and country, for example `Nashville, Tennessee, United States` or
  `Minsk, Belarus`. Each saved place displays as one label; legacy split values
  such as `Nashville`, `Tennessee`, `United States` are normalized back into one
  preferred-location label.
- Work preferences are reserved for non-location preferences such as `small
  team`, `async-first`, or `mission-driven`; location modes are stored
  separately.

### Tab: Constraints (`?tab=constraints`)
- Read-only list of current constraints and deal breakers.
- Edit form: constraints (soft limits, one per line), deal breakers (hard-no
  conditions flagged as red flags in evaluations, one per line), career change
  interest.

### Tab: Writing Voice (`?tab=voice`)
- Displays the current tone profile if already extracted (tone, formality,
  sentence style, style guide).
- Form to paste 2–5 writing samples (emails, cover letters, LinkedIn posts)
  separated by `---`. Submitting runs AI style extraction and saves the tone
  profile. Used to match AI-generated content to the user's authentic voice.

---

## Strategy `/strategy`

Role-fit map derived from the profile and skill inventory.

- **Direct fit** roles: score ≥ 80, strong evidence across the profile.
- **Adjacent** roles: score 60–79, achievable with some positioning.
- **Selective** roles: score 40–59, situational fit depending on the company.
- **Avoid** roles: score < 40, significant gaps or misalignment.

Each archetype shows a score, rationale, and gap list. The user can edit the
classification or rationale to correct AI judgments.

The page has two tabs:

- **Strategy** (default) — role-fit map, search focus, how-to-use guide, and evaluation corrections.
- **AI Prompts** — prompt overrides for resume tailoring, application answers, and outreach. Prompt overrides are stored locally and can be reset to the app defaults; locked resume-safety rules remain enforced in code.

---

## Analytics `/analytics`

Search performance metrics drawn from actual evaluation and application data.

**Charts and metrics:**
- Score-to-outcome correlation: do high-score jobs convert to interviews?
- Archetype performance: which role types get the most responses.
- Remote policy conversion: how remote / hybrid / onsite jobs track through the funnel.
- Gap coverage: what percentage of evaluated gaps have been addressed.
- Application funnel conversion rates.

---

## Settings `/settings`

Three configuration tabs:

### AI Providers
- Set active AI provider: Anthropic (Claude), OpenAI (GPT), or Google (Gemini).
- Enter API keys for each provider.
- Select model per provider.
- Set optional fallback provider.
- Test connection to verify the key and model work.

### Job Sources
- All configured sources appear in a unified table — companies from
  `portals.example.yml` and any manually added sources are treated equally.
- Enable or disable individual sources (disabled sources are skipped on the
  next scan).
- Column filters and saved filter presets on the sources table.
- Sources from `portals.example.yml` cannot be removed (they reload from the
  config file); manually added sources have a Remove button.
- Add any company by pasting its careers page URL — Greenhouse, Ashby, and
  Lever are auto-detected.
- "Scan for new sources" discovers additional Greenhouse boards automatically.

### Preferences
- Edit title include / exclude filters.
- Add profile supplements for gap filling. Supplements are checked for concrete
  role, project, action, and outcome detail before they are treated as confirmed
  resume-tailoring context.
- Adjust other search preferences.

---

## AI Capabilities

The app supports three AI providers interchangeably:

| Provider | Default model | Used for |
|---|---|---|
| OpenAI | `gpt-5.4-mini` | Evaluation, answers, outreach, research, transcription |
| Anthropic | `claude-sonnet-4-6` | Evaluation, answers, outreach, research |
| Google Gemini | `gemini-2.5-flash` | Evaluation, answers, outreach, research, transcription |

The active provider is set in Settings. If the active provider fails, a fallback
provider can be configured. All AI calls use the `src/lib/ai/` provider
abstraction with retry logic.

**AI-powered features:**
- Job fit evaluation (streaming, real-time output)
- Resume tailoring
- Application answer generation
- Company research
- Outreach message drafting
- Profile extraction from PDF
- STAR story transcription and parsing
- Gap response polishing
- Writing style extraction

---

## Job Scanning

The scanner discovers new jobs from ATS APIs (Greenhouse, Ashby, Lever) and
custom URLs configured in Settings.

**How a scan works:**
1. User clicks "Scan for new jobs" on the Dashboard.
2. The scanner queries each enabled source for open roles.
3. Title filters remove irrelevant roles.
4. Profile location and remote preferences remove listings outside the user's constraints.
5. Duplicate URLs are skipped.
6. New jobs are written to the `jobs` table with `status = found`.
7. A `scan_runs` record is created with metrics.
8. The Dashboard updates with the scan summary.

The Jobs page can also verify whether saved postings still exist. The liveness
check updates `liveness_status` but does not automatically archive or delete
anything. Expired jobs with no user activity are shown for confirmation before
deletion. Jobs with activity, such as reviewed, skipped, resume-generated, or
applied jobs, are kept unless the user explicitly selects and deletes them.

The Jobs table also re-checks current profile preferences at render time and is
refreshed after Preferences or Constraints are saved. Jobs that still fit show
`Match` in the Preference column; jobs that no longer fit show `Out of scope`.

Location matching uses the selected Location mode checkboxes:
- `Remote` includes all remote opportunities, even if the posting mentions a
  region outside the preferred locations.
- `Hybrid` includes hybrid opportunities only when the posting location matches
  one of the preferred locations.
- `On-site` includes on-site opportunities only when the posting location
  matches one of the preferred locations.

**Configuration:**
- Built-in sources: enable/disable per company in Settings → Job Sources.
- Custom sources: add any careers page URL.
- Title filters: positive list (must match) and negative list (exclude if matched).
- Profile filters: selected location modes and preferred locations constrain
  scan inserts.

---

## Browser Job Board Scanner (Claude and Codex Integration)

An optional feature for users with Claude Desktop or Codex Chrome. An agent browses visible job-board results on your behalf and writes discovered jobs directly into Job Search Terminal — no copy-paste required. Supported browser-board sources are LinkedIn, Wellfound, and Work at a Startup.

**How it works:**
1. Ask Claude or Codex to scan LinkedIn, Wellfound, or Work at a Startup
2. The agent reads your target roles and location preferences from the JST database
3. The agent opens the requested board in Chrome and extracts matching visible postings
4. A JSON file is written to `data/job-board-imports/` (`data/linkedin-imports/` remains supported for legacy LinkedIn files)
5. Job Search Terminal detects the file, imports jobs with duplicate detection, and shows a notification

**UI indicators on the Jobs table:**
- **LinkedIn**, **Wellfound**, or **Work at a Startup** badge (neutral gray) — source column — identifies jobs discovered via browser-board scans
- **Manual** badge (neutral gray) — source column — identifies jobs added manually via the Add Job modal
- **Duplicate** badge (amber, clickable) — flagged jobs whose URL or company+title already existed in the database. Clicking the badge instantly filters the table to show only duplicate-flagged jobs. Clicking again clears the filter.
- **Source** column — filterable and sortable; options are "LinkedIn", "Wellfound", "Work at a Startup", "Manual", and "Scanner"

**URL behavior:** Browser-board imports prefer a visible job-specific employer/ATS apply URL. If one is not available, the platform job URL is used and preserved as provenance.

**Duplicate detection:** Jobs are marked as possible duplicates (not dropped) when their original posting key, URL, or company+title+location matches an existing record. The user can review and act on flagged jobs normally.

**Import notification:** A fixed-bottom green alert appears on the Jobs page within 30 seconds of a completed import, showing the count of new jobs and duplicates. Auto-dismissed after 5 minutes.

**Requirements:** Claude Desktop with Claude in Chrome, or Codex with the Codex Chrome Extension. The user must already be logged into boards that require a session.

**Full documentation:**
- User guide: `docs/linkedin-scanner-guide.md`
- Technical reference: `docs/browser-board-scanner-technical.md`
- Agent instructions: `CLAUDE.md` and `AGENTS.md`

---

## Data and Privacy

- All data is stored locally in `data/job-search-terminal.sqlite` on the user's machine.
- No data is sent to any server except AI provider API calls (evaluation,
  generation, etc.).
- The database file is excluded from git.
- Backup: `npm run data:backup` writes a SQLite snapshot to `output/backups/`.
- Export: `npm run data:export` writes a JSON snapshot to `output/exports/`.
- To reset all data: `npm run db:reset` (drops local data and initializes an empty profile).
