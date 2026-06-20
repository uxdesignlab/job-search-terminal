import { readFileSync } from "node:fs";
import path from "node:path";
import { getAISettings, getEvaluationByJobId, getGeneratedDocumentById, getJobById, getJobGapResponses, getProfileSupplements, getResumeBuilderVersion, getResumes, getSkills, getUserProfile, saveGeneratedDocument, updateDocumentDraft, updateDocumentPdf } from "../db/queries";
import type { EvaluationRecord, GeneratedDocumentInput, JobRecord, ResumeBuilderSection, ResumeBuilderVersionRecord, ResumeRecord, ResumeSectionMode, ResumeSectionModeInput, SkillRecord, UserProfileRecord } from "../db/types";
import { evaluateJob } from "../evaluation/job-evaluator";
import { renderHtmlToPdf } from "./pdf-renderer";
import { renderResumeHtml, type ResumeTemplateInput } from "./resume-template";
import { tailorResumeWithAI, type TailoredResumeSections } from "./llm-tailorer";
import { keywordCoverageFor, keywordStrengthDetailsForText, isKeywordInText } from "./keyword-coverage";
import { auditDraftAgainstEvidence, evidenceTextForDraft, revertUnsupportedMetrics } from "./evidence-audit";

export { keywordCoverageFor, missingKeywordsFor } from "./keyword-coverage";

export type GeneratedResumeResult = GeneratedDocumentInput & {
  pageCount: number;
  sizeBytes: number;
};

export async function generateTailoredResume(jobId: string, sectionModes: ResumeSectionModeInput[] = []): Promise<GeneratedResumeResult> {
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
  const approvedVersion = getApprovedResumeVersion(baseResume);
  const resolvedSectionModes = resolveSectionModes(approvedVersion.sections, sectionModes);
  const sourceDraft = buildTailoredContent(job, evaluation, profile, skills, approvedVersion, resolvedSectionModes);

  const aiSettings = getAISettings();
  const hasAIKey = aiSettings.anthropicApiKey || aiSettings.geminiApiKey || aiSettings.openaiApiKey;
  let aiTailoring: TailoredResumeSections | null = null;
  let fallbackReason = "";
  const gapResponses = getJobGapResponses(jobId).filter((r) => r.qualityStatus === "addressed");
  const supplements = getProfileSupplements().filter((s) => s.qualityStatus === "addressed");

  // Build evidence before the AI call so we can classify keywords into confirmed vs candidate.
  const evidenceText = buildEvidenceText(sourceResumeText, sourceDraft, gapResponses, supplements);

  if (hasAIKey) {
    try {
      const { partial: partialInDraft, missing: missingFromDraft } = keywordStrengthDetailsForText(
        evidenceTextForDraft(sourceDraft), evaluation.keywords
      );
      // Keywords whose words are already in the full evidence corpus → safe to use verbatim.
      const confirmedKws = evaluation.keywords.filter((kw) => isKeywordInText(evidenceText, kw));
      const notExactInDraft = [...partialInDraft, ...missingFromDraft];
      aiTailoring = await tailorResumeWithAI(job, evaluation, profile, sourceResumeText, sourceDraft, resolvedSectionModes, gapResponses, supplements, skills, notExactInDraft, confirmedKws);
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error);
    }
  }

  const confirmedKwsForInjection = evaluation.keywords.filter((kw) => isKeywordInText(evidenceText, kw));
  const applied = applyAITailoring(sourceDraft, aiTailoring, resolvedSectionModes);
  const reverted = revertUnsupportedMetrics(sourceDraft, applied, evidenceText);
  const content = injectMissingConfirmedKeywordsIntoSkills(reverted.draft, confirmedKwsForInjection, resolvedSectionModes);
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
    draftJson: JSON.stringify(content),
    baseResumeId: baseResume.id,
    tailoringStatus: aiTailoring ? reverted.audit.status : "source-only",
    evidenceAuditJson: JSON.stringify(reverted.audit),
    fallbackReason
  };

  saveGeneratedDocument(document);

  return {
    ...document,
    pageCount: render.pageCount,
    sizeBytes: render.sizeBytes
  };
}

export async function generateResumeDraft(jobId: string, resumeId?: string | null, sectionModes: ResumeSectionModeInput[] = []): Promise<{
  documentId: string;
  draft: ResumeTemplateInput;
  tailoringStatus: string;
  evidenceAudit: ReturnType<typeof auditDraftAgainstEvidence>;
  fallbackReason: string;
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
  const approvedVersion = getApprovedResumeVersion(baseResume);
  const resolvedSectionModes = resolveSectionModes(approvedVersion.sections, sectionModes);
  const sourceDraft = buildTailoredContent(job, evaluation, profile, skills, approvedVersion, resolvedSectionModes);

  const aiSettings = getAISettings();
  const hasAIKey = aiSettings.anthropicApiKey || aiSettings.geminiApiKey || aiSettings.openaiApiKey;
  let aiTailoring: TailoredResumeSections | null = null;
  let fallbackReason = "";
  const gapResponses = getJobGapResponses(jobId).filter((r) => r.qualityStatus === "addressed");
  const supplements = getProfileSupplements().filter((s) => s.qualityStatus === "addressed");

  const evidenceText = buildEvidenceText(sourceResumeText, sourceDraft, gapResponses, supplements);

  if (hasAIKey) {
    try {
      const { partial: partialInDraft, missing: missingFromDraft } = keywordStrengthDetailsForText(
        evidenceTextForDraft(sourceDraft), evaluation.keywords
      );
      const confirmedKws = evaluation.keywords.filter((kw) => isKeywordInText(evidenceText, kw));
      const notExactInDraft = [...partialInDraft, ...missingFromDraft];
      aiTailoring = await tailorResumeWithAI(job, evaluation, profile, sourceResumeText, sourceDraft, resolvedSectionModes, gapResponses, supplements, skills, notExactInDraft, confirmedKws);
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error);
    }
  }

  const confirmedKwsForInjection = evaluation.keywords.filter((kw) => isKeywordInText(evidenceText, kw));
  const applied = applyAITailoring(sourceDraft, aiTailoring, resolvedSectionModes);
  const reverted = revertUnsupportedMetrics(sourceDraft, applied, evidenceText);
  const draft = injectMissingConfirmedKeywordsIntoSkills(reverted.draft, confirmedKwsForInjection, resolvedSectionModes);
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
    baseResumeId: baseResume.id,
    tailoringStatus: aiTailoring ? reverted.audit.status : "source-only",
    evidenceAuditJson: JSON.stringify(reverted.audit),
    fallbackReason,
  });

  return { documentId, draft, tailoringStatus: aiTailoring ? reverted.audit.status : "source-only", evidenceAudit: reverted.audit, fallbackReason };
}

export async function createPdfForDocument(documentId: string, draft: ResumeTemplateInput): Promise<{ pdfUrl: string }> {
  const doc = getGeneratedDocumentById(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const job = getJobById(doc.jobId);
  if (!job) throw new Error(`Job not found: ${doc.jobId}`);

  const profile = getUserProfile();
  const baseResume = resolveDocumentResumeLane(doc, getResumes());
  if (!baseResume) throw new Error(`Base resume lane not found: ${doc.baseResume}`);
  const sourceResumeText = await loadSourceResumeText(baseResume);
  const approvedVersion = getApprovedResumeVersion(baseResume);
  const sourceDraft = templateFromApprovedSections(approvedVersion.sections, profile, job, resolveSectionModes(approvedVersion.sections, []));
  const evidenceText = buildEvidenceText(
    sourceResumeText,
    sourceDraft,
    getJobGapResponses(doc.jobId).filter((response) => response.qualityStatus === "addressed"),
    getProfileSupplements().filter((supplement) => supplement.qualityStatus === "addressed")
  );
  const audit = auditDraftAgainstEvidence(draft, evidenceText);
  if (audit.status === "unsupported-claims") {
    throw new Error(`PDF export blocked: remove or confirm unsupported claims (${audit.issues.map((issue) => issue.claim).join(", ")}).`);
  }
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

function resolveDocumentResumeLane(doc: Pick<GeneratedDocumentInput, "baseResume" | "baseResumeId">, resumes: ResumeRecord[]) {
  return resumes.find((resume) => resume.id === doc.baseResumeId)
    ?? resumes.find((resume) => resume.name === doc.baseResume);
}

// After AI tailoring, inject any confirmed keywords that are still not present as exact phrases
// directly into the skills list. This handles cases where the AI placed the concept correctly
// but used a slight paraphrase. Only injects short phrases (≤3 words) to avoid awkward skill entries.
function injectMissingConfirmedKeywordsIntoSkills(
  draft: ResumeTemplateInput,
  confirmedKeywords: string[],
  sectionModes: ResumeSectionModeInput[]
): ResumeTemplateInput {
  if (confirmedKeywords.length === 0) return draft;
  if (modeForSection("skills", sectionModes) === "keep") return draft;
  const { partial: stillPartial, missing: stillMissing } = keywordStrengthDetailsForText(
    evidenceTextForDraft(draft), confirmedKeywords
  );
  const toInject = [...stillPartial, ...stillMissing].filter((kw) => {
    const wordCount = kw.trim().split(/\s+/).length;
    return wordCount <= 3;
  });
  if (toInject.length === 0) return draft;
  // keywordStrengthDetailsForText returns lowercased labels; restore original casing.
  const originalCasing = new Map(confirmedKeywords.map((kw) => [kw.trim().toLowerCase(), kw.trim()]));
  const existingSkillsLower = new Set(draft.skills.map((s) => s.toLowerCase()));
  const newSkills = toInject
    .map((kw) => originalCasing.get(kw.toLowerCase()) ?? kw)
    .filter((kw) => !existingSkillsLower.has(kw.toLowerCase()));
  if (newSkills.length === 0) return draft;
  return { ...draft, skills: [...draft.skills, ...newSkills] };
}

function buildEvidenceText(
  sourceResumeText: string,
  sourceDraft: ResumeTemplateInput,
  gapResponses: Array<{ rawResponse: string; polishedResponse: string }>,
  supplements: Array<{ content: string }>
) {
  return [
    sourceResumeText,
    evidenceTextForDraft(sourceDraft),
    ...gapResponses.flatMap((response) => [response.rawResponse, response.polishedResponse]),
    ...supplements.map((supplement) => supplement.content),
  ].join("\n");
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

function getApprovedResumeVersion(resume: ResumeRecord): ResumeBuilderVersionRecord {
  const version = getResumeBuilderVersion(resume.id);
  if (!version || version.status !== "approved") {
    throw new Error(`Review and approve the "${resume.name}" resume builder version before generating a tailored resume.`);
  }
  return version;
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
  skills: SkillRecord[],
  approvedVersion: ResumeBuilderVersionRecord,
  sectionModes: ResumeSectionModeInput[]
) {
  const keywords = evaluation.keywords.slice(0, 8);
  const preferredSkillNames = skills
    .filter((skill) => skill.usePreference !== "use_less")
    .map((skill) => skill.skillName);

  const leadershipRole = isLeadershipArchetype(evaluation.roleArchetype);
  const rankingKeywords = leadershipRole
    ? [...keywords, ...LEADERSHIP_SIGNAL_TERMS]
    : keywords;

  const source = templateFromApprovedSections(approvedVersion.sections, profile, job, sectionModes);
  const shouldRank = (sectionId: string) => modeForSection(sectionId, sectionModes) === "update";
  const experience = shouldRank("experience")
    ? source.experience.map((entry) => ({
      ...entry,
      bullets: rankItems(entry.bullets, rankingKeywords).slice(0, entry.bullets.length)
    }))
    : source.experience;

  return {
    name: source.name || profile.name,
    headline: source.headline,
    contactItems: source.contactItems,
    title: job.title,
    summary: source.summary,
    impactHeading: source.impactHeading,
    impactItems: shouldRank("impact") ? rankItems(source.impactItems, rankingKeywords).slice(0, source.impactItems.length) : source.impactItems,
    experienceHeading: source.experienceHeading,
    experience,
    skillsHeading: source.skillsHeading,
    skills: shouldRank("skills") ? rankItems(source.skills, [...rankingKeywords, ...preferredSkillNames]).slice(0, source.skills.length) : source.skills,
    recognitionHeading: source.recognitionHeading,
    recognition: source.recognition,
    extraSections: source.extraSections,
    education: source.education
  } satisfies ResumeTemplateInput;
}

function resolveSectionModes(sections: ResumeBuilderSection[], submitted: ResumeSectionModeInput[]): ResumeSectionModeInput[] {
  const submittedById = new Map(submitted.map((item) => [item.sectionId, item.mode]));
  return sections.map((section) => {
    const submittedMode = submittedById.get(section.id);
    if (submittedMode) return { sectionId: section.id, mode: submittedMode };
    if (section.type === "summary" || section.type === "impact" || section.type === "experience") {
      return { sectionId: section.id, mode: "update" };
    }
    return { sectionId: section.id, mode: "keep" };
  });
}

function modeForSection(sectionId: string, sectionModes: ResumeSectionModeInput[]): ResumeSectionMode {
  return sectionModes.find((mode) => mode.sectionId === sectionId)?.mode ?? "keep";
}

function templateFromApprovedSections(
  sections: ResumeBuilderSection[],
  profile: UserProfileRecord,
  job: JobRecord,
  sectionModes: ResumeSectionModeInput[]
): ResumeTemplateInput {
  const template: ResumeTemplateInput = {
    name: profile.name,
    headline: "",
    contactItems: [profile.location, profile.portfolio].filter(Boolean),
    title: job.title,
    summary: "",
    impactHeading: "Key Achievements",
    impactItems: [],
    experienceHeading: "Professional Experience",
    experience: [],
    skillsHeading: "Skills",
    skills: [],
    recognitionHeading: "Awards and Recognition",
    recognition: [],
    extraSections: [],
    education: []
  };

  for (const section of sections) {
    if (modeForSection(section.id, sectionModes) === "hide") continue;

    if (section.type === "header" && section.header) {
      template.name = section.header.name || template.name;
      template.headline = section.header.headline;
      template.contactItems = section.header.contactItems.length > 0 ? section.header.contactItems : template.contactItems;
    } else if (section.type === "summary") {
      template.summary = section.text ?? "";
    } else if (section.type === "impact") {
      template.impactHeading = section.title || template.impactHeading;
      template.impactItems = section.items ?? [];
    } else if (section.type === "experience") {
      template.experienceHeading = section.title || template.experienceHeading;
      template.experience = section.experience ?? [];
    } else if (section.type === "skills") {
      template.skillsHeading = section.title || template.skillsHeading;
      template.skills = section.items ?? [];
    } else if (section.type === "recognition") {
      template.recognitionHeading = section.title || template.recognitionHeading;
      template.recognition = section.items ?? [];
    } else if (section.type === "education") {
      template.education = section.education ?? [];
    } else if (section.type === "custom") {
      template.extraSections?.push({ id: section.id, title: section.title, items: section.items ?? [] });
    }
  }

  return template;
}

function applyAITailoring(
  source: ResumeTemplateInput,
  tailoring: TailoredResumeSections | null,
  sectionModes: ResumeSectionModeInput[]
): ResumeTemplateInput {
  if (!tailoring) return source;
  const next: ResumeTemplateInput = {
    ...source,
    impactItems: [...source.impactItems],
    experience: source.experience.map((entry) => ({ ...entry, bullets: [...entry.bullets] })),
    extraSections: (source.extraSections ?? []).map((section) => ({ ...section, items: [...section.items] }))
  };

  if (modeForSection("summary", sectionModes) === "update" && typeof tailoring.summary === "string" && tailoring.summary.trim()) {
    next.summary = tailoring.summary.trim();
  }

  if (
    modeForSection("impact", sectionModes) === "update" &&
    Array.isArray(tailoring.impactItems) &&
    tailoring.impactItems.length === source.impactItems.length
  ) {
    next.impactItems = tailoring.impactItems.map((item) => String(item).trim()).filter(Boolean);
    if (next.impactItems.length !== source.impactItems.length) next.impactItems = source.impactItems;
  }

  if (modeForSection("experience", sectionModes) === "update" && Array.isArray(tailoring.experience)) {
    for (const entry of tailoring.experience) {
      const sourceEntry = source.experience[entry.index];
      if (!sourceEntry || !Array.isArray(entry.bullets) || entry.bullets.length !== sourceEntry.bullets.length) {
        continue;
      }
      const bullets = entry.bullets.map((item) => String(item).trim()).filter(Boolean);
      if (bullets.length === sourceEntry.bullets.length) {
        next.experience[entry.index] = { ...next.experience[entry.index], bullets };
      }
    }
  }

  if (Array.isArray(tailoring.extraSections) && next.extraSections) {
    next.extraSections = next.extraSections.map((section) => {
      const modeId = section.id ?? `custom-${section.title}`;
      if (modeForSection(modeId, sectionModes) !== "update") return section;
      const rewritten = tailoring.extraSections?.find((item) => item.title === section.title);
      if (!rewritten || !Array.isArray(rewritten.items) || rewritten.items.length !== section.items.length) return section;
      const items = rewritten.items.map((item) => String(item).trim()).filter(Boolean);
      return items.length === section.items.length ? { ...section, items } : section;
    });
  }

  return next;
}

export function parseSourceResume(text: string, profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim().replace(/\s+--\s+\d+ of \d+\s+--$/, ""))
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
  if (lines.length === 0) {
    return {
      name: profile.name,
      headline: "",
      contactItems: [profile.location, profile.portfolio].filter(Boolean)
    };
  }

  // PDFs often put name + headline on a single line. Use the profile name to
  // split them: if line[0] starts with the known name, the rest is the headline.
  const { name, remaining } = extractHeaderName(lines, profile);

  const contactItems: string[] = [];
  let headline = "";

  for (const rawLine of remaining) {
    // normalizeText converts inline "•" / "●" separators to "\n● " — strip them
    const hasBulletPrefix = /^[●•●•]\s/.test(rawLine);
    const line = rawLine.replace(/^[●•●•]\s*/, "").trim();
    if (!line) continue;

    // First non-bullet line: extract headline even if it contains appended phone/email.
    // PDFs commonly produce "Headline Title +1-234-5678" on one line.
    if (!headline && !hasBulletPrefix) {
      const { headlinePart, contacts } = splitHeadlineFromMixedLine(line);
      if (headlinePart) {
        headline = headlinePart;
        contactItems.push(...contacts);
        continue;
      }
    }

    const parsedContact = parseContactLine(line);
    if (parsedContact.length > 0) {
      contactItems.push(...parsedContact);
      continue;
    }

    // "Nashville, TN" / "Remote" — city/state patterns without URL chars
    if (isLocationLike(line)) {
      contactItems.push(line);
      continue;
    }

    // Bare domain like "pavel.ux.business" without http/www prefix
    if (isDomainLike(line)) {
      contactItems.push(line);
      continue;
    }

    // Any line that was a normalised bullet separator is contact material
    if (hasBulletPrefix) {
      contactItems.push(line);
      continue;
    }

    // Plain text fallback
    if (!headline) {
      headline = line;
    } else {
      contactItems.push(line);
    }
  }

  return {
    name,
    headline,
    contactItems: contactItems.length > 0 ? unique(contactItems) : [profile.location, profile.portfolio].filter(Boolean)
  };
}

// Separates the professional headline from any contact info (phone, email, URL) that
// a PDF may have merged onto the same line as the title.
function splitHeadlineFromMixedLine(line: string): { headlinePart: string; contacts: string[] } {
  // Lines starting with contact markers are not headlines
  if (/^[+\d@]/.test(line) || /^https?:\/\//i.test(line) || /^www\./i.test(line)) {
    return { headlinePart: "", contacts: [] };
  }

  const hasPhone = /\+?\d[\d\s().-]{7,}/.test(line);
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line);
  const hasUrl = /https?:\/\/|www\.|linkedin\.com/i.test(line);

  if (!hasPhone && !hasEmail && !hasUrl) {
    // Pure headline with no contact info embedded
    return { headlinePart: line, contacts: [] };
  }

  // Strip contact markers from the line to recover the headline text
  const contacts: string[] = [];
  let cleaned = line;

  // Phone appended at the end: "...Headline Title +1-615-866-2369"
  cleaned = cleaned.replace(/\s+(\+?[\d][\d\s().-]{7,})\s*$/, (_, phone) => {
    contacts.push(phone.trim());
    return "";
  });

  // Emails embedded in the line
  cleaned = cleaned.replace(/\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, (_, email) => {
    contacts.push(email.trim());
    return "";
  });

  // Full URLs
  cleaned = cleaned.replace(/\s+(https?:\/\/\S+)/gi, (_, url) => {
    contacts.push(url.trim());
    return "";
  });

  // Split remaining by | and drop any still-contact-looking segments
  const parts = cleaned.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  const headlineParts: string[] = [];
  for (const part of parts) {
    if (/\+?\d[\d\s().-]{7,}/.test(part) || /[A-Z0-9._%+-]+@/i.test(part) || /linkedin\.com|https?:\/\//i.test(part)) {
      contacts.push(part);
    } else {
      headlineParts.push(part);
    }
  }

  const headlinePart = headlineParts.join(" | ").trim();
  if (headlinePart.length < 5) {
    return { headlinePart: "", contacts };
  }

  return { headlinePart, contacts };
}

function extractHeaderName(
  lines: string[],
  profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">
): { name: string; remaining: string[] } {
  const firstLine = lines[0];

  if (profile.name) {
    const profileLower = profile.name.toLowerCase();
    const firstLower = firstLine.toLowerCase();

    if (firstLower === profileLower) {
      return { name: firstLine, remaining: lines.slice(1) };
    }

    if (firstLower.startsWith(profileLower)) {
      // e.g. "Pavel Bukengolts Executive UX & Product Design Leader..."
      const name = firstLine.slice(0, profile.name.length).trim();
      const rest = firstLine.slice(profile.name.length).trim();
      const remaining = rest ? [rest, ...lines.slice(1)] : lines.slice(1);
      return { name, remaining };
    }
  }

  return { name: firstLine, remaining: lines.slice(1) };
}

function isLocationLike(line: string): boolean {
  if (!line || line.includes("@") || /[./]/.test(line) || /[0-9]/.test(line)) return false;
  if (/^remote$/i.test(line)) return true;
  // "Nashville, TN" / "New York, NY" / "London, UK" — comma + 2-3-letter code
  return /^[A-Za-z\s.''-]{2,30},\s*[A-Z]{2,3}$/.test(line);
}

function isDomainLike(line: string): boolean {
  // "pavel.ux.business" or "ux.design" — no spaces, no @, at least one dot
  return /^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}$/i.test(line) && !line.includes(" ");
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
  let pendingSchool = "";

  for (const line of lines) {
    const text = stripBullet(line);
    if (!text || /^-- \d+ of \d+ --$/.test(text)) continue;

    // Match both spelled-out degree names and common abbreviations (B.S., M.A., A.S., etc.)
    const isDegreeKeyword = /Bachelor|Master|Doctor|Associate|Ph\.?D|MBA|M\.B\.A|M\.D\.|Ed\.D\.|J\.D\.|LL\.M|B\.S\.|B\.A\.|B\.Sc\.|B\.E\.|B\.F\.A\.|M\.S\.|M\.A\.|M\.Sc\.|M\.Eng\.|A\.A\.|A\.S\.|A\.A\.S\./i.test(text);
    if (text.includes(" | ") || isDegreeKeyword) {
      let degree = text;
      let inlineSchool = "";
      let inlineFocus = "";

      if (text.includes(" | ")) {
        const parts = text.split(" | ");
        // parts[0] = "Computer and Digital Communication Science"
        // parts[1] = "Master of Science" OR "Master of Science Belarus State University... Focus: ..."
        let levelAndMore = parts[1];

        // Detach trailing "Focus: ..." that was merged onto the same line by the PDF extractor
        const focusIdx = levelAndMore.search(/\s+Focus:\s/);
        if (focusIdx !== -1) {
          inlineFocus = levelAndMore.slice(focusIdx).trim();
          levelAndMore = levelAndMore.slice(0, focusIdx).trim();
        }

        // Extract just the degree level ("Master of Science", "Bachelor of Arts", etc.)
        // then treat the remainder as the inline school name.
        // Use an explicit discipline list so the regex doesn't greedily consume school name words.
        const DISCIPLINES = "Science|Arts|Engineering|Fine Arts|Business Administration|Education|"
          + "Public Health|Law|Music|Commerce|Nursing|Divinity|Architecture|Design|Philosophy|"
          + "Technology|Computer Science|Information Systems|Social Work|Public Policy|"
          + "International Relations|Digital Communication Science|Communication Science";
        const degreeLevelMatch = new RegExp(
          `^((?:Master|Bachelor|Doctor)\\s+of\\s+(?:${DISCIPLINES})|Ph\\.?D\\.?|M\\.?B\\.?A\\.?|M\\.?D\\.?|Ed\\.?D\\.?)`,
          "i"
        ).exec(levelAndMore);
        const degreeLevel = degreeLevelMatch ? degreeLevelMatch[1].trim() : levelAndMore;
        const schoolRemainder = levelAndMore.slice(degreeLevel.length).trim();
        if (schoolRemainder) inlineSchool = schoolRemainder;

        if (degreeLevel.match(/Master|Bachelor|Doctor/i)) {
          degree = `${degreeLevel}, ${parts[0]}`;
        } else {
          degree = `${parts[0]}, ${degreeLevel}`;
        }
      }

      current = { degree, school: inlineSchool || pendingSchool };
      pendingSchool = "";
      if (inlineFocus) current.focus = inlineFocus.replace(/^Focus:\s*/, "");
      entries.push(current);
    } else if (current) {
      const stripped = text.replace(/^Focus:\s*/, "");
      if (text.startsWith("Focus:")) {
        current.focus = stripped;
      } else if (!current.school) {
        current.school = text;
      }
    } else {
      // School name before the degree line (common format)
      pendingSchool = text;
    }
  }

  // Fallback: if no entries were parsed but the section had content, create a basic entry
  // so validation doesn't falsely report a missing education section.
  if (entries.length === 0) {
    const nonEmpty = lines.map((l) => stripBullet(l)).filter((l) => l && !/^-- \d+ of \d+ --$/.test(l));
    if (nonEmpty.length > 0) {
      entries.push({ degree: nonEmpty[0], school: nonEmpty[1] ?? "" });
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

    // Category-style entry: "Category Name: content..." — common in Skills
    // sections that have no bullet markers between sub-categories. Treat each
    // such line as a new item rather than continuing the previous one.
    if (/^[A-Z][A-Za-z0-9 &/\-]{2,40}:\s/.test(line)) {
      items.push(line);
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
