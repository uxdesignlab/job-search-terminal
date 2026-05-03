# Design System

The Job Search Terminal interface is a focused work dashboard: compact, calm, professional, and
built for repeated scanning. Every visual decision should reduce cognitive load,
not add it.

---

## Principles

- Use reusable primitives before adding page-local styling.
- Keep cards flat at rest with subtle borders; no heavy shadows or gradients.
- Compact information density suitable for job lists, status badges, and scoring.
- Avoid decorative gradients, oversized marketing heroes, nested cards, and
  one-color palettes.
- Use plain language. Never surface engine details unless the user asks.
- Status is never communicated by color alone — always pair color with text.

---

## Design Tokens

Tokens are defined in `src/styles/tokens.css` and exposed to Tailwind via
`tailwind.config.ts`. Always use token-based utilities instead of raw color
values or arbitrary Tailwind numbers.

### Colors

| Token | CSS variable | RGB value | Tailwind utility | Usage |
|---|---|---|---|---|
| Surface | `--color-surface` | `246 247 249` | `bg-surface` | Page background |
| Panel | `--color-panel` | `255 255 255` | `bg-panel` | Card / nav background |
| Ink | `--color-ink` | `14 17 22` | `text-ink` | Primary text, headings |
| Muted | `--color-muted` | `94 104 120` | `text-muted` | Secondary text, labels |
| Border | `--color-border` | `225 229 235` | `border-border` | Dividers, card borders |
| Accent | `--color-accent` | `215 69 39` | `bg-accent`, `text-accent` | Brand, CTAs, active nav |
| Accent Strong | `--color-accent-strong` | `179 53 32` | (hover only) | Accent hover state |
| Success | `--color-success` | `22 163 74` | `text-success`, `bg-success` | Positive status |
| Warning | `--color-warning` | `202 138 4` | `text-warning`, `bg-warning` | Caution status |
| Danger | `--color-danger` | `220 38 38` | `text-danger`, `bg-danger` | Error / destructive |

**Semantic color rules:**
- `surface` — only for the outermost page background.
- `panel` — cards, header, footer, dropdowns.
- Never use raw Tailwind `gray-*` values; always use the token utilities.
- Tinted Badge backgrounds are expressed as `bg-success/10`, `bg-warning/10`,
  `bg-danger/10` with matching `border-*` and `text-*` at matching opacity.

### Typography

| Token | CSS variable | Value |
|---|---|---|
| Font stack | `--font-sans` | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |

**Scale in practice:**

| Use | Tailwind classes |
|---|---|
| Page title (`h1`) | `text-3xl font-semibold tracking-normal text-ink` |
| Section heading (`h2`) | `text-base font-semibold text-ink` |
| Card description | `text-sm leading-6 text-muted` |
| Body / labels | `text-sm text-ink` |
| Meta / secondary | `text-xs text-muted` |
| Nav links | `text-sm font-medium` |

### Spacing

| Token | CSS variable | Value | Tailwind equivalent |
|---|---|---|---|
| space-1 | `--space-1` | `0.25rem` | `p-1` / `gap-1` |
| space-2 | `--space-2` | `0.5rem` | `p-2` / `gap-2` |
| space-3 | `--space-3` | `0.75rem` | `p-3` / `gap-3` |
| space-4 | `--space-4` | `1rem` | `p-4` / `gap-4` |
| space-5 | `--space-5` | `1.25rem` | `p-5` / `gap-5` |
| space-6 | `--space-6` | `1.5rem` | `p-6` / `gap-6` |
| space-8 | `--space-8` | `2rem` | `p-8` / `gap-8` |
| space-10 | `--space-10` | `2.5rem` | `p-10` / `gap-10` |

Card internal padding is `p-5` (space-5). Page sections use `gap-8` between
stacked blocks.

### Radii

| Token | CSS variable | Value | Tailwind utility |
|---|---|---|---|
| Control | `--radius-control` | `0.5rem` | `rounded-control` |
| Panel | `--radius-panel` | `0.75rem` | `rounded-panel` |

- `rounded-control` — buttons, inputs, badges, selects, small chips.
- `rounded-panel` — cards, dropdowns, dialogs, the nav shell.

### Shadows and borders

| Token | CSS variable | Value |
|---|---|---|
| Focus ring | `--shadow-focus` | `0 0 0 3px rgb(215 69 39 / 0.2)` |
| Card shadow | `--shadow-card` | `0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)` |
| Subtle border | `--border-subtle` | `1px solid rgb(var(--color-border))` |

Focus: every focusable element must show `--shadow-focus` on `:focus-visible`.
The Tailwind alias is `shadow-focus`.

### Layout constants

| Token | CSS variable | Value | Purpose |
|---|---|---|---|
| Shell header offset | `--shell-header-offset` | `4.5rem` | Sticky table header top offset |

Max content width: `max-w-6xl` (72rem). Horizontal padding: `px-6`.

### Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

All animations and transitions must respect `prefers-reduced-motion`.

---

## UI Primitives

All primitives live in `src/components/ui/`. Import from the barrel:

```ts
import { Button, Badge, Card, ... } from "@/components/ui";
```

Compose these primitives before writing new page-local styles.

### Button

**File:** `src/components/ui/button.tsx`

Three exports: `Button` (native `<button>`), `LinkButton` (Next.js `<Link>`),
`ExternalLinkButton` (`<a target="_blank">`).

**Variants:**

| Variant | Appearance | Usage |
|---|---|---|
| `primary` | Accent background, white text | Primary CTAs, confirm actions |
| `secondary` | White background, border, ink text | Default secondary actions |
| `quiet` | Transparent background | Tertiary actions, icon-adjacent |

**Base styles:** `min-h-11` (44 px minimum target), `rounded-control`, `px-4 py-2`, `text-sm font-medium`.

**Disabled state:** `disabled:cursor-not-allowed disabled:opacity-55`.

```tsx
<Button variant="primary" onClick={handleSave}>Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="quiet">Clear</Button>
<LinkButton href="/jobs">View Jobs</LinkButton>
<ExternalLinkButton href="https://example.com">Open ↗</ExternalLinkButton>
```

### Badge

**File:** `src/components/ui/badge.tsx`

**Tones:**

| Tone | Background / Border / Text | Usage |
|---|---|---|
| `neutral` (default) | `bg-surface / border-border / text-ink` | Default labels, counts |
| `success` | `bg-success/10 / border-success/35 / text-success` | Applied, offer, positive |
| `warning` | `bg-warning/10 / border-warning/35 / text-warning` | Follow-up needed, caution |
| `danger` | `bg-danger/10 / border-danger/35 / text-danger` | Rejected, red flags, errors |

**Base styles:** `min-h-7`, `rounded-control`, `px-2.5`, `text-xs font-medium`.

**Rule:** always include readable text alongside the tone color. Never use color
as the sole status signal.

```tsx
<Badge tone="success">Applied</Badge>
<Badge tone="warning">Follow-up needed</Badge>
<Badge tone="danger">Rejected</Badge>
<Badge>New</Badge>
```

### Card

**File:** `src/components/ui/card.tsx`

Exports: `Card`, `CardHeader`, `CardTitle`, `CardDescription`.

`Card` is a white panel with `rounded-panel border border-border bg-panel p-5`
and `--shadow-card`. Avoid nesting cards inside cards.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Application Tracker</CardTitle>
    <CardDescription>Track your progress across all jobs.</CardDescription>
  </CardHeader>
  {/* content */}
</Card>
```

### Input

**File:** `src/components/ui/input.tsx`

Text input with explicit `<label>`. Always pass `id` so the label associates
correctly. Use `aria-invalid` and descriptive text when validation fails.

### Select

**File:** `src/components/ui/select.tsx`

Styled native `<select>`. Always include a `<label>`. Provide optional
descriptive text for clarification.

### Textarea

**File:** `src/components/ui/textarea.tsx`

Multi-line text input. Same labeling rules as `Input`.

### SubmitButton

**File:** `src/components/ui/submit-button.tsx`

A `Button` variant for form submissions with pending state. Renders a spinner
and disables the button while the server action is processing.

### StatCard

**File:** `src/components/ui/stat-card.tsx`

Composes `Card` and `Badge` into a metric tile. Use for dashboard summary
numbers.

Props: `label` (metric name), `value` (large number), `detail` (badge text),
`tone` (badge tone).

```tsx
<StatCard label="Active applications" value="12" detail="+3 this week" tone="success" />
```

### EmptyState

**File:** `src/components/ui/empty-state.tsx`

Dashed-border placeholder shown when a list or section has no data. Has
`role="status"` for screen readers.

Props: `title`, `description`.

```tsx
<EmptyState title="No jobs yet" description="Run a scan to discover matching jobs." />
```

### PageHeader

**File:** `src/components/ui/page-header.tsx`

Consistent page-level heading section. Responsive: stacks on mobile, row on
desktop.

Props: `eyebrow` (optional badge text), `title`, `description`, `actions`
(optional action buttons slot).

```tsx
<PageHeader
  eyebrow="Phase 8"
  title="Applications"
  description="Track every application from found to offer."
  actions={<Button>Add manually</Button>}
/>
```

### ProgressBar

**File:** `src/components/ui/progress-bar.tsx`

Horizontal progress indicator. Use for keyword coverage, profile completion.

### Table

**File:** `src/components/ui/table.tsx`

Accessible data table with sticky header support. Column headers use `scope="col"`.
Sticky headers clear the nav via `top-[var(--shell-header-offset)]`.

### DataTableSortFilter

**File:** `src/components/ui/data-table-sort-filter.tsx`

A suite of components and hooks that add per-column sort, multi-value filter
dropdowns, and saved filter presets to any data table.

**Components:**

`DataTableColHeader` — renders a `<th>` with a clickable button that opens the
sort/filter dropdown. Shows a filled dot (●) when the column has an active
filter, an arrow when sorted. Highlighted in accent when active.

`DataTableSortFilterDropdown` — the dropdown panel itself. Opens anchored to
the column header button. Contains:
- Sort A→Z and Z→A buttons (bold accent when active).
- "Filter by [column]" section with a scrollable checkbox list. Each option
  is a multi-select checkbox. "Select all" toggle included. A search input
  appears automatically when there are more than 7 options.
- "Clear filter" link when a filter is active.

`DataTableActiveFiltersSummary` — toolbar above the table that shows "X of Y
[items]" when filters are active, a "Clear all filters" link, and an optional
trailing slot for saved filter chips.

`DataTableSavedFiltersBar` — chip row for named filter presets. Shows up to 5
saved chips. Each chip has an apply button (click label) and a delete button
(×). Includes a "Save filter" button that opens an inline name field.

**Hooks:**

`useDataTableSortFilterState(initialSort, initialFilters?)` — manages sort col,
sort dir, per-column filter Sets, and the open dropdown position. Returns
`sort`, `filters`, `activeFilterCount`, `openFilter`, `handleSort`,
`handleFilter`, `clearAllFilters`, `applySortAndFilters`.

`useDataTableSavedFilters(storageKey)` — loads and persists named filter
presets from the SQLite `table_saved_filters` table (falls back to
`localStorage`). Returns `items`, `ready`, `saveSnapshot`, `deleteById`.

**Saved filter persistence:**

Presets are stored in `table_saved_filters` (migration `0026`). Each table has
a stable key defined in `src/lib/table-saved-filter-storage-keys.ts`:

| Table | Key constant |
|---|---|
| Jobs | `TABLE_SAVED_FILTER_STORAGE_KEYS.mainJobs` |
| Archived jobs | `TABLE_SAVED_FILTER_STORAGE_KEYS.archivedJobs` |
| Applications | `TABLE_SAVED_FILTER_STORAGE_KEYS.applications` |
| Generated documents | `TABLE_SAVED_FILTER_STORAGE_KEYS.generatedDocs` |
| Scan sources | `TABLE_SAVED_FILTER_STORAGE_KEYS.scanSources` |
| Discovered sources | `TABLE_SAVED_FILTER_STORAGE_KEYS.discoveredSources` |

Maximum 5 presets per table. Duplicate snapshots are not saved. Labels are
auto-generated from active column names but the user can rename before saving.
Maximum label length: 60 characters.

### Shell

**File:** `src/components/ui/shell.tsx`

The root layout wrapper. Renders the sticky header with primary nav, the
`<main>` content area, and the footer.

**Navigation structure:**

Primary nav (always visible): Dashboard · Jobs · Applications · Interview Prep ·
Analytics · Resumes

Account dropdown (hover): Profile · Strategy · Settings

The Account menu item includes a live provider health dot: green = active AI,
yellow = key set but provider mismatch, red = no key configured.

**Layout rules:**
- `<header>` is sticky at `z-40` with `min-h-[var(--shell-header-offset)]`.
- `<main>` is `max-w-6xl mx-auto px-6 py-8`.
- Footer uses `max-w-6xl` with attribution links.

---

## Dashboard Layout Patterns

### Page-level structure

Every page uses:

```tsx
<Shell activeItem="PageName">
  <PageHeader title="..." description="..." actions={...} />
  {/* page sections */}
</Shell>
```

### Grid layouts

Summary stat row: `grid grid-cols-2 gap-4 sm:grid-cols-4`

Two-column content: `grid gap-6 lg:grid-cols-[2fr_1fr]`

Card grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`

### Section spacing

Sections within a page are separated by `space-y-8` or `gap-8`.
Within a card, inner sections use `space-y-4` or `space-y-6`.

---

## State Patterns

### Loading

Use skeleton placeholders or a spinner with descriptive `aria-label` text.
Never leave a loading UI without labeling it for screen readers.

### Empty

Use `EmptyState` with a descriptive title and one-sentence explanation of what
to do next.

### Error

Display inline error text below the failing element. Associate it via
`aria-describedby`. Use `Badge tone="danger"` for status-level errors.

### Success

Use `Badge tone="success"` or a transient confirmation message. Do not rely on
color alone.

---

## Accessibility Requirements

All UI must meet WCAG 2.2 AA. See `docs/accessibility-checklist.md` for the
full checklist.

**Quick rules:**
- Minimum control height: `min-h-11` (44 px practical target).
- Focus ring: `shadow-focus` must appear on all focusable elements at `:focus-visible`.
- Color: never use color as the only status signal.
- Labels: every `input`, `select`, and `textarea` needs an associated `<label>`.
- Tables: always include `scope="col"` on `<th>` elements.
- Landmarks: every page has `<header>`, `<nav>`, `<main>` via `Shell`.
- Motion: all animations must respect `prefers-reduced-motion`.

---

## Tailwind Configuration

`tailwind.config.ts` extends the theme with token-backed aliases:

```ts
colors:   surface · panel · ink · muted · border · accent · success · warning · danger
radii:    control · panel
shadows:  focus
fonts:    sans (Inter stack via --font-sans)
```

Use these aliases everywhere. Do not use raw Tailwind color numbers (`gray-200`,
`red-500`) unless there is no token equivalent.
