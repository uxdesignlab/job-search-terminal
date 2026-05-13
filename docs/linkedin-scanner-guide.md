# Browser Job Board Scanner — User Guide

The browser job board scanner lets Claude Desktop or Codex browse supported boards on your behalf and automatically import matching job postings into Job Search Terminal. It supports LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster using the same local JSON import pipeline.

---

## What You Need

Before running your first scan, confirm you have:

- **Claude Desktop** with Claude in Chrome, or **Codex** with the Codex Chrome Extension
- The requested board open in Chrome and logged in if a session is required
- **Job Search Terminal** running locally (or at minimum, the project folder accessible to the agent)
- **Target roles and location preferences** saved in Job Search Terminal (Profile → Preferences)

If your Job Search Terminal preferences are empty, Claude will not know what to search for. Fill them in first — see [Profile setup](#setting-up-your-search-criteria) below.

---

## Setting Up Your Search Criteria

Search criteria are read directly from your Job Search Terminal profile. The agent does not need you to re-enter them.

1. Open Job Search Terminal and go to **Profile → Preferences**
2. Set your **target roles** — the job titles to search for (e.g., "Product Manager", "UX Designer")
3. Set your **preferred locations** — e.g., "Remote", "Nashville, TN"
4. Set your **remote preference** — Remote only, Local or remote, or All
5. Optionally configure **positive title filters** (titles must contain these words) and **negative title filters** (titles containing these words are skipped) in **Settings → Scan Sources**

The agent will use these exact settings when building the board search.

---

## Running a Scan

1. Open **Claude Desktop** or **Codex**
2. Make sure the project folder is the current working directory so the agent can read `CLAUDE.md` or `AGENTS.md`
3. Type any of:
   - `Scan LinkedIn for jobs`
   - `Find new jobs on Wellfound`
   - `Scan Work at a Startup for jobs`
   - `Scan Glassdoor for jobs`
   - `Scan Indeed for jobs`
   - `Scan Monster for jobs`
4. The agent will confirm your saved criteria and ask before starting when a signed-in browser session is involved
5. The agent opens the requested board in Chrome and begins scanning
6. You'll see live status updates as it pages through results

**During the scan:**
- The agent searches the board for each of your target job titles
- Applies visible filters such as date posted and remote mode when the board supports them
- Extracts company, job title, full description, platform URL, visible employer/ATS URL, and location from each posting
- Skips jobs that match your negative title filters
- Scans up to 3 pages or 50 postings, whichever comes first

**When the scan finishes:**
- Claude reports how many jobs were found and saves them locally
- Job Search Terminal detects the file and imports it automatically
- A green notification appears at the bottom of the Jobs page within 30 seconds

---

## Understanding the Jobs Table

After a scan, imported jobs appear in your Jobs table (`/jobs`) with two new indicators:

### Source Badge

A neutral-gray **LinkedIn**, **Wellfound**, **Work at a Startup**, **Glassdoor**, **Indeed**, or **Monster** badge in the Source column identifies every job that came from a browser-board scan. This lets you quickly tell imported jobs apart from ATS-scanned jobs or manually added ones.

You can filter the table by source using the **Source** column filter.

### Duplicate Badge

An amber **Duplicate** badge appears on any job that was already in your pipeline when the scan ran. A job is flagged as a duplicate when:

- Its canonical original posting key or URL matches a job already in the database (high confidence), or
- Its **company + title** matches an existing job (possible match — same role, different posting URL)

Duplicate jobs are **not dropped** — they are still imported so you can review them. The badge is a prompt to check whether you have already seen this role.

**To dismiss a duplicate flag:** Open the job detail page and update the job's status or notes to indicate you've reviewed it. There is no separate "dismiss" button — simply treating the job as part of your normal workflow (evaluate, skip, or archive it) is sufficient.

To show only duplicate-flagged jobs, use the **Source** column filter or look for jobs with the amber Duplicate badge.

---

## Import Notification

When Job Search Terminal detects and processes a new LinkedIn scan file, a notification appears at the bottom of the Jobs page:

```
Wellfound scan imported 12 new jobs · 3 possible duplicates flagged.    [Dismiss]
```

The notification:
- Appears automatically within 30 seconds of the scan completing
- Includes a count of new jobs added and duplicates flagged
- Refreshes the jobs table so new jobs are visible without a manual page reload
- Disappears automatically after 5 minutes or when you click Dismiss

If you don't see the notification, navigate to `/jobs` manually — the table will already contain the imported jobs.

---

## Manual Import (Fallback)

If the automatic import does not trigger (for example, if Job Search Terminal was not running during the scan), you can import manually:

**Option 1 — Restart the dev server.** The file watcher starts when the Next.js server starts. Any unprocessed `.json` files in `data/job-board-imports/` or the legacy `data/linkedin-imports/` directory will be picked up automatically.

**Option 2 — API trigger.** With the server running, call:
```bash
curl -X POST http://localhost:3000/api/job-board/import
```
This finds the most recent unprocessed file in `data/job-board-imports/` and imports it. Legacy LinkedIn files can still be imported with `/api/linkedin/import`.

**Option 3 — Specify a file.** To import a specific archived file or a file you placed manually:
```bash
curl -X POST http://localhost:3000/api/job-board/import \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/absolute/path/to/wellfound-jobs-2026-05-07T14-30-45Z.json"}'
```

---

## Where Files Are Stored

| Path | Contents |
|------|----------|
| `data/job-board-imports/` | Pending browser-board `.json` files waiting to be imported (usually empty — files are processed immediately) |
| `data/job-board-imports/archive/YYYY-MM-DD/` | Successfully imported browser-board files, organized by import date |
| `data/linkedin-imports/` | Legacy LinkedIn-only import directory, still watched for backward compatibility |

Files are only archived after a successful import. If an import fails, the source file remains in the import directory and you can retry manually.

---

## Scan Frequency and Limits

- The agent scans up to **3 pages of results** or **50 job postings**, whichever comes first
- Jobs are filtered to those **posted within the last 7 days** when the board exposes that filter
- **One search is run per target job title** in your preferences
- There is no built-in scheduling — you trigger scans manually from Claude Desktop or Codex
- Running a second scan on the same day is safe: duplicate detection prevents re-importing jobs you have already seen

To reduce rate-limit and terms risk, the agent pauses 1–2 seconds between page loads. Most scans complete in 3–5 minutes for a typical set of 2–3 target titles.

---

## Evaluating Imported Jobs

Imported browser-board jobs enter your pipeline in the same state as any other discovered job: status "Found", fit score 0, recommendation "Needs review".

They are immediately ready for the normal evaluation workflow:

1. Go to **Jobs** (`/jobs`)
2. Filter by Source to focus on the board you just imported
3. Select jobs to evaluate and click **Evaluate selected** (or evaluate individually from the job detail page)
4. The AI will score and recommend each role against your profile and resume lanes
5. Apply, skip, or archive as normal

There is no special handling required for browser-board jobs — they participate in all existing workflows: resume tailoring, gap response drafting, company research, outreach drafting, and application tracking.

---

## Troubleshooting

**Scan doesn't start / the agent says criteria are empty**

Go to Profile → Preferences in Job Search Terminal and make sure Target Roles is filled in. The agent reads directly from your saved profile.

**No notification appears after the scan**

- Confirm Job Search Terminal's dev server is running (`npm run dev`)
- Check that the scan file was written to `data/job-board-imports/` (you should see a `.json` file there briefly before it's archived)
- If the file was written but nothing happened, trigger a manual import: `curl -X POST http://localhost:3000/api/job-board/import`

**Jobs from the scan don't appear in the table**

- Refresh the Jobs page manually
- Check the **Source** filter — it may be set to hide the imported source
- Look in `data/job-board-imports/archive/` to confirm the file was processed

**The board shows a CAPTCHA or bot detection warning**

The agent will stop the scan immediately and tell you. Wait at least 10–15 minutes before trying again. If it happens repeatedly, reduce the scope of your next scan (fewer target titles, fewer pages).

**All imported jobs show as Duplicates**

This is expected if you ran a scan that covered the same roles as a previous scan. Duplicate detection uses original posting keys, URLs, and company/title/location matching. If the same jobs appear on multiple boards, they will be flagged on subsequent scans.

**The file watcher missed a file**

This can happen if the file was placed in the import directory before the server started, or if the `.tmp` rename took longer than 200ms. Use the manual import API to process it:
```bash
curl -X POST http://localhost:3000/api/job-board/import
```

---

## Important Notes

- **Terms of Service:** Automated browsing may be restricted by job-board terms. You are responsible for your own compliance.
- **No data leaves your machine:** Job descriptions and search criteria are processed locally by Job Search Terminal. The browsing agent may use its normal model/provider context while helping you.
- **The agent does not apply to jobs:** The scanner only reads and extracts job postings. It never clicks Apply or fills out any application form.
