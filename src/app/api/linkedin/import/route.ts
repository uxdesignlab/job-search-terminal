import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { importLinkedInJobs } from "@/lib/scanner/linkedin-importer";
import { resolveImportFilePathWithin } from "@/lib/scanner/import-path";

const WATCH_DIR = path.join(process.cwd(), "data", "linkedin-imports");
const FILE_PATTERN = /^linkedin-jobs-.+\.json$/;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { filePath?: string };

    let filePath: string;
    if (body.filePath) {
      const safePath = resolveImportFilePathWithin([WATCH_DIR], body.filePath);
      if (!safePath) {
        return NextResponse.json({ error: "filePath must be inside the import directory" }, { status: 400 });
      }
      filePath = safePath;
    } else {
      if (!existsSync(WATCH_DIR)) {
        return NextResponse.json({ error: "No import directory found" }, { status: 404 });
      }
      const files = readdirSync(WATCH_DIR)
        .filter((f) => FILE_PATTERN.test(f) && !f.endsWith(".tmp"))
        .sort()
        .reverse();
      if (files.length === 0) {
        return NextResponse.json({ error: "No pending LinkedIn import files found" }, { status: 404 });
      }
      filePath = path.join(WATCH_DIR, files[0]);
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const result = await importLinkedInJobs(filePath);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
