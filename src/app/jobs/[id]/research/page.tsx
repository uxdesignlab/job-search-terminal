import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyResearch, getJobById } from "@/lib/db/queries";
import { ResearchClient } from "./research-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ResearchPage({ params }: Props) {
  const { id } = await params;
  const job = getJobById(id);
  if (!job) notFound();

  const saved = getCompanyResearch(id);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <Link className="text-sm text-accent hover:underline" href={`/jobs/${id}`}>
            ← Back to job
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-ink">
            Company Research — {job.company}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <ResearchClient jobId={id} saved={saved} />
      </main>
    </div>
  );
}
