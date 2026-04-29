# Development Workflow

## Working Rules

- Plan non-trivial work before implementing.
- Work one implementation phase at a time.
- Do not pull tasks from future phases into the current phase.
- After each phase, pause for review and user testing before starting the next
  phase.
- After each completed build or phase, provide a concise QA checklist covering
  the screens, flows, content, and phase-specific changes the user should test.
- Commit phase work only after the user explicitly says to commit.
- Keep detailed docs in `docs/`.
- Keep root `README.md` short.
- Keep `AGENTS.md` at the root for Codex compatibility.
- Reuse CareerOps code and functionality first. Copy, vendor, or port working
  CareerOps engine code when practical instead of rebuilding equivalent logic.
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

For every later phase, use the same phase boundary:

1. Implement only that phase.
2. Run the agreed verification checks.
3. Report the result and provide a phase-specific QA checklist.
4. Stop and let the user inspect/test.
5. Commit only after explicit user approval.

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
