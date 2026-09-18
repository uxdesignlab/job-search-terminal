# Changelog

Every user-visible change to Job Search Terminal, newest first.

The version you are running is shown in the footer of every page, next to the
commit it was built from. See [Versioning](#versioning) at the bottom for what
the numbers mean and when they change.

> **On the entries before 0.11.0.** Job Search Terminal was built for four
> months before it kept a changelog. Those releases were reconstructed from the
> git history on 2026-08-29 and grouped at the points where the product visibly
> changed shape. The dates and the boundary commits are exact; the summaries are
> written after the fact and are deliberately broad rather than falsely precise.
> No release before 0.11.0 was tagged at the time.

---

## 0.17.0 — 2026-09-18 — Clear old jobs with confidence

**Added**

- Review and bulk archive untouched Found jobs whose postings are unavailable, or
  jobs saved 30+ days ago whose availability cannot be verified. Check progress,
  stop a run, inspect the reasons, and restore archived jobs when needed.
- Select or clear a range of jobs with Shift-click or Shift+Space in Jobs and the
  cleanup preview.

**Changed**

- Deliberate work permanently protects a job from cleanup, even if its status
  returns to Found. A migration runs on next start; existing saved work and
  recorded activity are used to protect older jobs. Unrecorded past actions cannot
  be recovered. Run verification again to get the new evidence checks.
- Cleanup always requires your selection and confirmation. The out-of-scope
  permanent-delete shortcut has been removed from maintenance.

**Fixed**

- A working job-board page or generic Apply button no longer proves that a role
  is still open. Old unverified listings are kept distinct from closed postings.
- Select all now reflects only the displayed rows, including partial selection.

## 0.16.5 — 2026-09-14 — Summaries built on your approved version

**Changed**

- **The AI tailors your summary from the one you approved.** 0.16.4 told it mainly to
  keep your numbers and add none. That was the wrong focus: the real problem was that it
  threw your summary away and wrote a new one. Now your approved summary is the starting
  point. The AI keeps who you are and what you lead with, and moves the focus and wording
  toward the job, following the same resume writing rules as the rest of the resume.
  Generate the resume again to get the new summary.

## 0.16.4 — 2026-09-14 — Summaries that stay yours

**Fixed**

- **A tailored summary stays close to the one you approved.** The AI rebuilt the
  summary from the rest of your resume. So figures you had taken out, like team sizes
  from your experience section, came back in. It is now told to keep your sentences and
  their order, and to add no numbers your approved summary leaves out. This is an
  instruction to the AI, not a hard check, so review the draft. Generate the resume again
  to get the new summary.
- **The summary heading matches your approved resume.** Generated resumes always printed
  "Professional Summary", even when your approved resume called the section "Summary".

## 0.16.3 — 2026-09-13 — Salary research reaches AI answers

**Fixed**

- **AI-drafted application answers now use the salary research.** When a paid AI
  service writes your answers, it never saw the market research the app does for a job
  with no posted range, so drafting again later could not include it. It now does, once
  the research has finished, and it still leads with your own target and quotes no figure
  that is not in your target, the posting, or the research.
- **Salary answers ignore research for a job you have since edited.** If you change a
  job's title, location, or salary notes after making its resume, the saved research
  describes the old role; application answers now leave it out until you make the resume
  again.
- **A local model that runs out of time during a fallback now stops.** When Ollama took
  too long and the app moved on to another service, Ollama kept working in the background
  and made anything else waiting for it wait longer.

---

## 0.16.2 — 2026-09-13 — Tidying up after a stop

**Fixed**

- **Stopping a resume stops your local model too.** Parts waiting for their turn on
  Ollama used to start anyway after the resume had finished or you pressed Stop, keeping
  your computer busy and making the next job wait. They are now skipped, and a part
  already running is cancelled.
- **A late salary result no longer overwrites newer resume preparation.** If you made a
  resume for the same job twice in quick succession — in two tabs, say — the first run's
  salary search could finish last and put back that run's older requirements and
  keywords. It now fills in only the salary details.
- **The salary answer is honest while research is still running.** It used to say market
  research was unavailable when it simply had not finished. It now says so, and Help
  explains how to draft the answer again to include the research.

---

## 0.16.1 — 2026-09-13 — Fixes from review

**Fixed**

- **A slow salary search no longer holds up your resume.** 0.15.0 started the search at
  the same time as reading the posting, but still waited for it to finish, and the search
  has no time limit of its own. The app now waits a few seconds at most; the search
  finishes on its own and is saved for your application answers.
- **If a paid service fails partway through a resume and the app falls back to your local
  model,** the remaining parts now take turns instead of all arriving at once, where your
  local model could drop some of them and leave those sections untailored.
- **A summary your approved resume left blank is now written** from the rest of the
  resume, instead of the draft quietly having no summary. ↻ Regenerate also works on a
  section whose box you have emptied.
- **ATS & recruiter checks ignore sections you removed.** Text in a removed section could
  make a check pass even though it would not appear on the exported resume.
- **Resume writing uses offers your local model only once it is switched on and
  answering.** On a setup with no local model it was offered anyway, and choosing it made
  every resume try it first.
- The help page now says that Awards and recognition has ✨ Improve only.

---

## 0.16.0 — 2026-09-13 — Resumes a recruiter reads twice

**Added**

- **↻ Regenerate on any section.** Next to ✨ Improve on the summary, key
  achievements, skills, custom sections, and each job, Regenerate writes that one part
  again from your approved resume. You no longer have to regenerate the whole resume to
  fix one job's bullets.
- **Add instruction.** Tell Improve or Regenerate what to change — "shorter", "lead with
  the accessibility work" — instead of asking again and hoping.
- **See where each new line came from, and undo.** A suggestion can show each rewritten
  line next to the line it was written from, and **Undo accept** puts back what was
  there before.
- **A warning before a full regenerate replaces your draft.** Generating again for a job
  that already has a draft now says it will replace the draft and your edits, and points
  you to regenerating just the section you want. The progress window also shows how long
  the last draft for that job took.
- **ATS & recruiter checks.** A list in the resume editor shows what a tracking system
  or a recruiter is likely to stumble on: the role you are applying for not named near
  the top, must-have words only in your skills list, a word repeated until it looks
  stuffed, a missing email or phone number, section names those systems do not
  recognise, mixed date formats, and hype, self-rating, first person, over-long bullets,
  or bullets that all start the same way. It updates as you type, and it never asks for
  a skill your evidence does not show.

**Changed**

- **Each part of your resume is written on its own.** Every job, your key
  achievements, and your skills are written separately, and the summary is written last
  from what they became — so it describes the resume you are sending. A part that fails
  keeps your approved wording and is named in the editor; the rest of the resume is
  still tailored. Before, one bad answer left the whole resume untailored.
- **Bullets are ordered by relevance to the job.** The AI puts the lines that matter
  most for this posting first. Nothing is dropped.
- **The writing is held to a standard, not just asked for one.** Each part is checked
  for hype, self-rating, first person, length, and repeated openings, and sent back once
  to be fixed if it breaks a rule.
- **Missing job language goes where it fits, once.** A must-have phrase your evidence
  supports is placed in the one job or section it belongs to, instead of being worked into
  every part — and in ordinary sentence case, never bolted onto the end of a sentence.
- **Your summary leads with the closest title you have actually held** to the one being
  hired for, in the posting's words, without claiming the posting's title itself.
- **✨ Improve now reads the job posting and your evidence**, and its suggestions go
  through the same claim checks as a generated resume. It keeps what you typed yourself.
- A keyword added to a skills list written as *Category: skill, skill* now joins the
  right category line, instead of appearing as a lone word underneath.
- The progress window names each part as it is written.
- On a paid service several parts are written at once. On a local model they are written
  one after another, so a resume with many jobs takes longer locally than in 0.15.0 —
  choose a paid service under **Resume writing uses** if speed matters more.

**Fixed**

- ✨ Improve could invent numbers. It asked for "measurable" bullets and "compelling"
  summaries without seeing your evidence, and nothing checked what came back. In the
  resume builder, where there is no job posting, Improve now keeps existing numbers and
  adds none.

---

## 0.15.0 — 2026-09-13 — Resumes in minutes, not five

**Added**

- **Choose which AI service writes your resumes.** Account → Settings → AI Provider
  now has **Resume writing uses**. Keep scoring jobs on a free local model and have a
  paid service write the resume, which is usually much faster and better. Left on
  *Same as provider priority*, nothing changes. Picking a paid service sends your
  resume text, gap answers, and the job posting to it whenever you generate or improve
  a resume.
- **You can watch a resume being made, and stop it.** The generate window lists each
  step as it happens — reading the posting, writing, checking claims, saving — names the
  AI service doing it, and shows how long it has been running. **Stop** gives up without
  saving anything, and your previous draft stays as it was.
- **The draft says what made it.** The editor header reads, for example, *Generated in
  58s with OpenAI (gpt-5.6)*.
- **When a paid service runs out of credits, the app says so and keeps working.** A bar
  across the top of every page names the service and which one is being used instead. The
  app skips the empty service and moves on to the next one in your list, including Ollama.
  If nothing is left, the bar turns red and AI actions explain exactly what to do. A
  passing **Test connection** clears it.

**Changed**

- **Resumes are much faster on a local model.** The app now switches off the model's
  hidden "thinking" for resume work, which was most of the wait. The same resume that took
  5 minutes 4 seconds took 2 minutes 22 seconds on the same computer, and 46 seconds to
  regenerate. ✨ Improve speeds up the same way.
- The salary search that runs while a posting is read no longer holds up the resume.
- The AI is given the parts of your resume it is not rewriting, and the posting's
  requirements in a short list, instead of a cut-off copy of your PDF. The later
  sections of the PDF — often skills and education — were being cut first.
- Years of experience ("6+ years of experience") and work arrangements ("Remote",
  "Hybrid") are no longer treated as resume keywords. They were steering the rewrite and
  counting against your keyword alignment. Existing jobs are cleaned up automatically, so
  your alignment percentage on some drafts may change.

**Fixed**

- If you use only Ollama, resumes are now actually tailored. The app checked for a paid
  service's key before tailoring, so an Ollama-only setup always got your resume back
  unchanged.
- An empty OpenAI account was reported as "rate limit reached — wait a moment", advice
  that could never work. An empty Anthropic account stopped the app from trying your next
  service at all.
- When a busy local model gave up after five minutes, the app now tries your next
  service instead of quietly returning an untailored resume.

The first start after updating adds a few new columns and a table to your database. It
runs on its own and nothing needs re-running.

---

## 0.14.0 — 2026-09-10 — Adzuna searches for words that exist

**Fixed**

- **Adzuna finds jobs again.** It had returned nothing at all since 17 August. The
  app was searching it with your full job titles, and Adzuna wants every word you
  give it to appear in the job title — so "VP of User Experience and Web
  Management" matched no posting anywhere in the country, and neither did any of
  the others. It now searches using the title keywords from Account → Settings →
  Preferences → Title filters, which are short enough to match. If you have no
  keywords set, it falls back to your target roles as before; adding a few short
  ones is worth doing.
- **A scan that finds nothing now says so.** When Adzuna came back empty the app
  recorded nothing at all — no history entry, no error — so a source that had gone
  dead looked exactly like one that simply had no new jobs that day. That is why
  three weeks passed before anyone noticed. Empty scans are now written to your
  scan history like any other.
- **Scan with Adzuna** in Settings → Sources was skipping your title filters
  entirely, so it imported jobs the Dashboard scan would have ruled out.

**Added**

- Adzuna now also searches the whole country, not only your on-site location.
  Adzuna never labels a job as remote, so a role open from anywhere was
  unreachable — the app searches nationwide and lets your Remote regions setting
  decide what to keep. Expect a modest gain rather than a flood: your own location
  and how many places are hiring still set the ceiling.
- The scan progress window names each Adzuna keyword as it searches and how many
  jobs came back, so a keyword that finds nothing is visible while it happens.
- The scan summary shows **N outside your locations** when jobs were found and
  then ruled out by your location preferences — previously that number was
  counted and thrown away, leaving "47 found, 0 imported, no errors" with no
  explanation.
- A new troubleshooting entry, **Adzuna never finds anything**, in Help →
  Troubleshooting.

**Changed**

- An Adzuna scan now makes 8 searches: your first four title keywords, each run
  once against your location and once nationwide. The previous shape was up to
  five roles across three locations. The cap keeps a free Adzuna key inside its
  2,000 searches a month.

---

## 0.13.3 — 2026-09-08 — Fetch description actually fetches

**Fixed**

- **Fetch description** works on jobs found through a company's Greenhouse board.
  Greenhouse hands back the employer's own careers link rather than a job-board one,
  and the app could not tell which board to ask, so it quietly did nothing. Of the
  jobs saved from Greenhouse, most had no description at all — which also means they
  were scored without one.
- The button says what actually happened. It used to show **Saved ✓** whenever it
  finished, whether or not anything had been saved, so a fetch that came back
  empty-handed looked exactly like one that worked, while the card underneath went on
  saying the description was missing. Now it names the problem: the posting is not on
  a board the app can read, the board had no description for it (usually a job that
  has been taken down), or the board could not be reached just now.
- Fetched Greenhouse descriptions are readable text. They were being saved as a
  jumble of angle brackets and code, and that is what the AI was reading when it
  scored those jobs. Descriptions already saved are not repaired automatically —
  **Troubleshooting** in Help has the two-minute fix for a job worth re-scoring.

## 0.13.2 — 2026-09-08 — A lighter Jobs page

**Fixed**

- The Jobs page no longer sends every job's full posting description and
  evaluation to your browser just to draw a table that shows neither. With 600
  jobs saved the page was a 9.9 MB download; it is now 1.5 MB, and Jobs and
  Archived both become clickable sooner. This is also what was causing the red
  "Hydration failed" box: at 9.9 MB it appeared on roughly half of page loads,
  and after the change it did not come back across eighteen loads in a row.

**Changed**

- On a phone, the Jobs page now lists the 50 strongest matches rather than every
  saved job, with a line underneath saying how many there are in total. Sorting
  and filtering were never available on that list — they live in the table you
  get on a wider screen — and rendering all 600 cards was half the weight of the
  page for everyone, including the people who never saw them.

## 0.13.1 — 2026-09-06 — Whole regions you can actually pick

**Fixed**

- Remote regions now offers regions. Type `Europe`, `EU`, `APAC`, `Latin
  America`, or any of the other fifteen and they appear at the top of the
  suggestions under a **Regions** heading, each with a line saying what it
  covers. Picking one accepts remote roles from every country in it. The app had
  understood these all along and the hint text told you to type one — but the
  only suggestions on offer came from OpenStreetMap, which answers `EU` with a
  French commune and `APAC` with a town in Uganda, and the **Add typed location**
  button you were pointed at sat underneath the dropdown showing them.
- **Add typed location** moved next to the box it belongs to, so a full set of
  map suggestions can no longer cover it.
- Pressing Enter in either location box adds what you typed. It used to do
  nothing.
- A typed shorthand is saved under its full name — `eu` becomes `European
  Union`, `LATAM` becomes `Latin America` — so the list says what it covers.
- Regions already on your list are no longer suggested again, however you first
  spelled them. A list holding `EU` no longer offers you `European Union` as if
  it were a different place.
- `Americas` and `Latin America` now cover every Caribbean country, not the
  largest eight. A remote role in Antigua, Dominica, or the Caymans was being
  ruled out by a setting that said it covered the Caribbean.

**Changed**

- The hint under Remote regions no longer recites all fifteen region names. The
  picker shows them, along with what each one covers, which the hint never did.

Nothing needs re-scanning. Your saved locations are untouched; the change is in
what the picker offers you next time you edit them.

---

## 0.13.0 — 2026-09-03 — Every position at one company

**Added**

- The company name on a job page is now a link to every position the app is
  tracking at that company, in every status. If you have applied there before, the
  number of applications is shown after the name — `Reddit (2)`.
- The Jobs list can be focused on a single company. While it is, your saved column
  filters are set aside so applications and rejections are visible instead of
  hidden. **Show all jobs** puts your own filters back.
- The company name stays plain text when the app is tracking only that one role
  there and you have never applied — there would be nothing to open.

## 0.12.0 — 2026-09-03 — A useful outreach shortlist

**Added**

- **Find relevant people** now builds a five-person outreach shortlist: two likely
  hiring leaders, two leaders close to the function or team, and one recruiter
  targeted to the role. It uses a `Reports to` title from the job description when
  one is available.
- The People card previews every title search and its result count before Clay runs.
  The three searches request no more than five results in total.

**Changed**

- The People card now distinguishes Job Search Terminal's Clay API connection from
  a separate Clay MCP connection in ChatGPT. The job description is used locally to
  prepare the search, while Clay receives only the company identifier and displayed
  title phrases.
- Every generated outreach draft now starts with the organization's or team's need
  and explains how you can help. Candidate background is supporting evidence rather
  than the subject; this framing remains enforced when custom prompts are used.
- If a model returns candidate-first outreach, the app requests one automatic rewrite.
  A second framing failure is explained and is not saved. Regenerating the older
  three-message set also keeps the previous drafts if any replacement fails.

**Fixed**

- The Outreach tab now shows everything **Find relevant people** needs before a
  Clay search: API connection, company, company website or LinkedIn page, and
  role focus. Missing details are labelled where you can fix them, and the button
  stays disabled until the search is ready.
- Company identifiers are checked before a paid search. Employer websites and
  LinkedIn company pages are accepted; job-board links are rejected with a
  clear next step.
- **Draft message** now changes to **Generating message…** and shows which person and
  channel the AI is working on. **Draft saved** appears only after generation finishes,
  and provider or framing failures stay visible with a recovery step.

## 0.11.1 — 2026-09-02 — Accurate source activity

**Fixed**

- The Dashboard's **Last source check** now shows when **Crawl for companies** or
  **Search for companies** last finished. Importing sources no longer leaves the
  misleading impression that the source search never happened.

## 0.11.0 — 2026-08-29 — Knowing what you are running

**Added**

- The footer of every page now shows the version you are running and the commit
  it came from. A star after the commit means you have edited files in your copy.
- A daily update check. Once every 24 hours the app asks GitHub whether newer
  commits exist and shows an **Update available** badge when they do, linking to
  exactly what changed. It sends one commit code that is already published on
  GitHub — never one of your own unpushed commits — does not delay a page,
  caches its answer on your machine, and switches off entirely with
  `JST_UPDATE_CHECK=off`.
- This changelog, and a versioning rule that keeps it current.

**Changed**

- Settings source management split into three tabs — **Sources** (fresh posting
  window, add a company, job aggregators), **Scan sources** (the sources table
  and the two discovery buttons), and **Cleanup**. The sources table had grown
  long enough that everything sharing a page with it was reachable only by
  scrolling past several hundred rows.
- The two discovery buttons were renamed to say what they do: **Crawl for
  companies** (was "Scan for new sources") and **Search for companies** (was
  "Search discover"). Both look for companies you are not tracking yet, and
  neither turns anything on by itself — the card now says so once.
- **Remove all** on the Cleanup tab clears the whole review list, behind a
  two-step confirmation because the removal cannot be undone.
- The footer's privacy note now states the update check in plain sight rather
  than claiming the app never contacts anything.
- **The whole help site rewritten in plain language.** Every guide was written
  for someone who has read a codebase; it is now written for someone looking for
  work. Terms the app borrows from the hiring industry — ATS, API key,
  aggregator, provider, lane — are explained where you first meet them, and
  Getting started opens with a short list of them. Guides now say what things
  cost, what to do when the answer is disappointing, and what the app will never
  do on your behalf.

---

## 0.10.0 — 2026-08-27 — First-run setup and provider control

First-run setup rebuilt around one AI provider at a time, and asking where you
want to work. The provider you pick first stays at the front of the chain, and
switching a provider off no longer erases its place in the order. Job Search
Terminal got its own logo, with UX Design Lab kept in the footer as attribution.
Dialogs hold keyboard focus and close with Escape. Ollama reports a missing
model instead of reporting success, and stops calling itself unreachable when a
check was simply cancelled. Source checks are stored, so the Dashboard can tell
you when one is stale.

---

## 0.9.0 — 2026-08-21 — Evaluation you can audit

AI work staged by pipeline step instead of happening all at once when you press
Evaluate, with the progress steps doubling as navigation. Each job records which
model evaluated it. Providers follow their own newest model rather than a pinned
one that ages out. Mapped evidence became a quotation rather than a claim about
one, readable in any script, and a check that cannot run now fails instead of
passing quietly. Cancelling a run actually stops it and nothing is saved. When
the AI fails, the app says so rather than falling back to a rules-based score.

---

## 0.8.0 — 2026-08-06 — Discovery reliability and remote regions

Common Crawl source discovery returns sources again, and backs off politely
instead of hammering the index. Added the Himalayas remote-board lane, and
rejected Remotive and RemoteOK as sources. Location preferences split into a
commute list and a remote-region list, so a remote role restricted to a region
you cannot work in is filtered out while an unstated region is left alone.
Positive title keywords are anchored. Re-posted requisitions surface instead of
being hidden as duplicates, and resume gaps are answered once globally rather
than per requisition. Live scan progress reporting on the Dashboard.

---

## 0.7.0 — 2026-07-11 — Interview prep overhaul

Interview preparation rebuilt around core stories: a taxonomy lifecycle with a
review queue and blocklist, a consolidation wizard that turns suggestions into
core stories, durable practice attempts with per-question history, and a
coverage panel. Stories are no longer auto-inserted into an evaluation — you
review them per job. Malformed and truncated AI responses are retried instead of
failing the run, and the evaluation's later blocks degrade gracefully rather
than aborting everything.

---

## 0.6.0 — 2026-06-25 — Local models and new scan lanes

Ollama joined as a local AI provider, with an ordered provider chain and model
attribution on generated output — the first configuration in which no job or
resume data leaves the machine at all. Approval-gated email job-alert imports
and the Dice scanner (no login, no API key) were added as new ways in. Behind
the scenes: a test suite, a review queue for low-confidence imports, and a
backlog synced to GitHub Issues.

---

## 0.5.0 — 2026-05-31 — Safe egress and the evidence layer

All outbound requests moved behind an SSRF-safe fetch that resolves hostnames
and re-validates every redirect hop, so a job board cannot redirect a scan into
your local network. Import routes validate caller-supplied paths and stay inside
the import directory. Scan errors gained categories and a detail modal, sources
can be disabled in bulk, and preferred locations accept city, state, and country
formats. Added the evidence audit, keyword resume proposals, and the interactive
story editor.

---

## 0.4.0 — 2026-05-17 — Aggregators and source discovery

Adzuna joined as a direct job aggregator and Brave Search as a discovery method,
alongside Common Crawl. Added source validation, bulk **Import all valid**, and
browser-assisted imports for Indeed, Glassdoor, and Monster — including the
expiry and recency handling Monster's stale listings require. Keyword coverage
analysis gained detail, and manually added jobs are checked for a duplicate URL
before being created.

---

## 0.3.0 — 2026-05-09 — Onboarding, browser boards, and the help site

A guided onboarding wizard for first-run setup. The Claude Desktop browser-board
import pipeline, starting with LinkedIn. The in-app help site at `/help`. The
resume builder, with section-mode generation and AI prompt tuning. Tables
remember their last sort and filter settings. Jobs became editable in place.

---

## 0.2.0 — 2026-05-03 — Job Search Terminal

The project took its name, and its public shape: a rewritten README, a
restructured `docs/` tree, a CC BY-NC 4.0 licence, a security policy, and
screenshots. The profile page gained tabs and resume lanes; the app gained
company research, LinkedIn outreach drafting, a strategy page with role
directions, voice practice for interview answers, and title filters.

---

## 0.1.0 — 2026-04-30 — Foundation

The first working end-to-end app, built in phases: a dashboard shell, the local
SQLite data model, profile intelligence, scanner integration, job evaluation,
resume generation, and the application tracker — then wired to real AI providers
for evaluation and generation. Jobs could be added by hand, evaluated, and
tracked, and resumes could be generated as tagged PDFs.

---

## Versioning

Job Search Terminal uses `MAJOR.MINOR.PATCH` and stays below `1.0.0`.

**The version never reaches 1.0 on its own.** It is released deliberately, when
the product is judged stable enough to promise stability — not by accumulating
enough features. Until then the number keeps climbing in the minor position:
`0.9.0` → `0.10.0` → `0.11.0`.

> `0.10.0` is **newer** than `0.9.0`. The parts are counted separately, not read
> as a decimal — ten is larger than nine.

| Bump | When |
|---|---|
| **Minor** (`0.11.0` → `0.12.0`) | A new capability a user can see: a page, tab, integration, scan source, AI behaviour, or setting. Also any database migration, and any change that alters what leaves the machine. |
| **Patch** (`0.11.0` → `0.11.1`) | A fix or a refinement to something that already exists: a bug, wording, layout, accessibility, or performance. |
| **Neither** | Documentation, tests, comments, and internal refactors with no user-visible effect. These get no entry here. |

The version lives in `package.json` and is read straight from there by the
footer, so bumping it is what makes the app report itself correctly. See
`CLAUDE.md` and `AGENTS.md` for the rule that keeps this file and that number in
step with the code.
