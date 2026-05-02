import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const { getProfileSupplements } = await import("@/lib/db/queries");
  return Response.json({ supplements: getProfileSupplements() });
}

export async function POST(req: Request) {
  const body = await req.json() as { content: string; tags?: string[] };
  const { saveProfileSupplement } = await import("@/lib/db/queries");
  const id = randomUUID();
  saveProfileSupplement({ id, content: body.content, tags: body.tags ?? [] });
  return Response.json({ id, saved: true });
}
