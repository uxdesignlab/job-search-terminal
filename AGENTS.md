# JS Agent Instructions

JS is a local-first, dashboard-first job-search command center. The product
reuses proven CareerOps concepts behind the scenes, but the user experience must
feel like a minimal professional SaaS dashboard.

## Project Direction

- Codex is the primary development and orchestration tool.
- `AGENTS.md` is the authoritative agent contract for this repo.
- Detailed project documentation belongs in `docs/`.
- Keep `README.md` short and link to docs instead of duplicating detail.
- Phase 1 is scaffolding and mapping only. Do not implement scanner, PDF,
  SQLite, evaluation, or application-tracking functionality in this phase.

## Architecture Defaults

- App: Next.js, TypeScript, Tailwind.
- Runtime: local-first Node app.
- Future data store: SQLite.
- Future PDF path: Playwright-based HTML-to-PDF adapted from CareerOps.
- Future AI path: backend-mediated OpenAI calls.

## CareerOps Rule

Before building a scanner, PDF generator, tracker, evaluation mode, application
assistant, or dashboard metric from scratch, check the CareerOps reuse map in
`docs/careerops-reuse-map.md`.

Use this policy:

- Reuse proven CareerOps engine behavior where it fits.
- Adapt file/CLI-first workflows into dashboard-triggered services.
- Replace user-facing terminal or slash-command flows with dashboard actions.
- Defer optional external adapters until the dashboard workflow needs them.

## Resume Lanes

The repo currently contains multiple resume source PDFs in `assets/`. Preserve
that multi-resume model. Do not collapse the workflow into a single universal
resume.

Initial lanes:

- Principal / Product Design Leadership
- UX Design
- Accessibility / Design Systems
- Design Operations
- Teaching / UX Education

## UX And Accessibility

- Use the design-system tokens and primitives under `src/styles/` and
  `src/components/ui/`.
- Keep the interface compact, calm, professional, and dashboard-first.
- Avoid decorative gradients, oversized marketing sections, nested cards, and
  one-color palettes.
- Meet WCAG 2.2 AA by default: visible focus, semantic structure, sufficient
  contrast, non-color-only status, labels for controls, reduced motion support.

## Safety

- Never submit applications, send emails, or message recruiters for the user
  without explicit approval.
- Never expose implementation details like script names or file paths in the
  product UI unless the user asks for technical details.
- Preserve user materials and generated outputs. Do not delete resumes,
  reports, outputs, or tracked data unless explicitly asked.

## Verification

For scaffold changes, run:

```bash
npm run lint
npm run typecheck
npm run build
```

For future feature work, add focused tests and verify the actual dashboard flow.
