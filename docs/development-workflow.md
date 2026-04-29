# Development Workflow

## Working Rules

- Plan non-trivial work before implementing.
- Keep detailed docs in `docs/`.
- Keep root `README.md` short.
- Keep `AGENTS.md` at the root for Codex compatibility.
- Preserve user resume assets and generated output.
- Document every meaningful implementation decision.

## Phase Discipline

Phase 1 is scaffold and mapping only. Do not implement:

- Job scanner integration.
- PDF generation.
- SQLite schema.
- OpenAI calls.
- Application tracker logic.
- Real dashboard workflows.

## Verification

Run for scaffold work:

```bash
npm run lint
npm run typecheck
npm run build
```

Future feature work should add focused tests for the changed behavior and verify
the actual dashboard path.

## Lessons

When a correction changes the project rules, record the durable lesson in
`docs/lessons.md`.
