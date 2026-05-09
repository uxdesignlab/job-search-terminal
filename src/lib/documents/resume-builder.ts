import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  ResumeBuilderSection,
  ResumeBuilderVersionRecord,
  ResumeRecord,
  UserProfileRecord
} from "../db/types";
import { getResumeBuilderVersion, saveResumeBuilderVersion } from "../db/queries";
import { parseSourceResume } from "./resume-generator";
import { assessExtractionQuality, extractResumeWithAI, mergeExtractions } from "./resume-ai-extractor";

export const BLANK_STARTER_SECTIONS: ResumeBuilderSection[] = [
  { id: "s-header", type: "header", title: "Contact", header: { name: "", headline: "", contactItems: [] } },
  { id: "s-summary", type: "summary", title: "Professional Summary", text: "" },
  { id: "s-experience", type: "experience", title: "Professional Experience", experience: [{ title: "", organization: "", location: "", dateRange: "", bullets: [] }] },
  { id: "s-skills", type: "skills", title: "Skills", items: [] },
  { id: "s-education", type: "education", title: "Education", education: [{ degree: "", school: "", focus: "" }] },
];

const KNOWN_SECTION_TITLES: Record<string, ResumeBuilderSection["type"]> = {
  summary: "summary",
  "professional summary": "summary",
  "executive summary": "summary",
  "career summary": "summary",
  profile: "summary",
  "professional profile": "summary",
  about: "summary",
  "about me": "summary",
  "selected impact": "impact",
  "selected executive impact": "impact",
  "career highlights": "impact",
  highlights: "impact",
  "core strengths": "impact",
  "key achievements": "impact",
  achievements: "impact",
  "selected achievements": "impact",
  "professional experience": "experience",
  "teaching experience": "experience",
  "work experience": "experience",
  experience: "experience",
  "relevant experience": "experience",
  "selected experience": "experience",
  "employment experience": "experience",
  "employment history": "experience",
  "work history": "experience",
  "career experience": "experience",
  "professional background": "experience",
  skills: "skills",
  "core skills": "skills",
  "core competencies": "skills",
  competencies: "skills",
  "areas of expertise": "skills",
  expertise: "skills",
  "technical skills": "skills",
  "design skills": "skills",
  "skills and tools": "skills",
  "technical skills and tools": "skills",
  tools: "skills",
  "tools and technologies": "skills",
  technologies: "skills",
  "soft skills": "skills",
  languages: "skills",
  recognition: "recognition",
  "industry leadership, publications and mentorship": "recognition",
  "awards and recognition": "recognition",
  awards: "recognition",
  publications: "recognition",
  certifications: "recognition",
  "licenses and certifications": "recognition",
  education: "education",
  "education and training": "education",
  "education and certifications": "education",
  "academic background": "education",
  credentials: "education"
};

// Multi-word headings — never appear in body text, safe to break inline anywhere.
const TIER_1_HEADINGS = [
  "Professional Summary", "Executive Summary", "Career Summary",
  "Professional Experience", "Teaching Experience", "Work Experience",
  "Relevant Experience", "Selected Experience", "Employment Experience",
  "Employment History", "Work History", "Career Experience", "Professional Background",
  "Selected Impact", "Selected Executive Impact",
  "Career Highlights", "Key Achievements", "Selected Achievements", "Core Strengths",
  "Core Skills", "Core Competencies", "Areas of Expertise",
  "Technical Skills", "Skills and Tools", "Technical Skills and Tools",
  "Tools and Technologies", "Soft Skills", "Design Skills",
  "Awards and Recognition", "Industry Leadership, Publications and Mentorship",
  "Licenses and Certifications",
  "Education and Training", "Education and Certifications",
  "Academic Background", "Professional Profile", "About Me",
];

// Single-word headings that rarely appear in resume body text.
// "Awards" is intentionally excluded — body phrases like "Council Awards" or
// "Industry Awards" frequently sit inside a recognition bullet, and breaking
// at "Awards" would shred the bullet apart.
const TIER_2_HEADINGS = [
  "Summary", "Education", "Recognition", "Publications", "Certifications",
  "Languages", "Profile", "About", "Highlights", "Achievements",
  "Competencies", "Expertise", "Technologies", "Credentials", "Skills",
];

// Single-word headings that frequently appear in body text — "Experience"
// shows up 4-6× per resume in role titles ("VP of User Experience"), product
// names ("Adobe Experience Manager"), and phrases ("Years of Experience").
// Only break these when followed by a bullet marker — the unambiguous
// PDF-flattening signature ("Skills ● Item1" jammed onto previous text).
const TIER_3_HEADINGS = ["Experience", "Tools"];

export async function ensureResumeBuilderVersion(
  resume: ResumeRecord,
  profile: UserProfileRecord
): Promise<ResumeBuilderVersionRecord | undefined> {
  const sourceText = await loadResumeSourceText(resume);
  const sourceHash = hashText(sourceText);
  const existing = getResumeBuilderVersion(resume.id);

  if (existing && existing.sourceHash === sourceHash && existing.sections.length > 1) {
    return existing;
  }

  if (!sourceText.trim()) {
    saveResumeBuilderVersion({
      resumeId: resume.id,
      status: "needs_review",
      sections: BLANK_STARTER_SECTIONS,
      sourceHash
    });
    return getResumeBuilderVersion(resume.id);
  }

  const parsed = await buildResumeBuilderSections(sourceText, profile);
  const sections = parsed.length > 0 ? parsed : BLANK_STARTER_SECTIONS;

  saveResumeBuilderVersion({
    resumeId: resume.id,
    status: "needs_review",
    sections,
    sourceHash
  });

  return getResumeBuilderVersion(resume.id);
}

export async function loadResumeSourceText(resume: ResumeRecord): Promise<string> {
  if (resume.extractedText?.trim()) {
    return normalizeText(resume.extractedText);
  }

  if (!resume.sourceFile) {
    return "";
  }

  const sourcePath = path.join(process.cwd(), resume.sourceFile);
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: readFileSync(sourcePath) });
    const result = await parser.getText();
    await parser.destroy();
    return normalizeText(result.text);
  } catch {
    return "";
  }
}

export function hashText(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

export async function buildResumeBuilderSections(
  sourceText: string,
  profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">
): Promise<ResumeBuilderSection[]> {
  let parsed = parseSourceResume(sourceText, profile);

  // AI intelligence layer: invoke the active AI provider when the heuristic
  // parser appears to have struggled. Two trigger conditions:
  //   1. Quality score < 4 — at least 2 key sections (summary, experience,
  //      bullets, skills, name) are missing or empty.
  //   2. Experience entries have merged title+company in the title field —
  //      symptom of a single-line PDF layout where the heuristic split at the
  //      date but couldn't separate role title from employer.
  const quality = assessExtractionQuality(parsed);
  const hasMergedTitles =
    parsed.experience.length > 0 &&
    parsed.experience.every((e) => !e.organization || !e.organization.trim());
  if (quality < 4 || hasMergedTitles) {
    const aiResult = await extractResumeWithAI(sourceText);
    if (aiResult) {
      parsed = mergeExtractions(parsed, aiResult);
    }
  }

  const sections: ResumeBuilderSection[] = [];

  sections.push({
    id: "header",
    type: "header",
    title: "Header",
    header: {
      name: parsed.name,
      headline: parsed.headline,
      contactItems: parsed.contactItems
    }
  });

  const detectedTitles = detectSectionTitles(sourceText);
  const titleFor = (type: ResumeBuilderSection["type"], fallback: string) =>
    detectedTitles.find((entry) => entry.type === type)?.title ?? fallback;

  if (parsed.summary) {
    sections.push({
      id: "summary",
      type: "summary",
      title: titleFor("summary", "Professional Summary"),
      text: parsed.summary
    });
  }

  if (parsed.impactItems.length > 0) {
    sections.push({
      id: "impact",
      type: "impact",
      title: parsed.impactHeading || titleFor("impact", "Key Achievements"),
      items: parsed.impactItems
    });
  }

  if (parsed.experience.length > 0) {
    sections.push({
      id: "experience",
      type: "experience",
      title: parsed.experienceHeading || titleFor("experience", "Professional Experience"),
      experience: parsed.experience
    });
  }

  if (parsed.skills.length > 0) {
    sections.push({
      id: "skills",
      type: "skills",
      title: titleFor("skills", "Skills"),
      items: parsed.skills
    });
  }

  if (parsed.recognition.length > 0) {
    sections.push({
      id: "recognition",
      type: "recognition",
      title: titleFor("recognition", "Recognition"),
      items: parsed.recognition
    });
  }

  // Exclude section-level headings AND experience entry titles (job titles satisfy
  // isLikelyCustomHeading and would otherwise produce spurious duplicate sections).
  const excludedTitles = new Set([
    ...sections.map((section) => normalizeHeading(section.title)),
    ...parsed.experience.map((entry) => normalizeHeading(entry.title))
  ]);
  for (const custom of extractCustomSections(sourceText, excludedTitles)) {
    // Re-categorize custom sections whose title contains a known section
    // keyword. PDFs sometimes use unconventional headings like
    // "Recognition, Teaching & Publications" that don't match any single
    // entry in our heading lists, but are clearly a recognition section.
    const lowerTitle = custom.title.toLowerCase();
    if (
      sections.every((s) => s.type !== "recognition") &&
      /\b(recognition|publications|certifications|awards|honors|mentions|press)\b/.test(lowerTitle)
    ) {
      sections.push({ ...custom, id: "recognition", type: "recognition" });
      continue;
    }
    sections.push(custom);
  }

  if (parsed.education.length > 0) {
    sections.push({
      id: "education",
      type: "education",
      title: titleFor("education", "Education"),
      education: parsed.education
    });
  }

  return sections;
}

function detectSectionTitles(sourceText: string) {
  return normalizeLines(sourceText)
    .filter((line) => KNOWN_SECTION_TITLES[normalizeHeading(line)])
    .map((title) => ({ title, type: KNOWN_SECTION_TITLES[normalizeHeading(title)] }));
}

function extractCustomSections(sourceText: string, knownSectionTitles: Set<string>): ResumeBuilderSection[] {
  const lines = normalizeLines(sourceText);

  // Skip the header area (name, headline, contacts) which sits before the first
  // known section heading. Without this, the person's name can be mis-detected
  // as a custom section heading.
  const firstKnownIndex = lines.findIndex((line) => KNOWN_SECTION_TITLES[normalizeHeading(line)]);
  const bodyStart = firstKnownIndex >= 0 ? firstKnownIndex : 0;

  // Match the date-range pattern used for role-header detection so we can
  // exclude job-title candidates from being mistaken for custom headings.
  const DATE_RANGE_LINE = new RegExp(
    `(?:\\d{2}[/.]\\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{4})\\s*[–\\-]\\s*(?:Present|\\d{2}[/.]\\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{4})`
  );
  const headingIndexes = lines
    .map((line, index) => {
      if (index < bodyStart || !isLikelyCustomHeading(line)) return -1;
      // If the next non-empty line contains a date range, this candidate is
      // a job title, not a custom heading.
      const next = lines.slice(index + 1).find((l) => l.trim());
      if (next && DATE_RANGE_LINE.test(next)) return -1;
      return index;
    })
    .filter((index) => index >= 0);

  const sections: ResumeBuilderSection[] = [];
  for (let i = 0; i < headingIndexes.length; i += 1) {
    const index = headingIndexes[i];
    const title = lines[index];
    const normalized = normalizeHeading(title);
    if (KNOWN_SECTION_TITLES[normalized] || knownSectionTitles.has(normalized)) {
      continue;
    }

    // Skip word-wrap artifacts: a genuine heading never appears directly after a line
    // that ends with a dangling connective (e.g. "Applied AI in Research and\nPrototyping").
    const prevLine = index > 0 ? lines[index - 1] : "";
    if (/\s(and|or|the|a|an|of|in|for|from|with|by|to|at|on|as)$/i.test(prevLine)) {
      continue;
    }

    const next = headingIndexes.find((candidate) => candidate > index) ?? lines.length;
    const contentLines = lines.slice(index + 1, next).filter((line) => line && !isLikelyCustomHeading(line));
    if (contentLines.length === 0) continue;

    sections.push({
      id: `custom-${slugify(title) || sections.length + 1}`,
      type: "custom",
      title,
      items: parseList(contentLines)
    });
  }

  return sections;
}

function isLikelyCustomHeading(line: string) {
  if (!line || line.length > 72) return false;
  if (/^[•*\-–]\s+/.test(line)) return false;
  if (/\d{4}|@|https?:\/\/|www\.|linkedin\.com/i.test(line)) return false;
  if (/[.!?]$/.test(line)) return false;
  // Exclude institution names — these appear as standalone lines in PDF extractions
  // but are never section headings.
  if (/\b(university|college|institute|polytechnic|academy|école)\b/i.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > 5) return false;
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  const uppercaseRatio = letters.replace(/[^A-Z]/g, "").length / letters.length;
  return uppercaseRatio > 0.35 || /^[A-Z][A-Za-z/&,\s-]+$/.test(line);
}

function parseList(lines: string[]) {
  const items: string[] = [];
  for (const line of lines) {
    if (/^[•*\-–]\s+/.test(line)) {
      items.push(line.replace(/^[•*\-–]\s+/, "").trim());
    } else if (items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    } else {
      items.push(line.trim());
    }
  }
  return items.filter(Boolean);
}

function normalizeLines(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim().replace(/\s+--\s+\d+ of \d+\s+--$/, ""))
    .filter((line) => line && !/^-- \d+ of \d+ --$/.test(line));
}

// Date pattern shared with the role-header detector below. Matches both
// "MM/YYYY" and "Month YYYY" formats.
const DATE_PATTERN = `(?:\\d{2}[/.]\\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{4})`;
const DATE_RANGE_PATTERN = `${DATE_PATTERN}\\s*[–\\-]\\s*(?:Present|${DATE_PATTERN})`;

function normalizeText(text: string) {
  let normalized = text
    .replace(/\r/g, "")
    .replace(/\n[ \t]*-- \d+ of \d+ --[ \t]*\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // PDFs frequently concatenate experience role headers onto the end of the
  // previous role's last bullet — "...delivery model. Director of User
  // Experience DePalma Studios | Nashville, TN 10/2017 – 01/2020". Detect
  // this signature (sentence end + capitalized title + date range) and break
  // the role header onto its own line.
  normalized = normalized.replace(
    new RegExp(`([.!?])\\s+(?=[A-Z][^\\n●]{10,150}${DATE_RANGE_PATTERN})`, "g"),
    "$1\n"
  );

  // Tier 1: Multi-word headings — break inline anywhere. These never appear
  // in body text, so simple `\s+heading\s+` matching is safe.
  for (const title of TIER_1_HEADINGS.sort((a, b) => b.length - a.length)) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(`\\s+(${escaped})\\s+`, "g"), "\n$1\n");
  }

  // Tier 2 & 3: Single-word headings — process line-by-line and skip lines
  // that are already a known multi-word heading. This prevents breaking
  // "Professional Experience" apart at "Experience", or "Education and Training"
  // apart at "Education".
  const tier1Set = new Set(TIER_1_HEADINGS.map((h) => normalizeHeading(h)));
  normalized = normalized
    .split("\n")
    .map((line) => {
      if (tier1Set.has(normalizeHeading(line))) return line;
      let modified = line;
      // Tier 2: safe single-word headings — break inline, but skip when
      // followed by a conjunction (and/&) that would form a multi-word heading
      // like "Publications & Mentorship" or "Recognition and Awards".
      for (const title of TIER_2_HEADINGS) {
        modified = modified.replace(
          new RegExp(`\\s+(${title})\\s+(?!(?:and|&)\\s)`, "g"),
          "\n$1\n"
        );
      }
      // Tier 3: ambiguous single-word headings — only break when immediately
      // followed by a bullet marker (PDF-flatten signature).
      for (const title of TIER_3_HEADINGS) {
        modified = modified.replace(new RegExp(`\\s+(${title})\\s+(?=[●•])`, "g"), "\n$1\n");
      }
      return modified;
    })
    .join("\n");

  return normalized
    .replace(/\s+[•●]\s+/g, "\n● ")
    .replace(/\s+-- \d+ of \d+ --\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeHeading(value: string) {
  return value
    .replace(/^[#\s]+/, "")
    .replace(/[:|]+$/, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
