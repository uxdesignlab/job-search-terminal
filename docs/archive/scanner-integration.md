# Scanner Integration

Phase 5 ports the CareerOps zero-token scanner pattern into Job Search Terminal as a
dashboard-triggered service.

## Reused CareerOps Behavior

The scanner keeps these CareerOps behaviors:

- Detect Greenhouse APIs from explicit `api` values and Greenhouse board URLs.
- Detect Ashby APIs from `jobs.ashbyhq.com/{board}` URLs.
- Detect Lever APIs from `jobs.lever.co/{board}` URLs.
- Parse Greenhouse, Ashby, and Lever JSON into a shared job shape.
- Apply positive and negative title filters from the portal config.
- Fetch with a timeout and bounded concurrency.
- Deduplicate by URL and by company/title.

## Job Search Terminal Adaptation

CareerOps writes scan output to Markdown files. Job Search Terminal adapts that boundary:

- Source config stays YAML-based at `config/portals.yml`, with
  `config/portals.example.yml` as the tracked fallback.
- Scan results write to SQLite `jobs`.
- Scan run history writes to SQLite `scan_runs`.
- Dashboard activity writes to `activity_log`.
- The dashboard owns the user action through the `Scan for new jobs` button.
- Markdown export remains deferred and non-primary.

## Guardrails

- Scanner output is marked `Found` and `Needs review`.
- Fit scores remain `0` until Phase 6 evaluation runs.
- Resume recommendations remain `To be selected` until Phase 7.
- The scanner does not call AI models.
- The scanner does not apply to jobs or message recruiters.

## Checks

```bash
npm run scanner:check
npm run db:check
npm run lint
npm run typecheck
npm run build
```

`scanner:check` uses mocked Greenhouse, Ashby, and Lever payloads so parser,
filter, and dedup behavior can be checked without depending on live job boards.
