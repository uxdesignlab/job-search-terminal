# Roadmap

Job Search Terminal is in early public development.

## Current focus

- Improve setup experience
- Add screenshots and demo data
- Strengthen privacy and legal documentation
- Improve job source discovery
- Improve AI evaluation transparency
- Improve resume tailoring controls
- Improve accessibility and keyboard navigation

## Fresh search scanner — mostly complete

Add a hybrid fresh-job discovery lane modeled on the Google searches at
[pavel.ux.business/24h](https://pavel.ux.business/24h/).

- ✅ Run unattended Brave Search scans for jobs indexed in the past 24 hours.
- ✅ Start with Greenhouse, Lever, Ashby, Workday, and jobs/careers subdomains.
- ✅ Route confidently parsed jobs through the existing local import, freshness,
  dedupe, notification, and liveness pipeline.
- ✅ Low-confidence imports (missing/short description) land in a review queue
  on the Jobs page — Approve to keep, Dismiss to archive.
- Add an agent-assisted Chrome workflow for exact Google 12-hour searches (partial — documented in CLAUDE.md).
- Preserve the local-first boundary: never auto-apply, click Apply, or send job
  data anywhere except the configured search API and local dashboard.

## Next phase — Public ATS source bank

Add a curated, release-versioned catalog of Greenhouse, Lever, and Ashby sources
so users can choose relevant companies instead of scanning a broad default list.
See [docs/source-bank.md](docs/source-bank.md) for the saved implementation
approach.

- Recommend sources from profile industries and preferred countries while
  keeping the full catalog available for browsing.
- Let users filter the catalog by industry, hiring coverage, and ATS provider.
- Add an onboarding source-selection step for new installs and preserve existing
  local portal configurations.
- When a manually added job reveals a supported ATS board, offer to track that
  company for future scans after explicit confirmation.
- Keep Common Crawl and Brave Search discoveries separate from the curated
  public catalog.

## Planned improvements

- Expand fresh-search coverage beyond the initial ATS and careers-domain set
- Consider optional hosted read-only source-bank refreshes after the bundled
  local-first catalog workflow is proven
- More transparent fit scoring explanations
- Stronger application funnel analytics
- Safer rejection/archive handling
- Better backup and restore UX
- Improved generated resume editor
- More interview prep workflows
- Optional import/export flows
- **Jooble API integration** — add Jooble as a second job aggregator source alongside Adzuna; free API key, same scan-and-import pattern, covers a broad range of listings from across the web
- **Lensa browser-board source** — add Lensa as a browser-assisted scan target (Claude Desktop); no public API exists, so agent-driven browsing is the only viable path

## Not planned

- Auto-submitting applications
- Spam outreach workflows
- Hosted user accounts by default
- Hidden telemetry
- Selling user data
- Commercial use without permission under the project license
