# Browser Board Scanner — Technical Reference

The browser board scanner generalizes the original LinkedIn import flow for
agent-assisted job discovery across LinkedIn, Wellfound, Work at a Startup,
Glassdoor, Indeed, and Monster.
It is intentionally not a server-side crawler. Claude Desktop and Codex browse
visible pages in Chrome, write a local JSON file, and Job Search Terminal imports
that file into SQLite.

## Architecture

```text
Claude in Chrome or Codex Chrome Extension
  ├─ reads search criteria from SQLite
  ├─ browses visible job-board results in Chrome
  ├─ writes data/job-board-imports/<source>-jobs-{timestamp}.json.tmp
  └─ renames .tmp -> .json

src/instrumentation.ts
  └─ startBrowserBoardFileWatcher()
       ├─ watches data/job-board-imports/
       └─ watches legacy data/linkedin-imports/

importBrowserBoardJobs()
  ├─ validates metadata.source and jobs[]
  ├─ normalizes source URL, employer URL, and posting key
  ├─ dedupes by original posting key, URL, then company/title/location
  ├─ insertBrowserBoardJobs()
  ├─ recordScanRun()
  └─ archives the import file
```

## Supported Sources

| Source | `metadata.source` | Stored `jobs.source` / `scan_runs.scan_type` |
| --- | --- | --- |
| LinkedIn | `linkedin` | `linkedin-claude-scan` |
| Wellfound | `wellfound` | `wellfound-browser-scan` |
| Work at a Startup | `workatastartup` | `workatastartup-browser-scan` |
| Glassdoor | `glassdoor` | `glassdoor-browser-scan` |
| Indeed | `indeed` | `indeed-browser-scan` |
| Monster | `monster` | `monster-browser-scan` |
| Adzuna | `adzuna` | `adzuna-api-scan` |

Adzuna uses a direct API scan (`src/lib/scanner/aggregator-scanner.ts`) rather
than browser automation. The `metadata.source` value `"adzuna"` is recognised
by the same importer pipeline, and the scan type `"adzuna-api-scan"` is stored
in `scan_runs.scan_type`. Adzuna scan summaries use the importer-returned
inserted job IDs for their new-listing preview, so ignored duplicate rows do
not displace jobs that were actually added.

The Adzuna scanner applies the same `title_filters` (positive/negative keyword
lists from `getTitleFilters()`) as the Career Ops scanner before writing the
import file. Jobs whose titles don't pass the filter are skipped and counted in
`metadata.totalJobsSkipped`. The route (`src/app/api/aggregator/scan/route.ts`)
reads and passes these filters via `AggregatorScanOptions.titleFilters`.

Legacy LinkedIn files without `metadata.source` remain supported when imported
through the legacy LinkedIn directory or route.

## Per-Source Liveness Notes

The liveness checker (`src/lib/scanner/liveness-checker.ts`) fetches `jobs.url`
and scans the response body for expiry/active-signal patterns.

**Monster — fetch attempted, result classified conservatively.**
Monster's CDN (Cloudflare) can return HTTP 200 with a bot-challenge page that
contains no job content and no expiry or active signals. To avoid misclassifying
those pages as live job postings, `monster.com` is in the
`UNCERTAIN_ON_AMBIGUOUS_HOSTS` list. For these hosts a pattern-free HTTP 200
falls back to `"uncertain"` rather than `"active"`. Explicit pattern matches are
still trusted in both directions:

- `"Sorry, that job has expired"` (Monster's exact expiry heading) → `"expired"`
- `"Apply now"` / `"Submit your application"` / `"We're hiring"` → `"active"`
- No pattern match on HTTP 200, or HTTP 4xx other than 404/410 → `"uncertain"`

**Monster search URL bakes in the recency filter.**
Monster's UI date filter is unreliable — even "Past 3 days" often surfaces
expired listings. The scanner now constructs the search URL with `recency=3`
and `sort=newest` as URL parameters rather than relying on UI interaction:
`https://www.monster.com/jobs/search?q=<title>&where=<location>&recency=3&sort=newest`

**Card-level pre-check before opening Monster detail pages.**
Monster search result cards show "Posted X days ago". Before clicking into a
detail page, the scanner checks that date: cards older than 3 days or with no
visible date are skipped without opening the detail page.

**Early-abort on predominantly-expired Monster results.**
After opening the first 5 Monster detail pages for a given search query, if 4+
are expired the scanner aborts that query immediately rather than scanning 3 full
pages of stale results. This is reported in the scan summary.

**Capture ATS URLs during scan for reliable liveness.**
When a Monster job detail page shows an "Apply on company site" button pointing
to a third-party ATS (Greenhouse, Lever, Ashby, etc.), the scanner records that
ATS URL as `original_posting_url`. The liveness route
(`src/app/api/jobs/liveness/route.ts`) falls back to `original_posting_url` when
the primary URL check returns `"uncertain"`, so ATS URLs are checked even when
the Monster platform URL returns an ambiguous response.

**Expired-post redirect false positive.** When a Greenhouse job closes, Greenhouse
often redirects to a company "Join our Talent Network" page (HTTP 200). Earlier
versions of the checker included `/join (our|the) team/i` as an active-signal
pattern, which caused these redirect pages to be misclassified as active. That
pattern was removed; the remaining active patterns (`apply now`,
`submit your application`, `we're hiring`) are specific enough to avoid the
false positive.

## Data Model

Migration `0035_browser_board_job_provenance` adds:

| Column | Purpose |
| --- | --- |
| `source_url` | The platform URL where the agent found the job. |
| `original_posting_url` | Visible job-specific employer or ATS apply URL, when available. |
| `original_posting_key` | Canonical dedupe key, preferring ATS provider and job ID. |

`jobs.url` remains the primary link opened by the app. Browser-board imports set
it to `original_posting_url` when a job-specific employer/ATS URL is visible;
otherwise they use `source_url`.

## Import JSON

Files go in `data/job-board-imports/` and must match
`<source>-jobs-<timestamp>.json`. The watcher ignores `.tmp` files, so agents
must write a `.tmp` file first and rename it when complete.

Minimum job fields:

```json
{
  "metadata": {
    "source": "wellfound",
    "scanTimestamp": "2026-05-11T12:05:00Z",
    "scanDurationSeconds": 60,
    "totalJobsDiscovered": 1,
    "searchCriteria": {}
  },
  "jobs": [
    {
      "company": "Acme AI",
      "position": "Product Design Lead",
      "jobDescription": "Full visible job description",
      "sourceUrl": "https://wellfound.com/jobs/100-product-design-lead",
      "originalPostingUrl": "https://job-boards.greenhouse.io/acmeai/jobs/1234567",
      "url": "https://job-boards.greenhouse.io/acmeai/jobs/1234567",
      "discoveredAt": "2026-05-11T12:05:00Z",
      "location": "Remote United States"
    }
  ]
}
```

## Verification

Use `npm run scanner:check` for parser and dedupe fixtures, then run the standard
project gates:

```bash
npm run lint
npm run typecheck
npm run build
```

For feature verification, import a fixture or browser-generated file, open Jobs,
and confirm the source badge, posting URL, duplicate flag, and import
notification render correctly.
