# Data Management

Job Search Terminal stores local runtime data in `data/job-search-terminal.sqlite`. The database is ignored by git,
so backups and exports are required before risky local changes.

## Backup

Create a SQLite backup:

```bash
npm run data:backup
```

Backups are written to `output/backups/` and can be restored manually if local
data is damaged.

## Export

Create a readable JSON export:

```bash
npm run data:export
```

Exports are written to `output/exports/` and include:

- profile
- skills
- role directions
- resumes
- jobs
- evaluations
- generated documents
- applications
- application answer drafts
- activity log

## Restore

Restore is intentionally manual because it replaces the active local database.

1. Stop the dev server.
2. Create one more backup of the current database if it still opens.
3. Copy the selected backup from `output/backups/` to `data/job-search-terminal.sqlite`.
4. Start the dev server.
5. Run `npm run db:check`.

Do not restore while `npm run dev` is actively serving the app.

