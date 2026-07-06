# Troubleshooting

## Dev Server

If the dev server does not start:

- Confirm dependencies are installed with `npm install`.
- Confirm no other process is using port 3000.
- Restart with `npm run dev`.

If pages render stale data:

- Restart the dev server.
- Run `npm run db:check` to verify the database is readable.
- Confirm the expected local database is being used if `JST_DATABASE_PATH` is set.

If the browser console reports a hydration mismatch on the root `<html>` or
`<body>` element:

- Check whether a browser extension added an attribute before React loaded.
  Privacy and analytics-blocking extensions may add attributes such as
  `data-google-analytics-opt-out`. Writing assistants may add attributes such as
  `data-gr-ext-installed`.
- The app suppresses hydration warnings on the root elements so extension-owned
  attributes do not interrupt local dashboard use.
- If the warning points to a component below `<body>`, inspect that component
  for server/client branching, time-based values, random values, locale
  formatting, or invalid HTML nesting.
- If an interactive widget reports mismatched generated accessibility IDs,
  provide a stable context ID through the widget library API.

## Local Database

If the database fails to open:

- Stop the dev server.
- Create a backup if possible with `npm run data:backup`.
- Restore from a known-good backup using the manual steps in
  `docs/data-management.md`.
- Run `npm run db:check`.

## Job Evaluation

If **Evaluate with AI** shows "Evaluation failed. Check your AI provider settings
and try again." with a red ✗ on a specific block (most often **Interview Stories** /
Block F):

- This generic message is the fallthrough for an error that was *not* an auth, quota,
  or network failure — almost always a malformed or truncated JSON response from the
  model. Block F produces the most output and is the most prone to being cut off.
- Clicking **Retry** re-runs the evaluation; because LLM output is non-deterministic,
  the next generation usually parses cleanly. This is expected behavior, not a config
  problem with your provider.
- The pipeline now retries malformed/truncated JSON up to 3× per block automatically,
  gives Block F a larger token budget (8,192), and lets Blocks F and G degrade to an
  empty/"Unknown" result instead of aborting the whole run. Persistent Block F failures
  after these safeguards usually mean the active model has a small output window — switch
  to a model with a larger output limit in Settings → AI Provider.
- If the ✗ lands on **Role Analysis** (A) or **Skills Match** (B) instead, those blocks
  fail hard by design (a fabricated score is worse than none). Check the provider
  credential, quota, and network first.

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
