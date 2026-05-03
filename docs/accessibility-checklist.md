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

## Manual Checks

Before finishing a UI change:

- Tab through the full page.
- Confirm focus is visible without relying on hover.
- Check text and status contrast.
- Confirm the page works at narrow mobile width.
- Confirm reduced motion does not break the interface.
