# Data Contract

This document defines the **authoritative boundary** between the User Layer and
the System Layer for all agents working in this repository (Claude, Codex, or
any other automated tool).

---

## User Layer — Never Auto-Modify or Delete

These resources contain user data and agent-generated outputs. Agents **must
not** modify, overwrite, or delete them except through the established
application functions (e.g. `deleteJob`, `saveStory`). An agent must never
directly write SQL, overwrite files, or purge records in this layer without
explicit user instruction.

| Resource | Description |
|---|---|
| `data/job-search-terminal.sqlite` | All user data — jobs, evaluations, resumes, applications, stories, settings |
| `config/portals.yml` | User-edited list of tracked company career portals |
| `data/job-board-imports/` | Import drop zone — agents may write new `.json` files here, but must never delete existing files |
| `data/linkedin-imports/` | Legacy import directory — same write-only rule |
| `data/discovered-sources.json` | User-curated source discovery results |
| Any file in `assets/` | Uploaded resume PDFs and user assets — never delete or overwrite. Portable backups include and restore only database-referenced resume files; every other asset is always ignored. |
| Top-level HTML/PDF files in `output/` | Generated resume HTML/PDF outputs — never delete |
| Any file in `output/backups/` | SQLite snapshots and portable account archives — never delete |

### Safe schema changes (additive only)

An agent may propose a new DB migration that:
- Adds a new table (`CREATE TABLE IF NOT EXISTS`)
- Adds a new column to an existing table (`ALTER TABLE … ADD COLUMN`)

An agent must **never** drop tables, drop columns, or run `DELETE` / `UPDATE`
statements against user data tables outside of established `queries.ts`
functions.

The account restore workflow is the deliberate exception for snapshot recovery.
It may replace managed User Layer files only through
`src/lib/backups/account-backup.ts`, only after archive validation, explicit
confirmation, and automatic creation of a rollback archive. Inside `assets/`,
restore may replace only resume files referenced by the restored database and
must preserve every unrelated file.

---

## System Layer — Agents May Update Freely

These resources are code, documentation, and configuration templates. Agents
may edit, create, and delete files here as part of normal development work.

| Resource | Description |
|---|---|
| `src/` | All application source code |
| `scripts/` | CLI utilities (migrate, seed, backup, export, check) |
| `docs/` | User-facing and developer documentation |
| `config/portals.example.yml` | Example portal config (not user data) |
| `config/profile.example.yml` | Example profile config (not user data) |
| `AGENTS.md` | Agent instruction contract |
| `CLAUDE.md` | Claude-specific instruction contract |
| `DATA_CONTRACT.md` | This file |
| `package.json`, `tsconfig.json`, etc. | Project configuration |
| `src/lib/db/schema.ts` | DB schema and migrations (additive changes only) |

---

## Verification Requirement

After any change to this repository, agents must run and pass:

```bash
npm run lint
npm run typecheck
npm run build
```

Failing these checks means the change is **not complete**.
