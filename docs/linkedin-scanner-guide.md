# LinkedIn Scanner — User Guide

The LinkedIn scanner lets Claude Desktop browse LinkedIn on your behalf and automatically import matching job postings into Job Search Terminal. Instead of spending 30 minutes manually copying roles, you run a single prompt and the jobs appear in your pipeline within seconds.

---

## What You Need

Before running your first scan, confirm you have:

- **Claude Desktop** installed and open
- **Claude in Chrome** extension installed in your Chrome browser
- **LinkedIn** open in Chrome and logged in to your account
- **Job Search Terminal** running locally (or at minimum, the project folder accessible to Claude Desktop)
- **Target roles and location preferences** saved in Job Search Terminal (Profile → Preferences)

If your Job Search Terminal preferences are empty, Claude will not know what to search for. Fill them in first — see [Profile setup](#setting-up-your-search-criteria) below.

---

## Setting Up Your Search Criteria

LinkedIn search criteria are read directly from your Job Search Terminal profile. Claude never asks you to re-enter them.

1. Open Job Search Terminal and go to **Profile → Preferences**
2. Set your **target roles** — the job titles to search for (e.g., "Product Manager", "UX Designer")
3. Set your **preferred locations** — e.g., "Remote", "Nashville, TN"
4. Set your **remote preference** — Remote only, Local or remote, or All
5. Optionally configure **positive title filters** (titles must contain these words) and **negative title filters** (titles containing these words are skipped) in **Settings → Scan Sources**

Claude will use these exact settings when building the LinkedIn search.

---

## Running a Scan

1. Open **Claude Desktop**
2. Make sure the project folder is the current working directory (Claude should see the `CLAUDE.md` file at the root)
3. Type any of:
   - `Scan LinkedIn for jobs`
   - `Find new jobs on LinkedIn`
   - `Run a LinkedIn job search`
4. Claude will confirm your saved criteria and ask before starting
5. Claude opens LinkedIn in your Chrome browser and begins scanning
6. You'll see live status updates as Claude pages through results

**During the scan:**
- Claude searches LinkedIn for each of your target job titles
- Filters to jobs posted in the last 7 days
- Extracts company, job title, full description, URL, and location from each posting
- Skips jobs that match your negative title filters
- Scans up to 3 pages (approximately 50–75 postings)

**When the scan finishes:**
- Claude reports how many jobs were found and saves them locally
- Job Search Terminal detects the file and imports it automatically
- A green notification appears at the bottom of the Jobs page within 30 seconds

---

## Understanding the Jobs Table

After a scan, imported jobs appear in your Jobs table (`/jobs`) with two new indicators:

### LinkedIn Badge

A neutral-gray **LinkedIn** badge in the Source column identifies every job that came from a Claude Desktop scan. This lets you quickly tell LinkedIn-imported jobs apart from ATS-scanned jobs or manually added ones.

You can filter the table to show only LinkedIn jobs using the **Source** column filter (click the column header to open the filter dropdown, then select "LinkedIn").

### Duplicate Badge

An amber **Duplicate** badge appears on any job that was already in your pipeline when the scan ran. A job is flagged as a duplicate when:

- Its **URL** exactly matches a job already in the database (high confidence), or
- Its **company + title** matches an existing job (possible match — same role, different posting URL)

Duplicate jobs are **not dropped** — they are still imported so you can review them. The badge is a prompt to check whether you have already seen this role.

**To dismiss a duplicate flag:** Open the job detail page and update the job's status or notes to indicate you've reviewed it. There is no separate "dismiss" button — simply treating the job as part of your normal workflow (evaluate, skip, or archive it) is sufficient.

To show only duplicate-flagged jobs, use the **Source** column filter or look for jobs with the amber Duplicate badge.

---

## Import Notification

When Job Search Terminal detects and processes a new LinkedIn scan file, a notification appears at the bottom of the Jobs page:

```
LinkedIn scan imported 12 new jobs · 3 possible duplicates flagged.    [Dismiss]
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

**Option 1 — Restart the dev server.** The file watcher starts when the Next.js server starts. Any unprocessed `.json` files in `data/linkedin-imports/` will be picked up automatically.

**Option 2 — API trigger.** With the server running, call:
```bash
curl -X POST http://localhost:3000/api/linkedin/import
```
This finds the most recent unprocessed file in `data/linkedin-imports/` and imports it.

**Option 3 — Specify a file.** To import a specific archived file or a file you placed manually:
```bash
curl -X POST http://localhost:3000/api/linkedin/import \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/absolute/path/to/linkedin-jobs-2026-05-07T14-30-45Z.json"}'
```

---

## Where Files Are Stored

| Path | Contents |
|------|----------|
| `data/linkedin-imports/` | Pending `.json` files waiting to be imported (usually empty — files are processed immediately) |
| `data/linkedin-imports/archive/YYYY-MM-DD/` | Successfully imported files, organized by import date |

Files are only archived after a successful import. If an import fails, the source file remains in `data/linkedin-imports/` and you can retry manually.

---

## Scan Frequency and Limits

- Claude scans up to **3 pages of results** per search (approximately 50–75 job postings)
- Jobs are filtered to those **posted within the last 7 days**
- **One search is run per target job title** in your preferences
- There is no built-in scheduling — you trigger scans manually from Claude Desktop
- Running a second scan on the same day is safe: duplicate detection prevents re-importing jobs you have already seen

To avoid being rate-limited by LinkedIn, Claude pauses 1–2 seconds between page loads. Most scans complete in 3–5 minutes for a typical set of 2–3 target titles.

---

## Evaluating Imported Jobs

LinkedIn-imported jobs enter your pipeline in the same state as any other discovered job: status "Found", fit score 0, recommendation "Needs review".

They are immediately ready for the normal evaluation workflow:

1. Go to **Jobs** (`/jobs`)
2. Filter by Source → "LinkedIn" to focus on newly imported roles
3. Select jobs to evaluate and click **Evaluate selected** (or evaluate individually from the job detail page)
4. The AI will score and recommend each role against your profile and resume lanes
5. Apply, skip, or archive as normal

There is no special handling required for LinkedIn jobs — they participate in all existing workflows: resume tailoring, gap response drafting, company research, outreach drafting, and application tracking.

---

## Troubleshooting

**Scan doesn't start / Claude says criteria are empty**

Go to Profile → Preferences in Job Search Terminal and make sure Target Roles is filled in. Claude reads directly from your saved profile.

**No notification appears after the scan**

- Confirm Job Search Terminal's dev server is running (`npm run dev`)
- Check that the scan file was written to `data/linkedin-imports/` (you should see a `.json` file there briefly before it's archived)
- If the file was written but nothing happened, trigger a manual import: `curl -X POST http://localhost:3000/api/linkedin/import`

**Jobs from the scan don't appear in the table**

- Refresh the Jobs page manually
- Check the **Source** filter — it may be set to hide LinkedIn jobs
- Look in `data/linkedin-imports/archive/` to confirm the file was processed

**LinkedIn shows a CAPTCHA or bot detection warning**

Claude will stop the scan immediately and tell you. Wait at least 10–15 minutes before trying again. If it happens repeatedly, reduce the scope of your next scan (fewer target titles, fewer pages).

**All imported jobs show as Duplicates**

This is expected if you ran a scan that covered the same roles as a previous scan. Duplicate detection uses URL and company+title matching. If the same jobs appear on LinkedIn multiple times (common for popular roles at large companies), they will be flagged on subsequent scans.

**The file watcher missed a file**

This can happen if the file was placed in `data/linkedin-imports/` before the server started, or if the `.tmp` rename took longer than 200ms. Use the manual import API to process it:
```bash
curl -X POST http://localhost:3000/api/linkedin/import
```

---

## Important Notes

- **LinkedIn Terms of Service:** Automated browsing of LinkedIn may be against LinkedIn's Terms of Service. You are responsible for your own compliance. Claude Desktop acts as an extension of your browser session using your existing logged-in account.
- **No data leaves your machine:** Job descriptions and search criteria are processed entirely locally. Nothing is sent to any cloud service other than the AI API calls that Claude Desktop makes during normal operation.
- **Claude does not apply to jobs:** The scanner only reads and extracts job postings. It never clicks Apply or fills out any application form.
