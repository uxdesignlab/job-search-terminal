# Job Search Terminal

A local-first job-search dashboard. Discovers jobs, scores them against your
profile with AI, generates tailored resumes, drafts application answers, and
tracks every application — all on your computer with no accounts and no cloud.

---

## Quick start

```bash
git clone <repo-url>
cd job-search-terminal
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Documentation

### For users
- [Getting started](docs/getting-started.md) — setup guide, first-run walkthrough, and a ready-to-paste AI prompt for no-dev setup
- [Features](docs/features.md) — everything the app does, page by page

### For developers
- [PRD](docs/PRD.md) — product requirements and design decisions
- [Design system](docs/design-system.md) — tokens, components, usage rules
- [Data model](docs/data-model.md) — full SQLite schema with all 25 migrations
- [Accessibility checklist](docs/accessibility-checklist.md) — WCAG 2.2 AA requirements
- [Development workflow](docs/development-workflow.md) — phase rules and contribution guidelines
- [Data management](docs/data-management.md) — backup, export, and restore
- [Troubleshooting](docs/troubleshooting.md) — common issues and fixes
- [Quality hardening](docs/quality-hardening.md) — automated accessibility and screenshot checks
- [Project implementation todo](docs/project-implementation-todo.md) — phase status tracker
- [Lessons](docs/lessons.md) — durable project rules and corrections

### Archive
Historical phase implementation notes are in [docs/archive/](docs/archive/).

---

## Commands

```bash
npm run dev              # start the development server
npm run build            # production build
npm run lint             # lint check
npm run typecheck        # TypeScript check
npm run quality:check    # accessibility + screenshot checks (requires npm run dev)

npm run db:migrate       # apply pending migrations
npm run db:seed          # seed demo data
npm run db:reset         # drop + re-migrate + re-seed
npm run db:check         # verify database

npm run profile:extract  # extract resume PDFs into the database
npm run profile:check    # verify extracted profile

npm run data:backup      # SQLite backup → output/backups/
npm run data:export      # JSON export → output/exports/
```

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, React 19, TypeScript |
| Database | SQLite via better-sqlite3 (local file) |
| AI | OpenAI · Anthropic · Google Gemini (your key, your choice) |
| PDF | Playwright + Chrome (local, no cloud) |
| Styling | Tailwind CSS with custom design tokens |
| Icons | Lucide React |
