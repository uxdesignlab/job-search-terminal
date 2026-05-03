# Features

This document describes every feature in the current application. Use it as a
reference for what the app does and how each section works.

---

## Navigation

The Shell header provides two navigation groups:

**Primary nav** (always visible): Dashboard · Jobs · Applications · Interview Prep · Analytics · Resumes

**Account dropdown** (hover on "Account"): Profile · Strategy · Settings

The Account menu shows a live AI provider health dot:
- Green: active provider has a key configured
- Yellow: a key exists but the active provider's key is missing
- Red: no AI keys configured at all

The app redirects `/` to `/dashboard` on load.

---

## Dashboard `/dashboard`

The command center. Shows where the job search stands at a glance.

**Sections:**

- **XP and level card** — gamified progress tracker showing experience points,
  current level, active streak, and recent achievements.
- **Action queue** — two lists: "Apply next" (high-score jobs not yet applied to)
  and "In flight" (applications in active states like interviewing or follow-up
  needed). Each card shows company, title, score, and recommended next action.
- **Job sources status** — summary of enabled scanning sources with scan history.
- **Scan results** — most recent scan run summary: companies scanned, new jobs
  found, duplicates skipped.
- **Recent activity log** — timestamped list of recent user actions.

**Actions from Dashboard:**
- Scan for new jobs (triggers a scan run)
- Batch evaluate jobs (evaluate multiple un-evaluated jobs at once)

---

## Jobs `/jobs`

The full job pipeline. Lists every discovered job with filtering and bulk tools.

**Features:**
- Fit score badge, status badge, freshness label, and role archetype per row.
- Sort by fit score, date, company, or status.
- Filter by status, score range, remote type, archetype.
- Text search across company and title.
- Bulk operations: change status on multiple jobs, archive, or delete in bulk.
- Marking a job **Skipped** (individually or in bulk) removes it from this list
  immediately — it is auto-archived and moves to the Archived page.
- Sweep / cleanup tool to archive or delete expired or low-score jobs.
- Add job manually via modal (paste URL or fill in details).
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

### Evaluation tab
- Run evaluation: triggers AI streaming evaluation with real-time output.
- Evaluation sections: strengths, gaps, red flags, resume recommendation,
  keyword list, legitimacy signal.
- User correction: override the AI recommendation and score with a note.
- Provider and model metadata for the last evaluation run.

### Resume tab
- Generate tailored resume for this job: picks best base resume, produces
  HTML and PDF output with tailoring summary and keyword coverage %.
- Resume draft editor: edit the tailored resume before export.
- Keyword coverage progress bar.
- Download PDF button.

### Apply tab
- Prepare application answers: paste common or custom application questions,
  generate AI answers for copy-paste. App never auto-submits anything.
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

Application funnel tracker with three view modes:

- **Table view** — sortable list of all active applications with status, company,
  role, score, follow-up date, and overdue indicator.
- **Kanban view** — drag-and-drop board organized by status column.
- **List view** — compact single-column list.

**Features:**
- Follow-up overdue alerts (highlighted when past the follow-up date).
- Status transition buttons inline in each row.
- Filter by status, overdue, or company.
- Column filters and saved filter presets (same system as the Jobs table).
- Summary funnel metrics at the top: applied, in progress, responded, interviewing.

---

## Archived `/archived`

Jobs that have been manually archived, marked as expired, or skipped.

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

**Base resumes** — the source PDF lanes uploaded by the user:
- Principal / Product Design Leadership
- UX Design
- Accessibility / Design Systems
- Design Operations
- Teaching / UX Education

Each lane shows extraction status, word count, and a link to view.

**Generated documents** — tailored resumes produced for specific jobs:
- Table showing job, lane used, keyword coverage %, generation date, and status.
- Column filters and saved filter presets on the generated documents table.
- Links to preview HTML and download PDF.
- Delete document action.

### Resume Editor `/generated-documents/[id]/edit`
Full draft editor for a tailored resume before exporting to PDF:
- Edit all sections: summary, experience bullets, skills.
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

**Resume gate:** At least one resume PDF must be uploaded and extracted
(`wordCount > 0`) before AI profile extraction is available. If no extracted
resume exists, the Overview tab shows a warning card with a link to the Resumes
tab, and the Resumes tab shows a prominent upload instruction banner.

### Tab: Overview (`?tab=overview`)
- Summary card: name, current search goal, location, portfolio, urgency, direction.
- **AI profile extraction card** — runs AI extraction on all uploaded resumes and
  populates skills, role directions, and experience automatically. Only shown when
  at least one resume has been extracted; otherwise shows the resume gate warning.
- Edit form: current search goal, search direction, urgency (select), career
  intent, career change interest, confidence level.

### Tab: Resumes (`?tab=resumes`)
- Upload banner (shown when no extracted resumes exist): instructs the user to
  re-upload a PDF on any lane, then return to Overview to run AI extraction.
- **Resume lanes** — each lane is a different resume version (e.g. Principal /
  Product Design Leadership, UX Design, Accessibility, etc.). Upload a PDF to
  extract text for AI evaluation and tailoring. Rename lanes to match their focus.
- **Skill inventory** — list of skills extracted from resume lanes (shown only
  after at least one extraction). Re-run AI extraction from Overview to refresh.

### Tab: Skills & Roles (`?tab=skills`)
- Read-only badge displays for: strongest skills (from AI extraction), skills to
  use more, skills to use less, target roles.
- Edit form: target roles (one per line), skills to use more (one per line),
  skills to use less (one per line).

### Tab: Preferences (`?tab=preferences`)
- Summary cards: remote preference, compensation, desired industries, preferred
  locations.
- Edit form: remote preference (select: remote-only / local-or-remote / all),
  preferred locations (one per line), desired industries (one per line),
  compensation needs (free text), work preferences (one per line).

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
- View all built-in ATS sources (Greenhouse / Ashby / Lever companies).
- Enable or disable individual sources.
- Column filters and saved filter presets on both the sources table and the
  discovered sources table.
- Add custom job board URLs.
- Set positive and negative title filters to control what the scanner picks up.

### Preferences
- Edit title include / exclude filters.
- Add profile supplements for gap filling.
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
4. Duplicate URLs are skipped.
5. New jobs are written to the `jobs` table with `status = found`.
6. A `scan_runs` record is created with metrics.
7. The Dashboard updates with the scan summary.

**Configuration:**
- Built-in sources: enable/disable per company in Settings → Job Sources.
- Custom sources: add any careers page URL.
- Title filters: positive list (must match) and negative list (exclude if matched).

---

## Data and Privacy

- All data is stored locally in `data/job-search-terminal.sqlite` on the user's machine.
- No data is sent to any server except AI provider API calls (evaluation,
  generation, etc.).
- The database file is excluded from git.
- Backup: `npm run data:backup` writes a SQLite snapshot to `output/backups/`.
- Export: `npm run data:export` writes a JSON snapshot to `output/exports/`.
- To reset all data: `npm run db:reset` (drops and re-seeds with demo data).
