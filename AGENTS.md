# Job Search Terminal — Agent Instructions

Job Search Terminal is a local-first, dashboard-first job-search command center.
It discovers jobs from ATS APIs, scores them against a career profile using AI,
generates tailored resumes, drafts application answers, and tracks applications —
all running locally on the user's machine with no cloud storage.

## Project Direction

- Claude Code is the primary development and orchestration tool.
- Codex is an approved project collaborator for implementation, review,
  documentation, verification, commits, and pushes when the user requests it.
- `AGENTS.md` is the authoritative agent contract for this repo.
- Detailed project documentation belongs in `docs/`.
- Keep `README.md` short and link to docs instead of duplicating detail.
- After adding or changing functionality, always document it in the same change
  set before considering the work complete. Update user-facing docs, technical
  references, and in-app help as applicable.

## Architecture

- **Framework:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Runtime:** local Node.js process — all data stays on the user's machine
- **Data store:** SQLite via `better-sqlite3` at `data/job-search-terminal.sqlite`
- **PDF generation:** Playwright-based HTML-to-PDF (requires Chrome)
- **AI:** provider-mediated calls via `src/lib/ai/` — supports OpenAI, Anthropic, Google Gemini
- **Job scanning:** Greenhouse / Ashby / Lever ATS APIs configured via `config/portals.example.yml`

## Browser Job Board Scanner

Codex can use the Codex Chrome Extension for signed-in or session-dependent job
boards. Claude Desktop can use Claude in Chrome. Both runners must follow the
same local import contract:

1. Read target roles, preferred locations, remote preference, and title filters
   from `data/job-search-terminal.sqlite`.
2. Browse only visible job-board results in Chrome for LinkedIn, Wellfound,
   Work at a Startup, Glassdoor, Indeed, or Monster.
3. Extract company, title, location, description, platform URL, and a visible
   job-specific employer/ATS apply URL when one exists.
4. Prefer the employer/ATS URL as the job URL; otherwise use the platform job
   URL. Preserve the platform URL as source provenance.
5. Write JSON to `data/job-board-imports/` using a `.tmp` file first, then
   rename to the final `.json` file. Legacy LinkedIn files may still be written
   to `data/linkedin-imports/`.

Supported `metadata.source` values are `linkedin`, `wellfound`,
`workatastartup`, `glassdoor`, `indeed`, and `monster`. Never click Apply,
submit forms, log in for the user, message
recruiters, bypass bot detection, or continue after CAPTCHA/login walls. Use the
in-app browser for local Job Search Terminal verification; use Chrome only when
the task needs the user's browser session.

## Resume Lanes

Resumes are uploaded through the in-app UI (Profile → Resumes tab). The app
supports multiple resume lanes — one per career angle or role type (e.g.,
"Leadership", "IC / Individual Contributor", "Operations"). Do not collapse the
workflow into a single universal resume. Preserve the multi-lane model.

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

After any change, run:

```bash
npm run lint
npm run typecheck
npm run build
```

For feature work, also verify the actual dashboard flow in the browser.
