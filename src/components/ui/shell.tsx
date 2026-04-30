import type { ReactNode } from "react";
import Link from "next/link";

type ShellProps = {
  children: ReactNode;
  activeItem?: string;
};

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Profile", href: "/profile" },
  { label: "Strategy", href: "/strategy" },
  { label: "Jobs", href: "/jobs" },
  { label: "Applications", href: "/applications" },
  { label: "Interview Prep", href: "/interview-prep" },
  { label: "Analytics", href: "/analytics" },
  { label: "Resumes", href: "/resumes" },
  { label: "Settings", href: "/settings" }
];

export function Shell({ children, activeItem = "Dashboard" }: ShellProps) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted">JS</p>
            <h1 className="text-lg font-semibold text-ink">Job Search Command Center</h1>
          </div>
          <nav aria-label="Primary navigation">
            <ul className="flex flex-wrap gap-1">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    aria-current={activeItem === item.label ? "page" : undefined}
                    className={
                      activeItem === item.label
                        ? "inline-flex min-h-10 items-center rounded-control bg-surface px-3 text-sm font-semibold text-ink"
                        : "inline-flex min-h-10 items-center rounded-control px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
                    }
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
