import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArchivedJobsTable } from "@/components/archived-jobs-table";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { formatPostedDate } from "@/lib/dates";
import { getArchivedJobs, unarchiveJob, deleteJob, purgeAllArchivedJobs } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function ArchivedPage() {
  const jobs = getArchivedJobs();

  async function unarchiveAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (id) {
      unarchiveJob(id);
      revalidatePath("/archived");
      revalidatePath("/jobs");
    }
  }

  async function deleteArchivedAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (id) {
      deleteJob(id);
      revalidatePath("/archived");
      revalidatePath("/jobs");
    }
    redirect("/archived");
  }

  async function deleteAllArchivedAction() {
    "use server";
    purgeAllArchivedJobs();
    revalidatePath("/archived");
    revalidatePath("/jobs");
    redirect("/archived");
  }

  return (
    <Shell activeItem="Archived">
      <div className="grid gap-6">
        <PageHeader
          description="Jobs hidden from the main pipeline after manual archive or skip actions."
          eyebrow="Archived jobs"
          title="Archived"
          actions={
            jobs.length > 0 ? (
              <form action={deleteAllArchivedAction}>
                <button
                  className="inline-flex min-h-9 items-center justify-center rounded-control border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/8"
                  type="submit"
                >
                  Delete all archived
                </button>
              </form>
            ) : undefined
          }
        />

        {jobs.length === 0 ? (
          <EmptyState
            description="Jobs you archive or skip will appear here. Nothing is deleted — you can restore any job."
            title="No archived jobs"
          />
        ) : (
          <>
            <p className="text-xs text-muted">{jobs.length} archived job{jobs.length !== 1 ? "s" : ""}</p>

            {/* Mobile cards */}
            <div className="grid gap-3 lg:hidden">
              {jobs.map((job) => (
                <div className="rounded-panel border border-border bg-panel p-4" key={job.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                        {job.title}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted">{job.company} · {job.location}</p>
                    </div>
                    {job.livenessStatus === "expired" && <Badge tone="danger">Expired</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{formatPostedDate(job)}</p>
                  <div className="mt-3 flex gap-2">
                    <form action={unarchiveAction}>
                      <input name="id" type="hidden" value={job.id} />
                      <button
                        className="rounded-control border border-border px-3 py-1 text-xs font-medium text-muted hover:text-ink"
                        type="submit"
                      >
                        Restore
                      </button>
                    </form>
                    <form action={deleteArchivedAction}>
                      <input name="id" type="hidden" value={job.id} />
                      <button
                        className="rounded-control border border-danger/40 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/8"
                        type="submit"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            <ArchivedJobsTable
              deleteArchivedAction={deleteArchivedAction}
              jobs={jobs}
              unarchiveAction={unarchiveAction}
            />
          </>
        )}
      </div>
    </Shell>
  );
}
