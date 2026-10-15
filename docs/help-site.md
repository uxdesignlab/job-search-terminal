# Help Site

Job Search Terminal includes an in-app documentation site at `/help`. It is
designed as the product's self-service support surface for open-source users, so
common setup, search, resume, browser-board scanning, application, privacy, and
troubleshooting questions should be answered there instead of only in developer
docs.

## Routes

| Route | Purpose |
|---|---|
| `/help` | Help home page with hero, search, and workflow-based topic cards |
| `/help/[slug]` | Static guide pages generated from the help content registry |

The individual guide pages are pre-rendered from `generateStaticParams()` and
use a shared documentation shell with a sidebar, screenshot hero, table of
contents, related guides, and external references.

## Source Files

| File | Purpose |
|---|---|
| `src/lib/help/content.ts` | Structured registry for all help pages, sections, related guides, screenshots, and external links |
| `src/app/help/page.tsx` | Help home page |
| `src/app/help/[slug]/page.tsx` | Per-guide route |
| `src/components/help/help-site-shell.tsx` | Shared docs layout, hero, and sidebar navigation |
| `src/components/help/help-article.tsx` | Guide article renderer |
| `src/components/help/help-search.tsx` | Client-side search across all help pages |
| `src/components/help/help-icons.ts` | Maps serializable icon names to Lucide icons |

Do not pass React component references from server content into client
components. The help registry stores serializable icon names, and
`help-icons.ts` resolves them to Lucide components where they render.

## Current Guide Coverage

- Getting started and the daily workflow
- AI provider setup for OpenAI, Anthropic, Google Gemini, and Ollama
- Resume lanes, resume upload, ATS-friendly resume structure, and PDF guidance
- Job search, work-arrangement locations and remote regions (including picking a
  whole region such as Europe or APAC), scan sources, manual job entry, filters,
  saved presets, and focusing the list on every position at one company
- Browser-board scanner setup, result scrolling/paging behavior, imports,
  duplicates, limits, and safety notes
- Job evaluation, tailored resume generation, application answers, research,
  organization-first outreach drafting and progress, and Clay's five-person
  contact-shortlist plan, readiness, privacy, allowance use, and recovery
- Application tracking, statuses, kanban/table views, follow-ups, archive vs.
  delete, and the Archived page (restore, delete, delete all)
- Analytics, the Evidence bank (answer a gap once, reused everywhere), Strategy
  role directions, and AI prompt overrides
- Interview preparation with STAR stories, voice practice, and the one-time
  story-consolidation wizard
- Privacy, local data, AI-provider data flow, local Ollama behavior, the footer
  version stamp and daily update check, backups, and safety boundaries
- Troubleshooting for setup, AI, resume/PDF, scan quality, remote regions that
  rule out too much, an Adzuna lane that never finds anything, and browser-board
  imports

## Research References

The help content intentionally links to authoritative or practical external
resources where users need provider-specific or resume-standard guidance:

- OpenAI API quickstart
- Anthropic API overview and API access help
- Google Gemini API key documentation
- Ollama download and model library
- LinkedIn job search, filters, alerts, and prohibited software guidance
- University career-center ATS and resume-format guidance

When these topics change, verify current provider or platform guidance before
rewriting the help copy.

## Known Coverage Gaps

Re-audited 2026-10-15 against every route in `src/app/*/page.tsx` and every nav
item in `src/components/ui/shell.tsx`. The five features the 2026-08-29 audit
found with **no help coverage at all** are now covered:

| Feature | Route / location | Where help covers it |
|---|---|---|
| Analytics | `/analytics`, primary nav | `insights` guide → `analytics` |
| Evidence bank | `/evidence`, reached from Analytics and Dashboard | `insights` guide → `evidence-bank` |
| Strategy (and AI Prompts tab) | `/strategy`, Account menu | `insights` guide → `strategy`, `ai-prompts` |
| Archived jobs | `/archived`, linked from the Jobs header | `applications` guide → `archived-page` |
| Email job-alert imports | Pending candidate approval flow | `job-search` guide → `email-alerts` |

The same pass added the story-consolidation wizard (`/interview-prep/consolidate`)
to `interview-prep` → `consolidate`, an `insights-empty` troubleshooting entry, and
two privacy bullets that were missing from `privacy-data` → `what-leaves`: what
Brave Search receives (company-discovery searches, Find posting, pay research
during application preparation) and what Clay receives on the Outreach tab.

The Himalayas remote board was on this list until 0.18.0, which added the
`himalayas` section to the job-search guide (what it is, why its jobs link to
Himalayas, and how **Find posting** resolves them) plus a `himalayas-links`
troubleshooting entry. 0.19.0 rewrote that section for keyword search, added a
`himalayas-scan-notes` troubleshooting entry for the lane's error rows, and added
a privacy bullet listing the search words each board lane sends.

Thinner than the feature warrants, but not absent: saved filter presets,
the resume builder, the keyword/taxonomy manager, story consolidation, and the
interview plan. Clay contact search now explains its prerequisites and common
failures, but the one-time email-enrichment routine setup is still thin.

The Evidence bank is deliberately kept out of the primary nav, so the `insights`
guide is the main place a user learns it exists — keep its "how to reach it"
sentence in step with the links on Analytics and the Dashboard.

Separately from missing coverage, check covered guides for *staleness*: renamed
controls, counts that drifted, and options that no longer exist. These cost less
to fix than a new guide and go stale silently. (`docs/features.md` described
Settings as having four tabs after a fifth was added; assume help drifts the same
way.)

## Documentation Rule

Any feature change that affects user workflows must update the in-app help site
when the current help content would otherwise become stale or incomplete. This
includes new navigation items, setup steps, provider behavior, resume workflows,
scan/import behavior, table columns, filters, statuses, safety boundaries, or
troubleshooting paths.

This rule is stated as a hard requirement in both `CLAUDE.md` and `AGENTS.md`,
alongside the trigger list that decides whether a given change is in scope. If
no trigger applies, say so explicitly when reporting the work — silence reads as
"forgot", not as "checked".

## Reading Level

The whole site was rewritten in plain language on 2026-08-29. The problem was
never sentence complexity — it was vocabulary. The copy had been written by
people who had read the codebase, for a reader assumed to have done the same,
and it used `ATS`, `API key`, `aggregator`, `provider chain`, `credentials`,
`parseable`, `funnel`, `pipeline`, `modal`, and `base URL` without ever saying
what any of them meant.

What changed, and what to preserve:

- **Terms are defined where the reader first meets them.** `getting-started`
  opens with a short "A few words you will see" section covering AI service,
  API key, ATS, job aggregator, scan, and lane. Every other guide can then use
  those words freely.
- **Guides say what things cost.** A job seeker choosing an AI provider needs to
  know that three of them bill a card and one does not.
- **Guides say what to do when the answer disappoints.** An empty first scan now
  has a callout explaining that narrow job titles, not a broken app, are the
  usual cause.
- **Boundaries are stated as deliberate limits**, not omissions: "It never
  submits an application. It writes the material; you send it."
- **Control names were checked against the code.** Help had said
  "Settings → AI Providers" in six places; the tab is labelled **AI Provider**.
  Arrows were normalised to `→`.

The hero copy and category descriptions live in
`src/components/help/help-site-shell.tsx` and `src/app/help/page.tsx` rather than
the registry. They are the first thing a reader sees — check them when auditing
reading level, or they drift back into feature-listing.

## Writing Help Copy

`docs/` is written for developers; `/help` is written for job seekers, and the
two have different reading levels, vocabularies, and goals. Do not translate one
into the other by copying.

The full contract lives in **[help-writing.md](help-writing.md)**: the audience
definition, voice rules, the registry's content shape, the change→help trigger
list, the procedure for adding a guide, the audit procedure, and a pre-finish
checklist. Read it before writing or auditing help copy.

It is deliberately one file for both agents. Claude Code reaches it through a
`help-writer` skill in `.claude/skills/` that only points at it; Codex is sent
there by `AGENTS.md`. Add new guidance to `help-writing.md`, never to the skill,
or the two agents start writing to different standards.

The rules that most often get broken:

- **Plain language, grade 6–8.** Jargon is the barrier, not sentence length.
- **`steps` are an ordered procedure; `bullets` are facts.** They are not
  interchangeable — mixing them makes a required procedure look optional.
- **Control names must match the UI exactly.** Open the screen; do not guess.
- **State what the app does not do.** Users assume automation. Every "never
  submits", "never sends", "never clicks Apply" is load-bearing.
- **New failure modes belong in the `troubleshooting` guide** in the same pass.
- **`related` links should go both ways.** A guide nothing links to is a guide
  nobody finds.

Job search includes untouched-job cleanup, restoration, and Shift-click/Shift+Space
range selection. Troubleshooting covers unverifiable postings, interrupted checks,
protected candidates, failed archives, and historical activity limitations.
