# Backlog

Issues and improvements sourced from user feedback, code review, and testing. Ordered by severity within each section.

---

## Blocker

### OB-1 — Onboarding traps user when AI extraction hits MAX_TOKENS

**Source:** User feedback (Chris Blocher, June 2026)
**Files:** `src/components/onboarding-wizard-modal.tsx:83–87, 405–416` · `src/components/extract-profile-button.tsx:26–36`

When the AI extraction call fails (e.g. Gemini MAX_TOKENS on a long resume), `extractionDone` stays `false` and "Continue to job preferences →" stays disabled. The preferences step is gated behind `statuses.resume = hasResume && hasExtractedProfile`, and the close (×) button only renders when `statuses.ready`. There is no skip, dismiss, or retry-with-different-model path. The user is fully trapped.

**Fix direction:** Allow the user to bypass the extraction gate when extraction errors out — either a "Skip for now" option on the extraction card, or allowing the continue button when an extraction error is present and the resume is uploaded. Extraction can be re-run later from the Profile page.

---

## High

### OB-2 — Onboarding re-appears after git pull despite prior dismissal

**Source:** User feedback (Chris Blocher, June 2026)
**Files:** `src/app/dashboard/page.tsx:70–72` · `src/components/new-user-onboarding.tsx:21–23`

`showOnboarding = !onboardingComplete || !onboardingDismissed`. If `onboardingComplete` ever becomes false — e.g. when `hasRolePreferences` requires positive title filters the user never set — onboarding re-triggers even though `onboardingDismissed = true`. This is compounded by OB-1: a user trapped by the extraction failure can never confirm preferences, keeping `onboardingComplete = false` permanently.

**Fix direction:** Once a user has dismissed onboarding, `onboardingDismissed` should be the authoritative gate. Decouple the "show modal" condition from `onboardingComplete` — instead surface a non-blocking banner or nudge for incomplete setup rather than re-triggering the full modal.

---

### RP-1 — Resume parser misclassifies sections on complex "super resume" format

**Source:** User feedback (Chris Blocher, June 2026) · super resume reviewed
**Files:** `src/lib/documents/resume-ai-extractor.ts:52` (MAX_AI_EXTRACTION_CHARS) · `src/lib/documents/resume-builder.ts` (heuristic parser)

The user's resume has: company-description paragraphs under each employer, a SKILLS section with three named sub-bullets (Technical, Business, Soft skills — each a long comma-separated list), and additional sections (CONTRIBUTIONS, CERTIFICATIONS, PROJECTS). The AI extractor truncates at 12 000 chars. Observed failures:

- Company summary paragraphs parsed as standalone sections
- Soft skills not placed under SKILLS (parser has a single flat `skills[]` array with no sub-category model)
- Business skills duplicated
- Projects merged with certifications

**Fix direction:** Raise or remove the char cap for the resume builder extraction (it truncates differently from the profile extraction which caps at 8 000). Add recognition for named skill sub-categories. Consider a post-parse cleanup pass that merges sections with the same type when the AI produces duplicates.

---

## Medium

### RB-1 — "Add section" is only at the bottom — no insert above/below affordance

**Source:** User feedback (Chris Blocher, June 2026)
**File:** `src/components/resume-builder-editor.tsx:161–166, 774–803`

The "Add section" button appends to the end of the section list. Users editing the middle of a resume have to add at the bottom then move up. Suggestion: add inline "Add section ↑ / ↓" affordances between sections, and "Add entry ↑ / ↓" between experience/education entries, so insertion is contextual.

**Fix direction:** Add an `addSectionAt(index, type)` variant and render a small insert button in the gap between each section. Same pattern for experience and education entries.

---

### RB-2 — "Improve" button color is indistinguishable from "Remove"

**Source:** User feedback (Chris Blocher, June 2026)
**File:** `src/components/resume-builder-editor.tsx:391` · `src/styles/tokens.css:13, 19`

`--color-accent: 215 69 39` (red-orange) is used for the "✨ Improve" button. `--color-danger: 220 38 38` (red) is used for "Remove". Both read as red — constructive and destructive actions share the same visual register.

**Fix direction:** Change "Improve" to use a neutral or blue color (e.g. `text-muted` with `hover:text-ink`, or a purpose-specific `text-info` token) so the red register is reserved exclusively for destructive actions.

---

### RB-3 — "Remove" button is separated from the section it targets

**Source:** User feedback (Chris Blocher, June 2026)
**File:** `src/components/resume-builder-editor.tsx:378–413`

Each section card header uses a `flex justify-between` row with the section title on the left and a cluster of controls (Improve · Move up · Move down · Remove) on the right. "Remove" sits at the far right, visually disconnected from the section name and easy to miss or mistake.

**Fix direction:** Move "Remove" closer to the section title, or relocate it to a more prominent position (e.g. a dedicated row below the title field, or a small icon button directly adjacent to the section name).

---

### RB-4 — "Section title" label should be renamed and use placeholder text

**Source:** User feedback (Chris Blocher, June 2026)
**File:** `src/components/resume-builder-editor.tsx:380`

The text input above each section currently has the label `Section title`. Suggestion: change the label to `Section` and move `Section title` into the input's placeholder, so the label names the field type rather than its expected value — consistent with standard form conventions.

---

## Low

### DX-1 — README missing a "how to restart after first setup" section

**Source:** User feedback (Chris Blocher, June 2026)
**File:** `README.md:88–109`

Returning users go back to the README but don't find a "just run `npm run dev`" shortcut. The Quick Start section covers first-time setup; the Core Commands table buries `npm run dev` among database and build commands.

**Fix direction:** Add a short "Day-to-day usage" or "Starting the app again" section near the top of the README, immediately after Quick Start.

---

### DX-2 — "Runs locally" claim needs explicit AI-provider data-flow caveat

**Source:** User feedback (Chris Blocher, June 2026)
**File:** `README.md:10–14, 183–191`

The README badge says "local-first" and the opening paragraph says "all on your own computer," which a user reasonably read as implying a local LLM (Ollama / LM Studio). The Privacy section does clarify the AI-provider data flow, but it's several screens down.

**Fix direction:** Add one sentence near the top of the README (and on the marketing site) that makes the data flow explicit — e.g. "Your data stays on your machine. AI features send text to the provider you configure (OpenAI, Anthropic, or Gemini) — no local model required."
