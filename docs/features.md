# Features

This document describes every feature in the current application. Use it as a
reference for what the app does and how each section works.

---

## Navigation

The Shell header provides two navigation groups:

**Primary nav** (always visible): Dashboard · Jobs · Applications · Interview Prep · Analytics · Resumes

**Account dropdown** (hover on "Account"): Profile · Strategy · Settings

**Not in the nav:** the Evidence bank at `/evidence` is deliberately kept out of the
primary nav. It is reached from the "Top gap patterns" card on Analytics and from the
"Evidence gaps to finish" card on the Dashboard, and it renders with Analytics lit in
the nav plus a "← Back to Analytics" link so its place in the hierarchy stays clear.

**Help link** appears immediately after Account and opens the in-app help site at
`/help` in a **new browser tab** (`target="_blank"`) so the user doesn't lose their current context.

The Account menu shows a live AI provider health dot. The indicator reads the
provider priority chain from `providerOrderJson` and checks each provider for a
credential (API key for cloud providers; a non-empty base URL for Ollama):
- Green: the first enabled provider in the chain has a credential configured
- Yellow: a credential exists somewhere but the first-in-chain provider is missing one
- Red: no credential is configured for any provider in the chain

The app redirects `/` to `/dashboard` on load.
The app also serves `/favicon.ico` (redirected to the shared `logo.svg`) so
browser default favicon requests resolve without 404 noise.

---

## Help Site `/help`

The in-app help site is a self-service documentation surface for open-source
users. It is designed as a mini website inside the product, with a landing page,
search, workflow cards, a persistent documentation sidebar, screenshots, related
guides, and per-topic pages.

**Help home:**
- Hero with product screenshot and calls to start the guide or open the resume
  and ATS guide.
- Near-hero privacy note that stored data stays on the machine and AI actions
  use the configured provider: OpenAI, Anthropic, Google Gemini, or Ollama
  locally.
- Search across all help pages.
- Workflow groups for setup, profile, jobs, applying, tracking, interview prep,
  privacy, and troubleshooting.

**Guide pages:**
- `/help/getting-started` — setup, onboarding, and daily workflow.
- `/help/ai-providers` — how to configure OpenAI, Anthropic, Google Gemini, or
  Ollama (local); create and add API keys; set the provider priority chain;
  test providers; and protect keys.
- `/help/resume-lanes` — resume lanes, resume upload, ATS-friendly formatting,
  PDF guidance, and bullet quality.
- `/help/job-search` — dashboard scans, job sources, manual job entry, filters,
  and saved presets.
- `/help/linkedin-scanner` — Claude/Codex browser-board scanning for LinkedIn,
  Wellfound, Work at a Startup, Glassdoor, Indeed, and Monster; Dice MCP scanning
  (no browser required); imports, duplicates, limits, and safety notes.
- `/help/evaluate-tailor` — evaluation, tailored resume generation, PDF export,
  application answers, research, and outreach drafting.
- `/help/applications` — statuses, table and kanban tracking, follow-ups, and
  archive vs. delete behavior.
- `/help/interview-prep` — STAR stories and voice practice.
- `/help/privacy-data` — local data, AI-provider data flow, backups, and safety
  boundaries.
- `/help/troubleshooting` — common setup, AI, resume/PDF, scan, and LinkedIn
  fixes.

The help content is sourced from `src/lib/help/content.ts` and rendered through
the shared help components under `src/components/help/`.

---

## Dashboard `/dashboard`

The command center. Has two states depending on setup progress.

**First-run onboarding** (shown until dismissed): Opens as an isolated dashboard
modal so the user can finish setup without leaving the flow. The × close button
is always visible. Clicking it when setup is not fully complete shows a warning
with two options — "Back to setup" or "Dismiss setup" (exits immediately and
records dismissal). Once dismissed, the modal never re-appears regardless of
whether all steps are complete; `onboardingDismissed` is the authoritative gate.

The modal has 5 steps — 4 required and 1 optional:

1. **AI provider** — saves one OpenAI, Anthropic, or Google Gemini API key, or configures an Ollama base URL, inline.
2. **Resume lanes** — uses the normal multi-lane resume upload cards. Uploading a
   PDF seeds desired positions and positive title filters from extracted resume
   titles, and AI extraction can enrich the full profile. The "Add another lane"
   button only appears once all existing lanes have a file uploaded (to prevent
   accidentally adding duplicate empty lanes). If AI extraction fails (e.g.
   MAX_TOKENS on a long resume), the "Continue to job preferences →" button
   becomes enabled anyway with a note that extraction can be re-run from the
   Profile page; the user is never trapped.
3. **Job preferences** — requires desired positions, include title filters, and
   an explicitly saved location work mode. Resume upload or extraction may
   prefill role and title values; readiness follows saved data regardless of
   whether it came from the onboarding wizard, Profile, Settings, or resume
   extraction. A compatibility mode inferred from an older remote-preference
   value does not count as the user's work-mode selection.
4. **Integrations** *(optional)* — covers two free API keys that extend job
   coverage. Each card shows a short explanation, a "Help →" link to the
   relevant help section, and inline input fields with a "Leave blank to keep
   existing" placeholder when keys are already saved.
   - **Adzuna (job aggregator)** — App ID + API Key. Links to
     `/help/job-search#aggregator`. Enables Adzuna API scanning alongside ATS
     sources on every dashboard scan.
   - **Brave Search (source discovery)** — API Key. Links to
     `/help/ai-providers#discovery-aggregators`. Enables the "Search discover"
     button in Settings → Sources.
   The sidebar marks this step with a dashed "Optional" badge and a `·` in the
   step circle when not yet configured. Clicking "Skip for now" advances to
   Ready without saving. "Save and continue" saves any non-blank fields (blank
   fields keep existing keys) and also advances to Ready.
5. **Ready** — explains the next operational steps: review scan sources in
   Settings, run Scan for new jobs on the Dashboard, then review and evaluate
   imported matches.

The resume step is considered complete as soon as a PDF has been uploaded to any
lane (regardless of whether AI extraction succeeded). The dashboard derives
readiness from the actual saved setup data: a configured provider in the active
chain, an uploaded resume, desired positions, at least one included title filter,
and an explicitly saved location work mode. It does not depend on a wizard-only
confirmation flag, and inferred compatibility defaults do not satisfy readiness.
Unrelated profile edits and resume uploads preserve this distinction instead of
writing an inferred compatibility mode back as an explicit selection.
When setup is incomplete, the dashboard names each missing item and links to the
screen where it can be completed. When ready, the header shows **Profile ready**.
The Integrations step is never a gate — completing it only enables optional
features.

**Normal dashboard** (after full setup):

- **Top dashboard tiles** — metric cards appear before "Fresh matches" and
  "Apply next". "Priority matches", "Applications sent", "Follow-ups due", and
  "Interviews active" are pinned in a two-row half-width block, with "This
  week" occupying the other half.
- **Fresh matches** — only unprocessed jobs discovered by scheduled or manually
  triggered scans inside the selected freshness window. Applied, rejected,
  manually added, stale, archived, and duplicate jobs stay out. Each row badge
  shows `Posted <date>` when a publish date exists, otherwise `Fetched <date>`
  from the discovery timestamp. Rows use the same compact list treatment as
  "Apply next" for consistent scanning, and row text wraps (no ellipsis
  truncation) so full titles and location lines remain visible on narrower
  viewports.
- **Evidence gaps to finish** — appears above the action queue whenever there is
  outstanding gap work. Shows three counts (started but still needing detail;
  raised by 2+ roles and unanswered; answered and reused) and links to the Evidence
  bank. Hidden entirely when nothing is outstanding. Unfinished gap answers weaken
  every application at once, which is why they get a dashboard prompt rather than
  sitting inside a single job page.
- **Action queue** — "Apply next" shows high-score jobs not yet applied to and
  "In flight" shows active applications (interviewing, follow-up needed). Each
  card shows company, title, fit score, and recommended next action.
- **Stat cards** — supporting metrics for priority matches, applications sent,
  new jobs this week, generated PDFs, follow-ups, interviews, and skipped jobs.
- **Recent activity log** — a "Source not returning jobs" warning appears first
  when any scan lane is failing silently (see below), then the "Latest scan"
  summary (status badges and per-source errors with inline "Disable source"),
  followed by the timestamped list of user actions.
- **Zero-yield warning** — a lane can break without ever reporting an error. The
  `private-page-scan` lane returned `total_jobs_found = 0` on every run for a
  week while still reporting 31–61 "companies scanned" and a
  `completed_with_errors` status, so nothing surfaced and the outage went
  unnoticed. `detectZeroYieldLanes` (`src/lib/scanner/scan-yield.ts`) flags any
  lane whose most recent runs all reached at least `ZERO_YIELD_MIN_SOURCES` (10)
  sources yet retrieved zero postings, reporting the streak length and start.
  Only the leading streak counts, so a recovered lane clears itself.

  A run that retrieves postings but imports none is deliberately **not** flagged
  — that is the normal steady state for the careerops lane, where every match is
  already in the database, and flagging it would train the warning to be ignored.

  History comes from `getRecentScanYieldRuns()`, which windows runs *per scan
  type* rather than applying a flat limit, so a high-frequency lane cannot crowd
  a low-frequency one out of the sample. When a lane's whole sample is one
  streak, the warning reads "since at least <date>" rather than implying the
  sample boundary is the true start.
- **Scan for new jobs** button in page header (hidden for new users).

---

## Jobs `/jobs`

The full job pipeline. Lists every discovered job with filtering, preference
status, posting maintenance, and bulk tools.

**Features:**
- Fit score badge, status badge, freshness label, and role archetype per row.
- Sort by fit score, date, company, preference, or workflow status.
- Filter by workflow status, preference status, score range, location, company,
  recommendation, posted date availability, and added date availability.
- The last sort and filter settings are restored automatically on the next
  visit; named presets are still available for recurring review modes.
- **Preference column** — shows `Match` when a job still fits the current
  profile preferences and constraints, or `Out of scope` when saved preferences
  have changed and the job no longer fits. This is a derived display/filter
  value, not a separate stored job status.
- **Posted column** — shows a short `MM/DD/YY` when a real posted date is known;
  the cell is left empty when there is no date or the stored value is not a
  parseable calendar date (no em dash or placeholder text).
- Text search across company and title.
- Bulk operations: change status on multiple jobs, archive, or delete in bulk.
  Select jobs with the row checkboxes, then use the bulk action bar:
  - **Evaluate selected** — runs AI evaluation on all selected jobs in sequence.
    A per-row progress indicator shows `Pending`, `Evaluating`, `Done`, or `Error`.
  - **Retry failed (N)** — appears after a batch run if any jobs returned an
    evaluation error. Re-runs evaluation only on the jobs that failed, without
    re-evaluating already-successful ones.
- Marking a job **Skipped** (individually or in bulk) removes it from this list
  immediately — it is auto-archived and moves to the Archived page.
- Bulk delete asks for confirmation. If selected jobs have user activity, the
  confirmation warns before deleting.
- Maintenance tool to verify posting liveness, archive expired untouched jobs,
  and identify active jobs whose titles no longer match saved title filters.
  Automatic cleanup **archives** rather than deletes — a single unauthenticated
  liveness fetch is not strong enough evidence to destroy a row and its
  evaluations, and archived jobs are permanently protected from further automatic
  removal. Out-of-scope cleanup only bulk-deletes unprotected jobs; jobs with user
  activity or recent discovery must be removed through explicit selected-job
  actions. Clicking
  **Verify active postings** opens a blocking `ProgressModal` while the liveness
  check runs; on completion the modal shows a badge summary (checked / active /
  uncertain / expired counts) and prompts the user to close and take action on
  expired jobs in the section below.
- **Bulk evaluate** — selecting jobs and clicking **Evaluate N** opens a blocking
  `ProgressModal` that tracks per-job progress ("Job X of N") while the AI
  evaluation streams for each selected job. On completion the modal shows how
  many evaluated successfully and how many failed.
- Add job manually via modal (paste URL or fill in details). Jobs added this
  way are stored with `source = 'manual'` and display a **Manual** badge in
  the Source column.
- **Source column** — shows where a job came from, resolved in this order
  (`getJobSourceLabel` in `src/lib/job-table-helpers.ts`): the browser-board
  source name (LinkedIn, Wellfound, Indeed, …), then the ATS provider for
  `<provider>-api` sources (Greenhouse, Lever, Ashby — previously blank), then the
  originating site derived from `source_url`, and finally **Scanner** when there is
  no usable URL. Sites the public host list does not name render as their bare
  hostname; `config/source-labels.local.json` (gitignored, see
  `config/source-labels.example.json`) can give them friendly names without
  publishing that list. When the job has an HTTP(S) `source_url` the label is a
  link that opens the original search result in a new tab; otherwise it stays a
  plain badge. `javascript:` and other non-HTTP URLs are never linked. The label is
  resolved on the server and reused for display, sorting, and filtering, so all
  three always agree. **Scanner** remains a filter option even when no job
  currently uses it, so a saved filter from before per-site labels existed stays
  selectable — and it still matches every source without a browser-board name.
- **Email job alert imports** — drop `.eml`, `.html`, or `.txt` files into
  `data/email-job-alert-imports/`. The local watcher parses them and queues
  extracted candidates in the **Email approval modal** — jobs are never added
  automatically. Each candidate is pre-scored against your saved target roles
  and positive title filters (**Matches criteria** / **Off target** / **No
  criteria set**). Candidates matching your criteria are pre-checked; off-target
  ones appear unchecked. Choose **Add to jobs** or **Dismiss selected** per
  candidate, or **Dismiss all** to clear the queue. Unchecked candidates stay
  pending until you add or dismiss them. The modal appears on both the Dashboard
  and Jobs pages and polls every 8 seconds for new arrivals. Jobs without a
  direct posting URL are imported as email leads that can be resolved via
  **Resolve posting** on the job detail page.
- **Table width** — the Jobs table fits inside the Shell's `max-w-6xl` container
  rather than widening the page. Grid wrappers carry `min-w-0` (grid items
  otherwise default to `min-width: auto`, so one wide descendant stretches the
  track and drags every sibling out with it), and cells use `break-words` for long
  tokens. The table deliberately does **not** use `overflow-x-auto`: setting
  `overflow-x` makes `overflow-y` compute as a scroll container, which breaks the
  viewport-relative sticky header (`.data-table-sticky-head`). The same `min-w-0`
  treatment is applied to the Dashboard, whose scan-error list can contain
  250-character URLs with no spaces.
- **Column filters** — click any column header to open a sort + multi-value
  checkbox filter dropdown. Active filters show a count summary ("X of Y jobs")
  with a "Clear all filters" link.
- **Saved filter presets** — name and save up to 5 filter+sort combinations as
  reusable chips above the table. Presets are persisted to the database and
  survive page reloads. Click a chip to re-apply; click × to delete.
- **Review queue banner** — when low-confidence imports are present (jobs with a
  description under 100 characters), a yellow banner appears at the top of the
  Jobs page showing the count of jobs pending review. The banner auto-hides when
  the queue is empty. It is informational: the per-row Review column with
  **Approve** / **Dismiss** buttons was removed to keep the table inside the page
  width. `approveReviewAction` and `dismissReviewAction` remain in
  `src/app/jobs/actions.ts` but are not currently wired to any UI, so
  `review_status` is not clearable from the Jobs table.

---

## Job Detail `/jobs/[id]`

Tabbed view for a single job. Five tabs — Overview, Evaluation, Resume, Apply and
Outreach:

### Overview tab
- Company, title, location, remote type, ATS source, freshness.
- Fit score, recommendation badge, role archetype.
- Match rationale, main concern, salary notes.
- Requirement match table showing which JD requirements the profile covers.
- Gap list: requirements not yet addressed.
- Red flags list.
- **Recommended resume** — a sidebar box under *Next step* naming the resume to tailor
  from, whether that is your saved choice for the role or the evaluation's suggestion,
  with a link into the Resume tab. This used to be a full-width *Resume evidence*
  column in the match grid, which gave a one-line answer the same weight as two long
  lists; the grid is now two columns (requirement match, gaps and red flags). Any
  resume-evidence line the evaluation recorded still shows in the box, unless it just
  repeats the lane name.
- **Job description** — collapsed panel showing the saved description text.
- **Edit job details** — collapsed form to overwrite position, company, job posting
  URL, and job description without creating a duplicate record. Useful when LinkedIn
  or other scanner sources capture only partial metadata. All four fields are
  pre-filled with the current values. A reminder to re-run evaluation is shown
  after saving, since any description change makes the existing AI analysis stale.

### Evaluation tab

Evaluation answers one question — **should I spend more time on this position?** —
and does no work belonging to a later stage. It runs only when you click Evaluate;
discovering a job triggers no AI.

**Fast Evaluation (`fast-v2`), one AI generation:**
- **Fit score** out of 100, summed from four components the model scores separately:
  core requirements (0–40), role and seniority (0–25), relevant evidence (0–20),
  preferences and direction (0–15). The model never returns a total — JST calculates
  it, so the headline number and the breakdown beneath it cannot disagree.
- **Recommendation**, derived from ordered rules rather than by the model:
  `Blocked` → `Priority apply` (fit ≥ 85 and strong direction alignment) →
  `Strong apply` (fit ≥ 70, strong or partial) → `Review manually` (fit ≥ 55) → `Skip`.
- **Confidence** — High / Medium / Low, describing *source quality, not candidate
  quality*: how much usable job description and resume evidence the assessment had.
  Calculated locally with no AI call.
- **Direction alignment** — strong / partial / none. Whether the role matches the
  direction you are searching in, which is separate from whether you could do the job.
  A capable match in the wrong direction lands at `Review manually`, not `Strong apply`.
- Strengths, concerns, requirement tally (`8 supported · 2 partial · 1 unknown`),
  posted compensation, and recommended resume lane.
- **View details** discloses the component breakdown, direction rationale, requirement
  matches, evidence used, red flags, and the provider/model/duration for the run.

**Requirements in the posting.** A second column beside the evaluation box lists what
the posting actually asks for, as bullets. A score's first follow-up question is
"against what?", and the answer was previously a tab away in the collapsed job
description. Sources, in order (`src/lib/jobs/posting-requirements.ts`):

1. **The evaluation's own requirement list** (`modelOutput.requirementMatches`) — the
   requirements the fit score was computed from, each tagged `supported`, `partial` or
   `unknown`. Preferred because showing a different list beside the score would ask the
   user to reconcile two lists that were never the same list.
2. **Merged requirement strings** from a run stored before `modelOutput` existed
   (`Lead end-to-end briefs. — supported (…)`), split back into requirement and status.
   Used only when a majority of the lines actually carry a status word: the oldest
   evaluations wrote free-form "X aligns with Y" notes into that same field, and
   presenting those as the posting's requirements would put words in the posting's
   mouth.
3. **The saved description**, parsed for bullets — bullets inside a requirements-style
   heading when the posting has one (continuing through *Preferred qualifications*,
   stopping at *Benefits* / *Compensation* / *About us*), otherwise every bullet, since
   a flat list is common. Fragments under 12 characters, paragraphs over 300, and
   duplicates are dropped, capped at 24 items. Labelled as taken straight from the
   description and not yet checked against your resume.

An older evaluation whose notes are all there is falls back to those, labelled as
notes. With no description saved and nothing recorded, the panel says so and points at
Fetch description. No AI call is involved at any step.

**A failed run is reported, never scored by rules.** When the AI does not produce a
usable evaluation, the run fails with the reason and the job keeps whatever state it
had. It used to fall back to the keyword scorer and save that as the evaluation:
a Senior Director, User Experience posting came back 64% "Technical Specialist",
saved, badged and counted exactly like a real assessment. A wrong answer presented as
an answer costs more than no answer, and every one of these failures is something the
user can act on:

| What happened | What the message says |
|---|---|
| The model ran out of time | `ollama / qwen3.8:27b-mlx did not finish within 600s.` plus what to change |
| Unreadable output after 3 tries | `…returned a response that could not be read as JSON, after 3 attempts.` A larger model (14B+ locally) is more reliable at structured output |
| An answer missing its core fields | `…answered, but the answer was missing what an evaluation is made of (fitComponents, roleArchetype).` |
| Auth, quota, network | the provider's own message, per provider (see the chain report in Settings) |

Evaluations saved by the old behaviour still exist and still render; they say
`scored by local rules, no AI model` in the run line and carry a banner saying the
score and role archetype are a rough sort rather than an assessment. Re-evaluating
replaces one.

**Deadlines are per provider, and a chain spends them in turn.** A cloud call is
capped at 150s — the cap exists so a stalled paid call cannot run up a bill. A local
model gets **10 minutes**, because a local model's speed is a property of the machine
it runs on, not of the request: the same 12B model that answers in 70s on one Mac
needs several times that on older hardware, and a 27B model needs more again. Any
bound tight enough to feel responsive on fast hardware makes the app unusable on slow
hardware, where waiting is the trade the user already accepted by running locally. The
local bound exists only so a wedged request cannot hang forever; impatience is served
by **Cancel**, not by a short deadline.

Each provider in the chain is bounded on its own, so a local model that runs out of
time hands over to the cloud provider configured behind it — which is the entire
point of putting one there. The run's outer bound covers the sum, since a bound sized
to the first provider would end the run before the fallback could take its turn.

**One reader for model JSON.** Every provider is asked for raw JSON and told not to
use markdown fences; models wrap it in ```` ```json ```` anyway, because an instruction
is a request rather than a guarantee. Anthropic and Gemini each grew their own
unwrapping regex and Ollama grew none, so a local model whose answer was perfectly good
inside a fence was reported as *"Ollama returned invalid JSON"* — over one backtick,
after 80 seconds of work, followed by a paid call to fix a problem that did not exist.
`parseJsonResponse` in `src/lib/ai/json-response.ts` is now the single reader for all
three: it unwraps a fenced block (tagged or bare — Anthropic's own pattern required the
`json` tag and missed bare fences), falls back to the first embedded object or array,
and on failure raises an error naming the parse reason with a 300-character preview.
The words "invalid JSON" are load-bearing in that message: they are what marks the
failure retryable and worth failing over, rather than an auth or quota problem the user
has to act on. Ollama's path also separates the three things that used to share one
message — an answer cut off at the token limit, an empty answer, and output that is
genuinely not JSON — because they call for different responses.

**A local model gets a second try before the chain spends money.** Output quality is
non-deterministic: the same model that mangles one answer usually produces a clean one
next time. The economics are lopsided — a local retry costs time the user has already
committed, while moving on spends a paid call — so a local provider is retried once on
unusable JSON before the chain hands over. Cloud providers are not retried at this
level: `withRetry` already covers the whole chain, and retrying a paid call twice in a
row is how one rate limit becomes two. A local failure that is not about JSON (the
server is down, the request timed out) hands over immediately.

**The modal follows the chain.** Progress used to name the chain's first provider for
the whole run, because that is what a `FallbackProvider` answers until something
succeeds — so a run that fell through to the cloud after 20 seconds spent two minutes
telling the user a local model was working on it, then reported a different one at the
end. Each hand-over is now announced: the running line switches to the provider and
model actually working, and the one that stopped is listed above it, struck through,
with its reason (`ollama (gemma4:12b-mlx) — Ollama returned invalid JSON. Try a larger
model (14B+)…`). The same correction applies to failure messages, which read the
provider *after* the call rather than before, so a validation failure is attributed to
the model that produced it.

An auto setting is resolved before it is announced (`AIProvider.prepare()`):
`latest-sonnet` names a policy, not a model, and it only became a concrete id inside
the request — so the modal would have shown the sentinel while the user waited.
Resolving first costs nothing, since the lookup is cached per key and the request makes
it anyway.

**Cancel, and the model switch it offers.** The evaluation modal's Cancel now stops the
run rather than only hiding the dialog. Closing the EventSource is the only cancel
signal a browser can send on a stream it did not open with `fetch`; it arrives at the
route as the stream's `cancel` callback and aborts the run. What that stops is the
*waiting*, not the generation — a request already sent finishes wherever it is running
— so the guarantee is about the save: an answer that arrives after the user walked away
is discarded rather than landing on a job they have moved on from. The dialog says so
(`gemma4:12b-mlx may still be finishing on your machine — its answer is discarded`)
rather than claiming the model was stopped.

Cancelling a local run is usually a verdict on the model's speed, so the answer offered
is the other models that machine already has: a picker of installed Ollama models,
smallest first (on one machine, size is the closest proxy for speed there is), and
**Switch and evaluate again** — which saves the choice as the Ollama model and restarts
the run. `POST /api/ai/ollama-model` changes that one field, because the settings form
submits every field at once and someone cancelling a slow run should not have their keys
and provider order make the round trip. Embedding and reranking models are filtered out
of the list everywhere it is used: they answer `/v1/models` alongside chat models and
cannot serve a generation at all, so offering one is a choice that can only fail.

**`Blocked` is not `Skip`.** `Blocked` means a saved non-negotiable rules the role out
however well you score — a 92% fit that requires relocation you have ruled out. `Skip`
means nothing blocks it but the fit is too low to justify the effort. A hard blocker
requires explicit evidence on *both* sides: something the posting actually states and a
constraint you actually saved. Missing salary, an unknown reporting line, an absent
preferred qualification, or an inferred culture mismatch are never blockers.

**Unknown is not a mismatch.** Requirements the resume is silent on are counted as
`unknown`, never as gaps.

**Failure behavior:**
- Progress streams as ordered phases — preparing → evaluating → validating → saving —
  with the provider, model, and elapsed time. There is no percentage bar: the work is a
  single call, so a filling bar would be invented.
- **Core fields decide whether an evaluation exists at all:** role, direction alignment,
  and the four components. Everything else degrades to empty and records a completeness
  warning, so one malformed field no longer costs the whole evaluation.
- Malformed JSON is retried automatically (3 attempts). If it still cannot be read, the
  run fails and says so — it is not scored by rules instead. Auth, quota, and network
  errors surface immediately with an actionable message rather than being retried.
- **Every generation is bounded**, because not every provider bounds itself: 150s for a
  cloud call, 10 minutes for a local one, per provider and in turn (see *Deadlines are
  per provider* below). Cancel stops waiting at any point. An unbounded call would leave the fallback chain unreachable and the
  spinner running forever.
- Errors name the phase that failed rather than a block letter.

**What evaluation no longer does.** Evaluation performs no ATS keyword extraction, no
compensation research, no live web research, no company research, no contact lookup, and
generates no interview stories.

ATS keyword extraction, requirement extraction, evidence mapping and compensation now run
in **Application Preparation**, which is triggered by Generate Resume — see the Resume tab.

Interview-story work now lives in **Interview Prep**. Evaluation no longer proposes
stories; stories saved before that change keep their kind and stay filterable.

**Legacy evaluations remain readable.** Jobs evaluated before this change still render
their original A–G sections and can be re-evaluated. Re-evaluating preserves the old
detail, your gap answers, saved stories, generated documents, company research, and
outreach drafts — and no longer resets an `Applied` or `Interviewing` job back to
`Reviewed`.

**User correction** still overrides score and recommendation with a note, and now
includes `Blocked` in the vocabulary.

**AI evaluation data sources (all fed into the analysis):**
- Full job description (up to 6,000 characters — captures required qualifications
  that appear deep in the posting).
- Candidate profile: goal, urgency, direction, compensation needs, work preferences,
  target roles, deal breakers, constraints.
- Skill inventory (up to 30 skills with strength level and evidence source).
- Role strategy (role-fit scores and rationale from the profile).
- Active resume excerpts (up to 2 resumes × 1,800 chars each) — so strengths and proof
  points are grounded in actual resume text, not inferred from skill abstractions.

### Resume tab
- Generate tailored resume for this job: picks best base resume, produces
  HTML and PDF output with tailoring summary and keyword coverage %.
- **Per-section Keep / Update / Hide modes.** Summary, key achievements, and
  experience default to Update; every other section defaults to Keep. Only
  sections set to Update are sent to the AI and written back. Modes are addressed
  by section id, and each section type also resolves by its type name, so a lane
  built from the blank starter (ids like `s-summary`) tailors the same as one
  extracted from a PDF (ids like `summary`) — previously those lanes silently
  fell through to Keep and were never tailored at all.
- Resume draft editor: edit the tailored resume before export.
- Keyword coverage progress bar.
- Download PDF button.

**Tailored resume AI context:**
- Source resume full text (up to 5,000 chars) — the AI must verify every keyword
  and strength against this text before using it.
- All validated keyword signals with their priority, category, source, and rationale.
- **Missing keywords** — keywords absent from the pre-AI source draft are identified
  before the AI call and passed as a separate priority list so the AI knows exactly
  which terms to weave in where the source resume provides supporting evidence.
- **Protected keywords** — the job phrases the source draft already matches
  exactly, listed as terms the rewrite must not paraphrase away. The mirror image
  of the missing-keyword list, and enforced after the call by the keyword
  preservation pass.
- **Job-specific gaps and red flags** — the evaluation's `gaps` (up to 5) and
  `redFlags` (up to 3) are included so the AI tailors content to address the
  specific shortfalls identified for this position, not just generic keyword coverage.
- Evaluation strengths (top 4) as suggested emphasis signals.
- Gap responses — user-supplied notes addressing identified experience gaps.
  Gaps and red flags are addressed via a structured modal (see below).
- Profile supplements — any extra context the user has added.
- Gap answer quality checks — vague gap responses and supplements are saved as
  drafts with a follow-up question, and only confirmed answers are used during
  resume tailoring.

**Gap addressing modal** (on the job Overview tab, "Gaps and red flags" card):
- Clicking **Address** (or **Edit**) opens a modal instead of an inline form.
- **Company checkboxes** — loaded from the user's resume experience entries via
  `/api/resume-companies`; selecting companies pre-structures the response as
  "At Company A, Company B: [description]".
- **What did you do?** — editable textarea, prefilled by parsing the gap text
  into a first-person statement (strips "The posting requires…" boilerplate,
  extracts the core activity). When the gap matches **no** known preamble it is the
  evaluator's own complaint rather than a claim the candidate can make
  ("The available resume evidence does not explicitly document…"), and the box is left
  **empty**. Prefilling those verbatim wrote the complaint into the answer, saved it as
  the candidate's evidence, and left the assessor reading the gap back to itself.
- **Key metrics or outcomes** — optional single-line field; appended as
  "Key results: …" in the saved response.
- **Polish with AI** — sends the structured response for AI polishing and quality
  assessment in one step; closes the modal when `qualityStatus === "addressed"`.
- **Save** — saves raw without polish; also closes on "addressed".
- If the AI returns `needs_followup`, the modal transitions to a follow-up step
  showing the AI question and the saved response, with a textarea for more detail.
- Escape key closes the modal.
- Modal slides up from the bottom on mobile, centers on desktop.

**Answers are global, not per-job.** Every saved gap answer — including ones the
assessor marks `needs_followup` — is promoted to the Evidence bank keyed on the gap
text, so unfinished work is never stranded on the requisition that surfaced it.
Consequently:
- A gap this job raised that was already answered elsewhere is **auto-filled**, badged
  `↻ From your evidence bank`. Answering it again is never required.
- A job-specific answer overrides the bank for that job only. The one exception is an
  unfinished job-level draft (`needs_followup`): a completed bank answer replaces it,
  otherwise finishing a gap in the Evidence bank would leave the job page showing the
  stale draft it was meant to replace.
- **Clear** removes both the job-level answer and the bank record, since the bank is the
  single global copy — leaving it would let the answer auto-fill straight back in.
- Job description excerpt (up to 10,000 chars) — allows the AI to verify keyword
  context and understand requirement weight, not just the extracted keyword list.
- Skills preference flags — skills the user wants to emphasize or de-emphasize
  (derived from `use_more` / `use_less` preference on each skill record).

**Keyword placement strategy (added to tailoring prompt):**
- Evidence-supported, high-priority language is considered first. Exact wording is
  preserved when natural and accurate because recruiters can use literal or Boolean
  searches, but no phrase is forced merely to raise a percentage.
- Tool/methodology keywords belong in Skills or within the experience bullet where
  that tool was actually used.
- Unsupported requirements remain gaps and are never inserted into Skills.
- The target title is never copied into held job titles. It appears in positioning copy
  only when the source resume supports that professional identity.
- Repetition and keyword dumping are explicitly prohibited.

**Three-tier keyword coverage (resume draft editor):**
The keyword panel in the draft editor classifies each keyword into one of three tiers:

| Tier | Display | Meaning |
|------|---------|---------|
| **Exact phrase** | ✓ green chip | Full verbatim phrase is present in the resume |
| **Related wording** | ~ amber chip | Significant terms are present, but not as the same phrase |
| **Missing** | + or ! chip | Not found; either add to Skills (if evidence confirmed) or confirm evidence first |

- The header shows **job keyword alignment**, not an employer ATS score. Critical,
  required, and preferred signals receive weights of 5, 3, and 1; related wording
  receives half credit.
- The UI shows Must/Core/Pref labels and explains that different ATS products and
  employer configurations search, parse, and match resumes differently.
- Clicking any chip highlights the keyword in the preview panel (exact phrase = bright
  yellow outline; term occurrences = faint yellow).
- `supportedKeywords` detection uses the same phrase-aware matching algorithm as
  coverage (previously used raw `string.includes()` which gave false positives).

**Job-keyword alignment metric:**
- For each evaluation keyword, first tries an exact phrase match in the resume text; if that
  fails, splits the keyword into significant words (stripping stop words and single-character
  tokens), then checks whether the meaningful terms appear within a 30-word context window
  instead of anywhere in the document. This related-term
  fallback handles multi-word phrases like "agile methodologies" or "Healthcare SaaS" that
  the LLM evaluator commonly produces. Specific acronyms (HIPAA, HL7, FHIR) still require an
  exact match and correctly flag as gaps when missing.
- Displayed as a percentage on the edit-draft page subtitle and is recomputed live from the
  current evaluation keywords each time the page loads (not cached from generation time).
- Color-coded bands remain green ≥ 70%, orange 40–69%, and red < 40% for quick
  comparison, without presenting 70% as a universal ATS cutoff.

**Tabs.** `Overview | Evaluation | Resume | Apply | Outreach`. `Analysis` was renamed to
`Evaluation`; old `?tab=analysis` links still resolve there, so bookmarks and notes keep
working. Outreach currently opens the existing generic-draft page and becomes a contact
workspace in a later phase.

**Evaluation run line.** To the right of the tabs, a single muted line records the run
behind everything on screen: `Evaluated gemini / gemini-3.5-flash · 41.2s · first assessed
Aug 19, 2:18 PM` — the provider and model that ran it, how long it took, and when the job
was first assessed. A row saved by the old rule-based fallback reads `Evaluated scored by
local rules, no AI model · 152.9s · first assessed Aug 19, 2:18 PM`, because `local-fallback / local-fallback` is a stored value, not a
sentence, and the one thing such a row has to say is that no model produced it. It is
read from the stored evaluation (`created_at`, `provider_used`, `model_used`,
`generation_ms`), so it describes the evaluation you are looking at rather than the last
run in the session.

**The two halves describe different runs, which is why each is labelled.** `created_at` is
deliberately preserved across re-evaluations so a job keeps the date it was first
assessed, while provider, model and duration are replaced every time. The line originally
read `Evaluated <date> · <model> · <duration>`, which put a stale date beside fresh
provenance and claimed today's model ran on the day of the first assessment. Either half
is dropped, separator and all, when it is unknown. When an auto option resolved a sentinel, the concrete id it resolved
to is what gets recorded and shown — `latest-sonnet` names a policy, not a model, and
saying it here would answer the wrong question. Nothing is shown for a job that has not
been evaluated. It sits beside
the tabs rather than inside the Evaluation tab because run cost is worth seeing from any
tab — a three-minute run is only noticeable if it is always in view. The full ISO
timestamp is available as the line's tooltip.

**Next best action.** Each job shows one primary action derived from its records — no new
status column, so it cannot disagree with what actually exists:

| State | Primary action |
|---|---|
| Not evaluated | Evaluate |
| Evaluated, `Skip` or `Blocked` | Review evaluation (no nudge to proceed) |
| Evaluated, no resume | Generate resume |
| Resume ready, not applied | Apply |
| Applied, nobody contacted | Find people |
| Interviewing or Offer | Prepare interview |

Outreach is promoted to the primary action only after you have applied with nobody
contacted. Outreach may happen before or after applying, but it never displaces the step
you are actually on. A `Blocked` or `Skip` role gets no encouragement to proceed — the tabs
remain available, but the app stops suggesting.

The primary action is **not rendered as a button or a sentence** on the job page. Every
action it can name is already one click away in the header (**Evaluate with AI**, **Check
live**, **Job posting**) or is a tab, so a CTA there was the same click twice. It is used
only to decide which breadcrumb step is marked as next.

**Opportunity progress.** A single breadcrumb line above the tabs, showing the five moves a
job goes through in the order they happen:

`✓ Evaluate › Resume › Apply › Outreach › Interview prep`

Every step is a link to where that step happens — Evaluate → Evaluation tab, Resume →
Resume tab, Apply → Apply tab, Outreach → Outreach tab, Interview prep →
`/interview-prep` — so the breadcrumb is the navigation, not a decorative status strip.
State is shown three ways, never by colour alone: a completed step is green and carries a
`✓`, the next step is bold in the accent colour and marked `aria-current="step"`, and later
steps stay muted. Which step counts as "next" comes from the next-best-action rules above,
matched on a shared step id rather than on label text, so rewording either one cannot
desynchronise them. A `Skip` or `Blocked` role therefore highlights nothing, matching the
rule that the app stops suggesting.

Application preparation is deliberately *not* a step. It happens inside resume generation,
so listing it named an internal stage the user never separately performs — it is folded
into **Resume**.

**Application Preparation.** Generating a resume first prepares the application — one
structured AI call producing:

- **Detailed requirements** from the posting, each marked supported, partial, or unknown
  against your evidence. Silence in your resume is `unknown`, never a mismatch.
- **ATS keyword signals** — 12–18 high-signal phrases, validated against the posting so an
  invented title variant or a phrase that never appears cannot survive.
- **An evidence map** — which of your evidence supports each requirement and where it
  belongs on the resume. A mapping citing evidence that does not exist is discarded rather
  than passed through, because it would otherwise become a false claim on a document you
  send to an employer.
- **Compensation context** — the posted range when the posting states one; otherwise at
  most one live search (Brave, or your provider's web search). When neither is available it
  says so and falls back to your saved target rather than inventing a range.

  Claude's server-side search tool comes in two variants, and the wrong one is rejected,
  so `AnthropicProvider.webSearch` picks it from the model that actually resolved:
  `web_search_20260209` (dynamic filtering) for Opus and Sonnet 4.6 and later, and the
  basic `web_search_20250305` for everything else — including Haiku 4.5, which outranks
  Sonnet 4.5 numerically but is not in the supported set, so the rule is per family
  rather than one global cutoff. An id the app cannot parse gets the basic tool, which
  every model accepts. Selecting it per model matters now that a Latest option can
  change which model runs without anyone editing the setting
  (`webSearchToolType` in `src/lib/ai/anthropic-models.ts`). Gemini uses its own
  `googleSearch` tool, which has no such split.

**Output budget.** Every provider defaults to 4096 output tokens, which is smaller than
these shapes need — a preparation answer alone carries 12–18 keyword signals with
rationale, a requirements list and an evidence map. Over the limit the answer stops
mid-object and arrives as `Unexpected end of JSON input`, which is indistinguishable
from the outside from a model that cannot follow a schema. Both Fast Evaluation and
Application Preparation now ask for `STRUCTURED_OUTPUT_MAX_TOKENS` (8192) explicitly at
the call site, so the budget holds whichever provider serves the request. Before this,
preparation failed on every attempt, which meant **no job ever had ATS keywords**: the
resume builder's keyword panel was empty and its header read `0% job keyword alignment`
on every draft.

**Preparation failure is visible in the draft.** Resume generation degrades rather than
aborting when preparation fails — a resume without keyword targeting beats no resume —
and the reason is recorded on the document. It used to be shown only when *tailoring*
also degraded to source-only, so a draft that tailored fine but had no keywords said
nothing at all. The draft editor now names the state in both places: the header reads
`job keywords not generated` rather than `0% job keyword alignment` (0% reports a
measurement that never ran, and reads as "this resume matches nothing"), and a banner
carries the recorded reason with what to do about it.

**Reuse and staleness.** A preparation is reused while both its job-description hash and
its evidence hash still match, so editing a draft does not pay for it again. The evidence
hash spans your whole evidence bank — answering a gap on `/evidence` for one role marks
every affected preparation stale, including jobs you answered it from somewhere else.

**Evaluation is required, and never silent.** Resume and Apply used to run an evaluation
themselves when one was missing — an expensive AI call with no user action behind it. They
now stop and ask you to evaluate first.

### Apply tab
- Prepare application answers: paste common or custom application questions,
  generate AI answers for copy-paste. App never auto-submits anything.
  - Pressing **Prepare answers** opens a blocking `ProgressModal` ("Drafting
    answers grounded in your resume and evaluation…" + spinner) while the
    request is in flight. On success the modal transitions to a done state
    ("Answers prepared — scroll down to review them.") with a Close button. On
    error it transitions to an error state with the failure message and a Close
    button (questions are preserved).
  - After answers return, the question inputs reset to a single empty row and
    the drafts list refreshes in place — no page reload is required to submit
    another batch of questions.
  - **Gap responses flow into answer generation**: all gap and red flag
    responses with `qualityStatus === "addressed"` are loaded and injected into
    the AI system prompt as verified evidence. The AI uses polished responses
    (or raw if no polish) to strengthen "why fit" and custom answers. The
    template fallback (no AI key) surfaces the most relevant addressed gap in
    the "why fit" answer and lists all gaps as supporting evidence for custom
    questions.
- Application status selector: move the job through the 11-status funnel.
- Follow-up date picker.
- Contact field.

**Sub-pages from Job Detail:**

### Research `/jobs/[id]/research`
AI-generated company intelligence:
- AI strategy and product direction
- Recent company movements (hiring, layoffs, expansions)
- Engineering / design culture
- Technical and organizational challenges
- Candidate positioning angle

Clicking **Start research** (or **Re-research**) opens a blocking progress modal
("Researching company" + spinner) that streams a live status line as each of the
six axes completes. On completion the modal shows "Research complete — scroll
down to read all six sections." The modal cannot be dismissed while the request
is in flight; the page-level **Cancel** button stops the stream and closes the
modal, and an X button and Close button appear only in the done state.

### Outreach tab
Generate a recruiter or hiring manager outreach message tailored to the job and
user profile. Shows character count. User copies the message manually.

Clicking **Generate messages** (or **Regenerate**) opens a blocking progress
modal ("Generating outreach messages" + spinner). On success the modal shows "3
messages ready — scroll down to copy and send them." The modal cannot be
dismissed while the request is in flight.

---

### Outreach `/jobs/[id]/outreach`

Part of the job workspace, not a separate screen — the job header, status control and
progress breadcrumb stay visible while you work. The old
`/jobs/[id]/outreach` URL redirects to `?tab=outreach`, so existing links keep working.

Real people rather than abstract personas. Contacts are **global**, so the same person can
be linked to several opportunities, while their role, relevance and outreach status stay
**per job** — someone marked *Contacted* for one role remains *Found* for another.

**Finding people with Clay.** When Clay is connected, **Find relevant people** searches for
up to five people at the hiring company. It runs only when you click it — never on
discovery, evaluation or page load — because each result spends your Clay allowance.

Only the company identifier, role keywords and seniority are sent. Your resume, private
notes, Story Bank and gap answers never leave Job Search Terminal.

Results are normalised, ranked by JST's own rules, and saved as ordinary contacts you can
edit, delete or forget. Anyone you previously chose to forget is filtered out before being
saved, so a later search cannot resurrect them.

**The company must be identified first.** A saved company domain is used if there is one;
otherwise it is derived from the job URL — but only when that URL is the employer's own
site. Links to Greenhouse, Lever, Ashby, Workday, LinkedIn, Indeed and similar are refused,
because deriving a domain from them would search a real company that is not the employer.
When nothing reliable is available, you are asked to add the domain rather than being given
confident results from the wrong organisation.

**When Clay has a problem**, each case says something different and useful: key rejected,
allowance used up, rate limited, company ambiguous, or unreachable. A Clay failure never
affects evaluation, resumes or applications.

**Finding a work email.** Search never returns emails, and enrichment is a separate,
per-contact action — **Find email** appears on a contact once you have decided they matter.
It is never applied across a search result set, so five results cannot quietly become five
enrichment charges.

> **Why not Clay's MCP integration?** It would avoid the routine, but Clay charges the same
> credits over MCP as over the API — there is no saving — and it requires OAuth with hourly
> token refresh. The routine is less machinery for the same cost.

> **Step-by-step setup:** see [docs/clay-enrichment-routine.md](clay-enrichment-routine.md),
> including `npm run clay:routine` to validate a routine id before saving it.

> **This needs setup, and the reason is Clay's.** Clay has no direct "find this person's
> email" endpoint. The only path is executing a *routine* you build in your own Clay
> workspace. Job Search Terminal does not create Clay routines or tables, so you build one
> that takes a LinkedIn URL and returns a work email, then paste its routine id in
> Settings → Integrations. Leave it blank to skip enrichment entirely — everything else
> works without it, and the button explains what is missing rather than failing.

**Automatic lookup.** Once a routine is configured, you can turn on *Look up emails
automatically for search results* in Settings → Integrations. Every person a search returns
is then enriched in a **single routine run**, rather than you clicking each one.

It is off by default because it costs real credits: batching saves round trips and latency,
but Clay charges per person enriched either way. Clay's managed enrichment function is
**12.8 credits per person**, so a five-result search costs 64 credits to enrich
automatically versus 12.8 for the one person you actually contact.

Whether that matters depends entirely on your plan — check **Usage → Workspace balances**
in Clay. A trial allowance comfortably absorbs it; a smaller one will not.

If automatic lookup fails, the search still succeeds: the people are already saved and
usable without an email.

Enriched addresses are labelled **unverified**, because that is what they are — the routine
found an address, nothing confirmed it deliverable.

**Adding a contact.** Name, title, company (blank uses the hiring company), relationship,
LinkedIn URL, work email and notes. Every contact is scored by the same deterministic rules
a provider result will be, so a manually added person is not a second-class record.

**Relevance is explained, not just scored.** The score comes from function overlap with the
role, hiring authority, seniority, whether they work at the hiring company, and whether you
can actually reach them — each contributing a stated reason. It is shown as a band —
**Recommended**, **Optional**, **Low value** — rather than another number to interpret. No
AI call is involved.

**Statuses:** Found, Shortlisted, Drafted, Contacted, Responded, Not Relevant.

**Drafting a message.** Each contact has its own draft area. Pick a channel — LinkedIn
connection note, LinkedIn message, or email — and the message is written *to that person*
about *this role*, using the job, its evaluation, your Application Preparation when it
exists, the contact's relationship to the role, and your saved writing style.

**Length follows the channel**, not one universal cap. A connection note aims for ~280
characters and warns past 300; an email aims for ~1,200 and has a subject line. The count
is always shown, and nothing is ever silently truncated — a message cut mid-sentence is
worse than a long one.

**What the drafts will not do.** No generic praise, no fake familiarity, no claims about
the company that are not in the context, no assertion that this person owns the role unless
that is known, and no invented experience, metrics or mutual connections. Drafts are
editable in place before you use them.

**There is no Send button.** Job Search Terminal drafts, tracks, and stops there. Copy the
message into LinkedIn or your email client and send it yourself.

**Three ways to remove someone**, meaning three different things:

- **Remove from this job** — drops them from this opportunity; they stay in your contacts.
- **Delete contact** — deletes them and their outreach history everywhere. A later search
  may legitimately find them again.
- **Forget this person** — deletes them *and* remembers a one-way fingerprint so a later
  search recognises and discards them. JST keeps no readable trace: not the name, not the
  email, not the profile URL. Adding them again is refused with an explanation until you
  clear the forgotten list in Settings → Integrations, which restores nothing.

Contact details are stored locally and included in account backups — the unencrypted-backup
warning names them explicitly.

## Applications `/applications`

Application funnel tracker with two view modes:

- **Table view** — sortable list of all active applications with status, company,
  role, applied date, score, follow-up date, and overdue indicator.
- **Kanban view** — drag-and-drop board organized by status column.

**Features:**
- Follow-up overdue alerts (highlighted when past the follow-up date).
- Status transition buttons inline in each row.
- Filter by status, overdue, or company.
- Column filters and saved filter presets (same system as the Jobs table).
- Summary funnel metrics at the top: applied, in progress, responded, interviewing.

---

## Archived `/archived`

Jobs that have been manually archived or skipped.

- Table of archived jobs with original score and archival date.
- Column filters and saved filter presets on the archived jobs table.
- Restore action: move a job back to active.
- Delete action: permanently remove the job and all associated records.

**Auto-archive on skip:** marking a job as **Skipped** automatically moves it to
the archive. The job leaves the active pipeline immediately — it will no longer
appear on the Jobs page or the Dashboard action queue. It remains visible on the
Archived page and can be restored at any time.

---

## Resumes `/resumes`

Resume studio showing all resume lanes and generated documents.

**Two sections:**

**Base resumes** — the source PDF lanes uploaded by the user, or resumes built
from scratch inside the app. Each lane represents a different career angle
(e.g., "Leadership", "IC / Individual Contributor", "Domain Specialist"). The
app ships with five default lane names that can be renamed; new lanes can be
added at any time.

Each lane shows extraction status, word count, and resume-builder approval
state. Existing uploaded resumes are backfilled from stored extracted text, so
current users do not need to upload them again.

The `/resumes` page uses the same dashboard table pattern as the Jobs page on
desktop, with compact cards on smaller screens. The table shows lane name,
builder status badge, source word count, extraction date, and an action button.
Each lane has a direct **Review and approve** or **Edit approved version** action
that opens the builder.

**Create new resume** button appears in the page header on `/resumes` and in the
Resumes tab of `/profile`. Clicking it creates a new blank lane with starter
sections (Contact, Summary, Experience, Skills, Education) pre-populated and
immediately opens the Resume Builder.

### Resume Builder `/profile/resumes/[id]/builder`
Structured source editor for each resume lane — works for both PDF-extracted and
from-scratch resumes:
- Parses the uploaded resume into editable sections, or starts from blank
  starter sections when the lane was created from scratch.
- Preserves custom sections such as Recognition when detected.
- Supports editing, adding, removing, renaming, and reordering sections.
- **Add section menu** — dropdown picker with section types: Summary, Key
  Achievements, Experience, Skills, Awards & Recognition, Education, Custom.
- **Add role / Add entry** buttons inside Experience and Education sections to
  append additional entries without leaving the section.
- **✨ Improve with AI** — available on Summary, Key Achievements, Skills,
  Awards & Recognition, Experience bullets, and Custom sections. Sends the
  section content to the active AI provider, which returns an improved version.
  The suggestion is shown inline with **Accept** and **Discard** buttons; the
  original is preserved until the user accepts.
- Helpful placeholder text in every input guides users building from scratch.
- Uses the same split editor/preview layout as the generated resume editor, so
  source edits can be checked against the rendered resume while reviewing.
- Saves a draft or approves the lane version used by job-specific generation.
- **Remove button** in the builder header — deletes the resume lane from the
  system after inline confirmation ("Delete this resume? / Yes, delete / Cancel").
  Available for all resumes, not just new ones.
- **Back button** — navigates to `/resumes`. For newly created (unsaved) resumes,
  clicking Back shows a leave confirmation dialog with four choices:
  - **Save draft and leave** — saves the current state as a draft, then navigates away.
  - **Delete and leave** — permanently deletes the resume lane.
  - **Leave without saving** — navigates away without saving (lane is kept but blank).
  - **Keep editing** — dismisses the dialog and stays on the page.
  The browser's native `beforeunload` prompt also fires if the user tries to close
  the tab or navigate directly while a new resume has not yet been saved.

The HTML resume template renders experience entries with the organization and
location left-aligned and the date range right-aligned on the same line, matching
standard resume layout conventions.

**Generated documents** — tailored resumes produced for specific jobs:
- Table showing job, lane used, keyword coverage %, generation date, and status.
- Generated documents keep a stable link to their source resume lane, so PDF
  export continues to work after the lane is renamed.
- Column filters and saved filter presets on the generated documents table.
- Links to preview HTML and download PDF.
- Delete document action.

### Resume Editor `/generated-documents/[id]/edit`
Full draft editor for a tailored resume before exporting to PDF. Matches the
approved-resume builder experience with identical section controls on every section:
- **Section title** — editable input that updates the heading printed in the PDF.
- **✨ Improve** — AI rewrites the section content; user can accept or discard the
  suggestion. Not shown on the Experience section (improvement is per-entry).
- **↑ Move up / ↓ Move down** — reorders sections; order is reflected in the preview
  and the generated PDF.
- **Remove** — hides a section from the PDF (data is not deleted).
- Experience entries each have a **✨ Improve bullets** button with the same
  accept/discard flow as the resume builder.
- Header (name, headline, contact) is always pinned at the top and is not
  moveable or removable.
- Education is always shown last and is display-only (pulled from the base resume).
- **Keyword coverage panel** — collapsible panel between the help text and the first
  section showing all job keywords as chips. Green ✓ chips = exact phrase or strong
  term-overlap coverage in the current resume text; `+` chips = supported by existing
  evidence and ready to add; `!` chips = missing evidence. Clicking a `+` chip adds the
  keyword to Skills. Clicking a `!` chip opens a guided wizard: select the companies
  and roles where the skill was used, optionally add context, then review distinct
  resume-writer suggestions grounded in each role's existing bullets. Each suggestion
  rewrites the strongest relevant bullet instead of appending a generic line. The user
  can edit or remove any change before approval. Company confirmation is required;
  writing is optional. When AI is unavailable or returns an unsafe suggestion, the app
  uses a claim-preserving fallback rewrite. Updates instantly as the user types (no
  debounce — pure JS computation).
  Starts expanded when coverage is below 70%. Collapses to just the `covered/total`
  counter when the user has seen enough. The page header uses the same live matcher.
- **Job-aware AI improvement** — ✨ Improve (and ✨ Improve bullets for experience)
  include the job keywords in the API call. The AI naturally incorporates missing
  keywords into suggestions without forcing them.
- **Evidence guard** — AI-proposed headline, summary, impact, skill,
  recognition, experience, and extra-section claims are checked against **every
  active resume lane** plus confirmed gap answers and supplements. Unsupported
  AI changes revert to source wording. If manual edits introduce unsupported
  quantified claims, PDF export opens a review dialog listing every claim, its
  location, and the affected line. The user can return to the editor to fix the
  claims or explicitly choose **Export anyway** to preserve the draft as written.
  The saved document audit records the flagged claims, the explicit export
  override, and every section that was reverted.

  What counts as an unsupported claim:

  - **Quantified claims.** In the summary and headline the figure must appear
    somewhere in the evidence corpus — those sections condense the whole resume,
    so a number there belongs to no single line. An open-ended `N+` figure is
    also accepted when the evidence states an equal or larger `M+`, because
    claiming less than the evidence supports is not a fabrication. Everywhere
    else the figure must appear in a *related* evidence line, which is what stops
    a metric being moved between roles.
  - **Named entities.** Tools, standards, employers, and products — detected by
    capitalization rather than by a list, so "React", "Svelte", "Kubernetes", and
    "HIPAA" are caught without anyone enumerating every tool that exists. A word
    counts when it carries an internal capital, is an acronym, or is capitalized
    anywhere other than the opening of a sentence or bullet.
  - **Seniority, credential, and recognition words** ("director", "staff",
    "certified", "award", "professor"). Inventing one misstates the candidate's
    level or qualifications rather than their phrasing.

  Everything else is treated as rhetoric and never triggers a revert on its own.
  The guard originally worked the other way — every word absent from the evidence
  was a claim unless a list said otherwise — and that list leaked three times in
  practice ("strong"/"brings"/"vision", then "consulting"/"expertise", then
  "stakes"/"cycle"), each leak throwing away a good summary over a word that
  asserts nothing. English holds more rhetoric than any list can. Guarding what a
  claim *is* rather than what it is *not* took the false reverts on the stored
  corpus from 88 of 93 summaries to 14, with every remaining catch a checkable
  fact: an invented tech stack, a compliance standard the resume never mentions,
  a seniority word the evidence does not support. Terms are matched by stem, so
  "wireframes" is supported by "wireframe".

  Unconfirmed *posting requirements* are deliberately not part of this. Absent
  from the resume is not the same as fabricated — guarding them reverted
  summaries over "user needs" and "business outcomes" — and the keyword alignment
  panel already lists them under **Needs confirmed evidence before use** for the
  user to judge.
- **Keyword preservation** — tailoring may add job language but never trade away
  language the resume already matched. Before the AI call, the phrases the source
  draft already matches *exactly* are sent as protected terms the rewrite must
  keep verbatim. After the call, every keyword is re-measured on the three-tier
  scale (exact / related / missing). Only phrases that were **exact** in the source
  are defended — a related-wording match is fuzzy overlap across the whole
  document, so no single line owns it and reverting one would cost real tailoring
  for no gain an ATS can see. A defended phrase that is no longer exact is
  repaired by restoring the one source line that carried it, leaving the rest of
  the rewrite intact. Restoring a line often repairs several phrases at once, so
  the loss is recomputed after each restore; a phrase no single line can repair is
  skipped rather than abandoning the repairs that are still possible. The tailoring plan on the preview page names the
  lines that were kept and the phrases they saved. Without this a rewrite could
  turn "service design" into "service maps" and come back with fewer matches than
  the untouched resume while still reporting healthy coverage.
- **No-op tailoring detection** — a provider outage is already reported, but a
  model that runs and declines to rewrite was not: the draft stored a supported
  audit over source content and read as tailored. Every selected section is now
  compared against the source draft **on the AI's own output**, before the
  evidence guard and the preservation pass run — both of those restore source
  wording deliberately and would otherwise be counted as the model doing nothing.
  A section where at least half the lines came back verbatim is reported; a run
  where every selected section came back untouched is recorded as `source-only`,
  the same status a provider failure produces, with the count as its reason. The
  counts are stored in `evidence_audit_json.unchanged`.
- **Untailored-section notice** — a revert leaves the section reading as approved
  source wording while the document still reports a supported audit. When that
  happens the draft editor says so above the sections: which sections lost their
  tailoring, and the exact terms that were not supported, so the user can add the
  evidence and regenerate or edit the section by hand. This matters most for the
  summary, which carries the target title and domain language an ATS reads
  first — a silently reverted summary drops keyword coverage with no visible
  cause. The same block also carries the no-op notice above, so the two ways a
  draft can read as tailored without being tailored — the guard threw the rewrite
  away, or the model never wrote one — are stated side by side.
- Live preview pane updates automatically with a 400 ms debounce; Refresh button
  forces an immediate update.
- Keyword coverage percentage shown in the page header (color-coded green/yellow/red).

### Resume Preview `/generated-documents/[id]/preview`
Read-only HTML preview of the tailored resume.

---

### Interview transition

When a job's application status reaches **Interviewing** or **Offer**, the job workspace
surfaces *Interview preparation available* with a direct link, and the progress breadcrumb
ticks **Interview prep**. Next best action promotes it above everything else — an advancing
opportunity is time-bound in a way earlier stages are not.

Story matching for a job uses the same effective-keyword resolver as resume tailoring, so
newly evaluated jobs match on Application Preparation keywords and older ones fall back to
their stored evaluation keywords.

**Where stories come from.** Evaluation used to propose STAR stories as part of its
seven-block output; it no longer does. Stories are written in Interview Prep and labelled
**Interview prep**. Older stories keep their original labels — *AI evaluation* for ones
proposed by the retired evaluator, *Voice practice* for ones captured from practice — and
remain filterable under **Job suggestions**.

## Interview Prep `/interview-prep`

Tools to prepare for interviews using stored experience.

**Tabbed Workspace:**
- **Header chips** are core-story-centric: `N core stories · N questions`, plus a `N to consolidate` link (when generated suggestions remain) and a `N candidates to review` link (when the taxonomy has candidates).
- **Practice:** opens with a **Coverage** panel — a per-category readout of how many questions have at least one linked story or recorded attempt. Categories with no story yet are highlighted as gaps, so it's obvious where prep is missing. Below it are reusable questions, answer recording, and standalone story capture.
- **Story Bank:** saved stories, search, filters, and inline editing live in a separate story-bank workspace. Job evaluations no longer auto-fill this bank (see "Generate but ask first" below); older auto-generated suggestions remain until the one-time consolidation wizard folds them into core stories.
- **Taxonomy:** the private local tag tree built from the user's own jobs, resumes, and stories can be reviewed and managed without changing raw ATS keywords.

**Story consolidation wizard (one-time cleanup):**
- When the story bank still contains auto-generated `evaluation_suggestion` rows from the old Block F behavior, a banner in the **Story Bank** tab links to **`/interview-prep/consolidate`**.
- The wizard (`ConsolidationWizard`) uses the active AI provider to cluster the near-duplicate suggestions — which are lightly-reworded copies of the same ~15–25 real experiences — into canonical core stories, then synthesizes one clean STAR+Reflection story per cluster with capability tags. **Nothing is written until you review and commit:** each proposed story shows its editable title/STAR/tags, the list of job-specific suggestions it was merged from, and an approve checkbox.
- Committing creates the approved stories as reusable standalone stories, re-homes the merged suggestions' job links onto them, and removes the suggestion rows. The run is resumable (persisted in `story_consolidation_runs`) and the banner disappears once the bank is clean. This is a feature, not a one-off script — it appears for any user whose bank holds generated suggestions and never on a fresh install.

**Generate but ask first (Block F no longer auto-inserts):**
- Running **Evaluate with AI** on a job still generates likely interview questions with STAR outlines, shown in the job's **F. Interview plan** section — but nothing is written to the story bank automatically. This replaced the previous behavior of silently inserting ~5 stories per evaluation, which made the bank impossible to review.
- Each suggested question offers three choices: **Draft / Record Answer** (save it as a new core story via the interactive builder), **Link an existing story** (the section shows core stories that already match this role's concepts, with a one-click Link/Unlink toggle backed by `getMatchingStoriesForJob` / `setStoryJobLink`), or simply ignore it (drafts are not persisted).

**Interactive Story Builder:**
- **Type or Record:** Toggle between "Type draft" (typing a raw text response or notes) and "Record audio" (spoken practice transcribed by AI).
- **AI STAR Structuring:** AI parses the raw text or spoken recording transcript into the structured STAR + Reflection format (Title, Situation, Task, Action, Result, Reflection), identifying 2–8 ATS-style keyword tags (skills, tools, methodologies, domain terms genuinely demonstrated in the story — the same kind of verbatim phrase the job-evaluation pipeline extracts from postings), readiness, and missing details.
- **Preview Before Save:** AI-structured drafts are shown for review before they are written to the story bank.
- **Modal Wizard:** Practice answers and standalone stories open in a focused modal flow instead of expanding the full page.
- **Position Assignment:** Answers can be assigned to multiple active application positions with statuses Applied, Recruiter responded, or Interviewing. Checkboxes save immediately and can be unchecked at any time, regardless of how the link was created.
- **Private Taxonomy:** The app ships only the taxonomy schema; new installs have no taxonomy data. Concepts are created locally from the user's own evaluated jobs, story tags, and interview-prep material. Raw ATS keywords remain unchanged for resume tailoring, while grouped concept tags power search, filtering, and story-job matching.
- **Auto-Matching:** Stories are automatically linked to eligible positions (Applied, Recruiter responded, Interviewing) whose local taxonomy concepts overlap with the job's title, role archetype, or extracted ATS keywords — no manual checkbox needed. Exact raw keyword overlap still helps, but broader parent/child matches also work; for example, a story classified under "User interviews" can match a job asking for "user research." Auto-matched positions are labeled "Auto-matched" wherever assignments are shown, so it's always clear whether a link was system-suggested or user-chosen. Matching runs whenever a story is saved and whenever a position's status changes into the eligible set.
- **Per-question practice history:** Each question in the library shows an **attempts** count and a **History & stories** button. Every time you practice a question, the transcript, AI-structured STAR, quality rating, and coaching notes are saved as a durable **practice attempt** — re-practicing appends a new attempt rather than silently creating a duplicate story. The history drawer lists the question's linked canonical stories plus every past attempt (newest first, each expandable to its STAR and transcript), with a **Practice again** button. Because a re-practice reuses the question's existing canonical story id, refining an answer updates that one story while the full rep-by-rep history is preserved in `practice_attempts`.
- **Section-by-Section Editing:** Once structured, the story is displayed as separate sections. Each section can be independently edited and saved directly to the database, ensuring you can refine details piece-by-piece.
- **Writing Voice Integration:** Optionally opt-in to update your writing voice style profile with your custom answers, refining future AI-generated drafts.

**Practice Questions:**
- Ships with reusable default prompts and lets users add their own custom interview questions.
- Custom questions can be selected, edited, hidden, and reused for future typed or recorded practice through pop-up flows.

**Standalone Stories:**
- Users can capture an accomplishment or proof point without tying it to a specific question.
- AI structures the story, evaluates whether it is ready, and saves it as a standalone story after user confirmation in a pop-up wizard.

**STAR Story Bank:**
- Collates and displays all saved stories with visual badges for S/T/A/R/Reflection components.
- Shows source and kind labels for answered questions, standalone stories, voice practice entries, and job evaluation suggestions.
- Includes search and filters by story kind, source, quality/readiness, grouped taxonomy tags, assigned/source position, and updated date.
- **Tags and Position filters are searchable multi-selects** (`SearchableMultiSelect` in `src/components/ui/searchable-multi-select.tsx`): a button shows the selected count and opens a popover with a search box and checkboxes, so hundreds of tags or dozens of positions stay usable. Tag filters use grouped taxonomy concepts; selecting a parent concept includes its children. Selecting multiple values within one filter is OR'd; filters across different fields are AND'd.
- **Cards are collapsed by default.** Each card shows title, badges, a one-line preview, up to 4 tags, and the assigned-position count; clicking the row (or "Show details") expands it to the full STAR text, all tags, all assigned positions, and quality notes. This keeps the list scannable at the story-bank's typical scale (100+ stories).
- **Paginated at 20 stories per page** with Previous/Next controls, so the page doesn't render or scroll through the entire story bank at once. Changing any filter or the search box resets to page 1.
- Support **inline editing** using the interactive section-by-section editor. Clicking Edit on an expanded card launches the editor immediately.
- Shows grouped concept tags first and keeps raw keywords in expanded details. User-authored stories normally contribute 2–8 raw keywords; job-evaluation suggestions can contribute up to 12 raw ATS keywords from the source job.

**Taxonomy Manager:**
- Lets users review the generated tag tree, search paths and aliases, add tags, rename tags, move tags under another parent, archive/restore tags, add/remove aliases, and merge duplicate tags.
- Taxonomy changes are logged locally. User edits are treated as authoritative for future classification.
- The tree supports up to five levels so broad areas can contain specific methods, such as `Research / User research / Qualitative research / Contextual inquiry`.
- **Tags are collapsed by default and lazily rendered.** A tag's children — and the per-tag "move to parent" / "merge into" dropdowns, which list every other tag — only render once that tag is expanded. Unmatched keywords fall into a single "Other keywords" bucket that can grow into the hundreds as real usage data accumulates; rendering that bucket's full edit UI unconditionally on page load previously froze the tab. Searching temporarily reveals matching branches regardless of their expanded state, and the match check walks the full subtree so a result at any depth (not just the first level or two) surfaces correctly.
- **Concept lifecycle (active / candidate / archived).** The tree shows only the curated **active** set. Keywords pulled from job evaluations now arrive as **candidates** rather than cluttering the tree — count chips at the top show active / candidate / archived / alias totals. Candidates still power story↔job matching; they are just held out of the browsing view.
- **Review queue.** A dedicated panel lists candidate concepts ranked by how many jobs referenced each, with a filter box, per-row checkboxes, **Approve selected** / **Archive selected** bulk actions, and a one-click **Archive all unused** (candidates with no story links and fewer than 3 jobs). A header chip on the workspace ("N candidates to review") jumps straight here.
- **Automatic promotion.** A candidate becomes active on its own when it is linked to a story or recurs across 3+ distinct jobs — so genuinely relevant tags surface without manual triage while one-off job phrases stay parked.
- **Blocklist.** Credentials (degree/certificate phrasing), job titles (seniority-prefix shapes), and the user's own tracked company names never become concepts. Patterns are role-agnostic, so the diet works for any user's field, not just design. Blocked phrases still count for resume tailoring and job matching via raw-keyword matching.
- **No resurrection.** Archiving a concept sticks: a later job evaluation that re-encounters the same keyword will not silently un-archive it — only an explicit restore does.

**Job Evaluation Integration (Section F. Interview plan):**
- Direct entry point from the **Job Detail → Analysis** page. Next to each suggested question in Section F, clicking `"Draft / Record Answer"` opens the interactive builder inline.
- Above the questions, a **"You may already have stories for this role"** panel lists existing core stories whose taxonomy concepts overlap this job, each with a **Link / Linked ✓** toggle — so you can attach an existing story instead of drafting a duplicate. This is the review step that replaced auto-insertion; nothing enters the story bank without an explicit Draft or Link action.

---

## Profile `/profile`

Career profile editor. The profile is the foundation for all evaluations and
resume tailoring. The page is split into **six tabs**, navigated via URL
(`?tab=<id>`), each with its own save action.

The AI extraction card is always visible on the Overview tab as a 2-step flow.
Step 1 shows active (blue) when no PDF has been uploaded, and green ✓ once a PDF
is ready. Step 2 (Extract button) is disabled until Step 1 is complete. The
Resumes tab shows an upload banner when no extracted resumes exist.

### Tab: Overview (`?tab=overview`)
- Summary card: name, current search goal, location, portfolio, urgency, direction.
- **AI profile extraction card** — 2-step flow: Step 1 (upload) shows active/✓
  state; Step 2 (Extract with AI button) is disabled until at least one resume
  PDF is uploaded. Runs AI extraction on all uploaded resumes and populates
  skills, role directions, and experience automatically. Clicking **Extract with
  AI** opens a blocking `ProgressModal` ("Analyzing your resume…" + spinner); on
  success it shows the number of skills extracted; on error it shows the failure
  message. **Extraction merges, never overwrites:** existing `targetRoles` are
  preserved and new AI-extracted roles are appended (case-insensitive dedup).
  Positive title filters also merge — a third AI call generates realistic
  job-board search keywords (industry synonyms, seniority-neutral variants,
  common abbreviations) from the extracted roles and career direction, and all
  additions are merged into any filters already saved. The negative filter list
  is always left untouched.
- Edit form: current search goal, search direction, urgency (select), career
  intent, career change interest, confidence level.

### Tab: Resumes (`?tab=resumes`)
- **Upload banner** (shown when no extracted resumes exist): instructs the user to
  upload a PDF, then go to Overview to run extraction.
- **Resume lanes card** — each lane is a different resume version. Per-lane actions:
  - **Upload PDF** (blue solid button): shown when the lane has no PDF; opens file
    picker, uploads and auto-extracts text.
  - **Replace PDF** (outlined button): shown when the lane already has content;
    replaces the file and re-extracts.
  - **Edit resume** / **Edit approved version** (text link): always shown for
    every lane; opens the Resume Builder for that lane.
  - **Remove** (text link): always shown for every lane; deletes the entire resume
    lane after inline confirm ("Remove this resume? / Yes, remove / Cancel"). This
    replaces the old PDF-only removal behavior — the lane itself is deleted.
  - **Rename** (✎ pencil icon): inline rename with keyboard support (Enter saves,
    Escape cancels).
- **Add resume (PDF)** button at the bottom of the lanes list: creates a new
  empty lane named "New Resume". User then renames it and uploads a PDF.
- **Create new resume** button: creates a blank lane with starter sections
  (Contact, Summary, Experience, Skills, Education) and opens the Resume Builder
  immediately — no PDF required. User types or pastes their content directly.
- **Skill inventory card** (shown only after at least one AI extraction): lists
  extracted skills with category and evidence source.

### Tab: Skills & Roles (`?tab=skills`)
- Read-only badge displays for: strongest skills (from AI extraction), skills to
  use more, skills to use less, target roles.
- Edit form: target roles (one per line), skills to use more (one per line),
  skills to use less (one per line).

### Tab: Preferences (`?tab=preferences`)
- Summary cards: location mode, compensation, desired industries, on-site /
  hybrid locations, remote regions.
- Edit form: location mode checkboxes (`Remote`, `Hybrid`, `On-site`), on-site /
  hybrid locations, remote regions, desired industries, compensation needs, and
  free-form work preferences.
- **Two independent location lists.** They answer different questions, and
  sharing one list made them inexpressible together — widening it to reach
  remote roles in another country also admitted that country's on-site offices.
  - **On-site / hybrid locations** — places you would physically commute to.
    Matched against hybrid and on-site postings only.
  - **Remote regions** — countries or regions whose remote roles you can take.
    Matched against region-restricted remote postings only. Leaving this empty
    means remote roles from anywhere are accepted.
- **Region groups expand to their member countries.** Rather than listing 27
  nations, put a group in Remote regions and every member country matches:
  `European Union` (or `EU`), `Europe`, `EMEA`, `North America`, `South America`,
  `Latin America` (`LATAM`), `Americas`, `APAC`, `Asia`, `Oceania`, `Africa`,
  `Middle East`, `Nordics`, `Scandinavia`, `Benelux`. Nominatim does not suggest
  these, so type one and use **Add typed location**.
  - `European Union` and `Europe` are **deliberately different sets.** EU is the
    27 member states; Europe additionally covers the UK, Switzerland, Norway and
    Ukraine. A posting requiring EU work authorization genuinely excludes the UK
    and Switzerland, so folding them together would accept unreachable roles.
  - Member countries are resolved from the same `Intl.DisplayNames` CLDR data
    that supplies the region vocabulary, so the two always agree.
  - Groups also expand on the on-site list, so `Europe` there matches an office
    in Berlin. `Georgia` is excluded from that expansion — it names both a
    country and a US state, and would otherwise make Atlanta match `Europe`.
- Both lists use an OpenStreetMap Nominatim lookup that supports city,
  state/region, and country selections. You can save precise locations such as
  `Nashville, Tennessee, United States`, broader targets such as
  `Tennessee, United States`, or country-only values such as `Canada`. Each
  saved place displays as one label; legacy split values such as `Nashville`,
  `Tennessee`, `United States` are normalized back into one label. Remote
  regions are collapsed to their country when matching, so country-level entries
  are the useful granularity there.
- Work preferences are reserved for non-location preferences such as `small
  team`, `async-first`, or `mission-driven`; location modes are stored
  separately.

### Tab: Constraints (`?tab=constraints`)
- Read-only list of current constraints and deal breakers.
- Edit form: constraints (soft limits, one per line), deal breakers (hard-no
  conditions flagged as red flags in evaluations, one per line), career change
  interest.

### Tab: Writing Voice (`?tab=voice`)
- Displays the current tone profile if already extracted (tone, formality,
  sentence style, style guide).
- Form to paste 2–5 writing samples (emails, cover letters, LinkedIn posts)
  separated by `---`. Submitting runs AI style extraction and saves the tone
  profile. Used to match AI-generated content to the user's authentic voice.

---

## Strategy `/strategy`

Role-fit map derived from the profile and skill inventory.

- **Direct fit** roles: score ≥ 80, strong evidence across the profile.
- **Adjacent** roles: score 60–79, achievable with some positioning.
- **Selective** roles: score 40–59, situational fit depending on the company.
- **Avoid** roles: score < 40, significant gaps or misalignment.

Each archetype shows a score, rationale, and gap list. The user can edit the
classification or rationale to correct AI judgments.

The page has two tabs:

- **Strategy** (default) — role-fit map, search focus, AI-generated role
  directions, how-to-use guide, and evaluation corrections. Use **Generate with
  AI** when no role directions exist, or **Regenerate with AI** to rebuild them
  from the current profile and skill inventory. The app replaces the current
  role-direction set after generation and keeps the editable correction workflow
  below each direction.
- **AI Prompts** — prompt overrides for resume tailoring, application answers, and outreach. Prompt overrides are stored locally and can be reset to the app defaults; locked resume-safety rules remain enforced in code.

---

## Analytics `/analytics`

Search performance metrics drawn from actual evaluation and application data.

**Charts and metrics:**
- Score-to-outcome correlation: do high-score jobs convert to interviews?
- Archetype performance: which role types get the most responses.
- Remote policy conversion: how remote / hybrid / onsite jobs track through the funnel.
- Gap coverage: what percentage of evaluated gaps have been addressed.
- Application funnel conversion rates.

**Top gap patterns** is read-only here. It lists the six most frequent gaps with their
recurrence count and their bank status (`Answered` / `Needs detail`), then links to the
Evidence bank to answer them. Editing was moved off this page so a gap is answered once
globally rather than per analysis view.

---

## Evidence Bank `/evidence`

The single place to answer the gaps and red flags evaluations raise. A gap is a fact
about the candidate, not about a requisition, so its answer is stored once — keyed on the
gap text — and reused by every application that raises the same gap, including future ones.

Reached from Analytics ("Top gap patterns") and the Dashboard ("Evidence gaps to finish").

**Summary tiles:**
- **Needs detail** — answers the user started that the AI assessor judged too thin to use.
- **Recurring, unanswered** — untouched gaps that two or more roles raised.
- **Answered** — complete answers, reused automatically.

**Why the list is filtered.** Evaluators phrase gaps per requisition, so exact-text
matching collapses very little and the raw unanswered pile runs into the hundreds. The
default **Needs work** view therefore shows only answers already started plus gaps raised
by 2+ roles (`RECURRING_GAP_MIN_ROLES`). A gap only one role raised is better answered on
that job page. **Answered** and **Every gap (N)** filters show the rest.

**Each row shows** the gap text, the roles that raised it (linked), a status badge, and an
expand control labelled Answer / Add detail / Edit by status.

**Expanded editor:**
- The gap restated as a plain question.
- *One thing left* / *N things left* — the assessor's persisted questions, for
  `needs_followup` items. Capped at two; see "Only ask what a resume needs" under AI
  Capabilities for the rules governing what may be asked.
- **Draft with AI** — proposes a starting answer built strictly from the user's resume and
  previously answered gaps. The draft is never auto-saved: it appears in a bordered
  preview with a "Based on N items from your evidence" disclosure listing the fragments it
  drew on, plus **Use this draft** / **Dismiss**. When the evidence does not support an
  answer the model returns *no* draft and instead lists what the user must supply — it is
  prompted never to stretch unrelated experience to cover a gap. Accepting a draft leaves a
  standing "check every claim is true before saving" note above the buttons.
- **Polish wording** — rewrites the current text without inventing facts (`/api/gaps/polish`).
- **Save to profile** — assesses and stores the answer. `addressed` collapses the row;
  `needs_followup` keeps it open with the new follow-up question visible.
- **Clear everywhere** — deletes the bank record, since it is the single global copy.

---

## Settings `/settings`

Four configuration tabs:

### AI Providers
- **Provider priority list** — enable up to four providers and order them by priority. The first enabled provider in the list is used for every task; the rest act as automatic fallbacks. Drag the grip handle on each row to reorder.
- **Cloud providers** — Anthropic (Claude), OpenAI (GPT), Google (Gemini). Enter an API key and select a default model for each.
- **Ollama (local)** — free, runs entirely on your machine; no API key required. Enable in the priority list to reveal the configuration section:
  - **Base URL** — Ollama server address (default `http://localhost:11434`).
  - **Model picker** — click "Choose…" to fetch the list of locally installed models from the running server and select one.
  - **Quality guide** — ≥64 GB: `qwen2.5:72b` / `llama3.1:70b` (near cloud quality); ≥12 GB: `qwen2.5:14b` / `mistral-nemo`; ≥8 GB: `llama3.1:8b` / `qwen2.5:7b`.
  - **Unreachability warning** — when Ollama is in the priority chain and the server is not reachable, an inline warning banner appears with a Retry button.
- **Every provider that was tried is named when the chain fails.** The fallback chain
  used to throw only the last provider's error, so a chain starting at a local Ollama
  and ending at Gemini reported *"AI quota exceeded — you've hit the free-tier limit"*
  — a quota error about a provider the user never meant to reach, with the local
  model's actual problem thrown away. A whole-chain failure now lists each attempt in
  order, with the model that ran and a one-line reason:

  ```
  All 3 AI providers failed:
  ollama (gemma4:12b-mlx) — Ollama returned invalid JSON. Try a larger model (14B+)…
  openai (gpt-5.6-sol) — OpenAI rate limit reached. Wait a moment then retry…
  gemini (gemini-3.1-pro-preview) — [429 Too Many Requests] You exceeded your current quota.
  ```

  Each provider is bounded by its own deadline (150s cloud, 10 minutes local), so a
  slow local model hands over to the cloud provider behind it instead of spending the
  whole run's budget; a provider that runs out of time is reported as `did not finish
  within 600s — a smaller or faster local model would fit the budget` rather than as
  the mechanism that stopped it. Retry classification follows the same whole-chain rule: a
  chain is retried only when *every* attempt failed for a retryable reason. A failure
  that would repeat on every provider (a malformed request) is still thrown as itself
  without walking the chain.
- **Output budgets are set where the shape is known**, not left to each provider's
  default of 4096 — see *Output budget* under Application Preparation. Ollama's own
  `generateJSON` default also moved to 8192 to match Gemini's, so a direct call cannot
  truncate either. Its client timeout is a minute past the local generation deadline,
  so a slow local run is cut by the caller's deadline — which hands over to the next
  provider — rather than by the HTTP client at 120s, which the chain used to read as a
  provider failure while the run still had budget left.
- Test connection for any provider to verify credentials and measure latency. On
  failure the panel shows **one line** — the HTTP status and the sentence that says
  what to do, e.g. `[429 Too Many Requests] You exceeded your current quota, please
  check your plan and billing details.` — with the provider's full response behind a
  **Full error** toggle (scrollable, nothing discarded). Provider SDKs return the
  entire failure body: Google's 429 arrives as ~2,200 characters of quota metrics and
  JSON violation objects, which pasted verbatim buried the actionable sentence. The
  summarizer (`summarizeProviderError` in `src/lib/ai/provider-error-summary.ts`)
  starts at the bracketed HTTP status when there is one — dropping the SDK's "Error
  fetching from <url>" preamble — stops before any appended JSON payload, and keeps
  the first sentence, hard-truncating at 180 characters only when the message has no
  sentence break. A short message is shown as-is with no toggle. A failed test also
  reports the model that actually ran, so an auto option shows the resolved id rather
  than the `latest-…` sentinel.
- **Key masking** — every stored secret (provider API keys, Brave, Adzuna) is
  replaced with `••••` plus its last four characters before it reaches the
  browser, so the full value never enters the RSC payload. Saving an untouched
  field, or testing a connection without retyping the key, sends the mask back;
  both the save action and `POST /api/ai/test` swap it for the stored key via
  `resolveMaskedKey` in `src/lib/ai/masked-key.ts`. (Before this, Test connection
  handed the mask straight to the provider SDK and failed with a ByteString
  conversion error on the `•` character.)
- **Model attribution** — every AI-generated result (evaluation, research, outreach drafts, application answers) shows the model and provider that produced it.

### Integrations

**Clay** (optional). Connect your own Clay account to find real people around an
opportunity. Job Search Terminal works normally without it — evaluation, resumes and
applications never depend on Clay, and a Clay outage cannot affect them.

- Paste your API key and save; saving immediately tests the connection.
- The test uses Clay's identity endpoint, **not** a people search, so checking whether your
  key works never consumes your search allowance.
- The key is stored locally and sent only to Clay. The settings page never receives it
  back — it shows the last four characters and nothing else.
- Status reads **Not connected**, **Connected**, **Key rejected** (actionable — re-paste
  it), or **Clay unreachable** (usually not actionable — Clay is down or the API changed).
- **Disconnect** clears the key, the status and any cached metadata.

**Which key — use the scoped one.** Clay's profile page offers two, and only one works:

| Clay tab | Key | Result |
|---|---|---|
| API keys (beta) | `clay_scoped_…` with the **Public API** scope | ✅ Connects |
| API key | `clay_user_…` (personal) | ❌ 401 "Authentication required" |

Clay's own API reference says the personal key is the one to use. It is not — that key is
rejected, verified against a live account on 2026-08-18. Create a scoped key under
**Profile → API keys (beta) → Add API key** with the Public API scope. Use Clay's copy
control rather than selecting the displayed value, which is truncated with an ellipsis.

> Contact search itself is not built yet. This phase establishes the credential and
> connection plumbing only.

### Job Sources
- All configured sources appear in a unified table — companies from
  `portals.example.yml` and any manually added sources are treated equally.
- Enable or disable individual sources (disabled sources are skipped on the
  next scan).
- Column filters and saved filter presets on the sources table.
- Sources from `portals.example.yml` cannot be removed (they reload from the
  config file); manually added sources have a Remove button.
- Add any company by pasting its careers page URL — Greenhouse, Ashby, and
  Lever are auto-detected.
- "Scan for new sources" queries the Common Crawl index to discover additional
  ATS boards automatically. See **Source discovery (Common Crawl)** below for how
  the sweep is bounded and why it is incremental.
- Discovered sources stay pending until the user reviews and explicitly selects
  the validated companies to add.
- Cleanup review lists disabled or malformed user-added sources for explicit
  removal. Existing sources are never removed automatically.
- "Search discover" queries Brave Search API for ATS job boards not in Common
  Crawl (requires Brave Search API key in AI Provider settings). Merges new
  findings into `data/discovered-sources.json` without overwriting existing
  entries.
- "Validate sources" opens a **modal** (progress, then summary counts and a scrollable list of dead/unknown boards — same interaction pattern as **Scan for new jobs** on the Dashboard). It checks each tracked board’s public ATS JSON URL (same
  host as CareerOps scans). Results: **Live** / **N jobs** when HTTP 200 and JSON
  parse succeeds, **Dead** on HTTP 404, **Unknown** for other HTTP codes, timeouts,
  or non-JSON. The validator uses a **45s** per-source ceiling, browser-like
  `User-Agent` / `Accept` headers, **up to three attempts** with backoff on
  transient errors (HTTP 429 / 5xx / network aborts), **lower concurrency** (5),
  and **longer pauses between batches** so Ashby and other hosts are less likely
  to rate-limit when hundreds of sources are validated at once. Hover an
  **Unknown** badge to see the last error string (for example `HTTP 429`).
  **Re-validate sources** re-runs the full check.
- **Fresh posting window** card: select how far back scans accept postings —
  24 hours, 72 hours (default), or 7 days. Postings older than the window are
  skipped as stale. The selected window applies to company career-site
  (CareerOps), Dice, and Adzuna scans, whether triggered manually or by the
  six-hour schedule. (This selector previously lived under Data & Backup; it
  moved to Sources so it sits next to the scan tools it governs.)

#### Source discovery (Common Crawl)

`src/lib/scanner/source-discovery.ts` harvests Greenhouse / Ashby / Lever company
slugs from the Common Crawl URL index, validates each board's public ATS JSON
endpoint, and writes candidates to `data/discovered-sources.json` for manual
review. Nothing is scanned until the user imports it from Settings → Job Sources.

**Resilience.** The CC index intermittently answers `502` / `503` / `504` under
load. Requests retry with exponential backoff and jitter, honouring `Retry-After`
when present. This matters: a run that hit gateway errors on all four URL
patterns previously wrote `totalCrawled: 0` with no errors recorded, making a
total outage look identical to "nothing new to find". Query failures are now
recorded in the `errors` array of both the output file and the run summary.

**Rate limiting — run discovery sparingly.** Common Crawl is a free community
service with no published rate limit, and it throttles by refusing connections
outright (`ECONNREFUSED`, not a 429). Repeated full sweeps *will* get the host
blocked for a period; this was observed in practice after several back-to-back
runs, at which point every query fails while unrelated hosts stay reachable.

Three deliberate choices follow from that, and they should not be "optimised"
away:

- Attempts are capped at `CC_FETCH_ATTEMPTS` (3), not more. Retrying hard while
  the index is throttling is a retry storm that converts a slowdown into a block.
- Backoff is exponential (`CC_RETRY_BASE_MS` × `CC_RETRY_FACTOR ^ attempt`) with
  jitter, so concurrent queries do not resynchronise their retries.
- A circuit breaker aborts the whole sweep after `CC_MAX_CONSECUTIVE_FAILURES`
  (3) consecutive failed queries. Grinding through the remaining patterns while
  blocked deepens the block and wastes minutes; the run reports the abort as an
  error instead.

If a run reports "Common Crawl is rate-limiting or refusing this host", wait
before retrying. Nothing is lost — discovery is incremental, so a later run
resumes where this one stopped.

**Crawl selection.** Indexes resolve from `collinfo.json` at run time — the
`CC_INDEX_COUNT` (3) most recent crawls, plus `CC_ARCHIVE_INDEXES`. The
implementation previously pinned a single crawl that went 20 months stale. The
archival index is coverage, not redundancy: `jobs.lever.co/*` returns a
persistent `504` on every recent index while answering normally on
`CC-MAIN-2024-51`, so a recent-only sweep finds almost no Lever boards (1 slug,
versus 90 from the archival crawl). Slugs from older crawls are still validated
live, so a stale crawl cannot introduce dead sources.

**Pagination.** Each pattern is walked page by page via `showNumPages`. The old
implementation fetched a flat `limit=1000` slice of page 0, capping patterns that
hold tens of thousands of records.

**Incremental by design.** `loadExistingSlugs()` skips slugs already in
`portals.yml`, already in the custom-sources table, *and* already reported by an
earlier run. Consulting only `portals.yml` (31 companies) meant every run
re-validated the hundreds of sources already imported plus every candidate it had
already reported, so each run redid the last one's work and buried genuinely new
boards. Because prior discoveries are skipped, `MAX_NEW_CANDIDATES_PER_RUN`
(1,500) is a rolling window rather than a permanent ceiling — rerun discovery to
walk further through the backlog. A run that hits the cap sets `truncated`.

**Where the cap is applied.** After the full sweep, never during it. Sweeping is
cheap (parsing index lines); validation and AI classification are what cost time
and money. Capping mid-sweep also aborted whole indexes before they were reached
— including the archival one carrying essentially all Lever coverage, which
silently defeated the Lever fix above. `selectBalancedCandidates` then draws
round-robin across providers: a flat slice would be dominated by Greenhouse,
which outnumbers Ashby roughly 2:1 and Lever by orders of magnitude, so Lever
boards would never survive the cap.

Since a run only carries newly-found slugs, its output is **merged** with prior
entries before writing; otherwise each run would wipe the pending review list.

**Cost control.** AI industry classification is capped at
`MAX_AI_CLASSIFY_ENTRIES` (200) per run. The label only decorates the review
list, and an uncapped wider sweep would issue roughly 55 model calls per run.
Entries past the cap fall back to the existing slug heuristic.

**Scale note.** A full sweep surfaces on the order of 9,000 candidate slugs, of
which roughly 77% have a live endpoint. Importing thousands of sources would
multiply CareerOps scan cost proportionally; staggered or incremental scanning is
not yet implemented, so import selectively.

### Preferences
- Edit title include / exclude filters.
- Add profile supplements for gap filling. Supplements are checked for concrete
  role, project, action, and outcome detail before they are treated as confirmed
  resume-tailoring context.
- Adjust other search preferences.

### Data & Backup
- Enable or disable automatic scans every six hours while the local app is
  running. The schedule card shows the currently selected fresh-posting window
  and links to Sources → Fresh posting window, where the selector now lives.
- Create a portable `.jst-backup` archive with optional password protection.
- Restore only after archive validation, preview, explicit confirmation, and an
  automatic rollback backup.

---

## AI Capabilities

The app supports four AI providers interchangeably:

| Provider | Default model | Used for |
|---|---|---|
| OpenAI | `latest` (auto-resolved) | Evaluation, answers, outreach, research, transcription |
| Anthropic | `claude-sonnet-4-6` | Evaluation, answers, outreach, research |
| Google Gemini | `gemini-2.5-flash` | Evaluation, answers, outreach, research, transcription |
| Ollama (local) | user-selected | Evaluation, answers, outreach, research |

Providers are configured as an ordered **priority chain** in Settings → AI
Provider. The app tries providers from top to bottom and automatically fails over
to the next one when a provider is unavailable or returns a recoverable error.
The first provider in the chain that has a credential configured is the active
provider. Ollama uses a base URL (default `http://localhost:11434`) instead of an
API key and supports any model installed on the local Ollama server. All AI calls
use the `src/lib/ai/` provider abstraction with retry and failover logic.

**Gap evidence AI helpers** (`src/lib/gaps/`):

| Module | Endpoint | Behavior without a provider |
|---|---|---|
| `evidence-context.ts` | — | Returns whatever is on file; no AI involved |
| `gap-answer-assessor.ts` | (internal) | Falls back to a keyword heuristic holding the same line |
| `llm-gap-polisher.ts` | `/api/gaps/polish` | Returns the input unchanged |
| `llm-gap-drafter.ts` | `/api/gaps/draft` | Returns no draft, plus at most two generic questions |

**Only ask what a resume needs.** The governing rule for every follow-up question is:
*would the answer change the wording of a resume bullet?* If not, it is not asked.
Concretely:

- **Employers, job titles, dates, and durations are never asked for.** They are already
  in the database. `loadGapEvidenceContext()` (`evidence-context.ts`) assembles the active
  resume's text plus an `organization — title — dateRange` list from the resume builder,
  and passes it into every assessment. Re-asking for a date that is already on file is
  treated as a defect, not a thoroughness feature.
- **Nothing the answer already states is re-asked**, including loosely. If the answer says
  the candidate managed people at named companies, that is settled — it is not sent back
  for confirmation or a re-listing of those companies.
- **At most 2 questions, and one is preferred** (`MAX_FOLLOW_UPS`). Priority order is
  (1) scale — headcount, users, budget; (2) a concrete outcome or deliverable.
- **Questions are persisted, not regenerated.** The list is stored in
  `assessment_json.followUpQuestions` and re-read via `followUpQuestionsFromJson()`, so it
  does not change between page visits or button clicks. Regenerating produced a different
  set each time and made the loop feel endless. A new question set is produced only when
  the answer text itself changes and is re-assessed. When no question is stored — a row
  cleared by `npm run gaps:clear-stale-questions` — the UI falls back to a deterministic
  scale question rather than rendering nothing.
- **Gap sentences are reduced before use.** `gapSubject()` in `gap-text.ts` strips the
  evaluator's framing so questions read about the topic, not the complaint. It handles
  leading forms ("The available resume evidence does not explicitly document X",
  "The job calls for X", "No X"), trailing forms ("X is not demonstrated", "X is stated"),
  dangling conjunctions, and the contrast form "X, but limited evidence of Y" — where the
  gap is **Y**, since X is normally a compliment. When a sentence resists reduction it
  returns "" and callers use generic wording instead of splicing the complaint into a
  question. Shared by the assessor, the drafter, and the Evidence bank panel so all three
  phrase a gap identically.
- **One question box.** The assessor's persisted questions are authoritative; when a saved
  answer exists, `Draft with AI` no longer prints a competing list of its own.
- **An answer that only restates the gap counts as empty.** `isEchoOfGap()` catches it, so
  the evaluator's own complaint can never read as evidence.

The heuristic fallback holds the same bar: where + what + scale-or-outcome is enough
(employers/titles/dates explicitly not required, since they are on the resume).

`draftGapAnswer()` is grounded and refusal-capable by design: it is given only the
active resume's extracted text and previously `addressed` answers (the gap being drafted
is excluded so the model cannot echo it back), it is instructed never to invent employers,
titles, dates, metrics, or outcomes, and it is told that returning an *empty* draft is the
correct output when the evidence is silent — stretching unrelated experience to cover a
gap is explicitly forbidden. It returns `basedOn` (the fragments it drew on, surfaced in
the UI for verification) and `questions` (what the user still has to supply). Nothing it
produces is persisted until the user reviews and saves it.

### Model selection — keeping up with new releases

All three cloud providers work the same way in Settings → AI Provider: the dropdown
merges a curated list with **whatever the saved key can actually reach right now**,
fetched from that provider's own model-list endpoint, and offers **auto options**
that follow new releases without anyone editing the setting. Under each dropdown a
line reports what the current auto option resolves to (`Resolves to gemini-3.7-flash
— rechecked hourly`), with a **Refresh** link that re-queries the provider.

An auto option changes which *release* runs, never which *tier*. Tier is the axis
that decides price and capability, and that stays the user's choice:

| Provider | Auto options | How the tier is held |
|---|---|---|
| Claude | Latest Sonnet (default), Latest Opus, Latest Haiku | Tier is in the model id, so there is one option per tier |
| Gemini | Latest Flash (default), Latest Pro, Latest Flash-Lite | Same — one option per tier |
| OpenAI | Latest (default) | Tier is a suffix, so one option is enough: cheaper and off-product variants are skipped |

Resolution is cached for one hour per key, and every failure path falls back to a
known-good pinned model rather than erroring — model discovery must never be able to
fail a generation. Selecting a concrete model id instead pins it, and the line under
the dropdown says so.

#### Claude and Gemini

- **Claude** — `latest-sonnet`, `latest-opus`, `latest-haiku` resolve against
  Anthropic's `GET /v1/models`. Within a tier the highest version wins numerically
  (`claude-opus-4-10` beats `claude-opus-4-8`, `claude-opus-5` beats both), and the
  undated alias beats a dated snapshot of the same release because the alias keeps
  following Anthropic's own pointer. Ids from the 3.x era (`claude-3-5-sonnet-…`,
  which put the version before the tier) are still ranked correctly. Fallbacks:
  `claude-sonnet-5` / `claude-opus-5` / `claude-haiku-4-5`. Curated pins:
  `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`, `claude-sonnet-4-6`,
  `claude-haiku-4-5`. Logic in `src/lib/ai/anthropic-models.ts`, live list from
  `GET /api/ai/anthropic-models`.
- **Gemini** — `latest-flash`, `latest-pro`, `latest-flash-lite` resolve against
  `GET https://generativelanguage.googleapis.com/v1beta/models` (the
  `@google/generative-ai` SDK exposes no listing call, so REST is used directly),
  keeping only ids that support `generateContent`. Stable releases win: thinking
  variants, dated builds (`-001`), image/TTS/custom-tool builds and Google's own
  `-latest` aliases never match. **One exception** — a tier whose newest stable
  release is a whole generation behind the newest stable generation the key can see
  falls through to that tier's newest preview. This is Google's real behaviour
  mid-transition: `gemini-2.5-pro` stays in the list long after it stops serving new
  keys ("no longer available to new users"), while the current Pro exists only as
  `gemini-3.1-pro-preview`. Running a preview is worse than running a current stable
  model and better than running one that 404s; a tier whose stable release is current
  is never moved onto a preview, however new that preview is. Fallbacks:
  `gemini-2.5-flash` / `gemini-2.5-pro` / `gemini-2.5-flash-lite`. Logic in
  `src/lib/ai/gemini-models.ts`, live list from `GET /api/ai/gemini-models`.

Migration `0065_latest_claude_gemini_models` moves installs still holding the app's
own old defaults (`claude-sonnet-4-6`, `gemini-2.5-flash`, `gemini-2.0-flash`) onto
the matching auto option, keeping the same tier. A model the user picked themselves
is left untouched, and switching back to a pinned id is one dropdown change.

#### OpenAI

The OpenAI model dropdown offers:

- **Latest (auto)** — the default. Stored as the sentinel `latest` and resolved at
  request time against OpenAI's `/v1/models` list. It takes the newest generation
  the key can actually reach and, within it, the bare generation alias (`gpt-5.6`,
  which routes to `gpt-5.6-sol`) or `-sol` when the account's list does not expose
  the bare alias. Generations that only expose cheaper or off-product variants
  (`-mini`, `-nano`, `-terra`, `-luna`, `-pro`, `-codex`, `-chat-latest`, dated
  snapshots) are skipped, so `latest` changes the model's *generation* but never
  its tier. The resolved id is cached for one hour per key; if the lookup fails the
  call falls back to `gpt-5.6` rather than erroring. The dropdown shows which id
  `latest` currently resolves to, with a Refresh link.
- **Named GPT-5.6 variants** — `gpt-5.6` (generation alias, routes to
  `gpt-5.6-sol`), `gpt-5.6-sol` (highest capability), `gpt-5.6-terra` (balanced,
  lower price), `gpt-5.6-luna` (fast, high volume).
- **Older pinned models** — `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`.
- **Anything else the saved key can reach**, merged in live from
  `GET /api/ai/openai-models` (which lists `gpt-*` models using the saved key and
  reports the current `latest` resolution). All three model-list routes answer in
  the same shape — `{ models: string[], latest: Record<sentinel, modelId> }` — so
  the settings form treats the providers identically.

Migration `0057_openai_latest_model` moves installs still on the old default
`gpt-5.4-mini` onto `latest`; explicitly pinned models are left untouched.

The resolution logic lives in `src/lib/ai/openai-models.ts`
(`OPENAI_LATEST_SENTINEL`, `pickLatestFlagship`, `resolveLatestOpenAIModel`) and is
applied inside `OpenAIProvider` for text, JSON, streaming, and connection tests.

**AI-powered features:**
- Job fit evaluation (streaming, real-time output)
- Resume tailoring
- Application answer generation
- Company research
- Outreach message drafting
- Profile extraction from PDF
- STAR story transcription and parsing
- Gap response polishing
- Writing style extraction

---

## Job Scanning

The scanner discovers new jobs from ATS APIs (Greenhouse, Ashby, Lever) and
custom URLs configured in Settings.

**How a scan works:**
1. User clicks "Scan for new jobs" on the Dashboard.
2. The CareerOps ATS scanner queries each enabled Ashby/Greenhouse/Lever source in parallel.
3. Dice runs in parallel with the ATS scan. If Adzuna credentials are configured (Settings → AI Provider → Discovery & Aggregators), Adzuna runs in parallel too.
4. Title filters remove irrelevant roles.
5. Profile location preferences remove listings outside the user's constraints — the
   on-site / hybrid list for hybrid and on-site postings, the remote regions list for
   region-restricted remote postings. This runs on every lane: the CareerOps scanner
   applies it inline, and every board lane (Dice, Adzuna, Himalayas, browser-board and
   email-alert imports) applies it at import so out-of-region roles are never written to
   the database. Jobs whose location the board did not report are kept and labelled
   `No location`, since filtering on missing data would discard roles for want of it.
6. Listings outside the selected fresh-posting window are filtered out.
7. Duplicates are skipped. A listing at a **URL already in the app** is always a duplicate.
   A *new* URL for a role already in the app (same company + title + location) is a
   duplicate only while that existing row is still live — the same role arriving through
   another lane in the current cycle. Once the user has closed the earlier row out
   (**Applied**, **Rejected**, **Skipped**, **Archived**), a new URL is treated as a
   **re-post**: the company opened a fresh requisition, so the listing is imported and
   counted in `repost_count`. This is what keeps a re-opened role from being hidden
   forever behind a requisition the user already dealt with months ago.
8. New jobs are written to the `jobs` table with `status = found`.
9. A `scan_runs` record is created with metrics.
10. The Dashboard updates with a combined scan summary across company career sites, Dice, and Adzuna when configured.

**Scan progress and results dialog** (Dashboard “Scan for new jobs” and Settings → Sources per-company scan): while the Dashboard scan runs, the modal receives live server progress and shows the actual state of the company career-site, Dice, and Adzuna lanes. Parallel lanes can be marked **Scanning now** at the same time; each changes to **Complete**, **Skipped**, or **Stopped** as its state changes. The current activity is exposed through a polite, atomic live region for screen readers. Adzuna is shown as skipped when it is not configured.

The results header shows count badges: run status, **N new in app**, **N found at source**, **N sources scanned**, **N skipped**, **N filtered by profile rules**, **N duplicates skipped**, and **N re-posts of a closed role** (shown only when non-zero — new listings that re-open a role the user had already applied to, rejected, skipped, or archived).

The results view is scrollable when there are many errors or new listings. Each error shows a **category badge** — *Dead or missing* (404/410, bad URL, unknown host), *Timed out* (no response within the fetch limit; the board may still be live), or *Other error*. A summary line counts how many sources reported issues, how many can be disabled as YAML/custom career sources, and a breakdown by category. **Select all** / **Clear selection** / **Disable selected** bulk-update `scan_source_overrides`; per-row **Disable** does the same for one company. Aggregator-only rows (e.g. **Adzuna**) are not disabled as career sources — the UI points to AI Provider settings instead.

The Jobs page can also verify whether saved postings still exist. The liveness
check updates `liveness_status` but does not automatically archive or delete
anything. Expired jobs with no user activity are shown for confirmation, and
confirming **archives** them rather than deleting them.

**Removal protection** (`src/lib/jobs/job-protection.ts`). A job is protected from
automatic removal when any of these hold:

- it is already archived;
- it has user activity — reviewed, skipped, resume-generated, or applied;
- it was discovered within the last day (`DISCOVERY_GRACE_DAYS`). Boards that
  challenge bots routinely look expired on one check and active on the next, so a
  posting a scan found this morning is never swept the same afternoon.

Protected jobs are kept unless the user explicitly selects and deletes them. The
maintenance panel reads this decision from the server rather than re-deriving it,
so the "kept" and "can be cleaned up" counts always match what the server will do.

**Liveness evidence quality** (`src/lib/scanner/liveness-checker.ts`). Only HTTP
404/410 and explicit expiry copy mark a posting expired. Two host lists soften
that where unauthenticated checks are unreliable:

- *Session-gated hosts* (LinkedIn by default) serve login walls and generic
  "no longer accepting applications" copy for roles that are still open, so no
  text-based verdict from them is trusted — only a hard 404/410 counts.
- *Ambiguous hosts* (Monster by default) can return HTTP 200 challenge pages, so a
  pattern-free 200 falls back to `uncertain` instead of `active`.

Both lists can be extended locally via `config/liveness-hosts.local.json`
(gitignored; see `config/liveness-hosts.example.json`).

The Jobs table also re-checks current profile preferences at render time and is
refreshed after Preferences or Constraints are saved. Jobs that still fit show
`Match` in the Preference column; jobs that no longer fit show `Out of scope`.

Location matching uses the selected Location mode checkboxes, and each mode reads
a **different** location list (`src/lib/jobs/preference-fit.ts`):
- `Remote` includes remote opportunities whose region is in the **remote
  regions** list. An empty remote list accepts remote roles from anywhere.
- `Hybrid` includes hybrid opportunities only when the posting location matches
  one of the **on-site / hybrid locations**.
- `On-site` includes on-site opportunities only when the posting location matches
  one of the **on-site / hybrid locations**.

The two lists are independent by design. Before they were split, one list drove
both, so a user who would commute only within Nashville but would take a remote
role anywhere in the US or Canada had no way to say so: adding `Canada` to reach
remote-Canada roles also admitted on-site Toronto offices, and omitting it
rejected the remote roles.

Three rules make "matches one of the on-site / hybrid locations" behave the way
postings are actually written:

- **Multi-location postings are split.** ATS boards routinely pack several
  locations into one field — `San Francisco, CA • New York, NY • United States`.
  The field is split on `•`, `·`, `|`, `;`, and newlines, and the job is accepted
  when **any** listed location qualifies. Commas are *not* split on, because they
  separate parts within a single location (`San Francisco, CA`). Splitting
  happens on the raw string, before normalization strips the separators.
- **A bare country label means country-wide, not on-site.** A posting whose whole
  location is `United States`, `USA`, or `US` is available across that country
  and is accepted for any preference inside it. Without this, such postings have
  no `remote` token, fall through to the on-site branch, and are rejected as
  "outside preferred locations" — which silently dropped most US-wide remote
  roles. Country detection uses a country-only alias list, deliberately separate
  from `LOCATION_ALIAS_GROUPS`, whose `united states` entry folds in all 50 state
  aliases and would otherwise classify `Ohio` as country-wide. A trailing country
  on a city (`Chicago, Illinois, United States`) is still treated as on-site.
- **The user's home metro matches a state-level preference.** Metro labels such
  as `Nashville Metropolitan Area` contain no state token, so a preference of
  `Tennessee, United States` misses them. When the profile's own `location`
  already falls inside a preferred region, its city name is added as an accepted
  alias. The gate matters: someone living outside their target region does not
  silently pull in local roles.

- **Remote roles restricted to a region the user cannot work in are rejected.**
  A posting limited to `Germany (Remote)` or `Remote - Europe` is not accepted
  merely for being remote. This rule reads the **remote regions** list only, so
  it is independent of where the user would commute. The rule is deliberately
  *permissive*: it only rejects when the restriction **names a recognised region**
  and none of the named regions are in scope. An unrecognised remainder —
  "Anywhere in the World", "27 Locations, Remote" — counts as unrestricted,
  because guessing wrong silently discards good roles, which is the failure this
  filter has already caused once. An empty remote regions list likewise means "no
  restriction". A region inside an accepted country stays in scope, so
  `Remote (California)` and `Georgia (Remote)` are accepted when the remote list
  contains the United States, even though Georgia is also a country.

  Matching is by **overlap, not containment**, in both directions. A posting may
  name something *inside* an accepted region (`Germany` within `Europe`) or
  something *wider* than it — someone authorized only in the EU can take a role
  advertised across `Europe` or `EMEA`, and a US-only candidate can take one
  advertised across `North America`. Requiring containment discarded both.

  A term that positively asserts no restriction — `anywhere`, `worldwide`,
  `world wide`, `global`, `distributed` — outranks any place names beside it.
  Postings routinely read "remotely world wide, joining us from offices in San
  Francisco, Germany, Austria"; those are the company's offices, not a
  restriction. `remotely` and the spaced `world wide` are recognised alongside
  `remote` and `worldwide`, since neither was matched as a token before.

- **A posting with no reported location is never judged on location.** Boards
  frequently omit the field, and the value arrives as `Not specified`. Treating
  that as a location mismatch would discard roles for want of data — the same
  principle as the unrecognised-remainder rule above. Such jobs are kept at
  import and shown as `No location` rather than `Out of scope`. One helper,
  `isLocationReported`, backs both the importer and the render-time label so the
  two cannot drift.

  The place-name vocabulary comes from `Intl.DisplayNames`, which supplies ~264
  ISO 3166 region names from the runtime's own CLDR data, plus a short list of
  supra-national regions ISO omits (`europe`, `emea`, `apac`, `latam`, …). This
  avoids hand-maintaining a world list that would rot. Sampled against a live
  Himalayas feed it recognised all 139 distinct restriction values while
  correctly ignoring non-geographic text.

Covered by `src/lib/__tests__/preference-fit.test.ts` and
`src/lib/__tests__/title-filter.test.ts`, which use verbatim location strings and
job titles from real postings as fixtures.

**Configuration:**
- Built-in sources: enable/disable per company in Settings → Job Sources.
- Custom sources: add any careers page URL.
- Title filters: positive list (must match) and negative list (exclude if matched).
  Matching lives in one place, `src/lib/jobs/title-filter.ts`, shared by the
  CareerOps, Dice, Adzuna, and Himalayas lanes — it previously existed as four
  near-identical copies that had to be fixed in lockstep.
  - **Positive keywords must start at a word boundary.** Plain substring matching
    made short keywords greedy: `ux` matched "Lin**ux**", "BENEL**UX**", and
    "L**ux**embourg", which accounted for 3 of 12 results in one live Himalayas
    import. Only the start is anchored; the end stays open so `product design`
    still matches "Product Designer" and `ux research` still matches
    "UX Researcher". Verified against 140 previously-imported jobs: zero
    legitimate matches lost.
  - **Negative keywords stay plain substrings** on purpose — they are meant to be
    greedy, so `intern` also catches "Internship". A check over 2,629 real titles
    found no case where that greediness rejected a wanted role.
- Profile filters: selected location modes, on-site / hybrid locations, and
  remote regions constrain scan inserts.
- **Settings → Sources table:** Above the table, counts show **sources total \| enabled** (enabled reflects optimistic checkbox toggles until the server round-trip completes). **Scan all enabled** runs the same full CareerOps job fetch as the Dashboard scan’s ATS leg: every **enabled** source is queried in parallel, independent of any prior “Validate sources” result — use it after re-enabling boards or when you want a fresh pull without opening the Dashboard. **Scan jobs** on a single row calls the same scanner with `companyExact` for that company **even when the row is disabled**, so you can verify a careers URL before turning the source back on. The **Live** column uses the same sort/filter header pattern as the other data columns; until **Validate sources** has been run, Live shows **Not validated** for each row.

**Performance tuning constants** (in `src/lib/scanner/careerops-scanner.ts`):
- `CONCURRENCY = 20` — parallel ATS API requests.
- `ATS_JOB_LIST_FETCH_MS = 60_000` — per-source ceiling for the full job-list
  request: HTTP response **and** `response.json()` parsing. Large Ashby boards
  often need far more than a few seconds to download JSON; the previous 12s
  budget could mark live boards as timed out. (`jd-fetcher.ts` still uses
  `FETCH_TIMEOUT_MS = 12_000` for individual job-description fetches.)
- `ATS_JOB_LIST_FETCH_RETRIES = 1` — on timeout/abort, one immediate retry after
  a short pause (transient CDN saturation).

**Posted dates per ATS** (`parseGreenhouse` / `parseAshby` / `parseLever`):
Greenhouse supplies `updated_at` and Ashby supplies `publishedAt`; Lever's public
postings API exposes no date, so Lever jobs are always `unknown-date` and are never
filtered as stale. `parseAshby` previously read a `publishedDate` field the posting
API has never returned, which left **every** Ashby job undated — so Ashby listings
bypassed the fresh-posting window entirely. With the correct field in place, Ashby
jobs are now subject to the selected freshness window like every other source; a
72-hour window will drop Ashby postings older than three days that used to slip
through as undated.

**Pruning dead sources:** `npx tsx scripts/prune-dead-sources.ts` validates
every enabled source (YAML + custom) and writes `scan_source_overrides` rows
to disable any that return HTTP 404 in pass 1, plus any that are unreachable
in both passes. Disabling is non-destructive — sources can be re-enabled
from Settings → Job Sources. Useful after a bulk source-discovery import,
which tends to add many slugs that do not actually exist on the ATS host.

---

## Browser Job Board Scanner (Claude and Codex Integration)

An optional feature for users with Claude Desktop or Codex Chrome. An agent discovers job-board results on your behalf and writes them directly into Job Search Terminal — no copy-paste required. Supported sources are LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, Monster, and **Dice** (MCP-powered, no browser needed).

**How it works:**
1. Ask Claude or Codex to scan LinkedIn, Wellfound, Work at a Startup, Glassdoor, Indeed, Monster, or Dice
2. The agent reads your target roles and location preferences from the JST database
3. For browser boards: the agent opens the board in Chrome and extracts matching visible postings. For Dice: the agent calls the Dice MCP `search_jobs` tool directly — no Chrome extension or login needed
4. A JSON file is written to `data/job-board-imports/` (`data/linkedin-imports/` remains supported for legacy LinkedIn files)
5. Job Search Terminal detects the file, imports jobs with duplicate detection, and shows a notification

---

## Dice MCP Scanner (In-App, No Credentials)

Dice is a tech-focused job board. JST integrates with Dice via Dice's free, public MCP server (`https://mcp.dice.com/mcp`) — no API keys, no browser extension, and no login required.

**How it works:**
1. Open Settings → Sources → Job aggregators
2. Click **Scan with Dice**
3. JST calls the Dice MCP `search_jobs` tool over HTTP with your target roles, on-site / hybrid locations, and remote preference from your profile. The remote regions list does not shape the query — it is applied as a filter at import.
4. Results are filtered by your title filters, written to `data/job-board-imports/dice-jobs-<timestamp>.json`, and imported automatically. Jobs outside your location preferences are dropped at import rather than written and labelled
5. New jobs appear in the Jobs table with a **Dice** source badge

**What it covers:** Tech roles on Dice including software engineering, data, DevOps, security, and product. Results are filtered to the past 7 days and up to 50 jobs per scan.

**Scan type recorded:** `dice-mcp-scan`. Jobs appear in the Jobs table with a **Dice** source badge.

**Implementation:** `src/lib/scanner/dice-scanner.ts` — contains a minimal MCP streamable-HTTP client and the scan/import orchestration.

---

## Himalayas Remote Board Scanner (In-App, No Credentials)

Himalayas is a remote-only job board with a large public feed (~97,000 live
postings, ~2,900 added per day). No key or login is required. It runs
automatically as a lane of the Dashboard scan alongside CareerOps, Dice, and
Adzuna.

**Two API constraints shape the implementation** (`src/lib/scanner/himalayas-scanner.ts`):

- **No server-side filtering.** `search`, `category`, and similar parameters are
  accepted and then ignored — every query returns the same feed. Verified
  directly: `?search=designer` and `?category=design` return results identical to
  an unfiltered call. Titles are therefore filtered client-side with the same
  positive/negative lists the other lanes use.
- **`limit` is hard-capped at 20** regardless of the value requested.

**Why it is still viable:** the feed is strictly newest-first, so a scan reads
the newest pages and stops instead of walking all ~4,800. `MAX_PAGES` (60) covers
the newest ~1,200 postings — roughly ten hours at the observed rate, comfortably
ahead of the six-hour schedule.

**Partial sweeps are reported.** In practice the page cap, not the freshness
cutoff, ends the walk: a 72-hour window would need ~435 pages. When the cap is
hit before the cutoff, the run records that older postings were not seen, rather
than reporting a clean result. Three consecutive page failures abort the walk so
a degraded API is not hammered.

**Data handling:**
- `pubDate` is UNIX epoch **seconds**, not milliseconds.
- The API emits raw control characters inside JSON strings, which `JSON.parse`
  rejects. `parseHimalayasPayload` sanitises them before parsing.
- `locationRestrictions` is a country array. Empty means unrestricted and maps to
  `Remote`; otherwise each country is emitted as `<Country> (Remote)` joined with
  `; ` so the preference filter's multi-location splitting evaluates each one.
  Those countries are matched against the profile's **remote regions** list at
  import, so a country outside it is dropped rather than written to the database.
  This lane sends no location to the API — it cannot filter server-side — which
  makes it the one most dependent on that import-time check.

**Measured yield:** a live run read 1,158 recent postings in ~28 seconds and
matched 12. Three were `ux` substring false positives ("Lin-ux", "BENEL-ux") and
two were EU-restricted remote roles; both classes are now filtered out upstream,
leaving 7 genuine design roles.

**Scan type recorded:** `himalayas-api-scan`. Jobs appear with a **Himalayas**
source badge.

**Sources evaluated and rejected:** Remotive and RemoteOK were tested and are not
viable. Remotive's entire public feed is 34 jobs spanning twelve unrelated
categories with its filters ignored, of which one is Design. RemoteOK's feed is
100 jobs, of which two match a design pattern and neither is a product/UX role.
Both also carry link-back terms aimed at republishing sites. Neither is worth a
lane.

---

## Adzuna Job Aggregator (Direct API Scanner)

Adzuna is a job aggregator that indexes listings from many sources including Indeed, CareerBuilder, and direct employer feeds. Unlike browser-board scanning, Adzuna requires no browser or logged-in session — the app queries its public API directly.

**How it works:**
1. Register at [developer.adzuna.com](https://developer.adzuna.com) for a free App ID and API Key (free tier: 2,000 queries/month)
2. Paste both keys in Settings → AI Provider → Discovery & Aggregators
3. Open Settings → Sources — the Job aggregators card appears at the bottom
4. Click **Scan with Adzuna**; clicking opens a blocking `ProgressModal`
   ("Scanning Adzuna" + spinner). On completion the modal shows "Found N
   listings — X new, Y duplicates." and a **View N found jobs** action that
   opens the refreshed Jobs page. The modal can also be dismissed with Close.
5. New jobs enter the same import pipeline as browser-board scans — duplicate detection, title filtering, and source badges all apply

**What it covers:** Adzuna aggregates from multiple sources and covers roles that may not appear in direct ATS portals or browser-board searches. It is best used alongside browser-board and CareerOps ATS scans.

**Limits:** Up to 5 target roles × 3 locations per scan, 50 results per query, and the selected fresh-posting window (24 hours, 72 hours by default, or 7 days). Adzuna's coverage varies by country (default: `us`).

**Scan type recorded:** `adzuna-api-scan`. Jobs appear in the Jobs table with an **Adzuna** source badge.

**UI indicators on the Jobs table:**
- **LinkedIn**, **Wellfound**, **Work at a Startup**, **Glassdoor**, **Indeed**, **Monster**, **Dice**, **Adzuna**, or **Himalayas** badge (neutral gray) — source column — identifies jobs discovered via browser-board scans, MCP scans, or aggregator API scans
- **Manual** badge (neutral gray) — source column — identifies jobs added manually via the Add Job modal
- **Duplicate** badge (amber, clickable) — flagged jobs whose URL or company+title already existed in the database. Clicking the badge instantly filters the table to show only duplicate-flagged jobs. Clicking again clears the filter.
- **Source** column — filterable and sortable; options are "LinkedIn", "Wellfound", "Work at a Startup", "Glassdoor", "Indeed", "Monster", "Dice", "Adzuna", "Himalayas", "Manual", and "Scanner"

**URL behavior:** Browser-board imports prefer a visible job-specific employer/ATS apply URL. If one is not available, the platform job URL is used and preserved as provenance.

**Duplicate detection:** Jobs are marked as possible duplicates (not dropped) when their original posting key, URL, or company+title+location matches an existing record. The user can review and act on flagged jobs normally.

**Adzuna URL stability:** Adzuna's API returns session-scoped redirect URLs that include tracking tokens which change on every API call. The importer normalises these to a stable canonical URL (`https://www.adzuna.com/land/ad/<id>`) so the same job always maps to the same database record across scan runs, preventing previously-imported Adzuna jobs from appearing as new. The same stable ID is also used for within-scan deduplication when the same listing appears under multiple search queries.

**Import notification:** A fixed-bottom green alert appears on the Jobs page within 30 seconds of a completed import, showing the count of new jobs and duplicates. Auto-dismissed after 5 minutes.

**Requirements:** Claude Desktop with Claude in Chrome, or Codex with the Codex Chrome Extension. The user must already be logged into boards that require a session. Dice is the exception — it uses an MCP server (`https://mcp.dice.com/mcp`) and requires no browser extension or login.

**Full documentation:**
- User guide: `docs/linkedin-scanner-guide.md`
- Technical reference: `docs/browser-board-scanner-technical.md`
- Agent instructions: `CLAUDE.md` and `AGENTS.md`

---

## Shared UI Patterns

### `Modal` (`src/components/ui/modal.tsx`)

A reusable dialog shell used for form-entry and action-confirmation dialogs. It
provides the overlay, dialog frame, header, scrollable body, optional sticky
footer, Escape-key handling, and accessibility attributes so individual
components don't repeat that boilerplate.

**Props:** `open`, `onClose?`, `title`, `description?`, `size?` ("sm"|"md"|"lg"),
`sheet?` (bottom-sheet on mobile, centered on desktop), `children`, `footer?`.

- When `onClose` is provided, the X button appears in the header and Escape
  closes the modal. When omitted (e.g. during a pending submission) neither is
  active.
- `sheet` produces `items-end sm:items-center` alignment with no padding on
  mobile and `rounded-t-panel sm:rounded-panel` corners — the standard
  bottom-drawer pattern.
- Non-sheet modals are always centered with `rounded-2xl`.

**Used by:**
| Component | `size` | `sheet` | Purpose |
|---|---|---|---|
| `AddJobModal` | lg | — | Add job manually form |
| `EditJobModal` | lg | — | Edit job details form |
| `GapAddressingPanel` | md | ✓ | Address gap / add detail (two-phase modal) |
| `ProfileSupplementsEditor` | md | — | Follow-up evidence detail per supplement |

---

### `ProgressModal` (`src/components/ui/progress-modal.tsx`)

A reusable blocking progress dialog used by all AI generation and long-running
data-fetch actions. It wraps the same visual pattern established by the "Scan
for new jobs" modal.

**States:**
- **Running** (`phase="running"`): spinning border circle + title + primary
  message + optional `statusLine` (animated pulse, used for streaming labels
  like current research axis) + optional `subtitle` (smaller muted text).
  The backdrop is not clickable; the modal cannot be dismissed.
- **Done** (`phase="done"`): shows `children` (success content) or an `error`
  string in a danger callout. An X button appears in the header and a Close
  button appears in the footer; clicking either or the backdrop closes the
  modal.

**Props:** `open`, `phase`, `title`, `message`, `subtitle?`, `statusLine?`,
`error?`, `children?`, `onClose`.

**Used by:**
| Action | Title | Success message |
|---|---|---|
| Evaluate N selected jobs | "Evaluating N jobs" | "{N} evaluated successfully" |
| Verify active postings | "Verifying active postings" | Badge summary + "close to take action" |
| Extract profile with AI | "Extracting profile with AI" | "{N} skills extracted" |
| Scan with Adzuna | "Scanning Adzuna" | "Found N listings — X new, Y duplicates" |
| Start/Re-research | "Researching company" | "Research complete — scroll down…" |
| Generate/Regenerate outreach | "Generating outreach messages" | "3 messages ready — scroll down…" |
| Prepare application answers | "Preparing application answers" | "Answers prepared — scroll down…" |

---

## Data and Privacy

- All data is stored locally in `data/job-search-terminal.sqlite` on the user's machine.
- No data is sent to any server except AI provider API calls (evaluation,
  generation, etc.).
- The database file is excluded from git.
- Portable account backup: Account → Settings → Data & Backup creates a `.jst-backup`
  archive with the database, database-referenced resume lane files, generated documents, source
  configuration, and scanner history. Optional password protection encrypts the
  complete payload. Creation streams files into the archive and shows a
  `ProgressModal` (cycling through three phase labels) while the local snapshot
  is packaged. Other files under `assets/` are always ignored.
- Restore: Account → Settings → Data & Backup validates the archive, previews its
  contents in a bounded disk staging area, creates a rollback backup, then
  replaces the managed local snapshot after explicit confirmation.
- Database-only backup: `npm run data:backup` writes a SQLite snapshot to
  `output/backups/`.
- Export: `npm run data:export` writes a JSON snapshot to `output/exports/`.
- To reset all data: `npm run db:reset` (drops local data and initializes an empty profile).
