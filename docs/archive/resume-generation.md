# Resume Generation

Phase 7 ports the CareerOps HTML-to-PDF resume generation path into the JS
dashboard.

## CareerOps Behavior Reused

The implementation follows these CareerOps patterns:

- Single-column ATS-safe HTML resume output.
- Job-aware keyword extraction from the evaluation.
- Base resume selection from the recommended resume lane.
- Proof-point reordering by overlap with job keywords.
- HTML preview before/alongside PDF output.
- Playwright/Chromium PDF rendering.
- ATS text normalization for smart punctuation, zero-width characters, and
  non-breaking spaces before PDF creation.

## JS Adaptation

- The source of truth is SQLite plus the extracted local resume-lane text.
- Output files are written under `output/`.
- Generated metadata is saved in `generated_documents`.
- Job Detail owns the `Generate tailored resume` action.
- Resumes shows generated HTML/PDF links.
- PDF and HTML preview are served through dashboard routes rather than exposing
  local filesystem paths in the UI.

## Guardrails

- The generator uses existing profile, evaluation, skill, and resume evidence.
- It does not invent job history, credentials, tools, or metrics.
- Scanner-only jobs may produce thinner resumes until a full job description is
  captured.
- Application answers and auto-apply behavior remain deferred to Phase 8.

## Checks

```bash
npm run document:check
npm run db:check
npm run lint
npm run typecheck
npm run build
```

`document:check` generates a tailored resume from a seeded evaluated job,
verifies HTML output, verifies PDF output starts with `%PDF`, and confirms the
database metadata was saved.
