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
  ├─ drops jobs outside the profile's location preferences
  ├─ dedupes by original posting key, URL, then company/title/location
  ├─ insertBrowserBoardJobs()
  ├─ recordScanRun()
  └─ archives the import file
```

Browser-board imports retain jobs posted during the past week. Callers such as
Adzuna that use a user-selected freshness window pass that window through the
shared importer so the final insertion filter matches the upstream query.

### Location preference filtering

Every board lane — Dice, Adzuna, Himalayas, the browser-board file watcher, the
manual import route, the LinkedIn importer, and the email-alert importer — funnels
through `importBrowserBoardJobs`, so it is the single place that keeps
out-of-region roles out of the database. Before this existed those lanes wrote
every job and the Jobs table merely labelled the unwanted ones "Out of scope",
which is why out-of-country remote roles kept appearing.

`importBrowserBoardJobs` builds a filter from the live profile
(`buildJobPreferenceFilter(getUserProfile())`) and passes it to
`prepareBrowserBoardJobs`. Two escape hatches keep the behaviour predictable:

- `prepareBrowserBoardJobs` applies **no** filter unless one is passed, so fixture
  callers such as `scripts/scanner-check.ts` are unaffected.
- `importBrowserBoardJobs({ preferenceFilter: null })` imports without filtering.

Jobs whose `location` the board did not report are **kept**. Filtering on a
missing location would discard roles for want of data, the same failure mode the
preference filter's permissive remote-region rule exists to avoid. The check is
`isLocationReported` from `preference-fit.ts`, shared with the Jobs table's
render-time label so the importer and the label cannot disagree — such jobs show
`No location`, not `Out of scope`.

Rejected jobs are counted as `preferenceFiltered` on the prepare result and on
`ImportResult`, folded into `scan_runs.filtered_count` (alongside malformed
records) so the browser-board lanes stay comparable with the CareerOps lane, and
named in the import summary string when non-zero so the drop is never silent.

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
| Email alerts | `email` | `email-alert-import` |
| Dice | `dice` | `dice-mcp-scan` |

Adzuna uses a direct API scan (`src/lib/scanner/aggregator-scanner.ts`) rather
than browser automation. The `metadata.source` value `"adzuna"` is recognised
by the same importer pipeline, and the scan type `"adzuna-api-scan"` is stored
in `scan_runs.scan_type`. Adzuna scan summaries use the importer-returned
inserted job IDs for their new-listing preview, so ignored duplicate rows do
not displace jobs that were actually added.

### Transient-failure handling (Adzuna and Common Crawl)

Retry mechanics shared by the scanner fetches live in
`src/lib/scanner/transient-retry.ts`. `fetchWithRetry(url, read, options)`
retries the statuses in `TRANSIENT_RETRY_STATUS` (429, 502, 503, 504) plus
transport errors, with exponential backoff that honours a server-supplied
`Retry-After`. It returns one of three outcomes so callers can tell the cases
apart:

| Outcome | Meaning |
| --- | --- |
| `{ kind: "value", value }` | Request succeeded and the body was read |
| `{ kind: "status", status, response }` | Non-retryable HTTP status; body not read |
| `{ kind: "exhausted", lastStatus, timedOut, retryAfterMs? }` | Every attempt failed |

Two invariants are easy to break and worth preserving:

- **The body read happens inside the retry loop.** A response that terminates
  mid-read is a transient failure like any other; hoisting the read out of the
  loop silently stops retrying it.
- **Every attempt carries its own deadline.** `safeFetch` imposes no timeout of
  its own — a caller that passes no signal can hang indefinitely.
- **The sleep between attempts is capped too.** The per-attempt deadline bounds
  the *request*, not the wait between requests. `BackoffConfig.maxDelayMs` caps
  the exponential schedule, and a server-supplied `Retry-After` longer than that
  ends the retries immediately, reporting the interval as `retryAfterMs` on the
  exhausted outcome. Honouring a quota-reset `Retry-After` verbatim would stall
  the caller for hours — the same unbounded stall the deadline exists to
  prevent — while ignoring it and retrying sooner would burn quota against a
  limit the server already told us about.

`ccFetchText` in `source-discovery.ts` is a thin wrapper over this helper
(3 attempts, 90s deadline, 2s base × 3 backoff, 60s delay cap — generous,
since it is a background sweep). `computeRetryDelayMs` and
`retryAfterMs` remain exported from `source-discovery.ts` for the CC-tuned
constants.

Adzuna (`searchAdzuna`) uses a faster profile — 3 attempts, a **15s per-attempt
deadline**, a 1s base × 2 backoff, and a **10s delay cap** — because a search
API answers in well
under a second when healthy and the scan fans out over up to 5 titles × 3
locations sequentially. Before this existed, Adzuna threw on the first non-ok
status, so a single 502 dropped a whole query and surfaced as an unactionable
scan error; it also passed no abort signal at all, so one hung socket could
stall the whole discovery run (all lanes run under `Promise.all` in
`job-discovery.ts`).

Exhausted Adzuna attempts produce distinct messages so
`classifyScanErrorMessage` can categorise them correctly on the dashboard:

- Timeout → `Adzuna search timed out after 15s` (badge: *Timed out*)
- Gateway → `Adzuna API returned HTTP <status> on all 3 attempts`
- Rate limit (429) → `Adzuna is rate limiting this account — it asked us to wait <interval> before retrying`
- Gateway backpressure (502/503/504 carrying `Retry-After`) → `Adzuna is temporarily unavailable (HTTP <status>) — it asked us to wait <interval> before retrying`
- Neither → `Adzuna could not be reached after 3 attempts`

Non-retryable statuses keep their existing meanings: 401/403 raise the
credentials error that aborts the whole Adzuna scan, and 404 is treated as an
empty result set rather than a failure.

**Backpressure ends the sweep.** A `Retry-After` longer than the cap raises
`AdzunaBackpressureError`, which aborts the entire title/location sweep rather
than counting as one failure toward the circuit breaker — every remaining query
goes to the same account against the same limit, so continuing only spends
requests to be told the same thing. Bad credentials raise
`AdzunaCredentialsError` and end the scan the same way. Both are matched by
type, never by substring: the messages are user-facing prose and must stay free
to change without altering control flow.

**Circuit breaker.** `ADZUNA_MAX_CONSECUTIVE_FAILURES` (3) abandons the sweep
once three consecutive title/location queries fail, mirroring
`CC_MAX_CONSECUTIVE_FAILURES`. A successful query resets the streak. Without
it, a full outage would burn the retry budget on all 15 queries to learn the
same thing. The abort is reported as a scan error
(`Adzuna stopped responding — gave up after N consecutive failed searches`)
rather than passing silently.

The Adzuna scanner applies the same `title_filters` (positive/negative keyword
lists from `getTitleFilters()`) as the Career Ops scanner before writing the
import file. Jobs whose titles don't pass the filter are skipped and counted in
`metadata.totalJobsSkipped`. The route (`src/app/api/aggregator/scan/route.ts`)
reads and passes these filters via `AggregatorScanOptions.titleFilters`.

Dice uses a free, no-auth MCP server (`https://mcp.dice.com/mcp`) rather than
browser automation. The in-app **Scan with Dice** button (Settings → Sources →
Job aggregators) calls the MCP `search_jobs` tool over HTTP via
`src/lib/scanner/dice-scanner.ts`, which uses a minimal MCP streamable-HTTP
client. Results are written as `dice-jobs-<timestamp>.json` and imported through
the same pipeline. No Chrome extension or user login is required. Agents
(Claude Desktop / Codex) can also drive Dice scans via the CLAUDE.md instructions
using the `dice` MCP server configured in `.mcp.json`.

Email alert imports are generated by the local drop-folder watcher documented in
`docs/email-job-alert-imports.md`. Dropped `.eml`, `.html`, and `.txt` files are
parsed into internal `email-jobs-<timestamp>.json` files and then imported
through this same pipeline.

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

**Startup sweep.** On server start, `startBrowserBoardFileWatcher()` performs a
one-time `readdirSync` sweep of both watched directories before registering
`fs.watch`. Any `.json` files already present (e.g., dropped while the server
was offline) are imported immediately through the same `processFile` path used
by live events. This ensures no scan file is silently missed.

**Partial-write resilience.** When `fs.watch` fires for a new `.json` file, the
watcher does not read it immediately. Instead it polls `stat().size` up to 4
times at ~250ms intervals and only proceeds once the file size has been stable
for two consecutive reads and is non-zero. If the file fails `JSON.parse` (a
writer that aborted mid-write), the file is left in place and logged via
`logActivity`. A subsequent startup sweep or manual API call will retry it.

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

## Network and Import Safety

**SSRF-safe egress (`src/lib/safe-fetch.ts`).** Every outbound fetch made by the
scanners, the JD fetcher, source discovery, and the liveness checker goes through
`safeFetch`. It enforces an `http(s)` protocol allow-list and blocks requests to
loopback, RFC-1918 private ranges, CGNAT (100.64.0.0/10), and link-local
(169.254.x.x / AWS IMDS) targets, plus their IPv6 equivalents (`::1`, `fc00::/7`,
`fe80::/10`, and IPv4-mapped forms). Protection is layered:

1. A synchronous literal-host check on the URL (IPv6 hosts are unwrapped from
   their `[…]` brackets before matching).
2. DNS resolution of the hostname — every resolved address is checked, so a
   public hostname that points at an internal IP is rejected.
3. Manual redirect following — each redirect hop is re-validated, so a remote
   server cannot 3xx-redirect into an internal address. Callers that pass
   `redirect: "manual"`/`"error"` receive the first redirect response untouched.

A residual DNS-rebinding (TOCTOU) window between the resolution check and the
socket connect is not fully closed, but the resolution check raises the bar well
above a hostname-only filter.

**Import path containment.** The import API routes
(`src/app/api/job-board/import` and `src/app/api/linkedin/import`) accept an
optional caller-supplied `filePath`. That path is resolved through
`resolveImportFilePathWithin()` (`src/lib/scanner/import-path.ts`) and rejected
with HTTP 400 unless it lands inside an allowed import directory
(`data/job-board-imports/` or the legacy `data/linkedin-imports/`). This prevents
a local request from reading arbitrary files off disk via the import endpoint.

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
