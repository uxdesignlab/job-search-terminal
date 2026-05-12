import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getBrowserBoardImportDirectory, importBrowserBoardJobs } from "@/lib/scanner/browser-board-importer";

const WATCH_DIR = getBrowserBoardImportDirectory();
const FILE_PATTERN = /^(job-board|browser-board|linkedin|wellfound|workatastartup)-jobs-.+\.json$/;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { filePath?: string };

    let filePath: string;
    if (body.filePath) {
      filePath = body.filePath;
    } else {
      if (!existsSync(WATCH_DIR)) {
        return NextResponse.json({ error: "No import directory found" }, { status: 404 });
      }
      const files = readdirSync(WATCH_DIR)
        .filter((f) => FILE_PATTERN.test(f) && !f.endsWith(".tmp"))
        .sort()
        .reverse();
      if (files.length === 0) {
        return NextResponse.json({ error: "No pending job board import files found" }, { status: 404 });
      }
      filePath = path.join(WATCH_DIR, files[0]);
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const result = await importBrowserBoardJobs(filePath);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
