# Lessons

Project corrections and durable workflow lessons go here.

## Current Rules

- Keep detailed project documentation in `docs/`.
- Keep `AGENTS.md` at the repo root for Claude Code.
- Use a design-system-first UI approach.
- Target WCAG 2.2 AA from the first scaffold.
- Preserve multi-resume lanes — do not collapse to a single universal resume.
- Before building any scanner, PDF, tracker, evaluation, or application-assistant
  behavior from scratch, check whether an equivalent already exists in the
  codebase. Extend and adapt rather than reinvent.
- After every completed build, verify with `npm run lint && npm run typecheck && npm run build`
  and do a manual browser check of affected flows.
