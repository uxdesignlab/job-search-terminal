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

## Verification

Run after every change:

```bash
npm run lint
npm run typecheck
npm run build
```

For feature work, also verify the actual dashboard flow in the browser.

## Lessons

When a correction changes the project rules, record the durable lesson in
`docs/lessons.md`.
