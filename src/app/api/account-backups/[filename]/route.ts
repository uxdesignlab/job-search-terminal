import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !safeFilename.endsWith(".jst-backup")) {
    return NextResponse.json({ error: "Invalid backup filename." }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), "output", "backups", safeFilename);
  if (!existsSync(filePath)) return NextResponse.json({ error: "Backup not found." }, { status: 404 });
  return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Content-Length": String(statSync(filePath).size),
      "Content-Type": "application/octet-stream",
    },
  });
}
