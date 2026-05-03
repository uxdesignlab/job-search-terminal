# Profile And Resume Intelligence

Phase 4 makes the profile and strategy screens evidence-aware without adding AI
or job-scanning behavior.

## Source Inputs

The current source resumes are the five PDFs in `assets/`:

- Principal / Product Design Leadership
- UX Design
- Accessibility / Design Systems
- Design Operations
- Teaching / UX Education

## Extraction Flow

```bash
npm run profile:extract
npm run profile:check
```

`profile:extract` reads the PDF resumes locally, extracts text, stores it in
SQLite, records word counts, and saves short evidence snippets per resume lane.

`profile:check` verifies:

- five resume lanes are present
- extracted text exists for each lane
- evidence exists for each lane
- skills were derived from resume text
- role directions reference resume evidence

## Guardrails

- Extraction is deterministic and local.
- The system only creates skill signals when matching terms are found in resume text.
- Evidence snippets are stored with the resume lane, so generated profile claims
  can be traced back to source material.
- No scanner, PDF generation, OpenAI calls, or application automation is part of
  Phase 4.

## Editable Fields

The Profile screen lets the user edit:

- target roles
- desired industries
- compensation needs
- work preferences
- urgency
- constraints
- deal breakers
- career intent
- career-change interest
- confidence level
- skills to use more
- skills to use less

The Strategy screen lets the user refine role direction outputs:

- fit level
- score
- rationale
- gaps

All edits are saved to SQLite and logged in `activity_log`.
