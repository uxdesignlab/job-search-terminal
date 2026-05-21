import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteResumeLane,
  getResumes,
  getTitleFilters,
  getUserProfile,
  saveTitleFilters,
  setOnboardingPreferencesConfirmed,
  updateResumeSource,
  updateUserProfile,
} from "@/lib/db/queries";
import { parseSourceResume, validateResumeExtraction } from "@/lib/documents/resume-generator";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.type !== "application/pdf") {
    return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  }

  const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum size is 20 MB." }, { status: 413 });
  }

  let extractedText = "";
  let wordCount = 0;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    extractedText = normalizePdfText(result.text);
    wordCount = extractedText.split(/\s+/).filter(Boolean).length;
  } catch {
    return NextResponse.json(
      { error: "Could not extract readable text from this PDF. Upload a text-based resume PDF." },
      { status: 422 }
    );
  }

  const profile = getUserProfile();
  const parsedResume = parseSourceResume(extractedText, profile);
  const extractionWarnings = validateResumeExtraction(parsedResume, extractedText);

  // Always save the resume — extraction gaps are surfaced as warnings, not blockers.
  const slug = id.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const filename = `resume-${slug}.pdf`;
  const relPath = `assets/${filename}`;
  const absPath = path.join(process.cwd(), relPath);
  writeFileSync(absPath, buffer);

  updateResumeSource(id, relPath, extractedText, wordCount);
  const extractedPositions = extractResumePositions(parsedResume);
  updateUserProfile({
    ...profile,
    targetRoles: extractedPositions,
  });
  saveTitleFilters(
    extractedPositions.map((position) => position.toLowerCase()),
    getTitleFilters().negative
  );
  setOnboardingPreferencesConfirmed(false);

  return NextResponse.json({
    ok: true,
    wordCount,
    warnings: extractionWarnings,
    positions: extractedPositions,
    sections: {
      summary: Boolean(parsedResume.summary),
      experience: parsedResume.experience.length,
      skills: parsedResume.skills.length,
      education: parsedResume.education.length,
    },
  });
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

  deleteResumeLane(id);
  return NextResponse.json({ ok: true });
}

function extractResumePositions(parsedResume: ReturnType<typeof parseSourceResume>) {
  const positionTerms = [
    "architect",
    "consultant",
    "designer",
    "director",
    "engineer",
    "founder",
    "head",
    "lead",
    "manager",
    "officer",
    "operator",
    "principal",
    "producer",
    "product",
    "program",
    "researcher",
    "specialist",
    "strategist",
    "ux",
    "ui",
    "vice president",
    "vp",
  ];

  const titles = [parsedResume.headline, ...parsedResume.experience.map((entry) => entry.title)]
    .map((title) => normalizePositionTitle(title))
    .filter((title) => {
      const normalized = title.toLowerCase();
      return title.length >= 3 &&
        title.length <= 80 &&
        positionTerms.some((term) => normalized.includes(term)) &&
        !/^(experience|professional experience|work experience|employment history)$/i.test(title);
    });

  return uniqueByLowercase(titles).slice(0, 8);
}

function normalizePositionTitle(value: string) {
  return value
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+[-–—]\s+.*$/, "")
    .replace(/\s+at\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueByLowercase(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\n[ \t]*-- \d+ of \d+ --[ \t]*\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
