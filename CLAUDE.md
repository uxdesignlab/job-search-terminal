# Job Search Terminal — Project Rules & Claude Desktop LinkedIn Scanner

---

## Documentation Requirements

**Every code change must be documented.** This is a hard rule, not optional.

When making any change to this codebase — new feature, bug fix, refactor, or configuration — update the relevant documentation before considering the task complete:

- **`docs/features.md`** — describes every user-facing feature. Update it when adding, changing, or removing any feature or UI element.
- **`docs/data-model.md`** — documents the database schema, migrations, and all types. Update it whenever a migration is added, a column changes, or a new type is introduced.
- **`docs/linkedin-scanner-technical.md`** — technical reference for the LinkedIn scanner integration. Update code snippets, file descriptions, and architecture notes when touching that subsystem.
- **`docs/linkedin-scanner-guide.md`** — user guide for the LinkedIn scanner. Update when behavior visible to the user changes.
- **`CLAUDE.md`** — project rules and Claude Desktop agent instructions. Update when adding new rules or changing the LinkedIn scanner workflow.

**What "thoroughly documented" means:**

1. Describe what changed and why, not just that it changed.
2. Update any code snippets in docs to match the new implementation.
3. Update filter options, badge lists, table columns, and other enumerations that appear in docs.
4. If a doc section is now incorrect or incomplete, fix it — don't leave stale information.
5. New files or subsystems must have their purpose, exported API, and behavior documented.

**When there is no matching doc section**, add one. Do not skip documentation because a section doesn't exist yet.

---

## LinkedIn Scanner Agent Instructions

This file also contains instructions for Claude Desktop to perform automated LinkedIn job discovery and write results into Job Search Terminal's import pipeline.

---

## When to Use This Workflow

When the user asks you to "scan LinkedIn for jobs", "find new jobs on LinkedIn", or similar, follow the steps below. You will need:

- The **Claude in Chrome** browser extension installed and active
- The user **logged into LinkedIn** in Chrome
- Job Search Terminal running (or at minimum, its database accessible)

---

## Step 1 — Read Search Criteria from the Database

The database is at `data/job-search-terminal.sqlite` relative to this project root (or the path in `$JST_DATABASE_PATH`).

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
- `target_roles_json` → list of job titles to search (e.g. `["Product Manager", "UX Designer"]`)
- `preferred_locations_json` → list of locations (e.g. `["Remote", "Nashville, TN"]`)
- `remote_preference` → one of `"remote-only"`, `"local-or-remote"`, `"all"`
- `positive_json` → title keywords that must appear (required match)
- `negative_json` → title keywords that disqualify a role (excluded)

If `target_roles_json` is empty, ask the user to set their target roles in Job Search Terminal (Profile → Preferences) before scanning.

---

## Step 2 — Search LinkedIn

Use the Claude in Chrome extension to navigate LinkedIn:

1. Go to `https://www.linkedin.com/jobs/search/`
2. For each title in `target_roles_json`, search with the title as keywords and the first location from `preferred_locations_json` as location
3. Apply filters:
   - **Date posted:** Past week (7 days)
   - **Remote:** If `remote_preference` is `"remote-only"`, filter to Remote only
4. Sort by **Most Recent**

For each visible job listing on the results page:
- Click the job to open its detail panel
- Extract:
  - `company` — company name from the job header
  - `position` — exact job title from the posting
  - `url` — the canonical job URL (format: `https://www.linkedin.com/jobs/view/{jobId}/`)
  - `location` — location shown on the posting
  - `jobDescription` — full text of the job description (plain text, not HTML)
  - `discoveredAt` — current timestamp in ISO 8601 format

Apply `negative_json` filters: if the job title contains any excluded keyword, skip that job.

Scan up to 3 pages of results (≈75 jobs maximum). Pause 1–2 seconds between each page load to avoid rate limiting.

**Stop immediately** if LinkedIn shows a CAPTCHA, bot detection, or login prompt — report this to the user and do not continue.

---

## Step 3 — Build the Output JSON

Structure the collected jobs as follows:

```json
{
  "metadata": {
    "scanTimestamp": "<ISO 8601 UTC datetime when scan started>",
    "scanDurationSeconds": <integer seconds>,
    "totalJobsDiscovered": <integer>,
    "totalJobsValid": <integer>,
    "totalJobsSkipped": <integer>,
    "searchCriteria": {
      "titles": ["<title1>", "<title2>"],
      "locations": ["<location1>"],
      "remotePreference": "<remote_preference value>"
    },
    "chromeExtensionVersion": "Claude in Chrome",
    "claudeDesktopVersion": "Claude Desktop",
    "generatedBy": "Claude Desktop LinkedIn Scanner v1.0"
  },
  "jobs": [
    {
      "id": "<uuid>",
      "company": "<company name>",
      "position": "<job title>",
      "jobDescription": "<full description text>",
      "url": "https://www.linkedin.com/jobs/view/<jobId>/",
      "discoveredAt": "<ISO 8601 UTC datetime>",
      "location": "<location string>",
      "matchScore": null,
      "dataQuality": {
        "hasCompany": true,
        "hasPosition": true,
        "hasDescription": true,
        "hasUrl": true,
        "descriptionLength": <integer>,
        "warnings": []
      }
    }
  ],
  "validationSummary": {
    "totalRecords": <integer>,
    "validRecords": <integer>,
    "invalidRecords": <integer>,
    "errors": []
  }
}
```

**Field rules:**
- `position` must be the job title (not `title` — use the field name `position`)
- `jobDescription` must be the full description text (not `rawDescription`)
- `url` must start with `https://www.linkedin.com/jobs/view/`
- Skip any job where `company`, `position`, or `url` is empty
- Generate a UUID v4 for each job's `id` field

---

## Step 4 — Write the File

The import directory is `data/linkedin-imports/` relative to this project root.

1. Generate a filename: `linkedin-jobs-<timestamp>.json`
   - Timestamp format: `2026-05-07T14-30-45Z` (colons replaced with hyphens)
   - Full example: `linkedin-jobs-2026-05-07T14-30-45Z.json`

2. Write to a **temporary file first**:
   ```
   data/linkedin-imports/linkedin-jobs-2026-05-07T14-30-45Z.json.tmp
   ```

3. Once writing is fully complete, **rename** the `.tmp` file to the final `.json` name:
   ```
   data/linkedin-imports/linkedin-jobs-2026-05-07T14-30-45Z.json
   ```

This two-step write prevents Job Search Terminal from reading a partial file. JST's file watcher will automatically detect the renamed `.json` file and trigger the import. The file will be archived to `data/linkedin-imports/archive/YYYY-MM-DD/` after import.

---

## Step 5 — Report to the User

After writing the file, tell the user:

```
✓ Scan complete! Found X jobs matching your criteria.
Saved to: data/linkedin-imports/linkedin-jobs-<timestamp>.json

Job Search Terminal will import them automatically within 30 seconds.
You can also trigger a manual import from Settings if needed.
```

If any jobs were skipped (missing data, excluded keywords), mention the count.

---

## Important Constraints

- **Never click Apply** on any job posting
- **Never submit any form** on behalf of the user
- **Never log into LinkedIn** — the user must already be logged in
- **Maximum 50 jobs per scan** to avoid LinkedIn rate limiting
- **Pause 1–2 seconds** between page loads and between clicking job details
- **Stop on CAPTCHA or bot detection** — report to user immediately
- **Do not transmit job data** to any external service other than writing the local JSON file
- **LinkedIn ToS:** The user is responsible for compliance with LinkedIn's Terms of Service regarding automated browsing
