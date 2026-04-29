# Project Implementation Todo

This document tracks the phased implementation of JS from scaffold to working
local MVP. Keep task status current as work lands.

Project rule: reuse CareerOps code and functionality as much as possible. For
each engine feature, first inspect CareerOps, then copy, vendor, or port the
working code when practical. Do not reinvent equivalent scanner, PDF, tracker,
evaluation, application, or dashboard-metric logic without documenting why reuse
is not appropriate.

Delivery rule: work one phase at a time. Do not mix implementation tasks across
phases. After each phase, verify, pause, let the user inspect/test, and commit
only after explicit user approval.

QA handoff rule: after every completed build or phase, provide a concise
phase-specific QA checklist that tells the user what screens, flows, content,
and regressions to inspect before approval.

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

- [x] Create app navigation for Profile, Strategy, Dashboard, Jobs, Applications, Resumes, and Settings.
- [x] Build Profile screen with mock profile data.
- [x] Build Strategy screen with role-fit and adjacent-role mock data.
- [x] Build Dashboard overview with job-search metrics.
- [x] Build Jobs list with filters, sorting controls, and accessible table/card views.
- [x] Build Job Detail screen with evaluation, resume, and action sections using mock data.
- [x] Build Applications screen with funnel/status mock data.
- [x] Build Resumes screen showing source lanes and generated-document placeholders.
- [x] Build Settings screen for job sources and local app preferences.
- [x] Add responsive layout checks for desktop and mobile widths.
- [x] Confirm all screens use design-system primitives and WCAG 2.2 AA defaults.

Exit criteria:

- [x] User can open `http://localhost:3000` and navigate the whole shell.
- [x] Mock jobs display fit score, status, freshness, and recommended action.
- [x] No command-line workflow appears in the product UI.

Review status:

- [x] User review/testing complete.
- [x] User approved commit for Phase 2.

## Phase 3 — Local Data Model

Goal: replace mock data with persistent local storage.

- [x] Inspect CareerOps data contract, tracker files, status model, and dashboard parsers before designing tables.
- [x] Document which CareerOps data fields map directly into SQLite.
- [x] Choose and install SQLite migration/data-access tooling.
- [x] Create migration system.
- [x] Add `user_profile` table.
- [x] Add `skill_inventory` table.
- [x] Add `role_directions` table.
- [x] Add `resumes` table.
- [x] Add `jobs` table.
- [x] Add `evaluations` table.
- [x] Add `generated_documents` table.
- [x] Add `applications` table.
- [x] Add `activity_log` table.
- [x] Seed local demo data from the current mock data.
- [x] Replace dashboard mock reads with data-access reads.
- [x] Document schema decisions in `docs/`.

Exit criteria:

- [x] Dashboard data persists after restart.
- [x] Seed data can be reset safely.
- [x] Data layer has focused tests.

Review status:

- [x] User review/testing complete.
- [x] User approved commit for Phase 3.

## Phase 4 — User Profile And Resume Intelligence

Goal: make JS understand Pavel before ranking jobs.

- [x] Extract text from the five source resume PDFs.
- [x] Create structured resume-lane records.
- [x] Build editable profile setup flow.
- [x] Capture target roles, industries, location, remote preferences, compensation, urgency, deal breakers, and career intent.
- [x] Generate initial skill inventory from resume sources.
- [x] Generate direct, adjacent, stretch, and avoid role directions.
- [x] Let the user edit generated profile and role-direction outputs.
- [x] Store profile changes and activity log entries.
- [x] Add guardrails against unsupported or hallucinated resume claims.

Exit criteria:

- [x] User can complete or revise the career profile from the dashboard.
- [x] System recommends role directions tied to resume evidence.
- [x] User edits persist.

Review status:

- [x] User review/testing complete.
- [x] User approved commit for Phase 4.

## Phase 5 — CareerOps Scanner Integration

Goal: discover jobs through dashboard action, using CareerOps scanner patterns.

- [x] Copy or port CareerOps scanner code where practical instead of rewriting it.
- [x] Preserve Greenhouse, Ashby, and Lever detection/parsing behavior from CareerOps.
- [x] Preserve title filters and source config patterns from CareerOps.
- [x] Document any scanner logic that must be changed for JS storage/API boundaries.
- [x] Write scan results to SQLite instead of Markdown.
- [x] Add URL and company/role deduplication.
- [x] Add freshness metadata and first-seen dates.
- [x] Add dashboard action: Scan for new jobs.
- [x] Add scan progress and error states.
- [x] Add scan history to activity log.
- [x] Keep Markdown export optional and non-primary.

Exit criteria:

- [x] User can click Scan for new jobs.
- [x] New jobs are persisted and visible in Jobs/Dashboard.
- [x] Duplicate jobs are skipped predictably.

Review status:

- [x] User review/testing complete.
- [x] User approved commit for Phase 5.

## Phase 6 — Job Evaluation Agent

Goal: evaluate fit with evidence, recommendations, and role strategy.

- [ ] Port CareerOps evaluation mode structure into a dashboard-triggered service.
- [ ] Preserve reusable scoring/report sections unless they conflict with JS role lanes.
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

- [ ] Copy or port CareerOps ATS HTML template approach where practical.
- [ ] Copy or port CareerOps Playwright PDF generation and ATS text normalization where practical.
- [ ] Document any template or renderer changes required for JS resume lanes.
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

- [ ] Port reusable CareerOps application-assistant and tracker logic before writing new equivalents.
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
- [ ] Reuse CareerOps code/functionality first; document any decision to rebuild.
- [ ] Work one phase at a time; do not start future-phase tasks early.
- [ ] Pause after each phase for user review and testing.
- [ ] Provide a phase-specific QA checklist after every completed build or phase.
- [ ] Commit phase work only after explicit user approval.
- [ ] Update this todo when a phase starts or finishes.
- [ ] Update `docs/lessons.md` after corrections that should change future behavior.
- [ ] Keep implementation behind dashboard actions.
- [ ] Do not expose scanner, PDF, or script names in user-facing UI.
- [ ] Preserve multi-resume lane support.
- [ ] Verify with `npm run lint`, `npm run typecheck`, and `npm run build` before marking implementation work done.
