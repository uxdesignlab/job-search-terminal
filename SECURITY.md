# Security

Job Search Terminal is a **local-first application**. It runs entirely on your machine — no accounts, no cloud sync, no telemetry. This document describes the security model, what to protect, and how to report issues.

---

## Threat model

The primary risks are:

| Risk | Where it lives | Mitigation |
|---|---|---|
| AI provider API keys leaked | SQLite database, in-memory at runtime | Keys never leave the machine; database file is local-only |
| Personal resume / career data exposed | SQLite + `assets/` | Both are gitignored; never committed |
| Job search history exposed | SQLite | Local file; not synced anywhere |
| Malicious job listing content | Fetched from ATS APIs | Content is displayed, never executed |
| Dependency vulnerabilities | `node_modules/` | Pin versions; audit regularly |

---

## What is sensitive

### API keys
OpenAI, Anthropic, and Google Gemini keys are entered through the in-app Settings UI and stored in the local SQLite database (`data/job-search-terminal.sqlite`). They are never written to environment variables, config files, or logs.

**Never commit the database file.** It is gitignored by default.

### Personal data
- `config/portals.yml` — your curated company list (gitignored)
- `assets/` — resume PDFs (gitignored)
- `data/` — SQLite database containing job history, evaluations, application drafts, and AI keys (gitignored)
- `output/` — generated resumes and reports (gitignored)

All of these are covered by `.gitignore`. Verify before pushing:

```bash
git status --short
```

If any file from `data/`, `assets/`, `output/`, or `config/portals.yml` appears, do not commit it.

---

## Environment variables

The app uses two optional environment variables. Neither holds secrets.

| Variable | Purpose | Default |
|---|---|---|
| `JST_DATABASE_PATH` | Override the SQLite file location | `data/job-search-terminal.sqlite` |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Override the Chrome path for PDF rendering | System Chrome |

Do not put API keys in environment variables or `.env` files. The app does not read them from there.

---

## Network access

The app makes outbound requests only when you trigger an action:

- **Job scanning** — reads public ATS APIs (Greenhouse, Ashby, Lever) to fetch job listings
- **AI calls** — sends job descriptions and your profile context to the configured AI provider
- **PDF rendering** — runs Chrome locally; no network call

No data is sent to any server passively or in the background.

---

## Running safely

- Run the app on `localhost` only. Do not expose port 3000 to a network.
- If you use a reverse proxy or share your machine, add authentication in front of the app — it has none built in, by design (local-only tool).
- Keep Node.js and npm dependencies up to date. Run `npm audit` periodically.
- Back up your database before migrations: `npm run data:backup`

---

## Dependency hygiene

```bash
npm audit              # check for known vulnerabilities
npm audit fix          # auto-fix non-breaking issues
```

Dependencies use pinned minor versions (`^x.y.z`). Review `package-lock.json` when updating.

---

## Reporting a vulnerability

This is a personal, local-first tool with no hosted service. If you find a security issue:

1. Open a GitHub issue marked **[Security]** — or contact the maintainer directly if the issue is sensitive.
2. Describe the attack vector, what data is at risk, and reproduction steps.
3. Allow reasonable time for a fix before public disclosure.

There is no bug bounty program.
