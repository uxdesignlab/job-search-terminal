# Privacy

Job Search Terminal is designed as a local-first application.

## What stays local

The following data is stored on your machine in a local SQLite database:

- Career profile
- Resume text extracted from uploaded PDFs
- Skills and role preferences
- Job records
- AI evaluations
- Generated resumes and document drafts
- Application tracking data
- Interview preparation stories
- Company research records
- Outreach drafts
- Settings and saved filters

Default database path:

```txt
data/job-search-terminal.sqlite
```

## No hosted account

Job Search Terminal does not require an account.

The maintainers do not host user accounts, user dashboards, resumes, applications, generated documents, analytics, or personal job-search data.

## When data leaves your machine

Data may leave your machine only when you choose to run actions that require external services.

Examples:

- Running AI job evaluation
- Generating a tailored resume
- Drafting application answers
- Running company research
- Drafting outreach messages
- Transcribing interview practice audio
- Parsing writing style samples

In those cases, relevant data is sent directly to the AI provider you configured.

Supported providers may include:

- OpenAI
- Anthropic
- Google Gemini

Review the privacy policy and data usage terms of whichever provider you use.

## API keys

API keys are stored locally for your app instance.

Do not commit API keys to GitHub. Do not share screenshots that expose keys. Rotate keys immediately if they are leaked.

## Backups and exports

You can back up your local database:

```bash
npm run data:backup
```

You can export readable JSON:

```bash
npm run data:export
```

Backups and exports may contain sensitive personal data. Store them carefully.

## Analytics and telemetry

The public project does not collect maintainer-controlled analytics or telemetry by default.

If analytics are added in the future, they must be documented clearly and made opt-in.

## User responsibility

You are responsible for protecting your local machine, database, exports, generated resumes, and API keys.
