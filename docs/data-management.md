# Data Management

Job Search Terminal stores runtime data locally. Use the portable account
archive when you need a complete recovery point or want to move the app to
another machine.

## Portable Account Backup

Open **Account → Data & Backup** or **Settings → Data & Backup**, then click
**Create and download backup**. The `.jst-backup` archive includes:

- a consistent SQLite snapshot
- uploaded resume files referenced by resume lanes under `assets/`
- generated resume HTML/PDF files
- `config/portals.yml`
- discovered-source state
- job-board import history

Password protection is optional. Unencrypted backups require an explicit
privacy acknowledgment because the archive contains resume data and locally
stored provider credentials.

The app also keeps a local copy in `output/backups/`.
While a backup is being created, the app shows a progress dialog. Archive files
are packaged as streams so large scanner histories and resume assets do not
need to be loaded into memory at once.

Only resume files referenced by resume lanes are included from `assets/`.
Screenshots, videos, and every other unrelated asset are always ignored and are
never replaced during restore.

CLI recovery is available when the UI cannot start:

```bash
npm run account:backup
npm run account:backup -- --password="your password"
npm run account:restore -- output/backups/<archive>.jst-backup
```

## Restore

Open **Settings → Data & Backup**, select the archive, provide its password when
needed, and click **Inspect backup**. The app streams expanded files into a
private disk staging area, enforces archive size limits, and validates the
manifest, checksums, archive paths, referenced resume files, and SQLite snapshot
before showing the restore confirmation. Abandoned previews expire after 15
minutes.

Restore replaces managed account data with the saved snapshot. Before
replacement, the app automatically creates a rollback archive in
`output/backups/`.

## Database-Only Snapshot

For a quick SQLite-only snapshot:

```bash
npm run data:backup
```

This does not include resume files, generated documents, configuration, or
scanner history files.

## Readable Export

Create a readable partial JSON export:

```bash
npm run data:export
```

Exports are written to `output/exports/`. They are useful for inspection, but
they are not complete recovery archives.
