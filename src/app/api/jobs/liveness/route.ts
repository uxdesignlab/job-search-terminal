import { NextResponse } from "next/server";
import { checkJobLiveness } from "@/lib/scanner/liveness-checker";
import { deleteJob, getJobById, getJobs, saveJobLiveness } from "@/lib/db/queries";
import { isJobProtectedFromAutomaticRemoval } from "@/lib/jobs/job-protection";
import type { JobRecord } from "@/lib/db/types";

const CONCURRENCY = 6;

type LivenessJobSummary = {
  id: string;
  title: string;
  company: string;
  location: string;
  status: string;
  reason: string;
};

export async function POST() {
  try {
    const jobs = getJobs();
    const checked = await checkJobs(jobs);

    return NextResponse.json({
      ok: true,
      checked: jobs.length,
      active: checked.active,
      uncertain: checked.uncertain,
      expiredUntouched: checked.expiredUntouched,
      expiredProtected: checked.expiredProtected,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { ids } = (await req.json()) as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    let deleted = 0;
    const kept: LivenessJobSummary[] = [];

    for (const id of ids) {
      const job = getJobById(id);
      if (!job) continue;
      if (job.livenessStatus !== "expired" || isJobProtectedFromAutomaticRemoval(job)) {
        kept.push(summarizeJob(job, "Protected from automatic cleanup"));
        continue;
      }
      deleteJob(id);
      deleted++;
    }

    return NextResponse.json({ ok: true, deleted, kept });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function checkJobs(jobs: JobRecord[]) {
  const expiredUntouched: LivenessJobSummary[] = [];
  const expiredProtected: LivenessJobSummary[] = [];
  let active = 0;
  let uncertain = 0;
  let index = 0;

  async function next() {
    while (index < jobs.length) {
      const job = jobs[index++];
      if (!job.url) {
        uncertain++;
        continue;
      }

      const result = await checkJobLiveness(job.url);
      saveJobLiveness(job.id, result.status, result.reason);

      if (result.status === "active") {
        active++;
        continue;
      }
      if (result.status === "uncertain") {
        uncertain++;
        continue;
      }

      const summary = summarizeJob(job, result.reason);
      if (isJobProtectedFromAutomaticRemoval(job)) {
        expiredProtected.push(summary);
      } else {
        expiredUntouched.push(summary);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => next()));

  return { active, uncertain, expiredUntouched, expiredProtected };
}

function summarizeJob(job: JobRecord, reason: string): LivenessJobSummary {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    status: job.status,
    reason,
  };
}
