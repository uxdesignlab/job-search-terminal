export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { content: string; tags?: string[] };
  const { saveProfileSupplement } = await import("@/lib/db/queries");
  saveProfileSupplement({ id, content: body.content, tags: body.tags ?? [] });
  return Response.json({ saved: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { deleteProfileSupplement } = await import("@/lib/db/queries");
  deleteProfileSupplement(id);
  return Response.json({ deleted: true });
}
