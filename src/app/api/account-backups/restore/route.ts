import { NextResponse } from "next/server";
import { applyStagedRestore } from "@/lib/backups/account-backup";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { token?: string; confirmReplace?: boolean };
    if (!body.token || !body.confirmReplace) {
      return NextResponse.json({ error: "Confirm replacement of the current local account data." }, { status: 400 });
    }
    const result = await applyStagedRestore(body.token);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
