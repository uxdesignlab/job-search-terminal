# Development Workflow

## Working Rules

- Plan non-trivial work before implementing.
- Keep detailed docs in `docs/`.
- Keep root `README.md` short — link to docs rather than duplicating content.
- Keep `AGENTS.md` at the root for Claude Code compatibility.
- Preserve user resume assets and generated output. Do not delete data.
- Document every meaningful implementation decision.

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
