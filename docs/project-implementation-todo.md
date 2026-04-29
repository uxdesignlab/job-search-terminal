# Project Implementation Todo

This document tracks the phased implementation of JS from scaffold to working
local MVP. Keep task status current as work lands.

## Phase 1 — Repo Foundation And CareerOps Map

Goal: create the Codex-first project foundation without implementing product
features.

- [x] Create Next.js, TypeScript, and Tailwind scaffold.
- [x] Keep `AGENTS.md` as the root Codex contract.
- [x] Keep detailed documentation in `docs/`.
- [x] Add minimal README with links to docs.
- [x] Add token-first design system foundation.
- [x] Add accessible UI primitives for future dashboard screens.
- [x] Preserve multiple resume lanes from `assets/`.
- [x] Create CareerOps reuse map.
- [x] Add local configuration examples.
- [x] Add verification scripts.

Exit criteria:

- [x] `npm run lint` passes.
- [x] `npm run typecheck` passes.
- [x] `npm run build` passes.
- [x] No scanner, PDF, SQLite, OpenAI, or real tracker logic is implemented.

## Phase 2 — Dashboard Shell With Mock Data

Goal: build the usable dashboard surface before wiring real engines.

- [ ] Create app navigation for Profile, Strategy, Dashboard, Jobs, Applications, Resumes, and Settings.
- [ ] Build Profile screen with mock profile data.
- [ ] Build Strategy screen with role-fit and adjacent-role mock data.
- [ ] Build Dashboard overview with job-search metrics.
- [ ] Build Jobs list with filters, sorting controls, and accessible table/card views.
- [ ] Build Job Detail screen with evaluation, resume, and action sections using mock data.
- [ ] Build Applications screen with funnel/status mock data.
- [ ] Build Resumes screen showing source lanes and generated-document placeholders.
- [ ] Build Settings screen for job sources and local app preferences.
- [ ] Add responsive layout checks for desktop and mobile widths.
- [ ] Confirm all screens use design-system primitives and WCAG 2.2 AA defaults.

Exit criteria:

- [ ] User can open `http://localhost:3000` and navigate the whole shell.
- [ ] Mock jobs display fit score, status, freshness, and recommended action.
- [ ] No command-line workflow appears in the product UI.

## Phase 3 — Local Data Model

Goal: replace mock data with persistent local storage.

- [ ] Choose and install SQLite migration/data-access tooling.
- [ ] Create migration system.
- [ ] Add `user_profile` table.
- [ ] Add `skill_inventory` table.
- [ ] Add `role_directions` table.
- [ ] Add `resumes` table.
- [ ] Add `jobs` table.
- [ ] Add `evaluations` table.
- [ ] Add `generated_documents` table.
- [ ] Add `applications` table.
- [ ] Add `activity_log` table.
- [ ] Seed local demo data from the current mock data.
- [ ] Replace dashboard mock reads with data-access reads.
- [ ] Document schema decisions in `docs/`.

Exit criteria:

- [ ] Dashboard data persists after restart.
- [ ] Seed data can be reset safely.
- [ ] Data layer has focused tests.

## Phase 4 — User Profile And Resume Intelligence

Goal: make JS understand Pavel before ranking jobs.

- [ ] Extract text from the five source resume PDFs.
- [ ] Create structured resume-lane records.
- [ ] Build editable profile setup flow.
- [ ] Capture target roles, industries, location, remote preferences, compensation, urgency, deal breakers, and career intent.
- [ ] Generate initial skill inventory from resume sources.
- [ ] Generate direct, adjacent, stretch, and avoid role directions.
- [ ] Let the user edit generated profile and role-direction outputs.
- [ ] Store profile changes and activity log entries.
- [ ] Add guardrails against unsupported or hallucinated resume claims.

Exit criteria:

- [ ] User can complete or revise the career profile from the dashboard.
- [ ] System recommends role directions tied to resume evidence.
- [ ] User edits persist.

## Phase 5 — CareerOps Scanner Integration

Goal: discover jobs through dashboard action, using CareerOps scanner patterns.

- [ ] Adapt Greenhouse, Ashby, and Lever detection from CareerOps.
- [ ] Adapt title filters and source config from `config/portals.example.yml`.
- [ ] Write scan results to SQLite instead of Markdown.
- [ ] Add URL and company/role deduplication.
- [ ] Add freshness metadata and first-seen dates.
- [ ] Add dashboard action: Scan for new jobs.
- [ ] Add scan progress and error states.
- [ ] Add scan history to activity log.
- [ ] Keep Markdown export optional and non-primary.

Exit criteria:

- [ ] User can click Scan for new jobs.
- [ ] New jobs are persisted and visible in Jobs/Dashboard.
- [ ] Duplicate jobs are skipped predictably.

## Phase 6 — Job Evaluation Agent

Goal: evaluate fit with evidence, recommendations, and role strategy.

- [ ] Adapt CareerOps evaluation mode into a dashboard-triggered service.
- [ ] Replace AI/engineering archetypes with UX/product/design leadership archetypes.
- [ ] Score fit using profile, resume lanes, constraints, and job requirements.
- [ ] Store evaluation summary, strengths, gaps, red flags, evidence mapping, and recommended action.
- [ ] Show evaluation output on Job Detail.
- [ ] Allow the user to correct wrong recommendations.
- [ ] Feed corrections back into profile/strategy notes.

Exit criteria:

- [ ] User can evaluate a job from the dashboard.
- [ ] Evaluation explains why the score and recommendation were given.
- [ ] Evaluation output is saved and visible after restart.

## Phase 7 — Resume Tailoring And PDF Generation

Goal: generate truthful tailored resumes from the dashboard.

- [ ] Adapt CareerOps ATS HTML template approach.
- [ ] Adapt Playwright PDF generation with ATS text normalization.
- [ ] Select or recommend the best resume base for a job.
- [ ] Generate tailoring plan before PDF creation.
- [ ] Tailor summary and proof-point ordering without inventing claims.
- [ ] Generate HTML preview.
- [ ] Generate ATS-friendly PDF.
- [ ] Store generated document metadata and output path.
- [ ] Show preview/download from Job Detail and Resumes.

Exit criteria:

- [ ] User can generate a tailored resume from a job.
- [ ] Generated PDF is linked to the job.
- [ ] Tailoring summary explains what changed and why.

## Phase 8 — Application Assistant And Tracker

Goal: support manual applications without auto-submitting anything.

- [ ] Generate answers for common application questions.
- [ ] Let user paste custom application questions.
- [ ] Save answer drafts to the job record.
- [ ] Add status transitions: found, reviewed, resume generated, applied, follow-up needed, recruiter responded, interviewing, offer, rejected, skipped, archived.
- [ ] Add Mark applied, Add follow-up, Mark interview, Mark rejected, and Archive actions.
- [ ] Add application funnel metrics.
- [ ] Add basic follow-up due dates.
- [ ] Record all meaningful status changes in activity log.

Exit criteria:

- [ ] User can prepare answers, apply manually, and update status.
- [ ] Dashboard reflects application progress.
- [ ] The app never auto-submits applications or messages recruiters.

## Phase 9 — Quality, Accessibility, And Product Hardening

Goal: make the local MVP dependable and polished.

- [ ] Add Playwright or equivalent browser smoke tests for primary flows.
- [ ] Add accessibility checks for dashboard routes.
- [ ] Add responsive screenshot review for core screens.
- [ ] Add empty, loading, error, and success states across workflows.
- [ ] Add data backup/export path.
- [ ] Add import/export docs for profile, jobs, and generated outputs.
- [ ] Add local setup troubleshooting docs.
- [ ] Review color contrast and keyboard navigation against WCAG 2.2 AA.
- [ ] Run dependency audit and resolve actionable issues conservatively.

Exit criteria:

- [ ] Core user flows are covered by automated or documented manual checks.
- [ ] UI meets the design-system and accessibility checklist.
- [ ] Local data can be backed up and restored.

## Phase 10 — Optional Access And Future Platform Work

Goal: expand only after the local MVP works.

- [ ] Evaluate Cloudflare Tunnel for private remote access.
- [ ] Document local-only versus tunnel risk tradeoffs.
- [ ] Defer hosted Cloudflare architecture until there is a reason for multi-user or always-on access.
- [ ] Research D1/R2/Workers/Queues migration path only after MVP behavior is stable.
- [ ] Keep Gemini/search clients as optional adapters behind dashboard actions.

Exit criteria:

- [ ] Any remote access path keeps the dashboard workflow intact.
- [ ] No infrastructure change weakens scanner, PDF, or local data reliability.

## Standing Rules

- [ ] Keep detailed docs in `docs/`.
- [ ] Update this todo when a phase starts or finishes.
- [ ] Update `docs/lessons.md` after corrections that should change future behavior.
- [ ] Keep implementation behind dashboard actions.
- [ ] Do not expose scanner, PDF, or script names in user-facing UI.
- [ ] Preserve multi-resume lane support.
- [ ] Verify with `npm run lint`, `npm run typecheck`, and `npm run build` before marking implementation work done.
