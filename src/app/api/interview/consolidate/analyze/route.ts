import { randomUUID } from "node:crypto";
import { getEvaluationSuggestionDigests, saveConsolidationRun } from "@/lib/db/queries";
import { buildConsolidationPayload } from "@/lib/interview/consolidation";
import { aiErrorResponse } from "@/lib/ai/error-response";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const digests = getEvaluationSuggestionDigests();
    if (digests.length === 0) {
      return Response.json({ error: "No generated suggestions to consolidate." }, { status: 400 });
    }
    const payload = await buildConsolidationPayload(digests);
    const runId = `consolidation-${randomUUID()}`;
    saveConsolidationRun(runId, payload, "review");
    return Response.json({ runId, payload });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
