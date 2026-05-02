export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json() as { gapText: string; rawResponse: string };

  if (!body.rawResponse?.trim()) {
    return Response.json({ polishedResponse: "" });
  }

  try {
    const { polishGapResponse } = await import("@/lib/gaps/llm-gap-polisher");
    const polishedResponse = await polishGapResponse(body.gapText, body.rawResponse);
    return Response.json({ polishedResponse });
  } catch {
    return Response.json({ polishedResponse: body.rawResponse });
  }
}
