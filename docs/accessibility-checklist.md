# Accessibility Checklist

Job Search Terminal targets WCAG 2.2 AA defaults.

## Global Requirements

- Text and interactive states meet AA contrast.
- Focus is visible for every interactive element.
- Controls have accessible names.
- Form fields have explicit labels.
- Error text is programmatically associated with the field.
- Status is not communicated by color alone.
- Motion respects `prefers-reduced-motion`.
- Layout supports keyboard and screen-reader navigation.
- Semantic landmarks are present: `header`, `nav`, `main`.
- Heading order is logical and does not skip levels for visual effect.

## Component Requirements

- Buttons use native `button` elements unless they navigate.
- Links use `a` only for navigation.
- Tables include column headers and `scope`.
- Badges include readable status text.
- Inputs expose `aria-invalid` and descriptions when errors or hints exist.
- Selects have labels and optional descriptive text.
- Every `aria-describedby` / `aria-labelledby` resolves to an element that is actually
  in the DOM. Watch third-party widgets that auto-generate ids from a module-level
  counter: the count restarts in the browser but persists for the life of the server
  process, so the server-rendered reference can point at nothing. Give such widgets an
  explicit, stable `id` — both `DndContext`s (`ai-settings-provider-priority`,
  `applications-kanban`) do.

## Manual Checks

Before finishing a UI change:

- Tab through the full page.
- Confirm focus is visible without relying on hover.
- Check text and status contrast.
- Confirm the page works at narrow mobile width.
- Confirm reduced motion does not break the interface.
- Check the browser console for React hydration mismatches. A mismatch on an ARIA
  attribute is an accessibility bug, not just a warning — the reference that survives
  hydration is usually the broken one.
