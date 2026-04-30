import { readFileSync } from "node:fs";
import path from "node:path";
import { getEvaluationByJobId, getJobById, getResumes, getSkills, getUserProfile, saveGeneratedDocument } from "../db/queries";
import type { EvaluationRecord, GeneratedDocumentInput, JobRecord, ResumeRecord, SkillRecord, UserProfileRecord } from "../db/types";
import { evaluateJob } from "../evaluation/job-evaluator";
import { renderHtmlToPdf } from "./pdf-renderer";
import { renderResumeHtml, type ResumeTemplateInput } from "./resume-template";

export type GeneratedResumeResult = GeneratedDocumentInput & {
  pageCount: number;
  sizeBytes: number;
};

export async function generateTailoredResume(jobId: string): Promise<GeneratedResumeResult> {
  const job = getJobById(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  let evaluation = getEvaluationByJobId(jobId);
  if (!evaluation) {
    evaluateJob(jobId);
    evaluation = getEvaluationByJobId(jobId);
  }
  if (!evaluation) {
    throw new Error(`Evaluation could not be saved for job: ${jobId}`);
  }
  const profile = getUserProfile();
  const resumes = getResumes();
  const skills = getSkills();
  const baseResume = selectBaseResume(evaluation, resumes);
  const sourceResumeText = await loadSourceResumeText(baseResume);
  const content = buildTailoredContent(job, evaluation, profile, baseResume, skills, sourceResumeText);
  const html = renderResumeHtml(content);
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(`${profile.name}-${job.company}-${job.title}`);
  const id = `document-${job.id}`;
  const htmlPath = path.join(process.cwd(), "output", `${slug}-${date}.html`);
  const pdfPath = path.join(process.cwd(), "output", `${slug}-${date}.pdf`);
  const render = await renderHtmlToPdf({
    html,
    htmlPath,
    pdfPath,
    format: paperFormatFor(job)
  });
  const keywordCoverage = keywordCoverageFor(content, evaluation.keywords);
  const tailoringPlan = buildTailoringPlan(evaluation, baseResume, keywordCoverage);
  const document: GeneratedDocumentInput = {
    id,
    jobId: job.id,
    documentType: "resume",
    title: `${job.company} - ${job.title} tailored resume`,
    content: html,
    pdfUrl: render.pdfPath,
    htmlUrl: render.htmlPath,
    baseResume: baseResume.name,
    generatedDate: date,
    status: "Ready",
    tailoringSummary: `Generated from ${baseResume.name}. ${keywordCoverage}% of evaluation keywords appear in the tailored resume.`,
    keywordCoverage,
    tailoringPlan
  };

  saveGeneratedDocument(document);

  return {
    ...document,
    pageCount: render.pageCount,
    sizeBytes: render.sizeBytes
  };
}

function selectBaseResume(evaluation: EvaluationRecord, resumes: ResumeRecord[]) {
  const recommended = resumes.find((resume) => resume.name === evaluation.resumeBaseRecommendation);
  if (recommended) {
    return recommended;
  }

  const fallback = resumes.find((resume) => resume.activeStatus);
  if (!fallback) {
    throw new Error("No active resume lanes are available.");
  }

  return fallback;
}

async function loadSourceResumeText(resume: ResumeRecord) {
  const sourcePath = path.join(process.cwd(), resume.sourceFile);

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: readFileSync(sourcePath) });
    const result = await parser.getText();
    await parser.destroy();
    return normalizePdfText(result.text);
  } catch {
    return normalizePdfText(resume.extractedText);
  }
}

function buildTailoredContent(
  job: JobRecord,
  evaluation: EvaluationRecord,
  profile: UserProfileRecord,
  resume: ResumeRecord,
  skills: SkillRecord[],
  sourceResumeText: string
) {
  const source = parseSourceResume(sourceResumeText, profile);
  const keywords = evaluation.keywords.slice(0, 8);
  const preferredSkillNames = skills
      .filter((skill) => skill.usePreference !== "use_less")
    .map((skill) => skill.skillName);

  return {
    name: source.name || profile.name,
    headline: source.headline,
    contactItems: source.contactItems,
    title: job.title,
    summary: source.summary,
    impactHeading: "Key Achievements",
    impactItems: rankItems(source.impactItems, keywords).slice(0, source.impactItems.length),
    experienceHeading: "Professional Experience",
    experience: source.experience.map((entry) => ({
      ...entry,
      bullets: rankItems(entry.bullets, keywords).slice(0, entry.bullets.length)
    })),
    skills: rankItems(source.skills, [...keywords, ...preferredSkillNames]).slice(0, source.skills.length),
    recognition: source.recognition,
    education: source.education
  } satisfies ResumeTemplateInput;
}

function parseSourceResume(text: string, profile: UserProfileRecord) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^-- \d+ of \d+ --$/.test(line));

  const sections = {
    summary: findHeading(lines, ["Summary", "Professional Summary"]),
    impact: findHeading(lines, ["Selected Impact", "Selected Executive Impact", "Career Highlights", "Core Strengths", "Key Achievements"]),
    experience: findHeading(lines, ["Professional Experience", "Teaching Experience", "Experience"]),
    skills: findHeading(lines, ["Skills", "Core Skills", "Core Competencies"]),
    recognition: findHeading(lines, ["Recognition", "Industry Leadership, Publications & Mentorship", "Awards and Recognition"]),
    education: findHeading(lines, ["Education"]),
  };

  const getNextBoundary = (currentIndex: number) => {
    const boundaries = Object.values(sections).filter(v => v > currentIndex);
    return boundaries.length > 0 ? Math.min(...boundaries) : lines.length;
  };

  const header = parseHeader(lines.slice(0, Math.max(sections.summary, 0)), profile);

  return {
    ...header,
    summary: sections.summary !== -1 ? joinLines(lines.slice(sections.summary + 1, getNextBoundary(sections.summary))) : "",
    impactHeading: sections.impact !== -1 ? lines[sections.impact] : "Key Achievements",
    impactItems: sections.impact !== -1 ? parseBulletLines(lines.slice(sections.impact + 1, getNextBoundary(sections.impact))) : [],
    experienceHeading: sections.experience !== -1 ? lines[sections.experience] : "Professional Experience",
    experience: sections.experience !== -1 ? parseExperience(lines.slice(sections.experience + 1, getNextBoundary(sections.experience))) : [],
    skills: sections.skills !== -1 ? parseSectionList(lines, sections.skills, getNextBoundary(sections.skills)) : [],
    recognition: sections.recognition !== -1 ? parseSectionList(lines, sections.recognition, getNextBoundary(sections.recognition)) : [],
    education: sections.education !== -1 ? parseEducation(lines.slice(sections.education + 1, getNextBoundary(sections.education))) : []
  };
}

function parseHeader(lines: string[], profile: UserProfileRecord) {
  const name = lines[0] || profile.name;
  // Find the first line that looks like a contact line (email or phone)
  const contactIndex = lines.findIndex((line) => line.includes("@") || line.includes("+1-") || line.includes("+1 "));
  // Extract headline: lines between name and contact line that aren't location/contact info
  const headlineLines = contactIndex > 1
    ? lines.slice(1, contactIndex).filter((line) => !line.match(/^[\d+]/) && !line.includes("linkedin."))
    : [];
  const headline = headlineLines.length > 0 ? headlineLines.join(" ") : "";
  const contactLine = contactIndex >= 0 ? lines[contactIndex] : `${profile.location} | ${profile.portfolio}`;

  return {
    name,
    headline,
    contactItems: contactLine.split(/[|•]/).map((item) => item.trim()).filter(Boolean)
  };
}

function parseExperience(lines: string[]) {
  const entries: ResumeTemplateInput["experience"] = [];
  let current: ResumeTemplateInput["experience"][number] | undefined;
  let pendingTitle = "";

  // Matches a date range anywhere in the line — handles / and . separators,
  // regular hyphen AND Unicode en-dash (–) as separators.
  const DATE_RANGE_RE = /(\d{2}[/.]\d{4})\s*[–\-\u2013]\s*(Present|\d{2}[/.]\d{4})/;

  for (const line of lines) {
    // ── Bullet line ──────────────────────────────────────────────────────────
    if (line.startsWith("●")) {
      const bullet = line.replace(/^●\s*/, "").trim();
      if (current) {
        current.bullets.push(bullet);
      }
      // A fresh bullet resets any stray pendingTitle
      pendingTitle = "";
      continue;
    }

    // ── Org + date line ───────────────────────────────────────────────────────
    // If the line contains a date range, it's "Organization | Location  DATE – DATE"
    const dateMatch = DATE_RANGE_RE.exec(line);
    if (dateMatch) {
      // Everything before the date range is the org/location string
      const orgPart = line.slice(0, dateMatch.index).replace(/[\t|]+\s*$/, "").trim();
      const dateRange = formatDate(`${dateMatch[1]} - ${dateMatch[2]}`);

      if (pendingTitle) {
        current = { title: pendingTitle, organization: orgPart, dateRange, bullets: [] };
        entries.push(current);
        pendingTitle = "";
      } else {
        // Org+date line without a preceding title — use org as title
        current = { title: orgPart, organization: "", dateRange, bullets: [] };
        entries.push(current);
      }
      continue;
    }

    // ── Everything else: new job title OR wrapped bullet continuation ─────────
    // Heuristic: if the line starts with an uppercase letter and is short enough
    // to be a title, treat it as a new pending title. Otherwise, append to the
    // last bullet as a wrapped continuation.
    const looksLikeTitle =
      /^[A-Z]/.test(line) &&
      line.length <= 120 &&
      !line.startsWith("–") &&
      !line.startsWith("-");

    if (looksLikeTitle || !current?.bullets.length) {
      // Start or extend a pending title
      pendingTitle = pendingTitle ? `${pendingTitle} ${line}` : line;
    } else if (current?.bullets.length) {
      // Wrapped bullet continuation
      current.bullets[current.bullets.length - 1] =
        `${current.bullets[current.bullets.length - 1]} ${line}`.trim();
    }
  }

  return entries;
}

function formatDate(dateStr: string) {
  return dateStr.replace(/(\d{2})[/.](\d{4})/g, (_, m, y) => {
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(m, 10) - 1];
    return `${month} ${y}`;
  });
}

function parseEducation(lines: string[]) {
  const entries: ResumeTemplateInput["education"] = [];
  let current: ResumeTemplateInput["education"][number] | undefined;
  
  for (const line of lines) {
    const text = line.replace(/^●\s*/, "").trim();
    if (!text || /^-- \d+ of \d+ --$/.test(text)) continue;
    
    if (text.includes(" | ") || text.includes("Bachelor") || text.includes("Master")) {
      let degree = text;
      if (text.includes(" | ")) {
         const parts = text.split(" | ");
         if (parts[1].includes("Master") || parts[1].includes("Bachelor")) {
            degree = `${parts[1]}, ${parts[0]}`;
         } else {
            degree = `${parts[0]}, ${parts[1]}`;
         }
      }
      current = { degree, school: "" };
      entries.push(current);
    } else if (current) {
      if (text.startsWith("Focus:")) {
        current.focus = text;
      } else if (!current.school) {
        current.school = text;
      }
    }
  }
  return entries;
}


function parseSectionList(lines: string[], startIndex: number, endIndex: number) {
  if (startIndex < 0) {
    return [];
  }

  const sectionLines = lines.slice(startIndex + 1, endIndex).filter((line) => !/^-- \d+ of \d+ --$/.test(line));
  const bullets = parseBulletLines(sectionLines);
  return bullets.length > 0 ? bullets : sectionLines;
}

function parseBulletLines(lines: string[]) {
  const items: string[] = [];

  for (const line of lines) {
    if (line.startsWith("●")) {
      items.push(line.replace(/^●\s*/, "").trim());
      continue;
    }

    if (items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    } else if (line) {
      items.push(line);
    }
  }

  return items;
}

function rankItems(items: string[], keywords: string[]) {
  return unique(
    items
      .map((item, index) => ({
        item: item.trim(),
        index,
        score: keywords.reduce((count, keyword) => count + (item.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0)
      }))
      .filter((item) => item.item.length > 0)
      .sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score))
      .map((item) => item.item)
  );
}

function buildTailoringPlan(evaluation: EvaluationRecord, resume: ResumeRecord, keywordCoverage: number) {
  return [
    `Base resume selected: ${resume.name}.`,
    `Role archetype: ${evaluation.roleArchetype}.`,
    `Top keywords inserted only where supported: ${evaluation.keywords.slice(0, 8).join(", ") || "none captured"}.`,
    `Proof points reordered by overlap with the job/evaluation keywords.`,
    `Keyword coverage: ${keywordCoverage}%.`
  ];
}

function keywordCoverageFor(content: ReturnType<typeof buildTailoredContent>, keywords: string[]) {
  const text = JSON.stringify(content).toLowerCase();
  const relevant = unique(keywords.map((keyword) => keyword.toLowerCase())).filter(Boolean);
  if (relevant.length === 0) {
    return 0;
  }

  const matched = relevant.filter((keyword) => text.includes(keyword)).length;
  return Math.round((matched / relevant.length) * 100);
}

function paperFormatFor(job: JobRecord): "letter" | "a4" {
  const location = `${job.location} ${job.remoteType}`.toLowerCase();
  return location.includes("united states") || location.includes(" us") || location.includes("canada") ? "letter" : "a4";
}

function findHeading(lines: string[], headings: string[]) {
  const normalizedHeadings = headings.map((heading) => heading.toLowerCase());
  return lines.findIndex((line) => normalizedHeadings.includes(line.toLowerCase()));
}



function joinLines(lines: string[]) {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\n[ \t]*-- \d+ of \d+ --[ \t]*\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}



function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
