# Troubleshooting

## Dev Server

If the dev server does not start:

- Confirm dependencies are installed with `npm install`.
- Confirm no other process is using port 3000.
- Restart with `npm run dev`.

If pages render stale data:

- Restart the dev server.
- Run `npm run db:check` to verify the database is readable.
- Confirm the expected local database is being used if `JS_DATABASE_PATH` is set.

## Local Database

If the database fails to open:

- Stop the dev server.
- Create a backup if possible with `npm run data:backup`.
- Restore from a known-good backup using the manual steps in
  `docs/data-management.md`.
- Run `npm run db:check`.

## Resume PDF Generation

If PDF generation fails:

- Confirm local Chrome exists at the configured executable path.
- Set `CHROME_EXECUTABLE_PATH` if Chrome is installed somewhere else.
- Run `npm run document:check`.

## Quality Checks

If `npm run quality:check` fails:

- Confirm `npm run dev` is running.
- Review the route and viewport named in the error.
- Check generated screenshots in `output/quality/screenshots`.
- Fix accessibility, contrast, focus, or layout issues before marking the phase
  complete.

## Dependency Audit

If `npm audit --audit-level=moderate` reports issues:

- Prefer the smallest viable upgrade set.
- Do not take major migrations during Phase 9 unless the audit requires it.
- Document any unresolved audit item in `docs/lessons.md`.

