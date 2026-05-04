# Contributing to Job Search Terminal

Thank you for your interest in contributing.

Job Search Terminal exists to help job seekers manage a difficult, fragmented, and often demoralizing process with better tools, more privacy, and less friction.

## License note

This project is licensed under Creative Commons Attribution-NonCommercial 4.0 International.

By contributing, you agree that your contribution will be made available under the same license.

Commercial use is not permitted without written permission from the copyright holder.

## Project principles

- Local-first by default
- Human-in-the-loop always
- No auto-submitting applications
- No spam workflows
- No dark patterns
- No unnecessary cloud dependency
- Accessibility matters
- Plain language beats cleverness
- Job seekers are under pressure; the product should reduce that pressure

## Good first contributions

- Improve documentation
- Add screenshots
- Improve setup instructions
- Add tests
- Improve accessibility
- Improve keyboard navigation
- Fix bugs in the dashboard flow
- Add supported ATS source examples
- Improve error messages
- Improve empty states
- Improve mobile layout

## Larger contributions

Please open an issue before starting larger work, including:

- New scanner behavior
- New AI provider support
- Changes to evaluation logic
- Changes to database schema
- New application workflow features
- New document generation features
- Major design system changes

## What we do not accept

We may reject contributions that:

- Enable mass auto-submission of job applications
- Scrape platforms that prohibit automated access
- Bypass third-party access controls
- Encourage spam outreach
- Misrepresent user qualifications
- Add hidden telemetry
- Require unnecessary hosted services
- Commit personal data, resumes, API keys, or generated application materials

## Development setup

```bash
git clone https://github.com/uxdesignlab/job-search-terminal.git
cd job-search-terminal
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Verification

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run build
```

For UI changes, also run or manually verify:

```bash
npm run quality:check
```

Manual checks:

- Keyboard navigation works
- Focus states are visible
- Forms have labels
- Tables have clear headers
- Empty states are understandable
- Error messages explain the fix
- Mobile layout does not break

## Pull request expectations

A good PR includes:

- Clear summary of what changed
- Why the change matters
- Screenshots for UI changes
- Notes about testing performed
- Any migration or data impact
- Any accessibility impact

## Data safety

Never commit:

- Real resumes
- Real applications
- API keys
- Local SQLite databases
- Generated PDFs with personal information
- Exported user data

Use fictional examples only.
