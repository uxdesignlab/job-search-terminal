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
