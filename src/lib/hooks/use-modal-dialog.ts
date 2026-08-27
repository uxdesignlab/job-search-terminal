"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

type Options = {
  /** Whether the dialog is currently on screen. */
  open: boolean;
  /** Escape handler. Omit to make Escape a no-op (a dialog the user must resolve). */
  onEscape?: () => void;
};

/**
 * Gives a dialog the behaviour `role="dialog" aria-modal="true"` only claims: focus
 * moves in on open and is trapped inside, the page behind it goes inert and stops
 * scrolling, Escape is handled, and focus returns to whatever opened it on close.
 *
 * The onboarding wizard declared itself modal while leaving 21 focusable elements
 * reachable behind it — including links to the very settings it was trying to own —
 * with focus still on `<body>` and Escape doing nothing.
 *
 * Returns a ref to attach to the dialog's outermost element.
 */
export function useModalDialog({ open, onEscape }: Options) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest handler without re-running the whole effect on every render.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus in. Prefer the dialog itself (it carries tabIndex={-1}) so the screen
    // reader announces the dialog's label before its first control.
    container.focus({ preventScroll: true });

    // Everything outside the dialog becomes inert, so AT and Tab both stop at it.
    //
    // Marking only `document.body`'s children is not enough: this dialog renders deep
    // inside the app tree, so the one body child that matters is the one *containing*
    // it, and skipping that leaves the whole page reachable. Walk up instead, making
    // each ancestor's other children inert — which covers the page without needing a
    // portal.
    const restoreInert: Array<() => void> = [];
    for (let node: HTMLElement = container; node !== document.body && node.parentElement; ) {
      const parent = node.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node || !(sibling instanceof HTMLElement)) continue;
        const had = sibling.hasAttribute("inert");
        if (!had) sibling.setAttribute("inert", "");
        restoreInert.push(() => { if (!had) sibling.removeAttribute("inert"); });
      }
      node = parent;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!escapeRef.current) return;
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;

      // `inert` already stops most browsers from tabbing out, but it is not universal
      // and does not wrap at the ends, so the cycle is closed explicitly.
      const items = focusableWithin(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreInert.forEach((restore) => restore());
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return containerRef;
}
