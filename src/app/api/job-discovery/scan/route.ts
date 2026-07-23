import { revalidatePath } from "next/cache";
import { getScanSchedule } from "@/lib/db/queries";
import type { JobDiscoveryScanStreamEvent } from "@/lib/scan-progress-types";
import { runJobDiscoveryScan } from "@/lib/scanner/job-discovery";

export const runtime = "nodejs";

export async function POST() {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: JobDiscoveryScanStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      void (async () => {
        try {
          const schedule = getScanSchedule();
          const summary = await runJobDiscoveryScan({
            trigger: "manual",
            freshnessWindowHours: schedule.freshnessWindowHours,
            onProgress: (progress) => send({ type: "progress", progress }),
          });
          revalidatePath("/dashboard");
          revalidatePath("/jobs");
          send({ type: "result", summary });
        } catch (error) {
          send({ type: "error", message: error instanceof Error ? error.message : "Scan failed" });
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
