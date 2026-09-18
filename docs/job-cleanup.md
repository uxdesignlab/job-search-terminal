# Untouched job cleanup and range selection

Jobs → **Verify active postings** checks non-archived Found jobs with no recorded
deliberate activity and at least 24 hours since local `created_at`. The saved date
is not `date_posted` or imported `first_seen_date`. Missing, invalid, and future
saved dates are protected. Nothing is archived by verification or by a schedule.

Candidates have one of two reasons: `closed` (job-specific closure/unavailability)
or `old_unverified` (uncertain and saved at least 30 days). Age never changes a
liveness verdict to expired. Active jobs never qualify by age. A fresh run replaces
old results; legacy evidence without a stored reason cannot authorize cleanup.

## Evidence and cancellation

The checker prefers saved employer links, tries saved alternatives, and lets a
matching active employer posting override a stale board. HTTP 200 and generic
apply text do not prove availability. Employer confirmation requires a matching
role/company plus an application invitation. Matched JobPosting expiry and
job-specific 404/410 or closure copy support unavailable verdicts. Login walls,
challenges, general-page redirects, request failures, and ambiguous pages remain
uncertain. No limited feed omission is used as evidence. Checks use safeFetch,
six concurrent jobs, and a 12-second timeout per URL. A verdict settled by status
code or URL alone releases the response body without reading it, so the socket is
freed for the next job rather than held until the stream is collected. The
session-gated host list is read once per process; edits apply on restart.

Requests are paced to one per host per second. A saved list is usually dominated
by a handful of boards, so without pacing six workers would hit one host as fast
as the network allowed. Workers still run concurrently across different hosts;
only same-host requests queue, which is what makes a large run take minutes
rather than seconds. The wait is taken before the 12-second timeout starts, so
queuing never counts against a check, and Stop interrupts a waiting request as
well as an in-flight one. `JST_LIVENESS_HOST_GAP_MS` overrides the gap in
milliseconds; `0` disables pacing and is what the test suite sets.
The checker does not log in, click Apply, use AI, or send profile/resume data.

`POST /api/jobs/liveness` retains JSON responses by default. With
`Accept: application/x-ndjson`, it emits `progress` and `result` events containing
`CleanupSummary`, or an `error` event. Summary includes checked/total/protected,
active/uncertain counts, and candidates. Candidate records
include identity, source, saved date, cleanup reason, evidence URL/text, and check
time. Stop aborts client and server fetches. Received completed results remain
reviewable; cancelled and unchecked jobs are never added to that preview.

`DELETE /api/jobs/liveness` accepts `{ ids: string[] }` and rechecks current saved
evidence, status, age, archive state and activity inside one SQLite write
transaction. It returns archivedIds, archived and skipped (IDs and reasons).
It never permanently deletes jobs. Failure rolls
back the batch. Protected jobs changed since preview are skipped. Evidence and
cleanup reason are retained; activity_log records the archive. Restoring is a
deliberate action and permanently protects the job. Found archived records remain
in duplicate detection so the same posting is not immediately reimported.

## Durable protection

Migration 0069 adds user_activity_at, liveness_reason, liveness_evidence_url and
cleanup_archive_reason. Application query helpers backfill protection once per
connection using saved work, current non-Found status, manual sources and
identifiable historical activity. Actions that historically left no record cannot
be reconstructed. Subsequent deliberate actions set the durable marker, including
edits, resolution, status changes, manual archive/restore, evaluations, application
work, documents, contacts and outreach. Starting evaluation/research/generation
also protects a job even if the operation fails or is cancelled. Viewing,
scanning, imports, selection and verification do not mark user activity.
Older private-page imports sometimes logged their automatic link lookup as a
manual resolution. The application repairs only activity markers from the first
cleanup migration when that resolution and import share an exact timestamp;
other saved user work remains protective. The marker itself is matched within a
short window after the migration's applied_at rather than at an exact value,
because the backfill runs on the first job read after the migration and both
timestamps have one-second resolution; an exact match repairs nothing whenever
that read lands a second later. Real user work cannot fall inside the window, and
the protection backfill restores anything with recorded evidence regardless. Automatic link lookups now have their
own activity label. A user-chosen posting link still protects the job.

## Review and selection

The preview starts unselected, shows 25 rows per page, and supports search,
reason filtering, sorting, per-page selection and explicit all-results selection
for each reason (including results hidden by search). Archive selected displays
an explicit count confirmation. Completed results and skip reasons remain visible;
Archived provides restoration. The maintenance out-of-scope delete shortcut was
removed; manual selected-job deletion stays separate.

Both the Jobs table and preview share range selection. Ordinary activation sets
an anchor. Shift-click or Shift+Space applies the target checkbox's new state to
the inclusive displayed range, preserving other selections. Shift activations
retain the anchor; missing anchors fall back to a single row. Sort, filter, page,
or row-order changes and select-all/clear reset it. Filtered rows and other pages
never join a range. Header checkboxes reflect displayed rows and expose partial
selection; selection is disabled during bulk operations.
