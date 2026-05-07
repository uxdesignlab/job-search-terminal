"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { HelpPage } from "@/lib/help/content";
import { getHelpIcon } from "./help-icons";

type HelpSearchProps = {
  pages: HelpPage[];
};

export function HelpSearch({ pages }: HelpSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalizedQuery) return pages;
    return pages.filter((page) => {
      const searchable = [
        page.title,
        page.shortTitle,
        page.description,
        page.category,
        page.highlights.join(" "),
        ...page.sections.flatMap((section) => [
          section.title,
          section.intro ?? "",
          ...(section.bullets ?? []),
          ...(section.steps ?? []).flatMap((step) => [step.title, step.body]),
          section.callout?.title ?? "",
          section.callout?.body ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [normalizedQuery, pages]);

  return (
    <section className="grid gap-4 rounded-panel border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor="help-site-search">
          Search the help site
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="min-h-11 w-full rounded-control border border-border bg-white py-2 pl-10 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent"
            id="help-site-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search providers, resumes, ATS, LinkedIn, scans, PDF..."
            type="search"
            value={query}
          />
        </div>
      </div>

      <div className="grid gap-3" aria-live="polite">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {results.length} result{results.length === 1 ? "" : "s"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {results.map((page) => {
            const Icon = getHelpIcon(page.icon);
            return (
              <Link
                className="group grid gap-3 rounded-panel border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-white"
                href={`/help/${page.slug}`}
                key={page.slug}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-control bg-white text-accent shadow-[var(--shadow-card)]">
                    <Icon aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink group-hover:text-accent">{page.shortTitle}</span>
                    <span className="block text-xs text-muted">{page.category} · {page.readTime}</span>
                  </span>
                </span>
                <span className="text-sm leading-6 text-muted">{page.description}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
