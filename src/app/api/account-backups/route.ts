import { NextResponse } from "next/server";
import { createAccountBackup } from "@/lib/backups/account-backup";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { password?: string; acknowledgePlaintext?: boolean };
    const password = body.password?.trim() || undefined;
    if (!password && !body.acknowledgePlaintext) {
      return NextResponse.json({ error: "Confirm that an unencrypted backup contains private local data." }, { status: 400 });
    }
    const result = await createAccountBackup({ password });
    return NextResponse.json({
      ok: true,
      filename: result.filename,
      downloadUrl: `/api/account-backups/${encodeURIComponent(result.filename)}`,
      sizeBytes: result.sizeBytes,
      summary: {
        createdAt: result.manifest.createdAt,
        encrypted: result.manifest.encrypted,
        fileCount: result.manifest.files.length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
