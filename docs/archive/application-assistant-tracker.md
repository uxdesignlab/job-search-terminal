# Application Assistant And Tracker

Phase 8 ports the CareerOps manual application pattern into the dashboard. The
goal is copy-paste assistance and tracker updates, not browser automation.

## CareerOps Sources Reused

- `modes/apply.md`: paste or detect application questions, load the evaluated
  job context, generate personalized responses, present them for copy-paste,
  and only update the tracker after the candidate confirms the application.
- `modes/tracker.md`: maintain application status, show funnel statistics, and
  keep PDF/report readiness visible.
- `templates/states.yml`: preserve canonical tracker states and aliases where
  practical while expanding JS-specific pre-application states.

## JS Adaptation

- Application answers are generated from saved profile, job, evaluation, resume
  evidence, and generated-resume metadata.
- Common questions are prepared automatically:
  - why this role
  - why you are a fit
  - tell us about yourself
  - compensation expectations
  - location or work authorization constraints
- The user can paste one custom application question at a time.
- Drafts are stored in `application_answer_drafts` and linked to `jobs`.
- The dashboard presents answers for manual copy-paste only.

## Tracker Statuses

JS supports the following manual tracker states:

- Found
- Reviewed
- Resume generated
- Applied
- Follow-up needed
- Recruiter responded
- Interviewing
- Offer
- Rejected
- Skipped
- Archived

These extend CareerOps states for dashboard-first workflow visibility before an
application is submitted. Status changes write to `applications`, update the job
status, and add an `activity_log` event.

## Guardrails

- The app never submits job applications.
- The app never sends recruiter messages.
- Answer drafts must stay grounded in saved evidence and should avoid claims
  that are not present in the profile, resume evidence, job record, or
  evaluation.
- Follow-up dates are simple manual reminders in this phase, not automation.

## Verification

```bash
npm run application:check
npm run db:check
npm run lint
npm run typecheck
npm run build
```

