import { NextResponse } from "next/server";
import { verifyJobPosting } from "@/lib/scanner/liveness-checker";
import { archiveCleanupCandidates, getJobById, getJobs, saveJobLiveness } from "@/lib/db/queries";
import { cleanupCandidateReason, isJobProtectedFromAutomaticRemoval } from "@/lib/jobs/job-protection";
import { getJobSourceLabel } from "@/lib/job-table-helpers";
import type { CleanupEvent, CleanupSummary } from "@/lib/jobs/cleanup-types";

export const runtime = "nodejs";

async function verify(signal: AbortSignal, progress: (event: CleanupEvent) => void) {
  const all = getJobs();
  const jobs = all.filter((job) => !isJobProtectedFromAutomaticRemoval(job));
  const summary: CleanupSummary = { checked: 0, total: jobs.length, protected: all.length - jobs.length, active: 0, uncertain: 0, candidates: [], expiredUntouched: [], expiredProtected: [], outOfScope: [] };
  progress({ type: "progress", summary });
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => {
    while (!signal.aborted && index < jobs.length) {
      const job = jobs[index++];
      const result = await verifyJobPosting(job, signal);
      signal.throwIfAborted();
      // A deliberate action during the fetch must not be overwritten by maintenance.
      const current = getJobById(job.id);
      if (current && !isJobProtectedFromAutomaticRemoval(current)) {
        saveJobLiveness(job.id, result.status, result.reason, result.evidenceUrl, result.checkedAt);
        const cleanupReason = cleanupCandidateReason({ ...current, livenessStatus: result.status, livenessCheckedAt: result.checkedAt, livenessReason: result.reason });
        if (cleanupReason) {
          const candidate = { id: job.id, title: job.title, company: job.company, location: job.location, status: job.status,
            source: getJobSourceLabel(job), savedAt: current.createdAt ?? "", reason: result.reason,
            evidenceUrl: result.evidenceUrl ?? "", checkedAt: result.checkedAt, cleanupReason, protectedFromRemoval: false as const };
          summary.candidates.push(candidate);
          if (cleanupReason === "closed") summary.expiredUntouched.push(candidate);
        }
        if (result.status === "active") summary.active++;
        if (result.status === "uncertain") summary.uncertain++;
      } else summary.protected++;
      summary.checked++;
      progress({ type: "progress", summary });
    }
  }));
  return summary;
}

export async function POST(req: Request) {
  if (!req.headers.get("accept")?.includes("application/x-ndjson")) {
    try { return NextResponse.json({ ok: true, ...await verify(req.signal, () => {}) }); }
    catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
  }
  const cancellation = new AbortController();
  const signal = AbortSignal.any([req.signal, cancellation.signal]);
  let closed = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: CleanupEvent) => {
        if (closed || signal.aborted) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
        catch { closed = true; cancellation.abort(); }
      };
      void verify(signal, send).then((summary) => send({ type: "result", summary })).catch((error) => {
        if (!signal.aborted) send({ type: "error", message: String(error) });
      }).finally(() => { if (!closed) { closed = true; controller.close(); } });
    },
    cancel() { closed = true; cancellation.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.some((id: unknown) => typeof id !== "string" || !id)) return NextResponse.json({ error: "Select jobs to archive" }, { status: 400 });
    return NextResponse.json({ ok: true, ...archiveCleanupCandidates(body.ids) });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}
