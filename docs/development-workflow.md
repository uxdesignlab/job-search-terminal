# Development Workflow

## Working Rules

- Plan non-trivial work before implementing.
- Keep detailed docs in `docs/`.
- Keep root `README.md` short — link to docs rather than duplicating content.
- Keep `AGENTS.md` at the root for Claude Code compatibility.
- Preserve user resume assets and generated output. Do not delete data.
- Document every meaningful implementation decision.
- Document every new or changed feature in the same change set. At minimum,
  update `docs/features.md` and any relevant technical reference. If the change
  affects user workflows, also update the in-app help site under `/help`.

## Source Layout

### Job detail route (`src/app/jobs/[id]/`)

The job workspace is a **server component**. It holds no client state of its own —
every piece of interactivity is delegated to a client component under
`src/components/`, and all mutations go through the inline `"use server"` actions
defined in `page.tsx`.

```
src/app/jobs/[id]/
  page.tsx              data loading, server actions, page chrome, tab routing
  tabs/
    types.ts            TABS list and the shared Tab / TabHref types
    detail-list.tsx     DetailList + EvaluationSection list primitives
    overview-tab.tsx
    evaluation-tab.tsx
    outreach-tab.tsx    owns the OUTREACH_ERRORS message map
    resume-tab.tsx
    apply-tab.tsx
  outreach/             contacts panel and outreach client (pre-existing)
  research/
```

`page.tsx` loads all data and defines the server actions, then passes both the data
and the actions down to whichever tab is active. Server actions are passed as plain
props — this works because the tab components are server components too.

**Keep the tab components server components.** Adding `"use client"` to one would
force its data and server actions across a client boundary, and would ship its JSX
to the browser for no benefit. If a tab needs interactivity, add a small client
component under `src/components/` and render it from the tab, which is how the
existing modals, forms and streaming panels already work.

Splitting these files does not shrink the route's client bundle — server components
emit no client JS, so the ~1.5 MB dev chunk for this route is the fifteen client
components it renders plus their dependencies, not the page's own markup.

## Testing the First-Run Experience

Once you have used the app, your instance holds real data and the first-run
onboarding never appears again. To exercise onboarding — for usability testing,
or to check a change to the wizard — run a **second, independent instance**
rather than deleting your own data.

Every path the app writes to (`data/`, `output/`, `assets/`, `config/*.local.*`)
is resolved relative to the working directory and is gitignored, so a second
working copy is isolated by construction rather than by configuration.

**One thing defeats that: `JST_DATABASE_PATH`.** `src/lib/db/client.ts` prefers it
over the working-directory default, so if it is exported in your shell — or set in
either checkout's `.env.local` — both instances open the *same* database file. The
second instance would then show your real data instead of onboarding, and worse,
could write to it. Leave it unset when running two instances, or give each one its
own value. Everything below assumes it is unset.

Create one as a git worktree, so it shares the object store and stays pinned to
a commit you choose:

```bash
git worktree add --detach ../job-search-terminal-testing main
cd ../job-search-terminal-testing
npm ci
npm run dev -- -p 3100
```

The second instance needs its own `node_modules` and its own port. Port 3100
keeps it clear of the default 3000, so both instances can run side by side.

On first page load the app creates an empty database and lands on the
first-run onboarding wizard. The seed inserts an empty profile row and one
empty resume lane — it is a bootstrap, not a fixture, so nothing needs to be
cleared afterwards.

To reset between test sessions, use a script that refuses to run unless it is
certain it is pointed at the throwaway instance. Do not run bare deletions: the
same commands in the primary checkout would destroy the real database, imported
jobs, uploaded resumes, generated documents, and backups, which the working rules
above forbid. Keep the script outside version control — `.claude/` is gitignored
and is a reasonable home — and set `EXPECTED` to your own absolute path:

```sh
#!/bin/sh
# Wipe the testing instance back to a first-run state.
set -eu

EXPECTED="/absolute/path/to/your/testing/worktree"   # <- edit this
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3100}"

# Guard 1 — path. A stray copy of this script cannot touch the real instance.
[ "$ROOT" = "$EXPECTED" ] || {
  echo "Refusing: $ROOT is not the testing instance" >&2; exit 1; }

# Guard 2 — database location. With JST_DATABASE_PATH set, the paths below are
# not the database the app actually opens, so deleting them is both useless and
# unsafe.
[ -z "${JST_DATABASE_PATH:-}" ] || {
  echo "Refusing: JST_DATABASE_PATH is set" >&2; exit 1; }

# Guard 3 — liveness. Deleting an open SQLite file does not error; the server
# keeps writing to an inode that no longer has a name, so the reset appears to
# succeed and silently does not take. Check the port and the database file, so a
# server started on some other port is still caught.
if command -v lsof >/dev/null 2>&1; then
  busy="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  [ -f "$ROOT/data/job-search-terminal.sqlite" ] && busy="$busy $(lsof -t -- \
    "$ROOT/data/job-search-terminal.sqlite" 2>/dev/null || true)"
  [ -z "$(echo "$busy" | tr -d ' ')" ] || {
    echo "Refusing: the instance is still running. Stop the dev server." >&2
    exit 1; }
else
  echo "Warning: lsof not found; could not check for a running server." >&2
fi

cd "$ROOT"
rm -f data/*.sqlite data/*.sqlite-shm data/*.sqlite-wal
for dir in data output assets reports; do
  find "$dir" -mindepth 1 ! -name .gitkeep -delete 2>/dev/null || true
done
rm -f config/portals.yml config/*.local.json
```

Next.js spawns short-lived workers, so the liveness check can briefly report more
than one process. Erring toward refusal is the right bias.

To pick up newer code in the testing worktree, pull in your main checkout and
then re-point the worktree:

```bash
git checkout --detach main
```

## Verification

Run after every change:

```bash
npm run lint
npm run typecheck
npm run build
```

**Stop the dev server before building.** `next dev` and `next build` share the
same `.next` directory, so running them together in one checkout makes the build
fail while collecting page data for a route — the failure names whichever route
lost the race, so it reads like a bug in that route rather than a collision. It
is intermittent: a rerun often succeeds, which makes it easy to dismiss. If a
build fails that way, stop the dev server, `rm -rf .next`, and build again before
looking for a real cause.

This is the second thing in a second instance that needs the server down; the
first is resetting its database, above.

For feature work, also verify the actual dashboard flow in the browser. Check the
browser console too — a React hydration mismatch on an ARIA attribute is an
accessibility bug, not a warning, because React leaves the server's value in place
and it may reference an element that only ever exists on the client.

## Lessons

When a correction changes the project rules, record the durable lesson in
`docs/lessons.md`.
