"use client";
import { type ReactNode, useEffect } from "react";

type Props = {
  open: boolean;
  onClose?: () => void;
  title: string;
  description?: ReactNode;
  size?: "sm" | "md" | "lg";
  sheet?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, description, size = "md", sheet = false, children, footer }: Props) {
  useEffect(() => {
    if (!open || !onClose) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  const maxW = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  const align = sheet ? "items-end sm:items-center" : "items-center";
  const pad = sheet ? "p-0 sm:p-4" : "p-4 sm:p-6";
  const rounded = sheet ? "rounded-t-panel sm:rounded-panel" : "rounded-2xl";

  return (
    <div
      aria-labelledby="modal-title"
      aria-modal="true"
      className={`fixed inset-0 z-50 flex ${align} justify-center ${pad} bg-black/50 backdrop-blur-sm`}
      role="dialog"
    >
      <div className={`flex max-h-[92dvh] w-full ${maxW} flex-col overflow-hidden ${rounded} bg-panel shadow-2xl`}>
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink" id="modal-title">{title}</h2>
            {description != null && (
              <div className="mt-1 text-xs text-muted leading-5">{description}</div>
            )}
          </div>
          {onClose && (
            <button
              aria-label="Close"
              className="shrink-0 mt-0.5 text-muted hover:text-ink leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer != null && (
          <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
