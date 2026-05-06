import { readFileSync } from "node:fs";
import path from "node:path";
import { getAISettings, getEvaluationByJobId, getGeneratedDocumentById, getJobById, getJobGapResponses, getProfileSupplements, getResumes, getSkills, getUserProfile, saveGeneratedDocument, updateDocumentDraft, updateDocumentPdf } from "../db/queries";
import type { EvaluationRecord, GeneratedDocumentInput, JobRecord, ResumeRecord, SkillRecord, UserProfileRecord } from "../db/types";
import { evaluateJob } from "../evaluation/job-evaluator";
import { renderHtmlToPdf } from "./pdf-renderer";
import { renderResumeHtml, type ResumeTemplateInput } from "./resume-template";
import { tailorResumeWithAI } from "./llm-tailorer";

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

  const aiSettings = getAISettings();
  const hasAIKey = aiSettings.anthropicApiKey || aiSettings.geminiApiKey || aiSettings.openaiApiKey;
  let tailoredSummary: string | null = null;

  if (hasAIKey) {
    try {
      const gapResponses = getJobGapResponses(jobId);
      const supplements = getProfileSupplements();
      const tailored = await tailorResumeWithAI(job, evaluation, profile, sourceResumeText, gapResponses, supplements);
      tailoredSummary = tailored.summary || null;
    } catch {
      // Fall through to source resume summary
    }
  }

  const content = buildTailoredContent(job, evaluation, profile, baseResume, skills, sourceResumeText, tailoredSummary);
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
    tailoringPlan,
    draftJson: JSON.stringify(content)
  };

  saveGeneratedDocument(document);

  return {
    ...document,
    pageCount: render.pageCount,
    sizeBytes: render.sizeBytes
  };
}

export async function generateResumeDraft(jobId: string, resumeId?: string | null): Promise<{
  documentId: string;
  draft: ResumeTemplateInput;
}> {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  let evaluation = getEvaluationByJobId(jobId);
  if (!evaluation) {
    evaluateJob(jobId);
    evaluation = getEvaluationByJobId(jobId);
  }
  if (!evaluation) throw new Error(`Evaluation could not be saved for job: ${jobId}`);

  const profile = getUserProfile();
  const resumes = getResumes();
  const skills = getSkills();

  const baseResume = resumeId
    ? (resumes.find((r) => r.id === resumeId) ?? selectBaseResume(evaluation, resumes))
    : selectBaseResume(evaluation, resumes);

  const sourceResumeText = await loadSourceResumeText(baseResume);

  const aiSettings = getAISettings();
  const hasAIKey = aiSettings.anthropicApiKey || aiSettings.geminiApiKey || aiSettings.openaiApiKey;
  let tailoredSummary: string | null = null;

  if (hasAIKey) {
    try {
      const gapResponses = getJobGapResponses(jobId);
      const supplements = getProfileSupplements();
      const tailored = await tailorResumeWithAI(job, evaluation, profile, sourceResumeText, gapResponses, supplements);
      tailoredSummary = tailored.summary || null;
    } catch { /* fall through to source resume summary */ }
  }

  const draft = buildTailoredContent(job, evaluation, profile, baseResume, skills, sourceResumeText, tailoredSummary);
  const keywordCoverage = keywordCoverageFor(draft, evaluation.keywords);
  const tailoringPlan = buildTailoringPlan(evaluation, baseResume, keywordCoverage);
  const date = new Date().toISOString().slice(0, 10);
  const documentId = `document-${job.id}`;

  saveGeneratedDocument({
    id: documentId,
    jobId: job.id,
    documentType: "resume",
    title: `${job.company} - ${job.title} tailored resume`,
    content: "",
    pdfUrl: "",
    htmlUrl: "",
    baseResume: baseResume.name,
    generatedDate: date,
    status: "Draft",
    tailoringSummary: `Generated from ${baseResume.name}. ${keywordCoverage}% keyword coverage.`,
    keywordCoverage,
    tailoringPlan,
    draftJson: JSON.stringify(draft),
  });

  return { documentId, draft };
}

export async function createPdfForDocument(documentId: string, draft: ResumeTemplateInput): Promise<{ pdfUrl: string }> {
  const doc = getGeneratedDocumentById(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const job = getJobById(doc.jobId);
  if (!job) throw new Error(`Job not found: ${doc.jobId}`);

  const profile = getUserProfile();
  const html = renderResumeHtml(draft);
  const slug = slugify(`${profile.name}-${job.company}-${job.title}`);
  const date = new Date().toISOString().slice(0, 10);
  const htmlPath = path.join(process.cwd(), "output", `${slug}-${date}.html`);
  const pdfPath = path.join(process.cwd(), "output", `${slug}-${date}.pdf`);

  const render = await renderHtmlToPdf({ html, htmlPath, pdfPath, format: paperFormatFor(job) });

  updateDocumentDraft(documentId, JSON.stringify(draft));
  updateDocumentPdf(documentId, html, render.htmlPath, render.pdfPath);

  return { pdfUrl: render.pdfPath };
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

const LEADERSHIP_SIGNAL_TERMS = [
  "manage", "managed", "managing", "hire", "hired", "hiring", "built the team", "scaled the team",
  "led a team", "lead a team", "team of", "direct report", "org design", "organizational",
  "roadmap", "vision", "executive", "stakeholder", "c-suite", "board", "budget", "headcount",
  "cross-functional", "aligned", "strategic", "strategy", "department", "division"
];

function isLeadershipArchetype(archetype: string) {
  const a = archetype.toLowerCase();
  return a.includes("leadership") || a.includes("management") || a.includes("director") || a.includes("chief") || a.includes("vp");
}

function buildTailoredContent(
  job: JobRecord,
  evaluation: EvaluationRecord,
  profile: UserProfileRecord,
  resume: ResumeRecord,
  skills: SkillRecord[],
  sourceResumeText: string,
  tailoredSummary?: string | null
) {
  const source = parseSourceResume(sourceResumeText, profile);
  const extractionIssues = validateResumeExtraction(source, sourceResumeText);
  if (extractionIssues.length > 0) {
    throw new Error(`Resume extraction is incomplete: ${extractionIssues.join("; ")}`);
  }

  const keywords = evaluation.keywords.slice(0, 8);
  const preferredSkillNames = skills
    .filter((skill) => skill.usePreference !== "use_less")
    .map((skill) => skill.skillName);

  const leadershipRole = isLeadershipArchetype(evaluation.roleArchetype);
  const rankingKeywords = leadershipRole
    ? [...keywords, ...LEADERSHIP_SIGNAL_TERMS]
    : keywords;

  // Reorder bullets within each role entry by keyword relevance.
  // Bullets NEVER move between entries — source role assignment is always preserved.
  const experience = source.experience.map((entry) => ({
    ...entry,
    bullets: rankItems(entry.bullets, rankingKeywords).slice(0, entry.bullets.length)
  }));

  return {
    name: source.name || profile.name,
    headline: source.headline,
    contactItems: source.contactItems,
    title: job.title,
    // Use AI summary only if provided; otherwise keep the source resume summary verbatim
    summary: tailoredSummary || source.summary,
    impactHeading: "Key Achievements",
    // Reorder impact items by relevance but never add or remove any
    impactItems: rankItems(source.impactItems, rankingKeywords).slice(0, source.impactItems.length),
    experienceHeading: "Professional Experience",
    experience,
    // Reorder skills by relevance but never add or remove any
    skills: rankItems(source.skills, [...rankingKeywords, ...preferredSkillNames]).slice(0, source.skills.length),
    recognition: source.recognition,
    education: source.education
  } satisfies ResumeTemplateInput;
}

export function parseSourceResume(text: string, profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^-- \d+ of \d+ --$/.test(line));

  const headingGroups = {
    summary: ["Summary", "Professional Summary", "Executive Summary", "Career Summary", "Profile", "Professional Profile", "About", "About Me"],
    impact: ["Selected Impact", "Selected Executive Impact", "Career Highlights", "Highlights", "Core Strengths", "Key Achievements", "Achievements", "Selected Achievements"],
    experience: ["Professional Experience", "Teaching Experience", "Work Experience", "Experience", "Relevant Experience", "Selected Experience", "Employment Experience", "Employment History", "Work History", "Career Experience", "Professional Background"],
    skills: ["Skills", "Core Skills", "Core Competencies", "Competencies", "Areas of Expertise", "Expertise", "Technical Skills", "Design Skills", "Skills and Tools", "Technical Skills and Tools", "Tools", "Tools and Technologies", "Technologies", "Soft Skills", "Languages"],
    recognition: ["Recognition", "Industry Leadership, Publications and Mentorship", "Awards and Recognition", "Awards", "Publications", "Certifications", "Licenses and Certifications"],
    education: ["Education", "Education and Training", "Education and Certifications", "Academic Background", "Credentials"],
  };

  const sections = {
    summary: findHeading(lines, headingGroups.summary),
    impact: findHeading(lines, headingGroups.impact),
    experience: findHeading(lines, headingGroups.experience),
    skills: findHeading(lines, headingGroups.skills),
    recognition: findHeading(lines, headingGroups.recognition),
    education: findHeading(lines, headingGroups.education),
  };

  const allHeadingIndexes = uniqueIndexes(
    Object.values(headingGroups).flatMap((headings) => findHeadingIndexes(lines, headings))
  );
  const skillIndexes = findHeadingIndexes(lines, headingGroups.skills);

  const getNextBoundary = (currentIndex: number) => {
    const boundaries = allHeadingIndexes.filter(v => v > currentIndex);
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
    skills: skillIndexes.flatMap((index) => parseSectionList(lines, index, getNextBoundary(index))),
    recognition: sections.recognition !== -1 ? parseSectionList(lines, sections.recognition, getNextBoundary(sections.recognition)) : [],
    education: sections.education !== -1 ? parseEducation(lines.slice(sections.education + 1, getNextBoundary(sections.education))) : []
  };
}

export type ParsedResumeSections = ReturnType<typeof parseSourceResume>;

export function validateResumeExtraction(parsed: ParsedResumeSections, sourceText: string) {
  const issues: string[] = [];
  const wordCount = sourceText.split(/\s+/).filter(Boolean).length;

  if (wordCount < 120) {
    issues.push("PDF text layer is too short to be a complete resume");
  }
  if (parsed.summary.split(/\s+/).filter(Boolean).length < 12) {
    issues.push("missing or incomplete summary section");
  }
  if (parsed.experience.length === 0) {
    issues.push("missing experience section");
  } else if (parsed.experience.every((entry) => entry.bullets.length === 0)) {
    issues.push("experience section has no role details or bullets");
  }
  if (parsed.skills.length === 0) {
    issues.push("missing skills section");
  }
  if (parsed.education.length === 0) {
    issues.push("missing education section");
  }

  return issues;
}

function parseHeader(lines: string[], profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">) {
  const name = lines[0] || profile.name;
  const contactItems: string[] = [];
  const headlineLines: string[] = [];

  for (const line of lines.slice(1)) {
    const parsedContact = parseContactLine(line);
    if (parsedContact.length > 0) {
      contactItems.push(...parsedContact);
      continue;
    }

    headlineLines.push(line);
  }

  const headline = headlineLines.join(" ").trim();

  return {
    name,
    headline,
    contactItems: contactItems.length > 0 ? unique(contactItems) : [profile.location, profile.portfolio].filter(Boolean)
  };
}

function parseContactLine(line: string) {
  const labeled = /^(Location|Phone|Email|Portfolio|LinkedIn|Website|Relocation):\s*(.+)$/i.exec(line);
  if (labeled) {
    const label = labeled[1].toLowerCase();
    const value = labeled[2].trim();
    if (label === "email") {
      const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      return email ? [email] : [];
    }
    if (label === "relocation") {
      return [`Relocation: ${value}`];
    }
    return value ? [value] : [];
  }

  if (line.includes("@") || /\+?\d[\d\s().-]{7,}/.test(line) || /linkedin\.com|https?:\/\/|www\./i.test(line)) {
    return line.split(/[|\u2022]/).map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function parseExperience(lines: string[]) {
  const entries: ResumeTemplateInput["experience"] = [];
  let current: ResumeTemplateInput["experience"][number] | undefined;
  let pendingTitle = "";

  for (const line of lines) {
    if (isBulletLine(line)) {
      const bullet = stripBullet(line);
      if (current) {
        current.bullets.push(bullet);
      }
      pendingTitle = "";
      continue;
    }

    const dateMatch = DATE_RANGE_RE.exec(line);
    if (dateMatch) {
      const orgPart = line.slice(0, dateMatch.index).replace(/[\t|]+\s*$/, "").trim();
      const dateRange = formatDate(`${dateMatch[1]} - ${dateMatch[2]}`);
      const { organization, location } = splitOrganizationAndLocation(orgPart);

      if (pendingTitle) {
        current = { title: pendingTitle, organization, location, dateRange, bullets: [] };
        entries.push(current);
        pendingTitle = "";
      } else {
        // Org+date line without a preceding title — use org as title
        current = { title: organization, organization: "", location, dateRange, bullets: [] };
        entries.push(current);
      }
      continue;
    }

    const looksLikeTitle =
      /^[A-Z]/.test(line) &&
      line.length <= 120 &&
      !line.startsWith("\u2013") &&
      !line.startsWith("-");

    if (current && !pendingTitle && current.bullets.length === 0) {
      current.bullets.push(line);
    } else if (looksLikeTitle || !current?.bullets.length) {
      pendingTitle = pendingTitle ? `${pendingTitle} ${line}` : line;
    } else if (current?.bullets.length) {
      current.bullets[current.bullets.length - 1] =
        `${current.bullets[current.bullets.length - 1]} ${line}`.trim();
    }
  }

  return entries;
}

const MONTH_RE = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_VALUE_RE = `(?:\\d{2}[/.]\\d{4}|${MONTH_RE}\\s+\\d{4})`;
const DATE_RANGE_RE = new RegExp(`(${DATE_VALUE_RE})\\s*[\\-\u2013\u2014]\\s*(Present|${DATE_VALUE_RE})`, "i");

function splitOrganizationAndLocation(value: string) {
  const pipeParts = value.split(/\s+\|\s+/);
  if (pipeParts.length >= 2) {
    return {
      organization: pipeParts[0].trim(),
      location: pipeParts.slice(1).join(" | ").trim() || undefined,
    };
  }

  const dashParts = value.split(/\s+[\-\u2013\u2014]\s+/);
  if (dashParts.length >= 2) {
    return {
      organization: dashParts[0].trim(),
      location: dashParts.slice(1).join(" - ").trim() || undefined,
    };
  }

  return { organization: value.trim(), location: undefined };
}

function formatDate(dateStr: string) {
  return dateStr.replace(new RegExp(`\\d{2}[/.]\\d{4}|${MONTH_RE}\\s+\\d{4}`, "gi"), (date) => {
    const numeric = /(\d{2})[/.](\d{4})/.exec(date);
    if (!numeric) {
      return formatMonthDate(date);
    }

    const [, m, y] = numeric;
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(m, 10) - 1];
    return `${month} ${y}`;
  });
}

function formatMonthDate(value: string) {
  const match = new RegExp(`^(${MONTH_RE})\\s+(\\d{4})$`, "i").exec(value.trim());
  if (!match) return value;
  const monthKey = match[1].slice(0, 3).toLowerCase();
  const month = {
    jan: "Jan",
    feb: "Feb",
    mar: "Mar",
    apr: "Apr",
    may: "May",
    jun: "Jun",
    jul: "Jul",
    aug: "Aug",
    sep: "Sep",
    oct: "Oct",
    nov: "Nov",
    dec: "Dec",
  }[monthKey] ?? match[1];
  return `${month} ${match[2]}`;
}

function parseEducation(lines: string[]) {
  const entries: ResumeTemplateInput["education"] = [];
  let current: ResumeTemplateInput["education"][number] | undefined;
  
  for (const line of lines) {
    const text = stripBullet(line);
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
    if (isBulletLine(line)) {
      items.push(stripBullet(line));
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

function isBulletLine(line: string) {
  return /^[\u25aa\u25ab\u25cf\u25e6\u2022*\-]\s+/.test(line);
}

function stripBullet(line: string) {
  return line.replace(/^[\u25aa\u25ab\u25cf\u25e6\u2022*\-]\s+/, "").trim();
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
  const normalizedHeadings = headings.map(normalizeHeading);
  return lines.findIndex((line) => normalizedHeadings.includes(normalizeHeading(line)));
}

function findHeadingIndexes(lines: string[], headings: string[]) {
  const normalizedHeadings = headings.map(normalizeHeading);
  return lines
    .map((line, index) => normalizedHeadings.includes(normalizeHeading(line)) ? index : -1)
    .filter((index) => index !== -1);
}

function normalizeHeading(line: string) {
  return line
    .replace(/^[#\s]+/, "")
    .replace(/[:|]+$/, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqueIndexes(values: number[]) {
  return [...new Set(values.filter((value) => value >= 0))].sort((a, b) => a - b);
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
