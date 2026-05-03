import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { clearResumeSource, getResumes, updateResumeSource } from "@/lib/db/queries";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.type !== "application/pdf") {
    return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Slugify filename and save to assets/
  const slug = id.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const filename = `resume-${slug}.pdf`;
  const relPath = `assets/${filename}`;
  const absPath = path.join(process.cwd(), relPath);
  writeFileSync(absPath, buffer);

  // Extract text
  let extractedText = "";
  let wordCount = 0;
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    extractedText = result.text.replace(/\s+/g, " ").trim();
    wordCount = extractedText.split(/\s+/).filter(Boolean).length;
  } catch {
    // Leave extraction empty — generator will try the file path next time
  }

  updateResumeSource(id, relPath, extractedText, wordCount);
  return NextResponse.json({ ok: true, wordCount });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Try to remove the PDF file from disk (best-effort)
  const resumes = getResumes();
  const resume = resumes.find((r) => r.id === id);
  if (resume?.sourceFile) {
    try {
      unlinkSync(path.join(process.cwd(), resume.sourceFile));
    } catch {
      // File may already be gone — ignore
    }
  }

  clearResumeSource(id);
  return NextResponse.json({ ok: true });
}
