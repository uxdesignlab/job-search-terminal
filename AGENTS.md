# Job Search Terminal — Agent Instructions

Job Search Terminal is a local-first, dashboard-first job-search command center.
It discovers jobs from ATS APIs, scores them against a career profile using AI,
generates tailored resumes, drafts application answers, and tracks applications —
all running locally on the user's machine with no cloud storage.

## Project Direction

- Claude Code is the primary development and orchestration tool.
- Codex is an approved project collaborator for implementation, review,
  documentation, verification, commits, and pushes when the user requests it.
- `AGENTS.md` is the authoritative agent contract for this repo.
- Detailed project documentation belongs in `docs/`.
- Keep `README.md` short and link to docs instead of duplicating detail.
- After adding or changing functionality, always document it in the same change
  set before considering the work complete. Update user-facing docs, technical
  references, and in-app help as applicable.

## Architecture

- **Framework:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Runtime:** local Node.js process — all data stays on the user's machine
- **Data store:** SQLite via `better-sqlite3` at `data/job-search-terminal.sqlite`
- **PDF generation:** Playwright-based HTML-to-PDF (requires Chrome)
- **AI:** provider-mediated calls via `src/lib/ai/` — supports OpenAI, Anthropic, Google Gemini
- **Job scanning:** Greenhouse / Ashby / Lever ATS APIs configured via `config/portals.example.yml`

## Browser Job Board Scanner

Codex can use the Codex Chrome Extension for signed-in or session-dependent job
boards. Claude Desktop can use Claude in Chrome. Both runners follow this
contract exactly.

### Step 1 — Read Search Criteria

Database path: `data/job-search-terminal.sqlite` (or `$JST_DATABASE_PATH`).

```sql
SELECT target_roles_json, preferred_locations_json, remote_preference
FROM user_profile ORDER BY updated_at DESC LIMIT 1;

SELECT positive_json, negative_json FROM title_filters WHERE id = 'singleton';
```

- `target_roles_json` → job titles to search
- `preferred_locations_json` → locations
- `remote_preference` → `"remote-only"` | `"local-or-remote"` | `"all"`
- `positive_json` / `negative_json` → title keyword filters

If `target_roles_json` is empty, ask the user to set target roles in the app
under Profile → Preferences before scanning.

### Step 2 — Search the Board

Supported boards:

| Board | `metadata.source` | Start URL |
| --- | --- | --- |
| LinkedIn | `linkedin` | `https://www.linkedin.com/jobs/search/` |
| Wellfound | `wellfound` | `https://wellfound.com/jobs` |
| Work at a Startup | `workatastartup` | `https://www.workatastartup.com/companies` |
| Glassdoor | `glassdoor` | `https://www.glassdoor.com/Job/index.htm` |
| Indeed | `indeed` | `https://www.indeed.com/jobs` |
| Monster | `monster` | `https://www.monster.com/jobs/search?recency=3&sort=newest` (append `&q=<title>&where=<location>` for each search) |

For each title in `target_roles_json`, search with the title and first location.

**Monster search URL:** Construct the URL directly with the recency filter baked
in — do **not** rely on the UI filter alone. Use:
`https://www.monster.com/jobs/search?q=<URL-encoded title>&where=<URL-encoded location>&recency=3&sort=newest`
This ensures freshness even when Monster's UI filter fails to apply.

Apply visible filters matching preferences:
- **Date posted:** Past week (all boards). Monster uses the `recency=3` URL param
  above — no need to also set the UI filter.
- **Remote:** Remote only when `remote_preference` is `"remote-only"`.
- **Sort:** Most Recent when available.

For each visible listing:

0. **Monster only — card-level pre-check:** Before clicking into any Monster job
   detail, read the "Posted" date on the search result card. If it shows a date
   older than 3 days (e.g. "Posted 5 days ago", "Posted 2 weeks ago") OR no
   visible post date at all, **skip that listing without opening it.**
1. Open the job detail page.
2. **Monster only — expiry check first:** Before extracting anything, read the
   page heading. If it says "Sorry, that job has expired" or shows any expiry
   indicator ("No longer accepting applications", "This position has been filled",
   "Application closed", no visible Posted date), **skip this listing
   immediately.** Do not extract any data. Move to the next listing.
3. **Monster only — early abort:** After opening the first 5 Monster detail pages
   for a given search query, if 4 or more were expired, **stop scanning further
   pages for that query.** Monster is serving predominantly stale results. Move to
   the next title in `target_roles_json` if one exists, and note the abort in
   your final report.
4. Extract `company`, `position`, `location`, `jobDescription`, `sourceUrl`,
   `originalPostingUrl`, and `discoveredAt`.
5. `originalPostingUrl` — set only when a visible job-specific employer/ATS apply
   URL exists (Greenhouse, Lever, Ashby, Workday, etc.). Leave empty otherwise.
   **Monster:** always look for an "Apply on company site" button pointing to a
   third-party ATS and record that URL — it lets the liveness checker verify the
   posting without relying on Monster's bot-protected URLs.
6. Set `url` to `originalPostingUrl` when present; otherwise use `sourceUrl`.
7. Apply `negative_json` title filters and skip excluded titles.

Scan up to 3 pages or 50 jobs, whichever comes first. Pause 1–2 seconds between
page loads and detail views. **Stop immediately** on CAPTCHA, bot detection, or
login prompt — report to the user.

### Step 3 — Build the Output JSON

```json
{
  "metadata": {
    "source": "<source>",
    "scanTimestamp": "<ISO 8601 UTC>",
    "scanDurationSeconds": 120,
    "totalJobsDiscovered": 12,
    "totalJobsValid": 10,
    "totalJobsSkipped": 2,
    "searchCriteria": {
      "titles": ["<title1>"],
      "locations": ["<location1>"],
      "remotePreference": "<value>"
    },
    "generatedBy": "Codex Browser Board Scanner v1.0"
  },
  "jobs": [
    {
      "id": "<uuid v4>",
      "company": "<company name>",
      "position": "<job title>",
      "jobDescription": "<full description text>",
      "url": "<ATS/employer URL, or platform URL>",
      "sourceUrl": "<platform job URL>",
      "originalPostingUrl": "<job-specific ATS/employer URL, or empty string>",
      "discoveredAt": "<ISO 8601 UTC>",
      "location": "<location string>",
      "salaryNotes": "<visible salary/equity text, or empty string>"
    }
  ]
}
```

Skip any job where `company`, `position`, or `url` is empty.

### Step 4 — Write the File

Directory: `data/job-board-imports/`
Filename: `<source>-jobs-<timestamp>.json` (timestamp format: `2026-05-07T14-30-45Z`)

Write to a `.tmp` file first, then rename to `.json`:

```
data/job-board-imports/monster-jobs-2026-05-07T14-30-45Z.json.tmp  →  .json
```

The file watcher detects the renamed `.json` and auto-imports it.

### Step 5 — Report

```
Scan complete. Found X jobs matching your criteria.
Saved to: data/job-board-imports/<source>-jobs-<timestamp>.json
Job Search Terminal will import them automatically within 30 seconds.
```

If jobs were skipped for missing data or excluded keywords, mention the count.

### Constraints

- **Never click Apply**, submit forms, log in for the user, or message recruiters.
- **Maximum 50 jobs per scan.**
- **Stop on CAPTCHA or bot detection** — report immediately, do not continue.
- **Do not transmit job data** to any service other than the local JSON file.
- Use Chrome only when the task needs the user's browser session; use the in-app
  browser for local Job Search Terminal verification.

## Resume Lanes

Resumes are uploaded through the in-app UI (Profile → Resumes tab). The app
supports multiple resume lanes — one per career angle or role type (e.g.,
"Leadership", "IC / Individual Contributor", "Operations"). Do not collapse the
workflow into a single universal resume. Preserve the multi-lane model.

## UX And Accessibility

- Use the design-system tokens and primitives under `src/styles/` and
  `src/components/ui/`.
- Keep the interface compact, calm, professional, and dashboard-first.
- Avoid decorative gradients, oversized marketing sections, nested cards, and
  one-color palettes.
- Meet WCAG 2.2 AA by default: visible focus, semantic structure, sufficient
  contrast, non-color-only status, labels for controls, reduced motion support.

## Safety

- Never submit applications, send emails, or message recruiters for the user
  without explicit approval.
- Never expose implementation details like script names or file paths in the
  product UI unless the user asks for technical details.
- Preserve user materials and generated outputs. Do not delete resumes,
  reports, outputs, or tracked data unless explicitly asked.

## Verification

After any change, run:

```bash
npm run lint
npm run typecheck
npm run build
```

For feature work, also verify the actual dashboard flow in the browser.
