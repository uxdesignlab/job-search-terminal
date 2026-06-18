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
- Job search, scan sources, manual job entry, filters, and saved presets
- Browser-board scanner setup, result scrolling/paging behavior, imports,
  duplicates, limits, and safety notes
- Job evaluation, tailored resume generation, application answers, research,
  and outreach drafting
- Application tracking, statuses, kanban/table views, follow-ups, archive vs.
  delete
- Interview preparation with STAR stories and voice practice
- Privacy, local data, AI-provider data flow, local Ollama behavior, backups,
  and safety boundaries
- Troubleshooting for setup, AI, resume/PDF, scan quality, and browser-board imports

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

## Documentation Rule

Any feature change that affects user workflows must update the in-app help site
when the current help content would otherwise become stale or incomplete. This
includes new navigation items, setup steps, provider behavior, resume workflows,
scan/import behavior, table columns, filters, statuses, safety boundaries, or
troubleshooting paths.
