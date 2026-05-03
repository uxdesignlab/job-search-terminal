# Quality Hardening

These repeatable checks verify the local app without changing the product workflow.

## Automated Checks

```bash
npm run quality:check
npm run db:check
npm run profile:check
npm run scanner:check
npm run evaluation:check
npm run document:check
npm run application:check
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

`quality:check` uses local Chrome through Playwright Core. It verifies:

- primary dashboard routes return OK responses
- expected page content renders
- semantic landmarks and heading order
- form controls and action links have accessible names
- sampled text meets WCAG AA contrast thresholds
- keyboard focus is visible during tab navigation
- desktop and mobile screenshots are written to `output/quality/screenshots`

## Screenshot Review

Review the generated screenshots for:

- desktop layout at 1440px width
- mobile layout at 390px width
- no overlapping text or controls
- no clipped table or button labels
- no marketing-style hero sections
- compact dashboard proportions

## Manual QA Expectations

After Phase 9, QA should include:

- dashboard scan, activity, and metric states
- job detail evaluation, resume, answer, and tracker controls
- applications funnel and linked job rows
- resume preview/PDF links
- profile edit form labels, focus states, and saved feedback
- keyboard-only navigation through the main nav and job detail actions

