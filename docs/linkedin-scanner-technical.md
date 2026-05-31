# LinkedIn Scanner — Technical Reference

> Current implementation note: the LinkedIn flow now runs through the generalized
> browser-board importer described in
> [`docs/browser-board-scanner-technical.md`](browser-board-scanner-technical.md).
> This file remains as historical detail for the original LinkedIn-only
> implementation and legacy import path.

This document describes the LinkedIn job scanner integration added in migration `0031`. It covers the architecture, all new and modified files, the data model changes, and how the components connect end to end.

---

## Overview

The LinkedIn scanner is a two-process system:

1. **Claude Desktop agent** — reads search criteria from the JST SQLite database, browses LinkedIn via the Claude in Chrome extension, and writes a JSON batch file to `data/linkedin-imports/`.
2. **Job Search Terminal** — watches for new JSON files, runs the import pipeline (duplicate detection → SQLite insert → archive), and surfaces the results in the UI.

The two processes communicate exclusively through the local filesystem. Claude Desktop never writes directly to the database; JST never requires Claude Desktop to be running. Non-Claude users are fully unaffected — the file watcher does nothing when the directory is empty.

---

## Architecture Diagram

```
Claude Desktop (agent)
  ├─ reads criteria from SQLite (read-only)
  ├─ browses LinkedIn via Chrome extension
  ├─ writes data/linkedin-imports/linkedin-jobs-{ts}.json.tmp
  └─ renames .tmp → .json  ← triggers watcher

data/linkedin-imports/
  └─ linkedin-jobs-{ts}.json

src/instrumentation.ts (Next.js server startup)
  └─ startLinkedInFileWatcher()
       └─ fs.watch() on data/linkedin-imports/
            └─ importLinkedInJobs(filePath) on each new *.json

importLinkedInJobs()
  ├─ parse JSON
  ├─ getJobDedupKeys()  ← reads existing jobs from DB
  ├─ mark duplicates (URL match first, then company+title)
  ├─ insertLinkedInJobs()  ← SQLite transaction
  ├─ archive file → data/linkedin-imports/archive/YYYY-MM-DD/
  ├─ recordScanRun()  ← scan_runs table, scan_type='linkedin-claude-scan'
  └─ logActivity()

Jobs page /jobs
  ├─ shows LinkedIn badge (source='linkedin-claude-scan')
  ├─ shows Duplicate badge (is_duplicate=1)
  ├─ Source column filterable/sortable
  └─ LinkedInImportNotification (polls /api/linkedin/recent every 30s)
```

---

## Database Changes — Migration `0031_linkedin_scan_support`

**File:** `src/lib/db/schema.ts`

### New columns on `jobs`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `is_duplicate` | `INTEGER NOT NULL` | `0` | `1` if this job was detected as a duplicate of an existing job at import time |
| `duplicate_of` | `TEXT` | `NULL` | JSON array of job IDs that this is a possible duplicate of (currently always null — reserved for future exact matching) |

All existing rows receive the default values automatically. No data is changed.

### New column on `scan_runs`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `scan_type` | `TEXT NOT NULL` | `'careerops'` | Distinguishes LinkedIn imports (`'linkedin-claude-scan'`) from CareerOps ATS scans (`'careerops'`) |

All existing `scan_runs` rows are automatically classified as `'careerops'`.

### New index

```sql
create index if not exists idx_jobs_company_title_location
on jobs(company, title, location);
```

Speeds up the company+title duplicate check during imports.

---

## Duplicate Detection Algorithm

Duplicates are detected in `importLinkedInJobs()` using the same dedup key set that the CareerOps scanner uses (`getJobDedupKeys()`), so detection is consistent across both scan sources.

**Priority order:**

1. **URL match** → exact duplicate. The URL is the most reliable identifier. If a job's URL already exists in the `jobs` table, `isDuplicate` is set to `true`.
2. **Company + title match** → possible duplicate. If `company.toLowerCase() + '::' + title.toLowerCase()` matches an existing job, `isDuplicate` is set to `true`. This catches the same role posted under a slightly different URL (common on LinkedIn when a posting is refreshed).
3. **No match** → new job. Inserted normally with `isDuplicate = false`.

**Within-batch deduplication:** The dedup key sets are updated in-memory as each job is processed, so two jobs with the same URL or company+title within a single JSON batch are also collapsed (only the first is inserted).

Duplicate jobs are **inserted** into the database — they are not dropped. This preserves the full record for user review. The `is_duplicate` flag causes a "Duplicate" badge to appear in the UI so the user can inspect and dismiss the flag if needed.

---

## New and Modified Files

### New Files

#### `src/lib/scanner/linkedin-importer.ts`

The core import function. Exported API:

```typescript
// Main entry point — called by file watcher and manual API route
importLinkedInJobs(jsonFilePath: string): Promise<ImportResult>

// Returns the watched directory path (data/linkedin-imports/)
getImportDirectory(): string

// Creates the watched directory if it does not exist
ensureImportDirectory(): void
```

**What `importLinkedInJobs` does:**

1. Reads and parses the JSON file (`LinkedInScanFile` schema)
2. Validates the top-level structure (requires `metadata` and `jobs` array)
3. Calls `getJobDedupKeys()` to load all existing URLs and company+title keys
4. Iterates `jobs` array — maps `position` → `title`, `jobDescription` → `rawDescription`, applies duplicate detection, generates stable IDs via SHA-1 of URL
5. Calls `insertLinkedInJobs()` in a single SQLite transaction
6. Archives the source file to `data/linkedin-imports/archive/YYYY-MM-DD/` using rename (falls back to copy+delete on cross-device filesystems)
7. Records the scan run with `recordScanRun()` (`scanType: 'linkedin-claude-scan'`)
8. Logs to `activity_log` via `logActivity()`
9. Returns `ImportResult`

**Job ID generation:**

```typescript
`li-${createHash('sha1').update(url).digest('hex').slice(0, 16)}`
```

IDs are deterministic from the URL. Re-importing the same job twice produces the same ID, which combined with `INSERT OR IGNORE` prevents double-insertion even if the file watcher fires more than once.

---

#### `src/lib/scanner/linkedin-file-watcher.ts`

Wraps Node.js `fs.watch()` to monitor `data/linkedin-imports/`. Exported API:

```typescript
startLinkedInFileWatcher(): void
```

The function is idempotent — calling it multiple times has no effect. It:

- Creates the watch directory if it doesn't exist
- Ignores events for `.tmp` files and files that don't match `linkedin-jobs-*.json`
- Waits 200ms after an event fires before reading the file (lets the `.tmp` → `.json` rename complete)
- Re-checks `existsSync()` before importing (prevents race conditions if the file was already consumed)
- Logs watcher errors to `activity_log` rather than crashing the server

---

#### `src/instrumentation.ts`

Next.js 15 instrumentation module. Runs once at server startup.

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startLinkedInFileWatcher } = await import('./lib/scanner/linkedin-file-watcher');
    startLinkedInFileWatcher();
  }
}
```

The `NEXT_RUNTIME === 'nodejs'` guard is required — without it, this code would run during Edge rendering and build phases where `fs.watch()` is unavailable. Dynamic `import()` avoids circular dependency issues at startup.

---

#### `src/app/api/linkedin/import/route.ts`

Manual import trigger. `POST /api/linkedin/import`.

**Request body (optional):**
```json
{ "filePath": "/absolute/path/to/file.json" }
```

If `filePath` is omitted, the route auto-detects the most recently modified `linkedin-jobs-*.json` file in `data/linkedin-imports/`.

**Response:** `ImportResult` JSON object.

Used by the Settings page manual import button (if implemented) and for testing via `curl`.

---

#### `src/app/api/linkedin/recent/route.ts`

Import recency check. `GET /api/linkedin/recent`.

Returns whether a LinkedIn import completed within the past 5 minutes. Polled every 30 seconds by `LinkedInImportNotification`.

**Response:**
```json
{
  "hasRecent": true,
  "newJobsCount": 12,
  "duplicateCount": 3,
  "completedAt": "2026-05-07T14:35:00Z"
}
```

Marked `dynamic = 'force-dynamic'` so Next.js never caches it.

---

#### `src/components/linkedin-import-notification.tsx`

Client component that polls `GET /api/linkedin/recent` every 30 seconds and shows a fixed-bottom success alert when a recent import is detected.

- Uses the existing inline alert pattern (same positioning and CSS structure as the scan error alert in `scan-sources-table.tsx`)
- Green `border-success/30` border (vs. red for errors)
- Calls `router.refresh()` on detection to reload server components and show new jobs
- Auto-dismisses when the 5-minute recency window expires
- Manual Dismiss button clears state immediately

---

#### `CLAUDE.md`

Claude Desktop agent instructions. Read automatically when Claude Desktop opens this project folder.

Covers:
1. Which SQLite queries to run to build search criteria
2. How to navigate and scrape LinkedIn via the Chrome extension
3. The exact JSON output schema Claude must produce
4. The `.tmp` → rename write pattern required for the file watcher
5. Usage constraints (no Apply clicks, rate limiting, CAPTCHA handling)

---

### Modified Files

#### `src/lib/db/schema.ts`

Added migration `0031_linkedin_scan_support` at the end of the `migrations` array. See database changes above.

---

#### `src/lib/db/types.ts`

**`JobRecord`** — two new fields added after `archived`:
```typescript
isDuplicate: boolean;
duplicateOf: string[] | null;
```

**`ScanRunRecord`** — one new field:
```typescript
scanType: 'careerops' | 'linkedin-claude-scan';
```

**New exported types:**

```typescript
// Returned by importLinkedInJobs()
type ImportResult = {
  success: boolean;
  imported: number;
  duplicates: number;
  fresh: number;
  unknownDate: number;
  staleFiltered: number;
  errors: string[];
  summary: string;
  jobIds: string[];
  importedJobs: Array<{ id: string; title: string; url: string; company: string }>;
  scanRunId: string;
};

// Shape of the JSON file written by Claude Desktop
type LinkedInScanFile = {
  metadata: { scanTimestamp, scanDurationSeconds, totalJobsDiscovered, ... };
  jobs: Array<{
    id, company, position, jobDescription?, url, discoveredAt, location?, dataQuality?
  }>;
};
```

Note the JSON field name `position` (not `title`) — this is the Claude Desktop output convention. The importer maps it to `jobs.title` in the database.

---

#### `src/lib/db/queries.ts`

**Updated internal `JobRow` type** — added `is_duplicate: number` and `duplicate_of: string | null`.

**Updated `mapJob()`** — maps the two new columns to the `JobRecord` shape:
```typescript
isDuplicate: (row.is_duplicate ?? 0) === 1,
duplicateOf: row.duplicate_of ? parseJson<string[]>(row.duplicate_of) : null,
```

**Updated internal `ScanRunRow` type** — added `scan_type: string`.

**Updated `mapScanRun()`** — maps `scan_type` with fallback:
```typescript
scanType: (row.scan_type ?? 'careerops') as ScanRunRecord['scanType'],
```

**Updated `recordScanRun()`** — includes `scan_type` in the INSERT statement. Existing CareerOps callers that don't set `scanType` receive `'careerops'` via `run.scanType ?? 'careerops'` fallback.

**New exported type `LinkedInJobInput`** — the input shape for `insertLinkedInJobs()`:
```typescript
type LinkedInJobInput = {
  id, company, title, url, location, rawDescription,
  datePosted, firstSeenDate, isDuplicate, duplicateOf
};
```

**New function `insertLinkedInJobs(jobs)`** — mirrors `insertScannedJobs()` but:
- Sets `source = 'linkedin-claude-scan'` statically
- Writes `raw_description` from the job's description text (CareerOps leaves this blank at scan time)
- Includes `is_duplicate` and `duplicate_of` in the INSERT
- Returns `{ inserted: number, jobIds: string[] }` instead of just `number`

**New function `getLatestLinkedInImport()`** — single-row query for the recency API:
```sql
select id, new_jobs_count, duplicate_count, completed_at
from scan_runs
where scan_type = 'linkedin-claude-scan'
order by started_at desc
limit 1
```

---

#### `src/lib/scanner/careerops-scanner.ts`

Added `scanType: 'careerops'` to the `ScanRunRecord` object constructed before calling `recordScanRun()`. Required after `scanType` became a non-optional field on `ScanRunRecord`.

---

#### `src/lib/job-table-helpers.ts`

Added `"source"` to the `MainJobsSortCol` union type.

Added a `case "source"` to `getMainJobColValue()`:
```typescript
case 'source':
  if (job.source === 'linkedin-claude-scan') return 'LinkedIn';
  if (job.source === 'manual') return 'Manual';
  return 'Scanner';
```

Added a `"source"` branch to `getMainJobColOptions()`:
```typescript
if (col === 'source') return ['LinkedIn', 'Manual', 'Scanner'];
```

---

#### `src/components/batch-evaluate-form.tsx`

- Added `{ col: 'source', label: 'Source' }` to `COL_DEFS`
- Added `case 'source'` to the sort comparator
- Added a new `<td>` for the Source column in each table row:
  ```tsx
  <td className="py-3 pr-4">
    <div className="flex flex-wrap gap-1">
      {job.source === 'linkedin-claude-scan' && <Badge tone="neutral">LinkedIn</Badge>}
      {job.source === 'manual' && <Badge tone="neutral">Manual</Badge>}
      {job.isDuplicate && <Badge tone="warning">Duplicate</Badge>}
    </div>
  </td>
  ```

The "LinkedIn" and "Manual" badges use `tone="neutral"` (standard gray border) to indicate source without urgency.

The "Duplicate" badge is rendered as a `<button>` (not a `<span>`) with warning styling. Clicking it toggles a `"duplicate"` filter that is tracked in the same `useDataTableSortFilterState` filter map as column filters — when active, `filters.duplicate` is `new Set(["Yes"])`, which causes `displayJobs` to pass only jobs where `isDuplicate` is true. When the filter is active the badge renders with a ring and slightly higher opacity background to signal the active state. Clicking again passes `undefined` to `handleFilter`, clearing the filter.

The `"duplicate"` column is added to `MainJobsSortCol` and handled in `getMainJobColValue()` (returns `"Yes"` / `"No"`) so the filter machinery works without a visible column header.

---

#### `src/app/jobs/page.tsx`

Imports and renders `<LinkedInImportNotification />` just before the Shell closing tag. As a Client Component, it runs in the browser and polls the recency API independently of the Server Component page render.

---

## JSON Import File Format

Claude Desktop must write files to `data/linkedin-imports/` following this schema exactly:

```json
{
  "metadata": {
    "scanTimestamp": "2026-05-07T14:30:00Z",
    "scanDurationSeconds": 120,
    "totalJobsDiscovered": 20,
    "totalJobsValid": 20,
    "totalJobsSkipped": 0,
    "searchCriteria": {
      "titles": ["Product Manager"],
      "locations": ["Remote"],
      "remotePreference": "remote-only"
    },
    "generatedBy": "Claude Desktop LinkedIn Scanner v1.0"
  },
  "jobs": [
    {
      "id": "any-string",
      "company": "Acme Corp",
      "position": "Senior Product Manager",
      "jobDescription": "Full job description text...",
      "url": "https://www.linkedin.com/jobs/view/9000000001/",
      "discoveredAt": "2026-05-07T14:30:15Z",
      "location": "Remote"
    }
  ],
  "validationSummary": {
    "totalRecords": 20,
    "validRecords": 20,
    "invalidRecords": 0,
    "errors": []
  }
}
```

**Key field mappings (JSON → database):**

| JSON field | DB column | Notes |
|-----------|-----------|-------|
| `position` | `jobs.title` | Field is named `position` in JSON, `title` in DB |
| `jobDescription` | `jobs.raw_description` | Field is named `jobDescription` in JSON |
| `url` | `jobs.url` | Must be unique; duplicate URLs are skipped |
| `company` | `jobs.company` | Required — jobs without company are skipped |
| `discoveredAt` | `jobs.first_seen_date` | Sliced to `YYYY-MM-DD` |
| `location` | `jobs.location` | Defaults to `'Not specified'` if absent |

The `id` field in the JSON is ignored — the importer generates a deterministic ID from the URL.

---

## File Naming Convention

Import files must be named: `linkedin-jobs-{ISO-timestamp-with-hyphens}.json`

Example: `linkedin-jobs-2026-05-07T14-30-45Z.json`

The `.tmp` → `.json` rename pattern is required. The file watcher ignores `.tmp` files and only processes files matching `linkedin-jobs-*.json`. Writing directly to the `.json` filename risks the watcher reading a partially written file.

---

## Archive Layout

After a successful import, the source file is moved to:

```
data/linkedin-imports/archive/
  └─ YYYY-MM-DD/
       └─ linkedin-jobs-{timestamp}.json
```

If `renameSync` fails (cross-device filesystem), the importer falls back to `copyFileSync` + `unlinkSync`. If the archive step itself fails entirely (e.g., permission error), the error is included in `ImportResult.errors` but the import still succeeds and the file remains in `data/linkedin-imports/`.

---

## Source Values in the Database

| `jobs.source` value | Meaning |
|---|---|
| `'linkedin-claude-scan'` | Imported by the LinkedIn scanner |
| `'greenhouse-api'` | CareerOps ATS scanner — Greenhouse |
| `'ashby-api'` | CareerOps ATS scanner — Ashby |
| `'lever-api'` | CareerOps ATS scanner — Lever |
| `'manual'` | Added manually via the Add Job modal |

---

## Testing

**Run an import directly:**
```bash
# Put a JSON file in the import directory, then:
npx tsx --tsconfig tsconfig.json scripts/test-linkedin-import.ts
```

**Test duplicate detection:**
Run the same import file twice. Second run should return `{ imported: 0, duplicates: N }`.

**Test the file watcher:**
With the dev server running:
```bash
cp some-valid-file.json data/linkedin-imports/linkedin-jobs-test.json.tmp
mv data/linkedin-imports/linkedin-jobs-test.json.tmp data/linkedin-imports/linkedin-jobs-test.json
```
Check the activity log in the UI for the `linkedin-import` entry.

**Test the recency API:**
```bash
curl http://localhost:3000/api/linkedin/recent
```

**Test manual import trigger:**
```bash
curl -X POST http://localhost:3000/api/linkedin/import
```
