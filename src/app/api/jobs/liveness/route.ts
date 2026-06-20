import { NextResponse } from "next/server";
import { checkJobLiveness } from "@/lib/scanner/liveness-checker";
import { deleteJob, getJobById, getJobs, saveJobLiveness, saveJobScopeStatus, getTitleFilters } from "@/lib/db/queries";
import { isJobProtectedFromAutomaticRemoval } from "@/lib/jobs/job-protection";
import type { JobRecord } from "@/lib/db/types";
import { hasResolvedPosting } from "@/lib/jobs/posting-resolution";

const CONCURRENCY = 6;

/** Cap the wall-clock time for a single liveness check; resolve as uncertain on timeout. */
async function withLivenessTimeout(promise: Promise<import("@/lib/scanner/liveness-checker").LivenessResult>, ms: number) {
  const timeout = new Promise<import("@/lib/scanner/liveness-checker").LivenessResult>((resolve) =>
    setTimeout(() => resolve({ status: "uncertain", reason: `timed out after ${ms}ms`, checkedAt: new Date().toISOString() }), ms)
  );
  return Promise.race([promise, timeout]);
}

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
    const titleFilters = getTitleFilters();
    const checked = await checkJobs(jobs, titleFilters);

    return NextResponse.json({
      ok: true,
      checked: jobs.length,
      active: checked.active,
      uncertain: checked.uncertain,
      expiredUntouched: checked.expiredUntouched,
      expiredProtected: checked.expiredProtected,
      outOfScope: checked.outOfScope,
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

function matchesTitleFilters(title: string, filters: { positive: string[]; negative: string[] }): boolean {
  const normalized = title.toLowerCase();
  if (filters.negative.some((kw) => normalized.includes(kw.toLowerCase()))) return false;
  if (filters.positive.length > 0 && !filters.positive.some((kw) => normalized.includes(kw.toLowerCase()))) return false;
  return true;
}

async function checkJobs(jobs: JobRecord[], titleFilters: { positive: string[]; negative: string[] }) {
  const expiredUntouched: LivenessJobSummary[] = [];
  const expiredProtected: LivenessJobSummary[] = [];
  const outOfScope: LivenessJobSummary[] = [];
  let active = 0;
  let uncertain = 0;
  let index = 0;

  async function next() {
    while (index < jobs.length) {
      const job = jobs[index++];
      if (!hasResolvedPosting(job)) {
        uncertain++;
        continue;
      }

      let result = await withLivenessTimeout(checkJobLiveness(job.url), 15_000);
      if (result.status === "uncertain" && job.originalPostingUrl && job.originalPostingUrl !== job.url) {
        const fallback = await withLivenessTimeout(checkJobLiveness(job.originalPostingUrl), 15_000);
        if (fallback.status !== "uncertain") result = fallback;
      }
      saveJobLiveness(job.id, result.status, result.reason);

      if (result.status === "expired") {
        const summary = summarizeJob(job, result.reason);
        if (isJobProtectedFromAutomaticRemoval(job)) {
          expiredProtected.push(summary);
        } else {
          expiredUntouched.push(summary);
        }
        continue;
      }

      const hasFilters = titleFilters.positive.length > 0 || titleFilters.negative.length > 0;
      if (hasFilters && !matchesTitleFilters(job.title, titleFilters)) {
        saveJobScopeStatus(job.id, "out_of_scope");
        outOfScope.push(summarizeJob(job, "title does not match filters"));
      } else {
        saveJobScopeStatus(job.id, "");
      }

      if (result.status === "active") {
        active++;
      } else {
        uncertain++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => next()));

  return { active, uncertain, expiredUntouched, expiredProtected, outOfScope };
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
