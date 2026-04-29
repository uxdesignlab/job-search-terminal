# Design System

The JS interface should feel like a focused work dashboard: compact, calm,
professional, and built for repeated scanning.

## Principles

- Use reusable primitives before page-local styling.
- Keep cards flat at rest with subtle borders.
- Use compact information density suitable for job lists, status, scoring, and
  application workflows.
- Avoid decorative gradients, oversized marketing heroes, nested cards, and
  one-color palettes.
- Use plain language. Do not surface engine details unless the user asks.

## Token Groups

Tokens live in `src/styles/tokens.css` and are exposed to Tailwind in
`tailwind.config.ts`.

- Color: surface, panel, ink, muted, border, accent, success, warning, danger.
- Type: system sans stack for predictable local rendering.
- Radius: `--radius-control` and `--radius-panel`.
- Focus: visible focus ring through `--shadow-focus`.
- Spacing: small fixed scale for dashboard rhythm.

## UI Primitives

Initial primitives live in `src/components/ui/`:

- `Button`
- `Badge`
- `Card`
- `Input`
- `Select`
- `Table`
- `Shell`

Future UI should compose these primitives before adding new ones.

## Dashboard Defaults

- Page max width: readable dashboard width, not full-bleed marketing layout.
- Primary navigation: semantic `nav` with compact links.
- Main content: semantic `main`, section headings, and tables for tabular data.
- Status: badge text plus tone, never color alone.
- Controls: minimum 44 px practical target height.
