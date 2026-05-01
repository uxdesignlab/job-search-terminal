import type { ReactNode } from "react";
import Link from "next/link";
import { getAISettings } from "@/lib/db/queries";

type ShellProps = {
  children: ReactNode;
  activeItem?: string;
};

const ACCOUNT_ITEMS = [
  { label: "Profile", href: "/profile" },
  { label: "Strategy", href: "/strategy" },
  { label: "Settings", href: "/settings" }
];

const PRIMARY_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Jobs", href: "/jobs" },
  { label: "Applications", href: "/applications" },
  { label: "Interview Prep", href: "/interview-prep" },
  { label: "Analytics", href: "/analytics" },
  { label: "Resumes", href: "/resumes" }
];

function ProviderHealthDot() {
  const settings = getAISettings();
  const hasActive =
    (settings.activeProvider === "openai" && !!settings.openaiApiKey) ||
    (settings.activeProvider === "anthropic" && !!settings.anthropicApiKey) ||
    (settings.activeProvider === "gemini" && !!settings.geminiApiKey);
  const hasAny = !!(settings.openaiApiKey || settings.anthropicApiKey || settings.geminiApiKey);

  const color = hasActive ? "bg-success" : hasAny ? "bg-warning" : "bg-danger";
  const label = hasActive
    ? `AI active: ${settings.activeProvider}`
    : hasAny
      ? "AI key set but active provider has no key"
      : "No AI key configured";

  return (
    <span
      aria-label={label}
      className={`inline-block h-1.5 w-1.5 rounded-full ${color}`}
      title={label}
    />
  );
}

export function Shell({ children, activeItem = "Dashboard" }: ShellProps) {
  const isAccountActive = ACCOUNT_ITEMS.some((i) => i.label === activeItem);

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-0">
          {/* Logo */}
          <Link className="flex items-center gap-2 py-4 text-sm font-semibold text-ink" href="/dashboard">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-[10px] font-bold text-white">JS</span>
            <span className="hidden sm:inline text-ink/70">Job Search</span>
          </Link>

          {/* Primary nav */}
          <nav aria-label="Primary navigation" className="flex-1">
            <ul className="flex items-center">
              {PRIMARY_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    aria-current={activeItem === item.label ? "page" : undefined}
                    className={
                      activeItem === item.label
                        ? "relative inline-flex items-center px-3 py-4 text-sm font-medium text-accent after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-accent after:content-['']"
                        : "inline-flex items-center px-3 py-4 text-sm font-medium text-muted transition-colors hover:text-ink"
                    }
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}

              {/* Account dropdown */}
              <li className="relative ml-1 group">
                <button
                  aria-expanded={isAccountActive}
                  className={
                    isAccountActive
                      ? "relative inline-flex items-center gap-1 px-3 py-4 text-sm font-medium text-accent after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-accent after:content-['']"
                      : "inline-flex items-center gap-1 px-3 py-4 text-sm font-medium text-muted transition-colors hover:text-ink"
                  }
                  type="button"
                >
                  Account
                  <ProviderHealthDot />
                  <svg aria-hidden="true" className="h-3 w-3 opacity-50 group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Dropdown */}
                <ul className="invisible absolute right-0 top-full z-50 w-40 rounded-panel border border-border bg-white py-1 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
                  {ACCOUNT_ITEMS.map((item) => (
                    <li key={item.href}>
                      <Link
                        aria-current={activeItem === item.label ? "page" : undefined}
                        className={
                          activeItem === item.label
                            ? "flex items-center px-3 py-2 text-sm font-medium text-accent bg-surface"
                            : "flex items-center px-3 py-2 text-sm text-ink hover:bg-surface"
                        }
                        href={item.href}
                      >
                        {item.label}
                        {item.label === "Settings" && (
                          <span className="ml-auto"><ProviderHealthDot /></span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
