import { redirect } from "next/navigation";

/**
 * Outreach lives in the job workspace as a tab (§9), not on its own screen.
 *
 * This route predates that change and is kept as a redirect: the standalone page
 * is where the "Draft outreach" links, bookmarks and browser history point, and
 * dropping it would break them. Same treatment as the analysis → evaluation
 * rename.
 */
export default async function OutreachRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/jobs/${id}?tab=outreach`);
}
