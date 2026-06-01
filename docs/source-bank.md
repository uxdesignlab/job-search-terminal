# Public ATS Source Bank

## Purpose

Job Search Terminal should help users choose relevant ATS sources instead of
scanning a broad company list by default. The public ATS source bank is a
curated, versioned catalog of supported Greenhouse, Lever, and Ashby boards.

The source bank is a discovery surface, not an automatic subscription list.
Users explicitly choose which companies to track before those sources join
manual or scheduled scans.

## Version 1 Approach

Ship the catalog with the application as a versioned system-layer file. Catalog
updates arrive with application releases. This preserves the local-first
architecture and avoids adding a hosted service for the initial version.

Each catalog entry should include:

- A stable identifier based on ATS provider and board slug.
- Company name, ATS provider, canonical careers URL, and API URL.
- Industry and optional industry tags.
- Hiring coverage: known countries, `global`, or `unknown`.
- A metadata review date so stale entries can be identified during curation.

Country metadata represents current hiring coverage, not company headquarters.
Entries with `unknown` coverage remain available when browsing the full bank but
do not appear as profile-matched recommendations.

## Source Selection

Settings should add a Source bank browser with filters for industry, hiring
country, and ATS provider. It should open on profile-matched recommendations
using the user's desired industries and preferred locations, with an option to
browse the full catalog.

Catalog rows are not imported or enabled automatically. A user explicitly
selects sources to track. Approved sources are enabled immediately and join the
next manual or scheduled scan.

New installs should start without the current broad pre-enabled starter list.
Onboarding should add a source-selection step after profile preferences so a new
user can approve relevant recommendations before the first scan. Existing local
`config/portals.yml` files must remain untouched.

## Manual Job Promotion

When a user adds a job manually, the app should detect whether the pasted URL is
a supported Greenhouse, Lever, or Ashby job-detail URL. If the corresponding
board is not already tracked, save the job normally and offer a confirmation:

> Track this company for future scans?

Confirming adds and enables the canonical board source. Dismissing the prompt
keeps the manual job without changing scan sources. If the detected board exists
in the public catalog, use its curated metadata. Otherwise use the entered
company name and mark hiring coverage as `unknown`.

## Discovery Separation

Common Crawl and Brave Search discovery remain local candidate-generation
tools. Their results stay in the existing pending-review workflow and never
publish into the public source bank automatically.

Public catalog entries require deliberate curation and validation before a
release. A future hosted read-only refresh can be considered after the bundled
catalog workflow is proven.

## Implementation Outline

- Add a versioned source-bank catalog under `config/`.
- Centralize ATS URL parsing so catalog import, manual job promotion, source
  validation, and scanning use one canonical provider-and-slug identity.
- Reuse `scan_sources_custom` for user-approved sources.
- Add hiring-coverage metadata to the existing company metadata cache with an
  additive migration.
- Add the Settings source-bank browser and onboarding source-selection step.
- Return an optional suggested source after manual job creation and show the
  confirmation prompt before adding it.
- Update user-facing help, feature documentation, and the data model when the
  implementation lands.

