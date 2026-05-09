import { NextRequest, NextResponse } from "next/server";
import { deleteResumeLane, updateResumeName } from "@/lib/db/queries";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  updateResumeName(id, name.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteResumeLane(id);
  return NextResponse.json({ ok: true });
}
