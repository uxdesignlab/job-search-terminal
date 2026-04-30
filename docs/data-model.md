# Local Data Model

Phase 3 adds a local SQLite data model for the dashboard shell. The schema is
designed to preserve CareerOps concepts while giving JS a database-first path.

## CareerOps Mapping

CareerOps source references inspected before implementation:

- `DATA_CONTRACT.md`: separates user-owned data from system-owned updateable code.
- `templates/states.yml`: canonical status IDs and aliases.
- `dashboard/internal/model/career.go`: application, funnel, score, and progress metric shapes.
- `dashboard/internal/data/career.go`: tracker parsing, status normalization, URL enrichment, and funnel metrics.

## SQLite Tables

The first migration creates the required MVP tables:

- `user_profile`: Pavel's search goal, constraints, target roles, skills, and direction.
- `skill_inventory`: skill records with evidence source, strength, market relevance, and use preference.
- `role_directions`: direct, adjacent, selective, stretch, and avoid-oriented role families.
- `resumes`: source resume lanes from the existing PDFs.
- `jobs`: discovered-job records plus Phase 2 fit/recommendation fields.
- `evaluations`: job evaluation outputs tied to `jobs`.
- `generated_documents`: generated resume/application document metadata, HTML
  preview path, PDF output path, keyword coverage, and tailoring plan.
- `applications`: application tracker status, follow-up, contact, response, company, role, and score.
- `application_answer_drafts`: copy-paste application answers linked to a job.
- `activity_log`: product memory and status/activity history.
- `scan_runs`: scanner history, counts, status, and per-company errors.
- `evaluation_feedback`: user corrections to saved evaluations.
- `schema_migrations`: local migration tracking.

The second migration adds CareerOps-style tracker fields to `applications`:

- `company`
- `role`
- `fit_score`

These keep manually tracked applications readable even when they do not yet have
a discovered job record.

The seventh migration adds `application_answer_drafts` for Phase 8. Answer
drafts are saved separately from the job row so multiple common and custom
questions can be tracked without overwriting job metadata.

## Scripts

```bash
npm run db:migrate
npm run db:seed
npm run db:reset
npm run db:check
npm run profile:extract
npm run profile:check
npm run scanner:check
npm run evaluation:check
npm run document:check
npm run application:check
npm run quality:check
npm run data:backup
npm run data:export
```

The local database file is `data/js.sqlite`. It is intentionally ignored by git.

## Runtime Behavior

- Server-rendered dashboard routes read through `src/lib/db/queries.ts`.
- `getDatabase()` runs migrations and seeds only if the database is empty.
- `db:reset` deletes local SQLite files, reruns migrations, and reseeds demo data.
- `db:check` verifies the persisted seed records and query layer.
- `profile:extract` extracts local resume PDF text into `resumes` and refreshes
  evidence-backed skill signals.
- `profile:check` verifies the extracted profile intelligence.
- `scanner:check` verifies the CareerOps scanner adapter with mocked ATS API
  payloads.
- `evaluation:check` verifies dashboard evaluation storage, A-G sections, and
  user correction feedback.
- `document:check` verifies HTML/PDF resume generation and generated-document
  metadata.
- `application:check` verifies answer generation, custom questions, status
  transitions, follow-up dates, funnel metrics, and activity logging.
- `quality:check` verifies primary dashboard routes, sampled accessibility
  rules, keyboard focus, contrast, and desktop/mobile screenshots.
- `data:backup` creates a SQLite backup in `output/backups/`.
- `data:export` creates a readable JSON export in `output/exports/`.
- Phase 3 keeps mock source modules as seed inputs only; dashboard pages no
  longer read mock modules directly.

## Reuse Rule

Future CareerOps imports should preserve tracker/status semantics:

- Keep status normalization aligned with CareerOps `states.yml`.
- Preserve company, role, score, PDF/report, and URL concepts from the CareerOps dashboard model.
- Use SQLite as the primary JS store, with Markdown export/import added only when needed.
