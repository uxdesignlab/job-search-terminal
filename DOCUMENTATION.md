# Job Search Dashboard — Full Documentation

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Pages and Features](#pages-and-features)
4. [Resume System](#resume-system)
5. [AI Integration](#ai-integration)
6. [Job Scanner](#job-scanner)
7. [Database](#database)
8. [Configuration](#configuration)
9. [API Reference](#api-reference)
10. [Scripts Reference](#scripts-reference)
11. [Data Storage](#data-storage)
12. [Tech Stack](#tech-stack)

---

## Overview

This is a **local-first job-search command center** built on Next.js 15. All data lives on your machine in a single SQLite database — nothing is sent to external servers except AI API calls when you have a key configured.

The app covers the full job search lifecycle:

- Discover jobs by scanning company career portals automatically
- Score each job against your profile, skills, and constraints
- Generate tailored, ATS-optimized resumes for individual roles
- Track applications, follow-ups, and responses
- Prepare for interviews with a STAR story bank
- Draft outreach messages for recruiters and hiring managers
- Research companies before interviews

---

## Core Concepts

### Resume Lanes

You upload multiple base resumes, each representing a different positioning angle (e.g., "Principal IC", "Design Leadership", "Design Operations"). The app picks the best-matching lane for each job and tailors content from it. Lanes are named — the name is used by the recommendation algorithm so names should reflect the career angle, not a file name.

### Evaluation Blocks (A–G)

When you evaluate a job, the AI runs seven analysis blocks in sequence:

| Block | Name | What it produces |
|-------|------|-----------------|
| A | Role Summary | Archetype classification, seniority level, domain, team context, remote policy |
| B | CV Match | Fit score (0–100), recommendation, strengths, gaps, red flags |
| C | Level Strategy | Positioning advice, seniority negotiation angles, market demand |
| D | Compensation & Demand | Salary band estimate, market context (uses real-time web search when available) |
| E | Tailoring Plan | Specific resume changes to make for this role |
| F | Interview Plan | 3–6 STAR stories mapped to likely questions |
| G | Posting Legitimacy | Freshness signals, repost indicators, ghost job risk |

Each block streams in as it completes so you see results progressively.

### Fit Score

A 0–100 score computed from:
- Keyword and skill overlap with the job description
- Role archetype match against your role directions
- Constraint and dealbreaker checks
- Seniority alignment
- Red flag penalties

| Score | Label |
|-------|-------|
| 85–100 | Strong fit |
| 70–84 | Review |
| 55–69 | Selective |
| 0–54 | Weak fit |

### Role Archetypes

The evaluator classifies each job into one of these archetypes, which drives the resume lane recommendation:

| Archetype | Typical titles | Default resume lane |
|-----------|---------------|---------------------|
| Design Leadership | CXO, VP Design, Director, Design Manager | Principal / Product Design Leadership |
| Principal Product Design | Senior IC, Principal, Lead Designer | Principal / Product Design Leadership |
| Design Operations | DesignOps, Design Program Manager | Design Operations |
| Accessibility / Design Systems | A11Y Engineer, DS Lead | Accessibility / Design Systems |
| UX Education | Instructor, Curriculum Designer | Teaching / UX Education |
| AI Product Strategy | AI Product Designer, Product Strategy | Principal / Product Design Leadership |
| Avoid | Junior, Intern, Brand/Graphic Designer | No resume recommended |

---

## Pages and Features

### Dashboard (`/dashboard`)

The home screen. Shows:

- **Quick actions** — Scan for jobs, run a bulk evaluate
- **Funnel metrics** — Count of jobs at each pipeline stage (Found → Reviewed → Resume Generated → Applied → Interviewing)
- **Priority matches** — Highest-scoring jobs with a fit badge and quick-link to the job detail
- **Latest scan stats** — How many jobs were found, filtered, and added in the last scan
- **Activity feed** — Chronological log of all actions (jobs added, evaluations run, resumes generated)

### Jobs (`/jobs`)

Full job list with Google Sheets-style column filtering:

- **Column filters** — Click any column header chevron (▾) to filter by values in that column. Active filters show a dot (●). Clear per-column or clear all.
- **Sorting** — Click a column header to sort ascending/descending (↑/↓)
- **Row selection** — Checkbox per row; "Select all" in the header
- **Bulk actions** (appear when rows are selected):
  - **Evaluate** — run AI evaluation on all selected jobs
  - **Skip** — mark all selected as Skipped
  - **Archive** — mark all selected as Archived
  - **Delete** — permanently remove selected jobs

### Job Detail (`/jobs/[id]`)

The most feature-dense page. Sections from top to bottom:

**Header actions:**
- Re-evaluate with AI (streaming modal)
- Generate tailored resume
- Prepare application answers
- Job posting link
- Research (company deep-dive)
- Outreach (message drafts)
- Save for follow-up
- Delete job

**Stat cards:**
- Fit score, Date posted, Status
- Resume base selector — interactive dropdown to pick which resume lane to use for generation

**Evaluation summary** — AI-written summary, badges (score label, archetype, legitimacy), why it matches, main concern, salary notes

**Recommended action** — Priority apply / Strong apply / Review manually / Save for later / Skip

**Three-column match grid** — Requirement match · Resume evidence · Gaps and red flags

**Tailored resume card** (appears after generation) — Edit resume button, Open PDF button

**Application tracker** — Status buttons, follow-up date, notes

**Application assistant** — Custom question input, AI-drafted answers

**Evaluation blocks A–G** — Full content of all seven blocks

**Save a story** — Quick-save a STAR story from Block F to the story bank

**Correct evaluation** — Override score, recommendation, summary, strengths, gaps, red flags with a correction note

### Applications (`/applications`)

Tracks every job where you've taken action beyond "Found":

- **Funnel row** — Count of jobs at each tracked stage
- **Tracked applications table** — Company, Role (linked to job detail), Status badge, Follow-up date with Upcoming/Overdue indicator, Fit score

### Interview Prep (`/interview-prep`)

- **Story bank** — CRUD for STAR+Reflection stories. Each story has: Title, Situation, Task, Action, Result, Reflection, linked skills, themes, and the source job
- Stories can be saved quickly from the Block F panel on any job detail page

### Analytics (`/analytics`)

Pattern analysis across all jobs:

- Funnel conversion rates
- Fit score distribution
- Archetype breakdown
- Rejection pattern analysis
- Remote policy stats

### Strategy (`/strategy`)

Shows your configured role directions with fit scores and rationale. Role directions are defined in your profile and used by the evaluator to fine-tune scoring.

### Resumes (`/resumes`)

Two sections:

**Resume lanes** — Your uploaded base resumes. Shows name, word count, and "Source ready" status.

**Generated documents table** — All tailored resumes produced so far. Columns: Target (job title + company), Posted date, Base resume used, Generated date, Keyword coverage %, Status, Output links (Preview / PDF / Job posting). Draft-status rows link the title to the edit page.

### Job Liveness Check

On any job detail page, click **"Check live"** in the header actions. The app fetches the posting URL and classifies it as:

- **Live ✓** — HTTP 200, active posting signals found
- **Expired** — HTTP 404/410 or expired content pattern matched (e.g., "position filled", "no longer accepting applications")
- **Status uncertain** — Request failed or no clear signal either way

The status badge persists in the header until you check again. Use it before finalizing your application to avoid wasted effort on ghost postings.

**How it works:** A lightweight HTTP fetch reads up to 30 KB of the page body and matches against a pattern library — no Playwright or browser needed. No browser fingerprinting, no login, no third-party service.

### Research (`/jobs/[id]/research`)

AI-generated company deep-dive on six axes:

1. AI strategy — How the company uses or competes on AI
2. Recent movements — Layoffs, funding, leadership changes
3. Engineering culture — Tech stack, team structure, work style
4. Technical challenges — What problems the team is solving
5. Competitive position — Where they stand in the market
6. Candidate angle — What you should emphasize in your interview

### Outreach (`/jobs/[id]/outreach`)

Three message drafts (under 300 characters each, LinkedIn-ready):

- Recruiter outreach
- Hiring manager outreach
- Peer / referral outreach

### Profile (`/profile`)

Your career profile. This data feeds into every evaluation and generation:

**Read-only display:**
- Name, location, portfolio
- Target roles, strongest skills
- Constraints

**Writing voice** — Paste writing samples (emails, cover letters, LinkedIn posts) separated by `---`. The AI extracts your personal tone, formality, sentence structure, and vocabulary patterns, then stores this as a style profile. All AI-generated content (application answers, resume summaries, outreach drafts) will be written to match your authentic voice instead of generic AI defaults.

**Editable fields:**
- Current search goal, direction, urgency
- Target roles, desired industries, work preferences
- Constraints, deal breakers
- Career intent, career-change interest
- Compensation needs, confidence level
- Skills to use more / use less
- Preferred locations, remote preference

**Resume lanes** — Each resume shows its name (editable inline) and a "Re-upload PDF" button. Renaming takes effect immediately for future generations. Re-uploading replaces the PDF file and re-extracts text.

**Skill inventory** — Auto-extracted from your resumes. Shows skill name, category, and evidence source.

### Account / Settings (`/settings` via Account menu)

- **AI provider** — Choose between Claude (Anthropic), Gemini (Google), or GPT (OpenAI). Enter API keys. Test connection.
- **Active provider health indicator** — Green dot in the nav if a key is configured and working.
- **Scan sources** — Toggle which company career portals to scan. Add custom sources with name and careers URL.

---

## Resume System

### Upload a Base Resume

1. Go to **Profile**
2. In the **Resume lanes** section, click **Re-upload PDF** on any lane
3. Select your PDF. The text is extracted automatically.

### Rename a Resume Lane

1. Click the **✎** pencil icon next to the resume name
2. Type the new name, press Enter or click Save

The name is what the recommendation algorithm matches against. Use names like:
- `Executive / Leadership` (for management-track roles)
- `IC / Product Design` (for individual contributor roles)
- `Design Operations` (for DesignOps/program management roles)

### Generate a Tailored Resume

1. Open a job detail page
2. Click **Generate tailored resume**
3. Select the base resume lane (the recommended one is pre-selected)
4. Click **Generate** — takes 15–30 seconds with AI
5. You land on the **Edit resume** page

### Edit a Resume Draft

The editor is a split-pane view:
- **Left** — editable fields: Name, Headline, Contact info, Professional Summary, Key Achievements, Experience entries (Title, Organization, Location, Date range, Bullets), Skills, Recognition
- **Right** — live preview iframe that auto-updates 400ms after any change. Click **↻ Refresh** to force an immediate update.
- Education is display-only (pulled from your resume, not editable here)

### Create the PDF

Click **Create PDF →** in the top-right of the editor. This:
1. Saves your current edits
2. Renders HTML via Playwright/Chromium
3. Stores the PDF locally
4. Redirects you to the job detail page

PDF filename format: `FirstName_LastName_Job_Title.pdf` — ATS-friendly, underscores, no special characters.

### Keyword Coverage

The percentage shown on the resume card is how many of the job's top evaluation keywords appear somewhere in the generated resume text. 0% means the base resume may not have been tailored yet or the keywords are very specialized.

---

## AI Integration

### Providers

Three providers are supported. All keys are stored in the local database — not in `.env` files.

| Provider | Default model | Best for |
|----------|--------------|----------|
| Anthropic Claude | claude-sonnet-4-6 | Evaluation blocks, resume tailoring |
| Google Gemini | gemini-2.0-flash | Fast research, structured JSON |
| OpenAI GPT | gpt-4o | Application answers, outreach |

### Fallback Chain

If the active provider fails, the system tries the others in order: Anthropic → Gemini → OpenAI. Only providers with a configured API key are tried.

### Without an API Key

The app works without any AI key using rule-based fallbacks:
- Job evaluation uses keyword matching instead of LLM blocks
- Resume tailoring reorders bullets by keyword overlap
- Application answers use templated questions
- Research and outreach are unavailable without AI

### Prompt Caching

When using Anthropic, long system prompts are marked with `cache_control: ephemeral` to use Anthropic's prompt caching. This reduces cost and latency for repeated evaluations.

### Testing Your Connection

Go to **Account → Settings → AI provider**, enter a key, and click **Test connection**. The result shows latency and confirms the model is reachable.

### Web Search for Compensation (Block D)

Block D now attempts real-time market data before falling back to training knowledge:

- **Anthropic** — uses the `web_search_20250305` managed tool. The model decides what to search and synthesizes the results into the compensation analysis.
- **Gemini** — uses Google Search grounding. The model has live Google Search access during the Block D call.
- **OpenAI** — falls back to training data (web search not available in the standard Chat Completions API).

When live data is used, Block D bullets will be more specific to the current market for that archetype/location combination. No additional API key is required — the search runs through the same provider you have configured.

### Writing Voice (Style Extraction)

When you extract your writing style on the **Profile** page, the app analyzes your samples and stores a structured profile:

```json
{
  "tone": "confident, direct, occasionally self-deprecating",
  "formality": "semi-formal",
  "sentenceStyle": "short punchy sentences mixed with longer elaborations",
  "vocabularyLevel": "plain",
  "rhetoricalPatterns": ["opens with concrete examples", "uses questions to engage"],
  "thingsToAvoid": ["passive voice", "corporate jargon"],
  "styleGuide": "Write like someone who has earned confidence through results..."
}
```

This profile is injected into the system prompt for:
- **Application answers** (`llm-answer-generator.ts`)
- **Resume summaries** (`llm-tailorer.ts`)
- **Outreach messages** (`llm-outreach.ts`)

If no style has been extracted, generators use a generic "professional but natural" default.

---

## Job Scanner

### How It Works

The scanner reads `config/portals.yml` to find company career portals. It detects which ATS each company uses (Greenhouse, Ashby, Lever) and calls the appropriate public API. Jobs are filtered by title keywords and deduplicated against existing records.

### portals.yml Structure

```yaml
companies:
  - name: Figma
    api: greenhouse
    board: figma
    title_includes:
      - Product Design
      - UX
    title_excludes:
      - Junior
      - Intern
      - Brand
```

- `api`: `greenhouse`, `ashby`, or `lever`
- `board`: the company's ATS board slug (from their careers URL)
- `title_includes`: only include jobs matching at least one term
- `title_excludes`: skip jobs matching any of these terms

### Adding a Company

1. Go to **Account → Settings → Scan sources**
2. Click **Add source**, enter company name and careers URL
3. The scanner will attempt to auto-detect the ATS type on next run

Or edit `config/portals.yml` directly for full control.

### Triggering a Scan

- Click **Scan for jobs** on the Dashboard
- Or run `npm run scanner:check` from the terminal

---

## Database

All data is stored in `data/js.sqlite`. The database uses WAL mode for reliability.

### Tables

| Table | Purpose |
|-------|---------|
| `user_profile` | Single row — your career profile, goals, constraints |
| `skill_inventory` | Skills extracted from your resumes |
| `role_directions` | Configured career direction lanes with scores |
| `jobs` | All discovered or manually added job postings |
| `scan_runs` | History of scanner executions |
| `scan_sources_custom` | Custom scan sources added via Settings |
| `scan_source_overrides` | Enable/disable specific companies |
| `evaluations` | AI evaluation results for each job |
| `evaluation_feedback` | Your manual corrections to evaluations |
| `resumes` | Base resume metadata and extracted text |
| `generated_documents` | Tailored resume HTML, PDF, and draft data |
| `applications` | Application status tracking |
| `application_answer_drafts` | AI-drafted application answers |
| `outreach_drafts` | Outreach message drafts |
| `company_research` | Company research notes |
| `story_bank` | STAR interview stories |
| `writing_style_cache` | Cached writing tone profile |
| `ai_settings` | AI provider keys and preferences (single row) |
| `activity_log` | Audit log of all app actions |

### Migrations

Schema changes are applied automatically on startup via the migration runner in `src/lib/db/schema.ts`. Migrations are numbered and idempotent — safe to run multiple times.

### Backup

```bash
npm run data:backup
```

Creates a timestamped copy in `output/backups/`.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JS_DATABASE_PATH` | `data/js.sqlite` (relative to project root) | Override the database file location |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Auto-detected | Override Chromium path for PDF rendering |

Create a `.env.local` file in the project root to set these:

```
JS_DATABASE_PATH=/absolute/path/to/your/database.sqlite
```

### AI Keys

Configured via the UI at **Account → Settings**. Stored in the `ai_settings` table.

### Scanner Config

Edit `config/portals.yml` to add, remove, or adjust company scan targets.

---

## API Reference

All routes are under `/api/`. Server actions on page components handle most mutations — these routes exist for async operations that need streaming or file handling.

### `GET /api/evaluate/[jobId]`

Streams a Server-Sent Events (SSE) response. Each event is a JSON object:

```json
{ "block": "a", "content": { ... }, "done": false }
{ "block": "g", "content": { ... }, "done": true }
```

Block keys: `a`, `b`, `c`, `d`, `e`, `f`, `g`

### `POST /api/resume/generate`

```json
// Request
{ "jobId": "job-abc123", "resumeId": "principal-product-design" }

// Response
{ "documentId": "document-job-abc123" }
```

### `POST /api/generated-documents/[id]/render-pdf`

```json
// Request
{ "draft": { ...ResumeTemplateInput } }

// Response
{ "ok": true }
```

### `POST /api/resume/[id]/upload`

Multipart form data with a `file` field (PDF). Returns:

```json
{ "ok": true, "wordCount": 812 }
```

### `PATCH /api/resume/[id]`

```json
// Request
{ "name": "Executive / Leadership" }

// Response
{ "ok": true }
```

### `PATCH /api/jobs/bulk`

```json
// Request — status update
{ "ids": ["job-1", "job-2"], "status": "Skipped" }

// Request — delete
// Use DELETE method instead, same body format
{ "ids": ["job-1", "job-2"] }
```

### `GET /api/ai/test`

```json
{ "ok": true, "latencyMs": 1240 }
// or
{ "ok": false, "error": "Invalid API key" }
```

### `GET /api/research/[jobId]`

SSE stream of company research. One event per research axis.

### `GET /api/outreach/[jobId]`

SSE stream producing three outreach drafts (recruiter, hiring\_manager, peer).

---

## Scripts Reference

Run all scripts from the project root with `npm run <script>`.

| Script | What it does |
|--------|-------------|
| `dev` | Start dev server at http://localhost:3000 |
| `build` | Production build |
| `start` | Run production server |
| `lint` | ESLint check (zero warnings allowed) |
| `typecheck` | TypeScript type check (no emit) |
| `db:migrate` | Apply pending schema migrations |
| `db:seed` | Populate with seed/demo data |
| `db:reset` | Drop all tables and re-run migrations |
| `db:check` | Validate database integrity |
| `profile:extract` | Extract profile data from resume PDFs |
| `profile:check` | Validate profile completeness |
| `scanner:check` | Run scanner and print discovery stats |
| `evaluation:check` | Test evaluation pipeline on sample data |
| `document:check` | Test resume generation and PDF rendering |
| `application:check` | Validate application tracking |
| `quality:check` | Full suite: lint + typecheck + all checks |
| `data:backup` | Backup database to `output/backups/` |
| `data:export` | Export data to JSON/CSV in `output/exports/` |

---

## Data Storage

```
project root/
├── data/
│   └── js.sqlite           # Primary database (all your data)
├── assets/
│   └── *.pdf               # Your uploaded base resume PDFs
├── output/
│   ├── *.html              # Generated resume HTML files
│   ├── *.pdf               # Generated tailored PDF resumes
│   ├── backups/            # Database backups
│   └── exports/            # JSON/CSV data exports
└── config/
    ├── portals.yml         # Companies to scan
    └── portals.example.yml # Reference template
```

**Important**: `data/js.sqlite` is your entire dataset. Back it up before making schema changes or running `db:reset`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React Server Components) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 3 |
| Database | SQLite via better-sqlite3 (synchronous, no ORM) |
| AI — Anthropic | @anthropic-ai/sdk → Claude Sonnet 4.6 |
| AI — Google | @google/generative-ai → Gemini 2.0 Flash |
| AI — OpenAI | openai → GPT-4o |
| PDF parsing | pdf-parse |
| PDF rendering | Playwright Core (Chromium) |
| YAML config | js-yaml |

The app is intentionally local-first: no cloud database, no authentication, no external data persistence. The SQLite file is the source of truth.
