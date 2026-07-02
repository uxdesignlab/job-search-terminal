# Features

This document describes every feature in the current application. Use it as a
reference for what the app does and how each section works.

---

## Navigation

The Shell header provides two navigation groups:

**Primary nav** (always visible): Dashboard · Jobs · Applications · Interview Prep · Analytics · Resumes

**Account dropdown** (hover on "Account"): Profile · Strategy · Settings

**Help link** appears immediately after Account and opens the in-app help site at
`/help` in a **new browser tab** (`target="_blank"`) so the user doesn't lose their current context.

The Account menu shows a live AI provider health dot. The indicator reads the
provider priority chain from `providerOrderJson` and checks each provider for a
credential (API key for cloud providers; a non-empty base URL for Ollama):
- Green: the first enabled provider in the chain has a credential configured
- Yellow: a credential exists somewhere but the first-in-chain provider is missing one
- Red: no credential is configured for any provider in the chain

The app redirects `/` to `/dashboard` on load.
The app also serves `/favicon.ico` (redirected to the shared `logo.svg`) so
browser default favicon requests resolve without 404 noise.

---

## Help Site `/help`

The in-app help site is a self-service documentation surface for open-source
users. It is designed as a mini website inside the product, with a landing page,
search, workflow cards, a persistent documentation sidebar, screenshots, related
guides, and per-topic pages.

**Help home:**
- Hero with product screenshot and calls to start the guide or open the resume
  and ATS guide.
- Near-hero privacy note that stored data stays on the machine and AI actions
  use the configured provider: OpenAI, Anthropic, Google Gemini, or Ollama
  locally.
- Search across all help pages.
- Workflow groups for setup, profile, jobs, applying, tracking, interview prep,
  privacy, and troubleshooting.

**Guide pages:**
- `/help/getting-started` — setup, onboarding, and daily workflow.
- `/help/ai-providers` — how to configure OpenAI, Anthropic, Google Gemini, or
  Ollama (local); create and add API keys; set the provider priority chain;
  test providers; and protect keys.
- `/help/resume-lanes` — resume lanes, resume upload, ATS-friendly formatting,
  PDF guidance, and bullet quality.
- `/help/job-search` — dashboard scans, job sources, manual job entry, filters,
  and saved presets.
- `/help/linkedin-scanner` — Claude/Codex browser-board scanning for LinkedIn,
  Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster; Dice MCP scanning
  (no browser required); imports, duplicates, limits, and safety notes.
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

**First-run onboarding** (shown until dismissed): Opens as an isolated dashboard
modal so the user can finish setup without leaving the flow. The × close button
is always visible. Clicking it when setup is not fully complete shows a warning
with two options — "Back to setup" or "Dismiss setup" (exits immediately and
records dismissal). Once dismissed, the modal never re-appears regardless of
whether all steps are complete; `onboardingDismissed` is the authoritative gate.

The modal has 5 steps — 4 required and 1 optional:

1. **AI provider** — saves one OpenAI, Anthropic, or Google Gemini API key, or configures an Ollama base URL, inline.
2. **Resume lanes** — uses the normal multi-lane resume upload cards. Uploading a
   PDF seeds desired positions and positive title filters from extracted resume
   titles, and AI extraction can enrich the full profile. The "Add another lane"
   button only appears once all existing lanes have a file uploaded (to prevent
   accidentally adding duplicate empty lanes). If AI extraction fails (e.g.
   MAX_TOKENS on a long resume), the "Continue to job preferences →" button
   becomes enabled anyway with a note that extraction can be re-run from the
   Profile page; the user is never trapped.
3. **Job preferences** — requires the user to review and explicitly save desired
   positions, include/exclude title filters, and location work modes. Resume
   upload or extraction may prefill these values, but the step does not become
   complete until the user confirms them.
4. **Integrations** *(optional)* — covers two free API keys that extend job
   coverage. Each card shows a short explanation, a "Help →" link to the
   relevant help section, and inline input fields with a "Leave blank to keep
   existing" placeholder when keys are already saved.
   - **Adzuna (job aggregator)** — App ID + API Key. Links to
     `/help/job-search#aggregator`. Enables Adzuna API scanning alongside ATS
     sources on every dashboard scan.
   - **Brave Search (source discovery)** — API Key. Links to
     `/help/ai-providers#discovery-aggregators`. Enables the "Search discover"
     button in Settings → Sources.
   The sidebar marks this step with a dashed "Optional" badge and a `·` in the
   step circle when not yet configured. Clicking "Skip for now" advances to
   Ready without saving. "Save and continue" saves any non-blank fields (blank
   fields keep existing keys) and also advances to Ready.
5. **Ready** — explains the next operational steps: review scan sources in
   Settings, run Scan for new jobs on the Dashboard, then review and evaluate
   imported matches.

The resume step is considered complete as soon as a PDF has been uploaded to any
lane (regardless of whether AI extraction succeeded). Job preferences and the
dashboard are gated until an AI key, at least one uploaded resume, and confirmed
preferences all exist.
The Integrations step is never a gate — completing it only enables optional
features.

**Normal dashboard** (after full setup):

- **Top dashboard tiles** — metric cards appear before "Fresh matches" and
  "Apply next". "Priority matches", "Applications sent", "Follow-ups due", and
  "Interviews active" are pinned in a two-row half-width block, with "This
  week" occupying the other half.
- **Fresh matches** — only unprocessed jobs discovered by scheduled or manually
  triggered scans inside the selected freshness window. Applied, rejected,
  manually added, stale, archived, and duplicate jobs stay out. Each row badge
  shows `Posted <date>` when a publish date exists, otherwise `Fetched <date>`
  from the discovery timestamp. Rows use the same compact list treatment as
  "Apply next" for consistent scanning, and row text wraps (no ellipsis
  truncation) so full titles and location lines remain visible on narrower
  viewports.
- **Action queue** — "Apply next" shows high-score jobs not yet applied to and
  "In flight" shows active applications (interviewing, follow-up needed). Each
  card shows company, title, fit score, and recommended next action.
- **Stat cards** — supporting metrics for priority matches, applications sent,
  new jobs this week, generated PDFs, follow-ups, interviews, and skipped jobs.
- **Recent activity log** — "Latest scan" summary appears first (status badges
  and per-source errors with inline "Disable source"), followed by the
  timestamped list of user actions.
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
  Select jobs with the row checkboxes, then use the bulk action bar:
  - **Evaluate selected** — runs AI evaluation on all selected jobs in sequence.
    A per-row progress indicator shows `Pending`, `Evaluating`, `Done`, or `Error`.
  - **Retry failed (N)** — appears after a batch run if any jobs returned an
    evaluation error. Re-runs evaluation only on the jobs that failed, without
    re-evaluating already-successful ones.
- Marking a job **Skipped** (individually or in bulk) removes it from this list
  immediately — it is auto-archived and moves to the Archived page.
- Bulk delete asks for confirmation. If selected jobs have user activity, the
  confirmation warns before deleting.
- Maintenance tool to verify posting liveness, confirm deletion for expired
  untouched jobs, and identify active jobs whose titles no longer match saved
  title filters. Out-of-scope cleanup only bulk-deletes untouched jobs; jobs with
  user activity must be removed through explicit selected-job actions. Clicking
  **Verify active postings** opens a blocking `ProgressModal` while the liveness
  check runs; on completion the modal shows a badge summary (checked / active /
  uncertain / expired counts) and prompts the user to close and take action on
  expired jobs in the section below.
- **Bulk evaluate** — selecting jobs and clicking **Evaluate N** opens a blocking
  `ProgressModal` that tracks per-job progress ("Job X of N") while the AI
  evaluation streams for each selected job. On completion the modal shows how
  many evaluated successfully and how many failed.
- Add job manually via modal (paste URL or fill in details). Jobs added this
  way are stored with `source = 'manual'` and display a **Manual** badge in
  the Source column.
- **Email job alert imports** — drop `.eml`, `.html`, or `.txt` files into
  `data/email-job-alert-imports/`. The local watcher parses them and queues
  extracted candidates in the **Email approval modal** — jobs are never added
  automatically. Each candidate is pre-scored against your saved target roles
  and positive title filters (**Matches criteria** / **Off target** / **No
  criteria set**). Candidates matching your criteria are pre-checked; off-target
  ones appear unchecked. Choose **Add to jobs** or **Dismiss selected** per
  candidate, or **Dismiss all** to clear the queue. Unchecked candidates stay
  pending until you add or dismiss them. The modal appears on both the Dashboard
  and Jobs pages and polls every 8 seconds for new arrivals. Jobs without a
  direct posting URL are imported as email leads that can be resolved via
  **Resolve posting** on the job detail page.
- **Column filters** — click any column header to open a sort + multi-value
  checkbox filter dropdown. Active filters show a count summary ("X of Y jobs")
  with a "Clear all filters" link.
- **Saved filter presets** — name and save up to 5 filter+sort combinations as
  reusable chips above the table. Presets are persisted to the database and
  survive page reloads. Click a chip to re-apply; click × to delete.
- **Review queue banner** — when low-confidence imports are present (jobs with a
  description under 100 characters), a yellow banner appears at the top of the
  Jobs page showing the count of jobs pending review. Per-row **Approve** and
  **Dismiss** buttons let you promote a low-confidence job into the normal
  pipeline (clears `review_status`) or archive it. The banner auto-hides when
  the queue is empty.

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
- Extracts **20–25 keywords** per job posting using verbatim-phrase discipline:
  the LLM is instructed to pull the exact phrasing from the JD, never paraphrase.
- The target **job title and close variants** are always extracted first as `"title"`
  category keywords — these carry the highest ATS weight and drive summary positioning.
- Named tools, platforms, certifications, and frameworks are extracted exactly as written
  (Figma, Workday, AWS, PMP, etc.) for exact-match ATS signals.
- Hard-skill phrases from Required/Qualifications sections → `priority: "required"`.
- Soft-skill and context phrases from Preferred/Nice-to-have → `priority: "preferred"`.
- Domain context phrases (e.g. "healthcare SaaS", "B2B enterprise") are captured to
  distinguish the role from generic postings.
- For "X+ years of [skill]" requirements, the skill phrase itself is captured (not the
  number) so it can be verified against the candidate's resume.
- Categories: `"title"` | `"technical"` | `"soft"` | `"domain"` | `"tool"` |
  `"methodology"` | `"credential"`.
- Keywords are stored in priority order (required first, title category first within
  required) and used during resume tailoring.

### Resume tab
- Generate tailored resume for this job: picks best base resume, produces
  HTML and PDF output with tailoring summary and keyword coverage %.
- Resume draft editor: edit the tailored resume before export.
- Keyword coverage progress bar.
- Download PDF button.

**Tailored resume AI context:**
- Source resume full text (up to 5,000 chars) — the AI must verify every keyword
  and strength against this text before using it.
- All evaluation keywords in priority order (required first, then preferred); the
  previous cap of 12 has been removed — all 20-25 extracted keywords are passed.
- **Missing keywords** — keywords absent from the pre-AI source draft are identified
  before the AI call and passed as a separate priority list so the AI knows exactly
  which terms to weave in where the source resume provides supporting evidence.
- **Job-specific gaps and red flags** — the evaluation's `gaps` (up to 5) and
  `redFlags` (up to 3) are included so the AI tailors content to address the
  specific shortfalls identified for this position, not just generic keyword coverage.
- Evaluation strengths (top 4) as suggested emphasis signals.
- Gap responses — user-supplied notes addressing identified experience gaps.
  Gaps and red flags are addressed via a structured modal (see below).
- Profile supplements — any extra context the user has added.
- Gap answer quality checks — vague gap responses and supplements are saved as
  drafts with a follow-up question, and only confirmed answers are used during
  resume tailoring.

**Gap addressing modal** (on the job Overview tab, "Gaps and red flags" card):
- Clicking **Address** (or **Edit**) opens a modal instead of an inline form.
- **Company checkboxes** — loaded from the user's resume experience entries via
  `/api/resume-companies`; selecting companies pre-structures the response as
  "At Company A, Company B: [description]".
- **What did you do?** — editable textarea, prefilled by parsing the gap text
  into a first-person statement (strips "The posting requires…" boilerplate,
  extracts the core activity).
- **Key metrics or outcomes** — optional single-line field; appended as
  "Key results: …" in the saved response.
- **Polish with AI** — sends the structured response for AI polishing and quality
  assessment in one step; closes the modal when `qualityStatus === "addressed"`.
- **Save** — saves raw without polish; also closes on "addressed".
- If the AI returns `needs_followup`, the modal transitions to a follow-up step
  showing the AI question and the saved response, with a textarea for more detail.
- Escape key closes the modal.
- Modal slides up from the bottom on mobile, centers on desktop.
- Job description excerpt (up to 3,000 chars) — allows the AI to verify keyword
  context and understand requirement weight, not just the extracted keyword list.
- Skills preference flags — skills the user wants to emphasize or de-emphasize
  (derived from `use_more` / `use_less` preference on each skill record).

**Keyword placement strategy (added to tailoring prompt):**
- "required" and title-category keywords that are supported by the candidate's evidence
  should appear at least once as an exact verbatim phrase — ATS systems do phrase-level
  matching, so split words don't reliably score.
- Tool/methodology keywords belong in Skills or within the experience bullet where
  that tool was actually used.
- Soft-skill phrases fit best in the summary or a high-impact bullet.
- The target job title or a close variant is worked into the summary when supported.
- Aim for supported required keywords to appear 1-2 times (once for ATS; twice for
  human reviewers).

**Three-tier keyword coverage (resume draft editor):**
The keyword panel in the draft editor classifies each keyword into one of three tiers:

| Tier | Display | Meaning |
|------|---------|---------|
| **Exact phrase** | ✓ green chip | Full verbatim phrase present — ATS will reliably score this |
| **Partial** | ~ amber chip | Individual terms present but not as a phrase — ATS may miss; add as exact phrase |
| **Missing** | + or ! chip | Not found; either add to Skills (if evidence confirmed) or confirm evidence first |

- The header score shows **ATS coverage %** (exact phrases only) — this is the
  realistic number an ATS parser would produce.
- Clicking any chip highlights the keyword in the preview panel (exact phrase = bright
  yellow outline; term occurrences = faint yellow).
- `supportedKeywords` detection uses the same phrase-aware matching algorithm as
  coverage (previously used raw `string.includes()` which gave false positives).

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
  - Pressing **Prepare answers** opens a blocking `ProgressModal` ("Drafting
    answers grounded in your resume and evaluation…" + spinner) while the
    request is in flight. On success the modal transitions to a done state
    ("Answers prepared — scroll down to review them.") with a Close button. On
    error it transitions to an error state with the failure message and a Close
    button (questions are preserved).
  - After answers return, the question inputs reset to a single empty row and
    the drafts list refreshes in place — no page reload is required to submit
    another batch of questions.
  - **Gap responses flow into answer generation**: all gap and red flag
    responses with `qualityStatus === "addressed"` are loaded and injected into
    the AI system prompt as verified evidence. The AI uses polished responses
    (or raw if no polish) to strengthen "why fit" and custom answers. The
    template fallback (no AI key) surfaces the most relevant addressed gap in
    the "why fit" answer and lists all gaps as supporting evidence for custom
    questions.
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

Clicking **Start research** (or **Re-research**) opens a blocking progress modal
("Researching company" + spinner) that streams a live status line as each of the
six axes completes. On completion the modal shows "Research complete — scroll
down to read all six sections." The modal cannot be dismissed while the request
is in flight; the page-level **Cancel** button stops the stream and closes the
modal, and an X button and Close button appear only in the done state.

### Outreach `/jobs/[id]/outreach`
Generate a recruiter or hiring manager outreach message tailored to the job and
user profile. Shows character count. User copies the message manually.

Clicking **Generate messages** (or **Regenerate**) opens a blocking progress
modal ("Generating outreach messages" + spinner). On success the modal shows "3
messages ready — scroll down to copy and send them." The modal cannot be
dismissed while the request is in flight.

---

## Applications `/applications`

Application funnel tracker with two view modes:

- **Table view** — sortable list of all active applications with status, company,
  role, applied date, score, follow-up date, and overdue indicator.
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
- Generated documents keep a stable link to their source resume lane, so PDF
  export continues to work after the lane is renamed.
- Column filters and saved filter presets on the generated documents table.
- Links to preview HTML and download PDF.
- Delete document action.

### Resume Editor `/generated-documents/[id]/edit`
Full draft editor for a tailored resume before exporting to PDF. Matches the
approved-resume builder experience with identical section controls on every section:
- **Section title** — editable input that updates the heading printed in the PDF.
- **✨ Improve** — AI rewrites the section content; user can accept or discard the
  suggestion. Not shown on the Experience section (improvement is per-entry).
- **↑ Move up / ↓ Move down** — reorders sections; order is reflected in the preview
  and the generated PDF.
- **Remove** — hides a section from the PDF (data is not deleted).
- Experience entries each have a **✨ Improve bullets** button with the same
  accept/discard flow as the resume builder.
- Header (name, headline, contact) is always pinned at the top and is not
  moveable or removable.
- Education is always shown last and is display-only (pulled from the base resume).
- **Keyword coverage panel** — collapsible panel between the help text and the first
  section showing all job keywords as chips. Green ✓ chips = exact phrase or strong
  term-overlap coverage in the current resume text; `+` chips = supported by existing
  evidence and ready to add; `!` chips = missing evidence. Clicking a `+` chip adds the
  keyword to Skills. Clicking a `!` chip opens a guided wizard: select the companies
  and roles where the skill was used, optionally add context, then review distinct
  resume-writer suggestions grounded in each role's existing bullets. Each suggestion
  rewrites the strongest relevant bullet instead of appending a generic line. The user
  can edit or remove any change before approval. Company confirmation is required;
  writing is optional. When AI is unavailable or returns an unsafe suggestion, the app
  uses a claim-preserving fallback rewrite. Updates instantly as the user types (no
  debounce — pure JS computation).
  Starts expanded when coverage is below 70%. Collapses to just the `covered/total`
  counter when the user has seen enough. The page header uses the same live matcher.
- **Job-aware AI improvement** — ✨ Improve (and ✨ Improve bullets for experience)
  include the job keywords in the API call. The AI naturally incorporates missing
  keywords into suggestions without forcing them.
- **Evidence guard** — AI-proposed headline, summary, impact, skill,
  recognition, experience, and extra-section claims are checked against the
  approved resume lane plus confirmed gap answers and supplements. Unsupported
  AI changes revert to source wording. PDF export is blocked if manual edits
  still introduce an unsupported metric or substantive claim.
- Live preview pane updates automatically with a 400 ms debounce; Refresh button
  forces an immediate update.
- Keyword coverage percentage shown in the page header (color-coded green/yellow/red).

### Resume Preview `/generated-documents/[id]/preview`
Read-only HTML preview of the tailored resume.

---

## Interview Prep `/interview-prep`

Tools to prepare for interviews using stored experience.

**Tabbed Workspace:**
- **Header chips** are core-story-centric: `N core stories · N questions`, plus a `N to consolidate` link (when generated suggestions remain) and a `N candidates to review` link (when the taxonomy has candidates).
- **Practice:** opens with a **Coverage** panel — a per-category readout of how many questions have at least one linked story or recorded attempt. Categories with no story yet are highlighted as gaps, so it's obvious where prep is missing. Below it are reusable questions, answer recording, and standalone story capture.
- **Story Bank:** saved stories, search, filters, and inline editing live in a separate story-bank workspace. Job evaluations no longer auto-fill this bank (see "Generate but ask first" below); older auto-generated suggestions remain until the one-time consolidation wizard folds them into core stories.
- **Taxonomy:** the private local tag tree built from the user's own jobs, resumes, and stories can be reviewed and managed without changing raw ATS keywords.

**Story consolidation wizard (one-time cleanup):**
- When the story bank still contains auto-generated `evaluation_suggestion` rows from the old Block F behavior, a banner in the **Story Bank** tab links to **`/interview-prep/consolidate`**.
- The wizard (`ConsolidationWizard`) uses the active AI provider to cluster the near-duplicate suggestions — which are lightly-reworded copies of the same ~15–25 real experiences — into canonical core stories, then synthesizes one clean STAR+Reflection story per cluster with capability tags. **Nothing is written until you review and commit:** each proposed story shows its editable title/STAR/tags, the list of job-specific suggestions it was merged from, and an approve checkbox.
- Committing creates the approved stories as reusable standalone stories, re-homes the merged suggestions' job links onto them, and removes the suggestion rows. The run is resumable (persisted in `story_consolidation_runs`) and the banner disappears once the bank is clean. This is a feature, not a one-off script — it appears for any user whose bank holds generated suggestions and never on a fresh install.

**Generate but ask first (Block F no longer auto-inserts):**
- Running **Evaluate with AI** on a job still generates likely interview questions with STAR outlines, shown in the job's **F. Interview plan** section — but nothing is written to the story bank automatically. This replaced the previous behavior of silently inserting ~5 stories per evaluation, which made the bank impossible to review.
- Each suggested question offers three choices: **Draft / Record Answer** (save it as a new core story via the interactive builder), **Link an existing story** (the section shows core stories that already match this role's concepts, with a one-click Link/Unlink toggle backed by `getMatchingStoriesForJob` / `setStoryJobLink`), or simply ignore it (drafts are not persisted).

**Interactive Story Builder:**
- **Type or Record:** Toggle between "Type draft" (typing a raw text response or notes) and "Record audio" (spoken practice transcribed by AI).
- **AI STAR Structuring:** AI parses the raw text or spoken recording transcript into the structured STAR + Reflection format (Title, Situation, Task, Action, Result, Reflection), identifying 2–8 ATS-style keyword tags (skills, tools, methodologies, domain terms genuinely demonstrated in the story — the same kind of verbatim phrase the job-evaluation pipeline extracts from postings), readiness, and missing details.
- **Preview Before Save:** AI-structured drafts are shown for review before they are written to the story bank.
- **Modal Wizard:** Practice answers and standalone stories open in a focused modal flow instead of expanding the full page.
- **Position Assignment:** Answers can be assigned to multiple active application positions with statuses Applied, Recruiter responded, or Interviewing. Checkboxes save immediately and can be unchecked at any time, regardless of how the link was created.
- **Private Taxonomy:** The app ships only the taxonomy schema; new installs have no taxonomy data. Concepts are created locally from the user's own evaluated jobs, story tags, and interview-prep material. Raw ATS keywords remain unchanged for resume tailoring, while grouped concept tags power search, filtering, and story-job matching.
- **Auto-Matching:** Stories are automatically linked to eligible positions (Applied, Recruiter responded, Interviewing) whose local taxonomy concepts overlap with the job's title, role archetype, or extracted ATS keywords — no manual checkbox needed. Exact raw keyword overlap still helps, but broader parent/child matches also work; for example, a story classified under "User interviews" can match a job asking for "user research." Auto-matched positions are labeled "Auto-matched" wherever assignments are shown, so it's always clear whether a link was system-suggested or user-chosen. Matching runs whenever a story is saved and whenever a position's status changes into the eligible set.
- **Per-question practice history:** Each question in the library shows an **attempts** count and a **History & stories** button. Every time you practice a question, the transcript, AI-structured STAR, quality rating, and coaching notes are saved as a durable **practice attempt** — re-practicing appends a new attempt rather than silently creating a duplicate story. The history drawer lists the question's linked canonical stories plus every past attempt (newest first, each expandable to its STAR and transcript), with a **Practice again** button. Because a re-practice reuses the question's existing canonical story id, refining an answer updates that one story while the full rep-by-rep history is preserved in `practice_attempts`.
- **Section-by-Section Editing:** Once structured, the story is displayed as separate sections. Each section can be independently edited and saved directly to the database, ensuring you can refine details piece-by-piece.
- **Writing Voice Integration:** Optionally opt-in to update your writing voice style profile with your custom answers, refining future AI-generated drafts.

**Practice Questions:**
- Ships with reusable default prompts and lets users add their own custom interview questions.
- Custom questions can be selected, edited, hidden, and reused for future typed or recorded practice through pop-up flows.

**Standalone Stories:**
- Users can capture an accomplishment or proof point without tying it to a specific question.
- AI structures the story, evaluates whether it is ready, and saves it as a standalone story after user confirmation in a pop-up wizard.

**STAR Story Bank:**
- Collates and displays all saved stories with visual badges for S/T/A/R/Reflection components.
- Shows source and kind labels for answered questions, standalone stories, voice practice entries, and job evaluation suggestions.
- Includes search and filters by story kind, source, quality/readiness, grouped taxonomy tags, assigned/source position, and updated date.
- **Tags and Position filters are searchable multi-selects** (`SearchableMultiSelect` in `src/components/ui/searchable-multi-select.tsx`): a button shows the selected count and opens a popover with a search box and checkboxes, so hundreds of tags or dozens of positions stay usable. Tag filters use grouped taxonomy concepts; selecting a parent concept includes its children. Selecting multiple values within one filter is OR'd; filters across different fields are AND'd.
- **Cards are collapsed by default.** Each card shows title, badges, a one-line preview, up to 4 tags, and the assigned-position count; clicking the row (or "Show details") expands it to the full STAR text, all tags, all assigned positions, and quality notes. This keeps the list scannable at the story-bank's typical scale (100+ stories).
- **Paginated at 20 stories per page** with Previous/Next controls, so the page doesn't render or scroll through the entire story bank at once. Changing any filter or the search box resets to page 1.
- Support **inline editing** using the interactive section-by-section editor. Clicking Edit on an expanded card launches the editor immediately.
- Shows grouped concept tags first and keeps raw keywords in expanded details. User-authored stories normally contribute 2–8 raw keywords; job-evaluation suggestions can contribute up to 12 raw ATS keywords from the source job.

**Taxonomy Manager:**
- Lets users review the generated tag tree, search paths and aliases, add tags, rename tags, move tags under another parent, archive/restore tags, add/remove aliases, and merge duplicate tags.
- Taxonomy changes are logged locally. User edits are treated as authoritative for future classification.
- The tree supports up to five levels so broad areas can contain specific methods, such as `Research / User research / Qualitative research / Contextual inquiry`.
- **Tags are collapsed by default and lazily rendered.** A tag's children — and the per-tag "move to parent" / "merge into" dropdowns, which list every other tag — only render once that tag is expanded. Unmatched keywords fall into a single "Other keywords" bucket that can grow into the hundreds as real usage data accumulates; rendering that bucket's full edit UI unconditionally on page load previously froze the tab. Searching temporarily reveals matching branches regardless of their expanded state, and the match check walks the full subtree so a result at any depth (not just the first level or two) surfaces correctly.
- **Concept lifecycle (active / candidate / archived).** The tree shows only the curated **active** set. Keywords pulled from job evaluations now arrive as **candidates** rather than cluttering the tree — count chips at the top show active / candidate / archived / alias totals. Candidates still power story↔job matching; they are just held out of the browsing view.
- **Review queue.** A dedicated panel lists candidate concepts ranked by how many jobs referenced each, with a filter box, per-row checkboxes, **Approve selected** / **Archive selected** bulk actions, and a one-click **Archive all unused** (candidates with no story links and fewer than 3 jobs). A header chip on the workspace ("N candidates to review") jumps straight here.
- **Automatic promotion.** A candidate becomes active on its own when it is linked to a story or recurs across 3+ distinct jobs — so genuinely relevant tags surface without manual triage while one-off job phrases stay parked.
- **Blocklist.** Credentials (degree/certificate phrasing), job titles (seniority-prefix shapes), and the user's own tracked company names never become concepts. Patterns are role-agnostic, so the diet works for any user's field, not just design. Blocked phrases still count for resume tailoring and job matching via raw-keyword matching.
- **No resurrection.** Archiving a concept sticks: a later job evaluation that re-encounters the same keyword will not silently un-archive it — only an explicit restore does.

**Job Evaluation Integration (Section F. Interview plan):**
- Direct entry point from the **Job Detail → Analysis** page. Next to each suggested question in Section F, clicking `"Draft / Record Answer"` opens the interactive builder inline.
- Above the questions, a **"You may already have stories for this role"** panel lists existing core stories whose taxonomy concepts overlap this job, each with a **Link / Linked ✓** toggle — so you can attach an existing story instead of drafting a duplicate. This is the review step that replaced auto-insertion; nothing enters the story bank without an explicit Draft or Link action.

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
  skills, role directions, and experience automatically. Clicking **Extract with
  AI** opens a blocking `ProgressModal` ("Analyzing your resume…" + spinner); on
  success it shows the number of skills extracted; on error it shows the failure
  message. **Extraction merges, never overwrites:** existing `targetRoles` are
  preserved and new AI-extracted roles are appended (case-insensitive dedup).
  Positive title filters also merge — a third AI call generates realistic
  job-board search keywords (industry synonyms, seniority-neutral variants,
  common abbreviations) from the extracted roles and career direction, and all
  additions are merged into any filters already saved. The negative filter list
  is always left untouched.
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
- Preferred locations use an OpenStreetMap Nominatim lookup that supports city,
  state/region, and country selections. You can save precise locations such as
  `Nashville, Tennessee, United States`, broader targets such as
  `Tennessee, United States`, or country-only values such as `Canada`. Each
  saved place displays as one label; legacy split values such as `Nashville`,
  `Tennessee`, `United States` are normalized back into one preferred-location
  label.
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

- **Strategy** (default) — role-fit map, search focus, AI-generated role
  directions, how-to-use guide, and evaluation corrections. Use **Generate with
  AI** when no role directions exist, or **Regenerate with AI** to rebuild them
  from the current profile and skill inventory. The app replaces the current
  role-direction set after generation and keeps the editable correction workflow
  below each direction.
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

Four configuration tabs:

### AI Providers
- **Provider priority list** — enable up to four providers and order them by priority. The first enabled provider in the list is used for every task; the rest act as automatic fallbacks. Drag the grip handle on each row to reorder.
- **Cloud providers** — Anthropic (Claude), OpenAI (GPT), Google (Gemini). Enter an API key and select a default model for each.
- **Ollama (local)** — free, runs entirely on your machine; no API key required. Enable in the priority list to reveal the configuration section:
  - **Base URL** — Ollama server address (default `http://localhost:11434`).
  - **Model picker** — click "Choose…" to fetch the list of locally installed models from the running server and select one.
  - **Quality guide** — ≥64 GB: `qwen2.5:72b` / `llama3.1:70b` (near cloud quality); ≥12 GB: `qwen2.5:14b` / `mistral-nemo`; ≥8 GB: `llama3.1:8b` / `qwen2.5:7b`.
  - **Unreachability warning** — when Ollama is in the priority chain and the server is not reachable, an inline warning banner appears with a Retry button.
- Test connection for any provider to verify credentials and measure latency.
- **Model attribution** — every AI-generated result (evaluation, research, outreach drafts, application answers) shows the model and provider that produced it.

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
- "Scan for new sources" queries the Common Crawl index to discover additional
  ATS boards automatically.
- Discovered sources stay pending until the user reviews and explicitly selects
  the validated companies to add.
- Cleanup review lists disabled or malformed user-added sources for explicit
  removal. Existing sources are never removed automatically.
- "Search discover" queries Brave Search API for ATS job boards not in Common
  Crawl (requires Brave Search API key in AI Provider settings). Merges new
  findings into `data/discovered-sources.json` without overwriting existing
  entries.
- "Validate sources" opens a **modal** (progress, then summary counts and a scrollable list of dead/unknown boards — same interaction pattern as **Scan for new jobs** on the Dashboard). It checks each tracked board’s public ATS JSON URL (same
  host as CareerOps scans). Results: **Live** / **N jobs** when HTTP 200 and JSON
  parse succeeds, **Dead** on HTTP 404, **Unknown** for other HTTP codes, timeouts,
  or non-JSON. The validator uses a **45s** per-source ceiling, browser-like
  `User-Agent` / `Accept` headers, **up to three attempts** with backoff on
  transient errors (HTTP 429 / 5xx / network aborts), **lower concurrency** (5),
  and **longer pauses between batches** so Ashby and other hosts are less likely
  to rate-limit when hundreds of sources are validated at once. Hover an
  **Unknown** badge to see the last error string (for example `HTTP 429`).
  **Re-validate sources** re-runs the full check.

### Preferences
- Edit title include / exclude filters.
- Add profile supplements for gap filling. Supplements are checked for concrete
  role, project, action, and outcome detail before they are treated as confirmed
  resume-tailoring context.
- Adjust other search preferences.

### Data & Backup
- Enable or disable automatic scans every six hours while the local app is
  running.
- Select the fresh-posting window: 24 hours, 72 hours by default, or 7 days.
  CareerOps and Adzuna scans use the selected window.
- Create a portable `.jst-backup` archive with optional password protection.
- Restore only after archive validation, preview, explicit confirmation, and an
  automatic rollback backup.

---

## AI Capabilities

The app supports four AI providers interchangeably:

| Provider | Default model | Used for |
|---|---|---|
| OpenAI | `gpt-5.4-mini` | Evaluation, answers, outreach, research, transcription |
| Anthropic | `claude-sonnet-4-6` | Evaluation, answers, outreach, research |
| Google Gemini | `gemini-2.5-flash` | Evaluation, answers, outreach, research, transcription |
| Ollama (local) | user-selected | Evaluation, answers, outreach, research |

Providers are configured as an ordered **priority chain** in Settings → AI
Provider. The app tries providers from top to bottom and automatically fails over
to the next one when a provider is unavailable or returns a recoverable error.
The first provider in the chain that has a credential configured is the active
provider. Ollama uses a base URL (default `http://localhost:11434`) instead of an
API key and supports any model installed on the local Ollama server. All AI calls
use the `src/lib/ai/` provider abstraction with retry and failover logic.

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
2. The CareerOps ATS scanner queries each enabled Ashby/Greenhouse/Lever source in parallel.
3. If Adzuna credentials are configured (Settings → AI Provider → Discovery & Aggregators), an Adzuna aggregator scan runs in parallel alongside the ATS scan.
4. Title filters remove irrelevant roles.
5. Profile location and remote preferences remove listings outside the user's constraints.
6. Listings outside the selected fresh-posting window are filtered out.
7. Duplicate URLs are skipped.
8. New jobs are written to the `jobs` table with `status = found`.
9. A `scan_runs` record is created with metrics.
10. The Dashboard updates with a combined scan summary (ATS + Adzuna totals merged).

**Scan results dialog** (Dashboard “Scan for new jobs” and Settings → Sources per-company scan): the modal is scrollable when there are many errors or new listings. Each error shows a **category badge** — *Dead or missing* (404/410, bad URL, unknown host), *Timed out* (no response within the fetch limit; the board may still be live), or *Other error*. A summary line counts how many sources reported issues, how many can be disabled as YAML/custom career sources, and a breakdown by category. **Select all** / **Clear selection** / **Disable selected** bulk-update `scan_source_overrides`; per-row **Disable** does the same for one company. Aggregator-only rows (e.g. **Adzuna**) are not disabled as career sources — the UI points to AI Provider settings instead.

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
- **Settings → Sources table:** Above the table, counts show **sources total \| enabled** (enabled reflects optimistic checkbox toggles until the server round-trip completes). **Scan all enabled** runs the same full CareerOps job fetch as the Dashboard scan’s ATS leg: every **enabled** source is queried in parallel, independent of any prior “Validate sources” result — use it after re-enabling boards or when you want a fresh pull without opening the Dashboard. **Scan jobs** on a single row calls the same scanner with `companyExact` for that company **even when the row is disabled**, so you can verify a careers URL before turning the source back on. The **Live** column uses the same sort/filter header pattern as the other data columns; until **Validate sources** has been run, Live shows **Not validated** for each row.

**Performance tuning constants** (in `src/lib/scanner/careerops-scanner.ts`):
- `CONCURRENCY = 20` — parallel ATS API requests.
- `ATS_JOB_LIST_FETCH_MS = 60_000` — per-source ceiling for the full job-list
  request: HTTP response **and** `response.json()` parsing. Large Ashby boards
  often need far more than a few seconds to download JSON; the previous 12s
  budget could mark live boards as timed out. (`jd-fetcher.ts` still uses
  `FETCH_TIMEOUT_MS = 12_000` for individual job-description fetches.)
- `ATS_JOB_LIST_FETCH_RETRIES = 1` — on timeout/abort, one immediate retry after
  a short pause (transient CDN saturation).

**Pruning dead sources:** `npx tsx scripts/prune-dead-sources.ts` validates
every enabled source (YAML + custom) and writes `scan_source_overrides` rows
to disable any that return HTTP 404 in pass 1, plus any that are unreachable
in both passes. Disabling is non-destructive — sources can be re-enabled
from Settings → Job Sources. Useful after a bulk source-discovery import,
which tends to add many slugs that do not actually exist on the ATS host.

---

## Browser Job Board Scanner (Claude and Codex Integration)

An optional feature for users with Claude Desktop or Codex Chrome. An agent discovers job-board results on your behalf and writes them directly into Job Search Terminal — no copy-paste required. Supported sources are LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, Monster, and **Dice** (MCP-powered, no browser needed).

**How it works:**
1. Ask Claude or Codex to scan LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, Monster, or Dice
2. The agent reads your target roles and location preferences from the JST database
3. For browser boards: the agent opens the board in Chrome and extracts matching visible postings. For Dice: the agent calls the Dice MCP `search_jobs` tool directly — no Chrome extension or login needed
4. A JSON file is written to `data/job-board-imports/` (`data/linkedin-imports/` remains supported for legacy LinkedIn files)
5. Job Search Terminal detects the file, imports jobs with duplicate detection, and shows a notification

---

## Dice MCP Scanner (In-App, No Credentials)

Dice is a tech-focused job board. JST integrates with Dice via Dice's free, public MCP server (`https://mcp.dice.com/mcp`) — no API keys, no browser extension, and no login required.

**How it works:**
1. Open Settings → Sources → Job aggregators
2. Click **Scan with Dice**
3. JST calls the Dice MCP `search_jobs` tool over HTTP with your target roles, location preferences, and remote preference from your profile
4. Results are filtered by your title filters, written to `data/job-board-imports/dice-jobs-<timestamp>.json`, and imported automatically
5. New jobs appear in the Jobs table with a **Dice** source badge

**What it covers:** Tech roles on Dice including software engineering, data, DevOps, security, and product. Results are filtered to the past 7 days and up to 50 jobs per scan.

**Scan type recorded:** `dice-mcp-scan`. Jobs appear in the Jobs table with a **Dice** source badge.

**Implementation:** `src/lib/scanner/dice-scanner.ts` — contains a minimal MCP streamable-HTTP client and the scan/import orchestration.

---

## Adzuna Job Aggregator (Direct API Scanner)

Adzuna is a job aggregator that indexes listings from many sources including Indeed, CareerBuilder, and direct employer feeds. Unlike browser-board scanning, Adzuna requires no browser or logged-in session — the app queries its public API directly.

**How it works:**
1. Register at [developer.adzuna.com](https://developer.adzuna.com) for a free App ID and API Key (free tier: 2,000 queries/month)
2. Paste both keys in Settings → AI Provider → Discovery & Aggregators
3. Open Settings → Sources — the Job aggregators card appears at the bottom
4. Click **Scan with Adzuna**; clicking opens a blocking `ProgressModal`
   ("Scanning Adzuna" + spinner). On completion the modal shows "Found N
   listings — X new, Y duplicates." and can be dismissed with Close.
5. New jobs enter the same import pipeline as browser-board scans — duplicate detection, title filtering, and source badges all apply

**What it covers:** Adzuna aggregates from multiple sources and covers roles that may not appear in direct ATS portals or browser-board searches. It is best used alongside browser-board and CareerOps ATS scans.

**Limits:** Up to 5 target roles × 3 locations per scan, 50 results per query, and the selected fresh-posting window (24 hours, 72 hours by default, or 7 days). Adzuna's coverage varies by country (default: `us`).

**Scan type recorded:** `adzuna-api-scan`. Jobs appear in the Jobs table with an **Adzuna** source badge.

**UI indicators on the Jobs table:**
- **LinkedIn**, **Wellfound**, **Work at a Startup**, **Glassdoor**, **Indeed**, **Monster**, **Dice**, or **Adzuna** badge (neutral gray) — source column — identifies jobs discovered via browser-board scans, MCP scans, or aggregator API scans
- **Manual** badge (neutral gray) — source column — identifies jobs added manually via the Add Job modal
- **Duplicate** badge (amber, clickable) — flagged jobs whose URL or company+title already existed in the database. Clicking the badge instantly filters the table to show only duplicate-flagged jobs. Clicking again clears the filter.
- **Source** column — filterable and sortable; options are "LinkedIn", "Wellfound", "Work at a Startup", "Glassdoor", "Indeed", "Monster", "Dice", "Adzuna", "Manual", and "Scanner"

**URL behavior:** Browser-board imports prefer a visible job-specific employer/ATS apply URL. If one is not available, the platform job URL is used and preserved as provenance.

**Duplicate detection:** Jobs are marked as possible duplicates (not dropped) when their original posting key, URL, or company+title+location matches an existing record. The user can review and act on flagged jobs normally.

**Adzuna URL stability:** Adzuna's API returns session-scoped redirect URLs that include tracking tokens which change on every API call. The importer normalises these to a stable canonical URL (`https://www.adzuna.com/land/ad/<id>`) so the same job always maps to the same database record across scan runs, preventing previously-imported Adzuna jobs from appearing as new. The same stable ID is also used for within-scan deduplication when the same listing appears under multiple search queries.

**Import notification:** A fixed-bottom green alert appears on the Jobs page within 30 seconds of a completed import, showing the count of new jobs and duplicates. Auto-dismissed after 5 minutes.

**Requirements:** Claude Desktop with Claude in Chrome, or Codex with the Codex Chrome Extension. The user must already be logged into boards that require a session. Dice is the exception — it uses an MCP server (`https://mcp.dice.com/mcp`) and requires no browser extension or login.

**Full documentation:**
- User guide: `docs/linkedin-scanner-guide.md`
- Technical reference: `docs/browser-board-scanner-technical.md`
- Agent instructions: `CLAUDE.md` and `AGENTS.md`

---

## Shared UI Patterns

### `Modal` (`src/components/ui/modal.tsx`)

A reusable dialog shell used for form-entry and action-confirmation dialogs. It
provides the overlay, dialog frame, header, scrollable body, optional sticky
footer, Escape-key handling, and accessibility attributes so individual
components don't repeat that boilerplate.

**Props:** `open`, `onClose?`, `title`, `description?`, `size?` ("sm"|"md"|"lg"),
`sheet?` (bottom-sheet on mobile, centered on desktop), `children`, `footer?`.

- When `onClose` is provided, the X button appears in the header and Escape
  closes the modal. When omitted (e.g. during a pending submission) neither is
  active.
- `sheet` produces `items-end sm:items-center` alignment with no padding on
  mobile and `rounded-t-panel sm:rounded-panel` corners — the standard
  bottom-drawer pattern.
- Non-sheet modals are always centered with `rounded-2xl`.

**Used by:**
| Component | `size` | `sheet` | Purpose |
|---|---|---|---|
| `AddJobModal` | lg | — | Add job manually form |
| `EditJobModal` | lg | — | Edit job details form |
| `GapAddressingPanel` | md | ✓ | Address gap / add detail (two-phase modal) |
| `GlobalGapAddressingPanel` | md | — | Follow-up evidence detail per top gap |
| `ProfileSupplementsEditor` | md | — | Follow-up evidence detail per supplement |

---

### `ProgressModal` (`src/components/ui/progress-modal.tsx`)

A reusable blocking progress dialog used by all AI generation and long-running
data-fetch actions. It wraps the same visual pattern established by the "Scan
for new jobs" modal.

**States:**
- **Running** (`phase="running"`): spinning border circle + title + primary
  message + optional `statusLine` (animated pulse, used for streaming labels
  like current research axis) + optional `subtitle` (smaller muted text).
  The backdrop is not clickable; the modal cannot be dismissed.
- **Done** (`phase="done"`): shows `children` (success content) or an `error`
  string in a danger callout. An X button appears in the header and a Close
  button appears in the footer; clicking either or the backdrop closes the
  modal.

**Props:** `open`, `phase`, `title`, `message`, `subtitle?`, `statusLine?`,
`error?`, `children?`, `onClose`.

**Used by:**
| Action | Title | Success message |
|---|---|---|
| Evaluate N selected jobs | "Evaluating N jobs" | "{N} evaluated successfully" |
| Verify active postings | "Verifying active postings" | Badge summary + "close to take action" |
| Extract profile with AI | "Extracting profile with AI" | "{N} skills extracted" |
| Scan with Adzuna | "Scanning Adzuna" | "Found N listings — X new, Y duplicates" |
| Start/Re-research | "Researching company" | "Research complete — scroll down…" |
| Generate/Regenerate outreach | "Generating outreach messages" | "3 messages ready — scroll down…" |
| Prepare application answers | "Preparing application answers" | "Answers prepared — scroll down…" |

---

## Data and Privacy

- All data is stored locally in `data/job-search-terminal.sqlite` on the user's machine.
- No data is sent to any server except AI provider API calls (evaluation,
  generation, etc.).
- The database file is excluded from git.
- Portable account backup: Account → Settings → Data & Backup creates a `.jst-backup`
  archive with the database, database-referenced resume lane files, generated documents, source
  configuration, and scanner history. Optional password protection encrypts the
  complete payload. Creation streams files into the archive and shows a
  `ProgressModal` (cycling through three phase labels) while the local snapshot
  is packaged. Other files under `assets/` are always ignored.
- Restore: Account → Settings → Data & Backup validates the archive, previews its
  contents in a bounded disk staging area, creates a rollback backup, then
  replaces the managed local snapshot after explicit confirmation.
- Database-only backup: `npm run data:backup` writes a SQLite snapshot to
  `output/backups/`.
- Export: `npm run data:export` writes a JSON snapshot to `output/exports/`.
- To reset all data: `npm run db:reset` (drops local data and initializes an empty profile).
