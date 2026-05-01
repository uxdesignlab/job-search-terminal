import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobById, getOutreachDrafts } from "@/lib/db/queries";
import { OutreachClient } from "./outreach-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function OutreachPage({ params }: Props) {
  const { id } = await params;
  const job = getJobById(id);
  if (!job) notFound();

  const saved = getOutreachDrafts(id);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <Link className="text-sm text-accent hover:underline" href={`/jobs/${id}`}>
            ← Back to job
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-ink">
            LinkedIn Outreach — {job.company}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <OutreachClient jobId={id} saved={saved} />
      </main>
    </div>
  );
}
