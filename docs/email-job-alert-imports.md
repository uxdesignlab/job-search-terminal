# Email Job Alert Imports

Job Search Terminal can import job-alert emails from a local drop folder. This is
for exported alerts from LinkedIn, job boards, newsletters, recruiter tools, and
other sources that send job leads by email.

## Drop Folder

Place email files in:

```txt
data/email-job-alert-imports/
```

Supported file types:

- `.eml`
- `.html`
- `.txt`

The app creates the folder automatically when the local server starts. The
watcher also sweeps files that were dropped while the app was stopped.

## Import Flow

Dropping an email file does **not** immediately add jobs to your job list.
Instead, it queues candidates for your review:

1. The watcher ignores `.tmp` files and waits for the file size to stabilize.
2. The email parser extracts likely company, title, location, salary, snippets,
   and candidate posting links.
   Alert headings and saved-search/search-result links are kept out of the job
   title list so a search label such as `"UX" jobs since yesterday` does not
   become a candidate.
3. Each candidate is analyzed against your saved **target roles** and
   **positive title filters**. Candidates are labeled:
   - **Matches criteria** — title matches a saved target role or positive keyword
   - **Off target** — no match found (still shown, just unchecked by default)
   - **No criteria set** — your profile has no target roles saved yet
4. Candidates are saved to a pending queue in the database. The original email
   file is archived under:

```txt
data/email-job-alert-imports/archive/YYYY-MM-DD/
```

5. An **approval modal** appears on the Jobs and Dashboard pages. You review
   each candidate, check or uncheck them, then choose:
   - **Add to jobs** — selected candidates are imported into your job list
   - **Dismiss selected** — selected candidates are discarded
   - **Dismiss all** — all pending candidates are discarded

Candidates that match your criteria are pre-checked. Off-target candidates
appear unchecked but remain visible for manual selection. Candidates you leave
unchecked stay in the pending queue until you add or dismiss them.

## Resolved Jobs And Leads

If the email contains a direct job posting URL, the candidate is shown with a
**Direct link** badge and will import with `posting_resolution_status = resolved`.

If the email mentions a job but does not include a direct posting URL, the
candidate shows a **No link found** badge. After you approve it, it is imported
as an email lead:

- `posting_resolution_status = needs_resolution`
- no normal posting link is shown
- liveness checks skip the job until it is resolved

Open the job detail page and use **Resolve posting** to search on demand or
paste a posting URL. Links found in the original email are shown before search
results so you can inspect the email trail first. Search is never run during
import.

## Privacy And Safety

The importer does not connect to an email account, does not send email data to
AI providers, and does not run web search automatically. It stores only minimal
evidence snippets and extracted links needed to explain where the lead came
from.
