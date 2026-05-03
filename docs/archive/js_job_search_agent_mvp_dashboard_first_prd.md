# Job Search Terminal MVP — Dashboard-First PRD

## Product position

Job Search Terminal is a job-search command center built on top of the existing CareerOps open-source project.

CareerOps repository: https://github.com/santifer/career-ops

Reference case study / product write-up: https://santifer.io/career-ops-system

Job Search Terminal should reuse as much proven CareerOps functionality as possible, then wrap it in a cleaner, dashboard-first user experience.

CareerOps is not just inspiration. It is the implementation foundation.

Job Search Terminal is a job-search command center that uses CareerOps automation under the hood, but presents the experience as a clean dashboard.

The user should not feel like they are running scripts, editing files, or managing a developer tool. They should feel like they are using a focused SaaS product built to help them find, evaluate, tailor, and apply to the right jobs faster.

The ugly machinery stays backstage.

---

## Core principle

The user is not here to operate software.

The user is here to find a job, make better career decisions, and understand where they actually fit.

Everything in the product should reduce friction, decision fatigue, and manual repetition.

The product must be built around the user first, not around the job listing, the resume, or the automation.

Before Job Search Terminal searches for jobs, it needs to understand the user:

- Who they are
- What they have done
- What they are good at
- What they want next
- How urgent the search is
- What constraints they have
- What they are trying to avoid
- Whether they want to stay on the same path or explore a career shift

The software should behave less like a resume machine and more like a career-search agent with memory, judgment, and a point of view.

---

## MVP goal

Build a dashboard-first MVP that helps Pavel:

1. Build a clear user profile from resumes, skills, proof points, preferences, urgency, and career intent.
2. Understand which roles match the user’s current path.
3. Suggest adjacent roles or outside-the-box opportunities worth considering.
4. Find newly posted jobs.
5. Review best-fit opportunities in one dashboard.
6. Understand which jobs are worth applying to and why.
7. Generate tailored resumes and PDFs without touching templates or scripts.
8. Prepare application answers.
9. Track applications and follow-ups.

The product should feel like a simple SaaS app, even if the backend initially reuses CareerOps logic.

---

## CareerOps foundation

This PRD assumes Job Search Terminal starts from CareerOps, not from scratch.

Source repository:

https://github.com/santifer/career-ops

CareerOps already proves the core job-search automation model works. It includes scanning, pipeline management, evaluation modes, resume tailoring, PDF generation, application help, tracking, dashboard metrics, and Codex routing.

Important implementation note: CareerOps was originally built with Claude Code, OpenCode, and Gemini CLI-style workflows in mind. Job Search Terminal will use CareerOps as the foundation, but Codex is the primary development and agent orchestration tool for this project. Any reused CareerOps logic must be adapted so Codex can operate it cleanly through `AGENTS.md`, structured project instructions, and dashboard-triggered workflows.

Codex is the default operating path. Gemini CLI, Google/Gemini-based search workflows, or other external search clients may be added later as optional adapters when they provide useful job discovery, research, or indexing capabilities. They should not become the primary product workflow unless there is a clear advantage.

The development strategy is:

1. Study CareerOps repository structure.
2. Reuse working scripts, prompts, modes, templates, and data flow wherever possible.
3. Replace only the parts that conflict with the Job Search Terminal product direction.
4. Build a dashboard interface on top of the proven engine.
5. Avoid rebuilding functionality CareerOps already handles well.

The product mistake to avoid: treating this as a greenfield app.

Job Search Terminal should be a user-centered product layer over CareerOps, not a rewrite for the sake of rewriting.

---

## What we reuse from CareerOps

CareerOps gives us working logic for:

- scanning job portals
- detecting Greenhouse, Ashby, and Lever jobs
- deduplicating roles
- maintaining a pipeline
- evaluating fit
- generating reports
- tailoring resumes
- generating PDFs through Playwright
- preparing application answers
- tracking applications
- dashboard metrics
- Codex routing through `AGENTS.md`
- Optional Gemini CLI / search workflow patterns where useful

CareerOps may include references to Claude Code, OpenCode, Gemini CLI, or slash-command workflows. For Job Search Terminal, these should be treated as implementation references, not the final operating model. The Job Search Terminal implementation must prioritize Codex-compatible workflows.

If Gemini CLI or other search clients help with discovery, research, or broader job-source coverage, they may be integrated as secondary adapters. The dashboard should hide which underlying tool performed the search.

Specific CareerOps assets to inspect and adapt:

- `scan.mjs` — job scanning for Greenhouse, Ashby, and Lever
- `generate-pdf.mjs` — Playwright HTML-to-PDF generation
- `templates/cv-template.html` — ATS resume template foundation
- `templates/portals.example.yml` — job source configuration
- `modes/auto-pipeline.md` — URL/JD to evaluation + PDF + tracker flow
- `modes/oferta.md` — job evaluation structure
- `modes/pdf.md` — resume tailoring and PDF generation logic
- `modes/apply.md` — application answer assistant
- `modes/pipeline.md` — job URL inbox flow
- `modes/tracker.md` — application tracker logic
- `dashboard/` — dashboard metrics and pipeline views
- `AGENTS.md` — Codex routing instructions
- `docs/CODEX.md` — Codex setup and behavior rules

We reuse the engine.

We do not reuse the user experience as-is.

---

## What changes from CareerOps

CareerOps should remain the foundation, but the user experience must change.

CareerOps is mostly local, file-based, and CLI-driven.

Job Search Terminal should be dashboard-first.

| CareerOps | Job Search Terminal MVP |
|---|---|
| User runs scripts | User clicks buttons |
| Markdown tracker | Dashboard pipeline |
| Local file mental model | SaaS-like workspace |
| CLI commands | Guided workflows |
| One CV source | Multiple resume profiles |
| AI/engineering archetypes | UX/product/design leadership archetypes |
| Terminal dashboard | Web dashboard |
| Manual file inspection | Visual job cards and detail views |

---

## MVP user experience

### User starts with themselves

The first experience should not be a job search box.

The first experience should be a guided user profile setup.

The system asks for:

- Resume or resumes
- LinkedIn profile
- Portfolio or case studies
- Target roles
- Desired industries
- Location and remote preferences
- Compensation needs
- Urgency level
- Deal breakers
- Career direction
- Career-change interest
- Confidence level
- Skills the user wants to use more
- Skills the user wants to move away from

The product then creates a working career profile:

- Skill inventory
- Strengths
- Weak spots
- Role fit map
- Preferred work conditions
- Resume strategy
- Suggested role directions
- Search strategy

The system should ask clarifying questions when the profile is thin, contradictory, or too generic.

Examples:

- “Are you trying to stay in UX leadership, or are you open to AI product strategy roles?”
- “Do you want a title upgrade, better compensation, better work-life balance, or a stronger company?”
- “Are you willing to take a strategic IC role if the company and scope are strong?”
- “Do you want me to search only obvious matches, or also adjacent roles?”

This is the product’s foundation. Job matching starts after user understanding.

---

### User opens the app

They see a dashboard with:

- New jobs found
- Best matches
- Jobs needing review
- Resumes generated
- Applications submitted
- Follow-ups due
- Interviews in progress
- Weak matches skipped

No scripts. No terminal. No file hunting.

---

## Primary workflow

### 1. Understand the user

User completes or updates their career profile.

The system analyzes:

- Resume content
- Skill set
- Seniority level
- Leadership signals
- Domain expertise
- Portfolio proof points
- Career goals
- Urgency
- Constraints
- Desired direction

The system produces:

- Career profile summary
- Skill inventory
- Role-fit map
- Recommended target roles
- Adjacent roles to consider
- Resume strategy
- Search strategy

The user can accept, edit, or reject these recommendations.

---

### 2. Find jobs

User clicks:

**Scan for new jobs**

The system scans configured sources and shows new roles.

Each job card shows:

- Company
- Role title
- Location / remote status
- Date posted or first seen
- Source
- Freshness label
- Match status
- Quick action

Freshness labels:

- New today
- New this week
- Recently found
- Possibly stale
- Already reviewed

---

### 3. Review jobs

User sees jobs ranked by relevance.

Each card shows:

- Fit score
- Role archetype
- Why it matches
- Main concern
- Recommended action

Recommended actions:

- Priority apply
- Strong apply
- Review manually
- Save for later
- Skip

The system should be opinionated. Not every job deserves attention.

---

### 4. Open job detail

The job detail page shows:

- Role summary
- Company summary
- Fit score
- Freshness signal
- Salary/location notes
- Requirement match
- Resume evidence
- Gaps
- Red flags
- Recommended resume base
- Application strategy

Primary buttons:

- Generate tailored resume
- Generate application answers
- Mark as applied
- Save for later
- Skip

---

### 5. Generate tailored resume

User clicks:

**Generate tailored resume**

The system:

1. Selects the best base resume.
2. Tailors the summary.
3. Reorders relevant proof points.
4. Injects truthful JD keywords.
5. Generates an ATS-friendly PDF.
6. Shows a preview and download button.

The user should not see HTML, Playwright, templates, or file paths unless they ask.

---

### 6. Prepare application answers

User clicks:

**Prepare application answers**

The system creates copy-paste answers for common application questions:

- Why are you interested in this role?
- Why this company?
- Tell us about relevant experience.
- What makes you a good fit?
- Salary expectations.
- Work authorization.
- Anything else we should know?

If the user pastes custom questions, the system answers those directly.

The system does not submit the application automatically.

---

### 7. Track application

After applying manually, user clicks:

**Mark as applied**

The system updates the dashboard.

Application statuses:

- Found
- Reviewed
- Resume generated
- Applied
- Follow-up needed
- Recruiter responded
- Interviewing
- Offer
- Rejected
- Skipped
- Archived

---

## Dashboard sections

### 1. User Strategy Dashboard

This is the first dashboard, because the product is built around the user.

Cards:

- Current search goal
- Urgency level
- Best-fit role families
- Adjacent roles worth exploring
- Strongest skills
- Skills needing reinforcement
- Resume readiness
- Search focus
- Recommended next action

This dashboard should answer:

- What am I looking for?
- Where do I fit best?
- What should I avoid?
- Where should I stretch?
- What is the smartest next move?

---

### 2. Job Search Overview

Cards:

- New jobs today
- Priority matches
- Strong matches
- Jobs skipped
- PDFs generated
- Applications sent
- Interviews active

---

### 3. Position Dashboard

A table/card view of all jobs.

Filters:

- Status
- Fit score
- Freshness
- Company
- Role archetype
- Location
- Remote/hybrid/onsite
- Resume generated yes/no
- Applied yes/no

Sort options:

- Freshest first
- Highest match
- Best strategic fit
- Needs action
- Recently updated

---

### 4. Application Dashboard

Shows the funnel:

- Found
- Reviewed
- Applied
- Responded
- Interviewing
- Offer / Rejected

Also shows:

- Response rate
- Interview rate
- Average fit score of applied jobs
- Follow-ups due

---

### 5. Resume Studio

Shows resume variants:

- Executive UX/Product Leadership
- DesignOps / AI Governance
- Accessibility / Design Systems
- Principal Product Design
- Academic / UX Education

For each generated resume:

- Target company
- Target role
- Date generated
- Base resume used
- PDF download
- Tailoring summary

---

### 6. Job Detail View

Every job should have a detail page with:

- Job description
- Parsed role summary
- Score breakdown
- Evidence mapping
- Resume tailoring plan
- Generated documents
- Application notes
- Status timeline

---

### 7. History / Activity Log

This does not need to be fancy in MVP, but it should exist.

Track:

- Job discovered
- Job evaluated
- Resume generated
- Application answers generated
- Marked as applied
- Follow-up added
- Status changed

This gives the product memory.

---

## Key product behaviors

### The product should keep the user in mind

The system should not treat every user as a generic applicant.

It should remember:

- Their goals
- Their urgency
- Their strengths
- Their constraints
- Their resume variants
- Their preferred direction
- Their open questions
- Their application history
- Their feedback on recommendations

If the user repeatedly skips certain jobs, the agent should learn.

If the user says a score is wrong, the agent should update its understanding.

If the user is aiming too low or too broadly, the product should say so.

If the user is missing an obvious adjacent path, the product should surface it.

---

### The product should prioritize jobs automatically

The user should not have to inspect every role manually.

The system should group jobs into:

- Apply now
- Worth reviewing
- Maybe later
- Skip

---

### The product should explain its recommendation

Every score should answer:

- Why this score?
- What evidence supports it?
- What is missing?
- What should I do next?

---

### The product should suggest career directions, not just jobs

The system should recommend:

- Direct-match roles
- Adjacent roles
- Stretch roles
- Career-change paths
- Roles to avoid
- Skills to strengthen before applying

Examples:

- A UX Director may also fit DesignOps leadership, AI product strategy, accessibility governance, or product design principal roles.
- A senior IC may be ready for manager roles, but only if their evidence shows mentoring, cross-functional leadership, and decision ownership.
- A career changer may need a bridge role instead of jumping straight into an unrealistic target.

The point is not to flatter the user. The point is to give them a better map.

---

### The product should reduce resume chaos

The user should not manually decide which resume to use every time.

The system should recommend the best resume base and explain why.

---

### The product should hide implementation details

No user-facing references to:

- `scan.mjs`
- `pipeline.md`
- `applications.md`
- `generate-pdf.mjs`
- file paths
- command-line scripts

Those may exist internally, but the dashboard should translate them into plain actions.

---

## MVP feature list

### Must have

- Guided user onboarding
- Resume upload/input
- Skill inventory generation
- Career intent capture
- Urgency and constraints capture
- Role-fit map
- Adjacent role recommendations
- Dashboard home
- Scan for new jobs button
- Job cards
- Job table
- Job detail page
- Fit scoring
- Freshness labeling
- Resume base selection
- Tailored resume generation
- PDF generation
- Application answer generation
- Application tracker
- Status updates
- Basic history log

### Should have

- Career-change exploration mode
- Skill-gap recommendations
- Search strategy recommendations
- Follow-up reminders
- Company watchlist
- Resume preview
- Export job report
- Search and filters
- Ghost/stale job warning
- Recruiter outreach draft

### Not MVP

- Auto-submit applications
- Browser extension
- Multi-user accounts
- BYOK
- Billing
- Admin panel
- Public SaaS onboarding
- Complex CRM integrations

---

## Tooling strategy

### Primary tool

Codex is the primary development and agent orchestration tool for Job Search Terminal.

Codex should own:

- project structure
- implementation tasks
- agent instructions
- backend service adaptation
- tests
- dashboard-triggered workflows
- reuse of CareerOps scripts and modes

### Secondary / optional tools

Gemini CLI, Google/Gemini-based workflows, or other search clients may be used later for:

- broader job search coverage
- company research
- role-market research
- compensation research
- indexing or summarizing external sources
- comparing results from multiple discovery providers

These tools should be implemented as adapters behind the dashboard, not as user-facing workflows.

The user should click **Scan for new jobs** or **Research this company**. The system decides whether that action uses CareerOps scanner logic, Gemini, web search APIs, or another source.

### Product rule

The dashboard owns the workflow.

Tools are replaceable engines behind the workflow.

---

## CareerOps reuse strategy

### Reuse directly where possible

- Job source configuration
- Greenhouse/Ashby/Lever scanning logic
- Deduplication logic
- Playwright-based PDF generation
- ATS-safe resume template approach
- Application answer generation workflow
- Tracker status model
- Codex instruction pattern
- Existing Claude Code/OpenCode/Gemini workflow patterns as references to translate into Codex-compatible instructions
- Existing Gemini CLI workflow ideas where they improve search, research, or discovery coverage

### Adapt, do not rebuild

- Agent orchestration: translate CareerOps’ Claude Code/OpenCode/Gemini-oriented workflows into Codex-first workflows.
- Search adapters: allow Gemini or other search clients later, but keep them behind dashboard actions.
- Pipeline storage: move from Markdown-first to database-first, but keep Markdown export as optional.
- Resume source: move from one `cv.md` to multiple resume profiles.
- Evaluation modes: keep the structured evaluation format, but replace AI/engineering archetypes with UX/product/design leadership archetypes.
- Dashboard: use CareerOps dashboard metrics as a reference, but build a SaaS-like web dashboard.
- Scanning: preserve CareerOps portal scanning, then add freshness metadata and dashboard visibility.

### Replace

- CLI-first user experience
- Manual file inspection
- One-resume assumption
- AI-engineering role taxonomy
- Spanish mode naming where it creates friction
- Terminal dashboard as the primary user interface

---

## Recommended MVP architecture

The recommended MVP architecture is local-first with a SaaS-like dashboard.

This preserves CareerOps functionality while giving the user a simple browser-based experience.

The mistake to avoid is forcing everything into Cloudflare too early and breaking the parts that already work.

### Recommendation

Start with a local web app that runs on Pavel’s machine.

The user experience should still feel like a SaaS dashboard:

- Open a browser.
- See the dashboard.
- Click **Scan for new jobs**.
- Review matches.
- Generate tailored resume.
- Download PDF.
- Prepare application answers.
- Track status.

The user should not need to run scripts manually.

Under the hood, the dashboard calls adapted CareerOps scripts and services.

### Local-first stack

- Frontend: Next.js or React/Vite dashboard.
- Styling: Tailwind.
- Backend/API: local Node server.
- Database: SQLite for MVP.
- File storage: local `/output`, `/reports`, and `/uploads` folders.
- Scanner: adapted CareerOps scanner.
- PDF: CareerOps Playwright HTML-to-PDF flow.
- AI: OpenAI API through local backend.
- Primary development and orchestration tool: Codex.
- Agent instructions: `AGENTS.md`.

### Why local-first

CareerOps already works as a local engine.

Local-first keeps:

- full Playwright support
- simpler PDF generation
- easier file handling
- easier debugging
- fewer deployment constraints
- fewer Cloudflare Worker limits
- less infrastructure risk

This is the safest path to a working product.

### User experience in local-first mode

The user starts the app once.

Then the workflow is browser-based:

1. Open `http://localhost:3000`.
2. Dashboard loads profile, jobs, resumes, applications, and history.
3. User clicks **Scan for new jobs**.
4. Local backend runs CareerOps scanner logic.
5. New jobs are saved to SQLite.
6. Dashboard shows new job cards.
7. User clicks **Evaluate**.
8. Local backend calls OpenAI and writes evaluation results.
9. User clicks **Generate tailored resume**.
10. Local backend uses Playwright to generate PDF.
11. PDF appears in the dashboard for preview/download.
12. User applies manually and marks status in the dashboard.

No terminal after launch.

### Optional Cloudflare access layer

If Pavel wants to access the local dashboard from another device, add Cloudflare Tunnel later.

Cloudflare Tunnel can expose a local app through a public hostname without opening local network ports. Cloudflare’s docs describe it as a lightweight `cloudflared` daemon that creates outbound connections between a local service and Cloudflare’s network.

This would allow:

- dashboard runs locally
- CareerOps engine runs locally
- PDFs generate locally
- data stays local
- Pavel can access the dashboard from another browser/device through a Cloudflare URL

This is not the same as fully hosting the app on Cloudflare.

It is a convenience layer.

### Cloudflare-hosted version later

A fully Cloudflare-hosted version can come later when the product needs:

- access without Pavel’s machine running
- private beta users
- user accounts
- BYOK
- shared deployment
- mobile access without local setup

At that point, use:

- Cloudflare Workers for API routes
- Cloudflare D1 for structured data
- Cloudflare R2 for resumes, reports, and PDFs
- Cloudflare Queues or Workflows for background jobs
- Cloudflare Cron Triggers for scheduled scans

But this should be Phase 2, not the first MVP.

### Cloudflare limitation to respect

Cloudflare Workers are excellent for APIs and dashboards, but they are not a natural drop-in replacement for a full local Node/Playwright environment.

CareerOps uses Playwright for dynamic page extraction and PDF generation. Cloudflare has Browser Rendering and a Cloudflare-compatible Playwright package, but this adds limits and complexity.

For MVP, do not sacrifice working PDF generation or job extraction just to say the app is hosted.

### Deployment decision

MVP should be:

**Local engine + browser dashboard + SQLite + Playwright + OpenAI + optional Cloudflare Tunnel later.**

Phase 2 should be:

**Cloudflare-hosted SaaS version with D1, R2, Workers, Queues, auth, and optional BYOK.**

### Product rule

The user experience should be SaaS-like.

The architecture does not need to be SaaS-hosted on day one.

The product succeeds when Pavel can focus on job search, not when the infrastructure looks impressive.

---

## Data objects

### User Profile

- id
- name
- location
- target roles
- desired industries
- compensation needs
- work preferences
- urgency level
- deal breakers
- career intent
- career-change interest
- confidence level
- notes

### Skill Inventory

- id
- user id
- skill name
- skill category
- evidence source
- strength level
- market relevance
- user interest level
- use more / use less preference

### Role Direction

- id
- user id
- role family
- fit level
- rationale
- required evidence
- gaps
- recommendation type: direct, adjacent, stretch, avoid

### Job

- id
- company
- title
- url
- source
- location
- remote type
- date posted
- first seen date
- freshness label
- raw description
- parsed description
- status
- created date
- updated date

### Evaluation

- id
- job id
- fit score
- score label
- role archetype
- summary
- strengths
- gaps
- red flags
- recommendation
- resume base recommendation
- created date

### Resume

- id
- name
- type
- content
- active status

### Generated Document

- id
- job id
- document type
- title
- content
- pdf url
- generated date

### Application

- id
- job id
- status
- applied date
- follow-up date
- notes
- contact
- response status

### Activity Log

- id
- entity type
- entity id
- action
- timestamp
- details

---

## MVP screens

### `/profile`

Guided user profile, resumes, skills, goals, urgency, constraints, and career direction.

### `/strategy`

Role-fit map, adjacent roles, search focus, gaps, and recommended next moves.

### `/dashboard`

Overview of job search activity.

### `/jobs`

All discovered jobs with filters and sorting.

### `/jobs/:id`

Detailed evaluation and actions.

### `/applications`

Application tracker and funnel.

### `/resumes`

Resume variants and generated PDFs.

### `/settings`

Profile, target roles, job sources, API settings.

---

## First build sequence

### Step 0 — Import and map CareerOps foundation for Codex

Before building new functionality, developers must inspect and map the CareerOps repository:

https://github.com/santifer/career-ops

Required outputs:

- Identify where CareerOps assumes Claude Code, OpenCode, Gemini CLI, or slash-command usage
- Identify which Gemini/search workflows are worth preserving as optional adapters
- Translate those assumptions into Codex-first development instructions
- List reusable CareerOps scripts
- List reusable modes/prompts
- List reusable templates
- List reusable dashboard logic
- Identify what can be copied directly
- Identify what needs adaptation
- Identify what should be replaced

This prevents wheel reinvention.

CareerOps should be treated as the working engine. Job Search Terminal should become the user-centered dashboard and product layer around it.

Codex should be treated as the primary implementation partner for Job Search Terminal. Any inherited CareerOps instructions should be rewritten so Codex has clear ownership of project structure, routing, coding tasks, testing, and dashboard-triggered agent workflows.

Gemini/search workflows should remain available as future plug-in adapters where they improve job discovery or research. They should not force the user back into command-line behavior.

---

### Step 1 — User profile and dashboard shell

Build the user profile flow and dashboard layout first.

Do not start with backend scripts.

Screens:

- Profile
- Strategy
- Dashboard
- Jobs
- Job detail
- Applications
- Resumes
- Settings

Use mock data first.

Reason: this forces the product to be UX-first.

---

### Step 2 — Data model

Create tables for:

- user profile
- skill inventory
- role directions
- jobs
- evaluations
- resumes
- generated documents
- applications
- activity log

---

### Step 3 — Job scanner integration

Adapt CareerOps scanner to write jobs into the database instead of Markdown.

Keep Markdown export optional, not primary.

---

### Step 4 — Evaluation agent

Build job evaluation from dashboard action:

Button: **Evaluate job**

Output goes into the job detail page.

---

### Step 5 — Resume/PDF generation

Button: **Generate tailored resume**

Output:

- preview
- PDF download
- tailoring summary

---

### Step 6 — Application assistant

Button: **Prepare answers**

Output:

- copy-paste responses
- saved to job detail

---

### Step 7 — Application tracking

Buttons:

- Mark applied
- Add follow-up
- Mark interview
- Mark rejected
- Archive

---

## Developer instruction: do not reinvent CareerOps

Development should start by pulling apart CareerOps and reusing what already works.

However, do not copy CareerOps’ Claude Code-oriented interaction model blindly. Job Search Terminal is Codex-first. CareerOps logic should be adapted into Codex-readable project instructions, backend services, and dashboard actions.

The Job Search Terminal repo should include clear references back to:

- CareerOps source: https://github.com/santifer/career-ops
- CareerOps write-up: https://santifer.io/career-ops-system

The implementation should not duplicate existing CareerOps behavior unless there is a clear UX, architecture, or scalability reason.

Before creating a new scanner, PDF generator, tracker, or job evaluation flow, check whether CareerOps already has a working version.

If CareerOps has a working version, adapt it.

If CareerOps has a weak user experience, wrap it.

If CareerOps has a wrong assumption for Job Search Terminal, replace only that assumption.

If CareerOps assumes Claude Code, OpenCode, Gemini CLI, or slash commands, translate the workflow into Codex-first implementation using `AGENTS.md`, structured prompts, scripts, services, and dashboard actions.

If Gemini or another search client provides useful discovery or research capability, preserve it as a backend adapter. Do not expose it as a separate user workflow unless the user explicitly needs that level of control.

---

## Dev handoff readiness

This PRD is ready for development with one architectural decision locked:

**MVP runs locally.**

The app should feel like a SaaS dashboard, but the engine runs on Pavel’s machine.

Do not start with full Cloudflare deployment. Do not start with multi-user SaaS. Do not start with BYOK.

### Locked MVP architecture

- Local browser dashboard
- Local Node backend
- SQLite database
- Local file storage for uploads, reports, and PDFs
- Adapted CareerOps scanner logic
- Playwright for PDF generation and page extraction where needed
- OpenAI API through local backend
- Codex as the primary development tool
- `AGENTS.md` as the Codex project instruction file

### Required developer starting point

Before building new logic, inspect CareerOps:

https://github.com/santifer/career-ops

Required CareerOps components to map:

- `scan.mjs`
- `generate-pdf.mjs`
- `templates/cv-template.html`
- `templates/portals.example.yml`
- `modes/auto-pipeline.md`
- `modes/oferta.md`
- `modes/pdf.md`
- `modes/apply.md`
- `modes/pipeline.md`
- `modes/tracker.md`
- `dashboard/`
- `AGENTS.md`
- `docs/CODEX.md`

The first development task is not coding new features. It is mapping what can be reused, adapted, or replaced.

### MVP implementation phases

#### Phase 0 — Repo and CareerOps mapping

Deliverables:

- New `Job Search Terminal` repo structure
- `AGENTS.md`
- `README.md`
- `PRD.md`
- CareerOps reuse map
- Local development setup
- Package scripts

Acceptance criteria:

- Codex can read `AGENTS.md` and understand project direction.
- Developers know exactly which CareerOps components are reused.
- No new scanner, PDF generator, or tracker is built before checking CareerOps first.

---

#### Phase 1 — Dashboard shell with mock data

Deliverables:

- Local dashboard app
- Navigation
- Profile screen
- Strategy screen
- Jobs screen
- Job detail screen
- Applications screen
- Resumes screen
- Settings screen

Acceptance criteria:

- User can open `http://localhost:3000`.
- User sees a real dashboard experience.
- No command line is needed after startup.
- Mock jobs display with fit score, status, freshness, and action buttons.

---

#### Phase 2 — Local data model

Deliverables:

- SQLite schema
- Local migrations
- Seed data
- Data access layer

Required tables:

- user_profile
- skill_inventory
- role_directions
- resumes
- jobs
- evaluations
- generated_documents
- applications
- activity_log

Acceptance criteria:

- Dashboard reads from SQLite, not mock data.
- User profile, jobs, applications, and resumes persist after restart.

---

#### Phase 3 — User profile and skill intelligence

Deliverables:

- Resume input/upload
- Profile setup
- Skill extraction
- Career intent capture
- Urgency and constraints capture
- Role-fit map
- Adjacent role recommendations

Acceptance criteria:

- User can enter resumes and career goals.
- System generates a working profile.
- System recommends direct, adjacent, stretch, and avoid role directions.
- User can edit or override recommendations.

---

#### Phase 4 — Job scanning

Deliverables:

- Adapted CareerOps scanner
- Dashboard button: **Scan for new jobs**
- Job deduplication
- Freshness metadata
- Source configuration

Acceptance criteria:

- User clicks **Scan for new jobs**.
- App scans configured sources.
- New jobs are written to SQLite.
- Dashboard displays new job cards.
- No manual script execution is required.

---

#### Phase 5 — Job evaluation

Deliverables:

- Dashboard action: **Evaluate job**
- Fit scoring
- Requirement-to-evidence mapping
- Gaps and red flags
- Recommended action
- Report saved locally

Acceptance criteria:

- User can evaluate a job from the dashboard.
- Evaluation includes score, recommendation, strengths, gaps, and resume evidence.
- Evaluation is saved and visible on job detail page.

---

#### Phase 6 — Resume tailoring and PDF generation

Deliverables:

- Multiple resume bases
- Dashboard action: **Generate tailored resume**
- Tailoring summary
- ATS PDF generation using adapted CareerOps Playwright flow
- PDF preview/download

Acceptance criteria:

- User can generate a tailored resume for a job.
- App selects or recommends the best resume base.
- PDF is generated and linked to the job.
- User can download the PDF from the dashboard.

---

#### Phase 7 — Application assistant and tracker

Deliverables:

- Dashboard action: **Prepare application answers**
- Copy-paste answer generation
- Application status updates
- Activity history
- Basic follow-up tracking

Acceptance criteria:

- User can generate answers for application questions.
- User can mark a job as applied.
- Dashboard updates application funnel.
- History records key actions.

---

### Explicit non-goals for MVP

Do not build:

- Full Cloudflare-hosted deployment
- Multi-user accounts
- BYOK
- Billing
- Auto-submit applications
- LinkedIn automation
- Browser extension
- Mobile app
- Complex CRM integration
- Public SaaS onboarding

### MVP success criteria

The MVP is successful when Pavel can:

1. Open the dashboard locally.
2. Complete or edit his profile.
3. Scan for jobs.
4. Review ranked job matches.
5. Evaluate a job.
6. Generate a tailored PDF.
7. Prepare application answers.
8. Mark the job as applied.
9. Track progress from the dashboard.

If any of these require manual file editing or command-line interaction after startup, the UX is not done.

---

## Product risk

The biggest risk is building a developer tool and calling it a product.

If the user has to remember commands, inspect files, or manage outputs manually, we failed.

The dashboard must be the product.

CareerOps becomes the engine, not the interface.

---

## Updated MVP statement

Build a dashboard-first job search agent that starts with the user, hides the technical machinery, and gives Pavel a simple workflow:

**Understand the user → map skills and intent → find jobs → evaluate fit → suggest direct and adjacent paths → generate tailored PDF → prepare application → track progress.**

The product should feel like a focused SaaS dashboard from day one, even if the backend starts as adapted CareerOps logic.

