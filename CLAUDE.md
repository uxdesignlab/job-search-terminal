# Job Search Terminal — Project Rules & Claude Desktop Browser Job Board Scanner

---

## Documentation Requirements

**Every code change must be documented.** This is a hard rule, not optional.

When making any change to this codebase — new feature, bug fix, refactor, or configuration — update the relevant documentation before considering the task complete:

- **`docs/features.md`** — describes every user-facing feature. Update it when adding, changing, or removing any feature or UI element.
- **`docs/data-model.md`** — documents the database schema, migrations, and all types. Update it whenever a migration is added, a column changes, or a new type is introduced.
- **`docs/browser-board-scanner-technical.md`** — technical reference for browser-assisted LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster imports. Update code snippets, file descriptions, and architecture notes when touching that subsystem.
- **`docs/linkedin-scanner-guide.md`** — user guide for the browser-assisted scanner. Update when behavior visible to the user changes.
- **`CLAUDE.md`** — project rules and Claude Desktop agent instructions. Update when adding new rules or changing the browser job-board workflow.

**What "thoroughly documented" means:**

1. Describe what changed and why, not just that it changed.
2. Update any code snippets in docs to match the new implementation.
3. Update filter options, badge lists, table columns, and other enumerations that appear in docs.
4. If a doc section is now incorrect or incomplete, fix it — don't leave stale information.
5. New files or subsystems must have their purpose, exported API, and behavior documented.

**When there is no matching doc section**, add one. Do not skip documentation because a section doesn't exist yet.

---

## Browser Job Board Scanner Agent Instructions

This file also contains instructions for Claude Desktop to perform browser-assisted job discovery and write results into Job Search Terminal's import pipeline. Codex follows the same scanner contract from `AGENTS.md`.

---

## When to Use This Workflow

When the user asks you to "scan LinkedIn for jobs", "find new jobs on Wellfound", "scan Work at a Startup", "scan Glassdoor", "scan Indeed", "scan Monster", or similar, follow the steps below. You will need:

- The **Claude in Chrome** browser extension installed and active.
- The user already logged into the requested job board in Chrome if the board requires a session.
- Job Search Terminal running, or at minimum its database and project folder accessible.

Supported boards:

| Board | `metadata.source` | Start URL |
| --- | --- | --- |
| LinkedIn | `linkedin` | `https://www.linkedin.com/jobs/search/` |
| Wellfound | `wellfound` | `https://wellfound.com/jobs` |
| Work at a Startup | `workatastartup` | `https://www.workatastartup.com/companies` |
| Glassdoor | `glassdoor` | `https://www.glassdoor.com/Job/index.htm` |
| Indeed | `indeed` | `https://www.indeed.com/jobs` |
| Monster | `monster` | `https://www.monster.com/jobs/search` |

---

## Step 1 — Read Search Criteria from the Database

The database is at `data/job-search-terminal.sqlite` relative to this project root, or the path in `$JST_DATABASE_PATH`.

Open the database and run these queries:

```sql
-- Get job titles and location preferences from user profile
SELECT
  target_roles_json,
  preferred_locations_json,
  remote_preference
FROM user_profile
ORDER BY updated_at DESC
LIMIT 1;

-- Get positive/negative title filters
SELECT positive_json, negative_json
FROM title_filters
WHERE id = 'singleton';
```

Parse the JSON arrays:

- `target_roles_json` → list of job titles to search.
- `preferred_locations_json` → list of locations.
- `remote_preference` → one of `"remote-only"`, `"local-or-remote"`, `"all"`.
- `positive_json` → title keywords that must appear.
- `negative_json` → title keywords that disqualify a role.

If `target_roles_json` is empty, ask the user to set their target roles in Job Search Terminal under Profile → Preferences before scanning.

---

## Step 2 — Search the Requested Board

Use Claude in Chrome to navigate the requested board:

1. Open the board start URL from the table above.
2. For each title in `target_roles_json`, search with the title as keywords and the first location from `preferred_locations_json` as location.
3. Apply visible filters that match saved preferences when the board exposes them:
   - **Date posted:** Past week, if available. For Monster specifically, set the date filter to **Past 3 days** (Monster's search results include many stale/expired listings that survive a week-wide filter).
   - **Remote:** If `remote_preference` is `"remote-only"`, filter to Remote only when available.
4. Sort by **Most Recent** when the board exposes sorting.

For each visible job listing:

- Open the job detail view.
- Extract `company`, `position`, `sourceUrl`, `originalPostingUrl`, `url`, `location`, `jobDescription`, and `discoveredAt`.
- Use `originalPostingUrl` only when a visible job-specific employer/ATS apply URL exists.
- Set `url` to `originalPostingUrl` when present; otherwise use the platform job URL.
- Apply `negative_json` filters and skip excluded titles.
- **Monster only — skip expired listings:** Monster keeps filled or closed postings in its search results. Skip any listing that shows "No longer accepting applications", "This position has been filled", "Application closed", or any similar expiry indicator — either on the search results page or on the job detail page. Also skip any listing with no visible "Posted" date, as undated Monster listings are typically months old.
- **Monster only — capture the ATS apply URL:** On each Monster job detail page, look for a button or link labelled "Apply on company site", "Apply now" (pointing to an external domain), or similar. If one exists and leads to a job-specific URL on a third-party ATS (Greenhouse, Lever, Ashby, Workday, etc.), record that URL as `originalPostingUrl`. This allows the liveness checker to verify the posting directly, bypassing Monster's bot protection.

Scan up to 3 pages of results or 50 jobs, whichever comes first. Pause 1–2 seconds between page loads and detail views.

**Stop immediately** if the board shows a CAPTCHA, bot detection, or login prompt. Report this to the user and do not continue.

---

## Step 3 — Build the Output JSON

Structure the collected jobs as follows:

```json
{
  "metadata": {
    "source": "linkedin | wellfound | workatastartup | glassdoor | indeed | monster",
    "scanTimestamp": "<ISO 8601 UTC datetime when scan started>",
    "scanDurationSeconds": 120,
    "totalJobsDiscovered": 12,
    "totalJobsValid": 10,
    "totalJobsSkipped": 2,
    "searchCriteria": {
      "titles": ["<title1>", "<title2>"],
      "locations": ["<location1>"],
      "remotePreference": "<remote_preference value>"
    },
    "chromeExtensionVersion": "Claude in Chrome",
    "claudeDesktopVersion": "Claude Desktop",
    "generatedBy": "Claude Desktop Browser Board Scanner v1.0"
  },
  "jobs": [
    {
      "id": "<uuid>",
      "company": "<company name>",
      "position": "<job title>",
      "jobDescription": "<full description text>",
      "url": "<preferred employer/ATS URL, or platform URL when no employer URL is visible>",
      "sourceUrl": "<platform job URL>",
      "originalPostingUrl": "<visible job-specific employer/ATS URL, or empty string>",
      "discoveredAt": "<ISO 8601 UTC datetime>",
      "location": "<location string>",
      "salaryNotes": "<visible salary/equity text, if any>",
      "dataQuality": {
        "hasCompany": true,
        "hasPosition": true,
        "hasDescription": true,
        "hasUrl": true,
        "descriptionLength": 1200,
        "warnings": []
      }
    }
  ],
  "validationSummary": {
    "totalRecords": 10,
    "validRecords": 10,
    "invalidRecords": 0,
    "errors": []
  }
}
```

Field rules:

- `metadata.source` must be `linkedin`, `wellfound`, `workatastartup`, `glassdoor`, `indeed`, or `monster`.
- `position` must be the job title.
- `jobDescription` must be the full visible description text.
- `sourceUrl` must be the platform job URL.
- `originalPostingUrl` is optional and must be job-specific when present.
- `url` should match `originalPostingUrl` when a visible job-specific employer/ATS URL exists.
- Skip any job where `company`, `position`, or `url` is empty.
- Generate a UUID v4 for each job's `id` field.

---

## Step 4 — Write the File

The general import directory is `data/job-board-imports/` relative to this project root. Legacy LinkedIn-only workflows may still write to `data/linkedin-imports/`.

1. Generate a filename: `<source>-jobs-<timestamp>.json`.
   - Timestamp format: `2026-05-07T14-30-45Z`.
   - Full example: `wellfound-jobs-2026-05-07T14-30-45Z.json`.

2. Write to a temporary file first:

   ```text
   data/job-board-imports/wellfound-jobs-2026-05-07T14-30-45Z.json.tmp
   ```

3. Once writing is complete, rename the `.tmp` file to the final `.json` name:

   ```text
   data/job-board-imports/wellfound-jobs-2026-05-07T14-30-45Z.json
   ```

This two-step write prevents Job Search Terminal from reading a partial file. JST's file watcher automatically detects the renamed `.json` file and archives it under `archive/YYYY-MM-DD/` after import.

---

## Step 5 — Report to the User

After writing the file, tell the user:

```text
Scan complete. Found X jobs matching your criteria.
Saved to: data/job-board-imports/<source>-jobs-<timestamp>.json

Job Search Terminal will import them automatically within 30 seconds.
You can also trigger a manual import from Settings if needed.
```

If any jobs were skipped because of missing data or excluded keywords, mention the count.

---

## Important Constraints

- **Never click Apply** on any job posting.
- **Never submit any form** on behalf of the user.
- **Never log into job boards** — the user must already be logged in when a session is required.
- **Maximum 50 jobs per scan** to reduce rate-limit and terms risk.
- **Pause 1–2 seconds** between page loads and detail views.
- **Stop on CAPTCHA or bot detection** — report to the user immediately.
- **Do not transmit job data** to any external service other than writing the local JSON file.
- **Terms of Service:** The user is responsible for compliance with each board's terms regarding automated browsing.
