import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { helpCategories, helpPages } from "@/lib/help/content";
import { getHelpIcon } from "./help-icons";

type HelpSiteShellProps = {
  activeSlug?: string;
  children: ReactNode;
};

export function HelpSiteShell({ activeSlug, children }: HelpSiteShellProps) {
  return (
    <Shell activeItem="Help">
      <div className="grid gap-8">
        <section className="overflow-hidden rounded-panel border border-border bg-panel shadow-[var(--shadow-card)]">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
            <div className="grid content-center gap-5 p-6 md:p-8">
              <Badge>Open-source help site</Badge>
              <div className="grid gap-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-ink md:text-5xl">
                  Job Search Terminal docs
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted">
                  Complete guidance for setup, AI providers, resume lanes, ATS-friendly PDFs, job scanning, LinkedIn imports,
                  tailoring, applications, interviews, data, and troubleshooting.
                </p>
                <p className="max-w-2xl text-sm leading-6 text-muted">
                  Stored data stays on your machine. AI actions use the provider you configure: OpenAI, Anthropic,
                  Google Gemini, or Ollama running locally.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))]"
                  href="/help/getting-started"
                >
                  Start the guide
                </Link>
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent"
                  href="/help/resume-lanes"
                >
                  Resume and ATS guide
                </Link>
              </div>
            </div>
            <div className="relative min-h-64 border-t border-border bg-surface lg:border-l lg:border-t-0">
              <Image
                alt="Job Search Terminal dashboard screenshot"
                className="object-cover object-left-top"
                fill
                priority
                sizes="(min-width: 1024px) 520px, 100vw"
                src="/images/job-search-terminal/job-search-terminal-dashboard.png"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="self-start rounded-panel border border-border bg-panel p-4 shadow-[var(--shadow-card)] lg:sticky lg:top-[calc(var(--shell-header-offset)+1rem)]">
            <Link
              className={activeSlug ? "block rounded-control px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-ink" : "block rounded-control bg-surface px-3 py-2 text-sm font-semibold text-accent"}
              href="/help"
            >
              Help home
            </Link>

            <nav aria-label="Help topics" className="mt-4 grid gap-4">
              {helpCategories.map((category) => (
                <div className="grid gap-1" key={category}>
                  <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">{category}</p>
                  {helpPages
                    .filter((page) => page.category === category)
                    .map((page) => {
                      const Icon = getHelpIcon(page.icon);
                      const active = activeSlug === page.slug;
                      return (
                        <Link
                          aria-current={active ? "page" : undefined}
                          className={
                            active
                              ? "flex items-center gap-2 rounded-control bg-surface px-3 py-2 text-sm font-semibold text-accent"
                              : "flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
                          }
                          href={`/help/${page.slug}`}
                          key={page.slug}
                        >
                          <Icon aria-hidden className="h-4 w-4 shrink-0" />
                          <span>{page.shortTitle}</span>
                        </Link>
                      );
                    })}
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </Shell>
  );
}
