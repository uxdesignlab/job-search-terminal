import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, ExternalLink } from "lucide-react";
import { Badge, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { HelpPage } from "@/lib/help/content";
import { getRelatedPages } from "@/lib/help/content";
import { getHelpIcon } from "./help-icons";

type HelpArticleProps = {
  page: HelpPage;
};

export function HelpArticle({ page }: HelpArticleProps) {
  const Icon = getHelpIcon(page.icon);
  const relatedPages = getRelatedPages(page);

  return (
    <article className="grid gap-6">
      <section className="grid gap-5 rounded-panel border border-border bg-panel p-6 shadow-[var(--shadow-card)] md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{page.category}</Badge>
          <Badge>{page.readTime}</Badge>
        </div>
        <div className="grid gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-panel bg-surface text-accent">
            <Icon aria-hidden className="h-6 w-6" />
          </span>
          <h2 className="text-3xl font-semibold tracking-normal text-ink md:text-4xl">{page.title}</h2>
          <p className="max-w-3xl text-base leading-7 text-muted">{page.description}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {page.highlights.map((highlight) => (
            <div className="rounded-panel border border-border bg-surface p-3 text-sm leading-6 text-muted" key={highlight}>
              {highlight}
            </div>
          ))}
        </div>
      </section>

      {page.image ? (
        <div className="overflow-hidden rounded-panel border border-border bg-panel shadow-[var(--shadow-card)]">
          <Image
            alt={page.image.alt}
            className="h-auto w-full"
            height={720}
            sizes="(min-width: 1024px) 840px, 100vw"
            src={page.image.src}
            width={1280}
          />
        </div>
      ) : null}

      <section className="rounded-panel border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen aria-hidden className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-ink">On this page</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {page.sections.map((section) => (
            <a
              className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-ink"
              href={`#${section.id}`}
              key={section.id}
            >
              {section.title}
            </a>
          ))}
        </div>
      </section>

      <div className="grid gap-4">
        {page.sections.map((section) => (
          <section
            className="scroll-mt-28 rounded-panel border border-border bg-panel p-5 shadow-[var(--shadow-card)] md:p-6"
            id={section.id}
            key={section.id}
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <h3 className="text-xl font-semibold text-ink">{section.title}</h3>
                {section.intro ? <p className="text-sm leading-6 text-muted">{section.intro}</p> : null}
              </div>

              {section.steps ? (
                <ol className="grid gap-3">
                  {section.steps.map((step, index) => (
                    <li className="grid gap-1 rounded-panel border border-border bg-surface p-4" key={step.title}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel text-xs font-semibold text-accent">
                          {index + 1}
                        </span>
                        <h4 className="text-sm font-semibold text-ink">{step.title}</h4>
                      </div>
                      <p className="pl-10 text-sm leading-6 text-muted">{step.body}</p>
                    </li>
                  ))}
                </ol>
              ) : null}

              {section.bullets ? (
                <ul className="grid gap-2 text-sm leading-6 text-muted">
                  {section.bullets.map((bullet) => (
                    <li className="flex gap-2" key={bullet}>
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {section.callout ? (
                <div className="rounded-panel border border-accent/30 bg-accent/5 p-4">
                  <p className="text-sm font-semibold text-ink">{section.callout.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{section.callout.body}</p>
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      {page.externalLinks?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Research and official references</CardTitle>
            <CardDescription>External resources used to keep this guidance practical and current.</CardDescription>
          </CardHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {page.externalLinks.map((link) => (
              <a
                className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent"
                href={link.href}
                key={link.href}
                rel="noreferrer"
                target="_blank"
              >
                <span>{link.label}</span>
                <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              </a>
            ))}
          </div>
        </Card>
      ) : null}

      {relatedPages.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Related guides</CardTitle>
            <CardDescription>Continue through the workflow from here.</CardDescription>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {relatedPages.map((related) => {
              const RelatedIcon = getHelpIcon(related.icon);
              return (
                <Link
                  className="group grid gap-3 rounded-panel border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-white"
                  href={`/help/${related.slug}`}
                  key={related.slug}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink group-hover:text-accent">
                    <RelatedIcon aria-hidden className="h-4 w-4" />
                    {related.shortTitle}
                  </span>
                  <span className="text-sm leading-6 text-muted">{related.description}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                    Open guide <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}
    </article>
  );
}
