# Job Evaluation

Phase 6 adapts the CareerOps evaluation mode into a dashboard-triggered Job Search Terminal
service.

## CareerOps Structure Reused

CareerOps `modes/oferta.md` defines a full evaluation with reusable sections:

- role summary
- match with CV
- level and strategy
- compensation and demand
- personalization plan
- interview plan
- posting legitimacy

Job Search Terminal preserves that structure in SQLite-backed evaluation sections and replaces
the AI/engineering archetypes with Pavel's UX/product/design leadership lanes.

## Job Search Terminal Adaptation

- Evaluation runs from the Job Detail dashboard action.
- Results write to `evaluations` and update the related `jobs` row.
- Score, recommendation, strengths, gaps, red flags, resume evidence, keywords,
  and legitimacy assessment persist after restart.
- Corrections from the dashboard write to `evaluation_feedback`.
- Strategy shows recent evaluation feedback so wrong scores can inform future
  role-direction tuning.

## Guardrails

- Evidence is drawn from the local profile, role directions, skill inventory,
  job text, and extracted resume evidence.
- The evaluator does not invent resume claims.
- Scanner-only jobs are marked as limited evidence when the full job
  description is not available.
- Live compensation research, PDF generation, and application-answer drafting
  remain deferred to later phases.

## Checks

```bash
npm run evaluation:check
npm run db:check
npm run lint
npm run typecheck
npm run build
```

`evaluation:check` evaluates a seeded job, verifies the A-G section structure,
and verifies that user correction feedback is saved.
