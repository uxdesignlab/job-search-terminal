import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { inspectAccountBackupFile, MAX_ACCOUNT_BACKUP_ARCHIVE_BYTES } from "@/lib/backups/account-backup";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!req.body) return NextResponse.json({ error: "Choose a .jst-backup archive." }, { status: 400 });
    const password = decodeURIComponent(req.headers.get("x-jst-backup-password") ?? "").trim() || undefined;
    const uploadPath = path.join(process.cwd(), "output", "backups", `.account-upload-${randomUUID()}.jst-backup`);
    mkdirSync(path.dirname(uploadPath), { recursive: true });
    try {
      let uploadedBytes = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _, callback) {
          uploadedBytes += chunk.length;
          callback(
            uploadedBytes > MAX_ACCOUNT_BACKUP_ARCHIVE_BYTES ? new Error("Backup archive is larger than the 1 GB safety limit.") : null,
            chunk
          );
        }
      });
      await pipeline(
        Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
        limiter,
        createWriteStream(uploadPath, { mode: 0o600 })
      );
      const result = await inspectAccountBackupFile(uploadPath, { password });
      return NextResponse.json({ ok: true, ...result });
    } finally {
      rmSync(uploadPath, { force: true });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
