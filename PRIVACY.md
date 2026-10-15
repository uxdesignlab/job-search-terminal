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
- Outreach drafts and saved contacts
- Evidence bank answers and Strategy role directions
- Settings, API keys, and saved filters

Default database path:

```txt
data/job-search-terminal.sqlite
```

## No hosted account

Job Search Terminal does not require an account.

The maintainers do not host user accounts, user dashboards, resumes, applications, generated documents, analytics, or personal job-search data.

## When data leaves your machine

Nothing is uploaded in the background. Data leaves only for the actions below, and
each sends only what that action needs.

### AI features

When you run an AI feature — job evaluation, resume generation or section rewrites,
application answers, company research, outreach drafts, Evidence bank drafts and
assessments, Strategy role directions, profile extraction, writing-voice parsing, or
interview-practice transcription — the relevant text is sent directly to the AI provider
you configured: OpenAI, Anthropic, or Google Gemini.

With **Ollama**, AI runs on your own computer and nothing leaves for these actions. To
keep it that way when Ollama is unavailable, switch the cloud providers off: the app only
falls back to providers that are switched on. **Resume writing uses** (Settings → AI
Provider) can send resume work to a different provider from everything else.

Review the privacy policy and data usage terms of whichever provider you use.

### Job scans

- **Company job boards** (Greenhouse, Lever, Ashby): the app downloads each watched
  company's public job list. Nothing about you is sent.
- **Himalayas**: your include title keywords (or target roles, if you have none).
- **Dice**: your target roles and on-site/hybrid locations.
- **Adzuna** (only with your own key): your include title keywords and on-site location.
- When a Himalayas job is found, or you press **Find posting**, the app asks that
  company's Greenhouse, Lever, and Ashby boards for their public job lists. The company
  name is part of the address; nothing about you is sent.
- **Crawl for companies** queries the public Common Crawl index for job-board addresses.
  Nothing about you is sent.

- **Check live**, **Fetch description**, and cleanup's posting check visit the job's own
  posting page, the same way a browser would. Nothing about you is sent.

No profile details beyond those search words, and nothing from your resume, is sent to
any job board.

### Optional services (only after you add a key)

- **Brave Search**: fixed company-discovery searches (**Search for companies**), the job
  title and company name for **Find posting**, and the job title and location when
  application preparation looks up typical pay.
- **Clay**: only when you press a button on a job's Outreach tab. **Find relevant people**
  sends the company's website or LinkedIn page and the job titles to look for; **Find
  email** sends the chosen person's LinkedIn link. Clay never receives your resume, notes,
  the job description, or application answers.

### Update check

Once a day the app asks GitHub whether a newer version of Job Search Terminal exists. It
sends only the published commit your copy was built from. Set `JST_UPDATE_CHECK=off` in
the environment you start the app from to turn it off.

### Browser job-board scans

Browser-assisted scans of LinkedIn, Wellfound, and the other supported boards are run by
Claude or Codex in your own browser, under that assistant's terms. Job Search Terminal
only reads the JSON file the assistant writes into your local import folder.

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

The public project does not collect maintainer-controlled analytics or telemetry. Two
things run without a click: the daily update check above, which carries no personal
data, and automatic job scans every six hours if you turn them on under Settings → Data
& Backup, which send the same search words as a scan you start yourself.

If analytics are added in the future, they must be documented clearly and made opt-in.

## User responsibility

You are responsible for protecting your local machine, database, exports, generated resumes, and API keys.
