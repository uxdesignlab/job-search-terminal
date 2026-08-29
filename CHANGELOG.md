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
