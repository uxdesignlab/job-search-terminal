import { commitConsolidation } from "@/lib/db/queries";
import type { ConsolidationCanonical } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      runId: string;
      approved: Array<{ canonical: ConsolidationCanonical; memberIds: string[] }>;
    };
    if (!body.runId || !Array.isArray(body.approved)) {
      return Response.json({ error: "runId and approved clusters are required." }, { status: 400 });
    }
    const result = commitConsolidation(body.runId, body.approved);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
