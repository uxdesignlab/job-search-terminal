import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/help/help-article";
import { HelpSiteShell } from "@/components/help/help-site-shell";
import { helpPages, helpPagesBySlug } from "@/lib/help/content";

type HelpArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return helpPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: HelpArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = helpPagesBySlug.get(slug);

  if (!page) {
    return {
      title: "Help - Job Search Terminal",
    };
  }

  return {
    title: `${page.shortTitle} - Job Search Terminal Help`,
    description: page.description,
  };
}

export default async function HelpArticlePage({ params }: HelpArticlePageProps) {
  const { slug } = await params;
  const page = helpPagesBySlug.get(slug);

  if (!page) notFound();

  return (
    <HelpSiteShell activeSlug={page.slug}>
      <HelpArticle page={page} />
    </HelpSiteShell>
  );
}
