import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getHelpIcon } from "@/components/help/help-icons";
import { HelpSearch } from "@/components/help/help-search";
import { HelpSiteShell } from "@/components/help/help-site-shell";
import { Badge, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { helpCategories, helpPages } from "@/lib/help/content";

export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <HelpSiteShell>
      <div className="grid gap-6">
        <HelpSearch pages={helpPages} />

        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Badge>Documentation map</Badge>
              <h2 className="mt-3 text-2xl font-semibold text-ink">Browse by workflow</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted">
              This help site is organized around the work people actually do: setup, profile building, job discovery,
              LinkedIn import, evaluation, tailoring, tracking, interview prep, and recovery.
            </p>
          </div>

          {helpCategories.map((category) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{category}</CardTitle>
                <CardDescription>
                  {category === "Setup" && "Get the local app ready and connect the AI features."}
                  {category === "Profile" && "Build the resume and profile foundation for scoring and tailoring."}
                  {category === "Jobs" && "Find, import, filter, review, and maintain your job pipeline."}
                  {category === "Apply" && "Evaluate fit and produce reviewed application materials."}
                  {category === "Track" && "Move applications through the funnel and stay on top of follow-ups."}
                  {category === "Prep" && "Prepare evidence-backed interview answers."}
                  {category === "Reference" && "Understand privacy, data, safety rules, and common fixes."}
                </CardDescription>
              </CardHeader>
              <div className="grid gap-3 md:grid-cols-2">
                {helpPages
                  .filter((page) => page.category === category)
                  .map((page) => {
                    const Icon = getHelpIcon(page.icon);
                    return (
                      <Link
                        className="group grid gap-3 rounded-panel border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-white"
                        href={`/help/${page.slug}`}
                        key={page.slug}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-white text-accent shadow-[var(--shadow-card)]">
                              <Icon aria-hidden className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-ink group-hover:text-accent">{page.shortTitle}</span>
                              <span className="block text-xs text-muted">{page.readTime}</span>
                            </span>
                          </span>
                          <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted group-hover:text-accent" />
                        </span>
                        <span className="text-sm leading-6 text-muted">{page.description}</span>
                      </Link>
                    );
                  })}
              </div>
            </Card>
          ))}
        </section>
      </div>
    </HelpSiteShell>
  );
}
