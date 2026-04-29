import path from "node:path";
import { getEvaluationByJobId, getJobById, getResumes, getSkills, getUserProfile, saveGeneratedDocument } from "../db/queries";
import type { EvaluationRecord, GeneratedDocumentInput, JobRecord, ResumeRecord, SkillRecord, UserProfileRecord } from "../db/types";
import { evaluateJob } from "../evaluation/job-evaluator";
import { renderHtmlToPdf } from "./pdf-renderer";
import { renderResumeHtml } from "./resume-template";

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
  const content = buildTailoredContent(job, evaluation, profile, baseResume, skills);
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

function buildTailoredContent(
  job: JobRecord,
  evaluation: EvaluationRecord,
  profile: UserProfileRecord,
  resume: ResumeRecord,
  skills: SkillRecord[]
) {
  const keywords = evaluation.keywords.slice(0, 8);
  const competencies = unique([
    ...keywords,
    ...skills
      .filter((skill) => skill.usePreference !== "use_less")
      .map((skill) => skill.skillName)
      .slice(0, 8)
  ]).slice(0, 10);
  const proofPoints = rankedProofPoints(resume, keywords);
  const projects = unique([
    ...evaluation.requirementMatch.slice(0, 4),
    ...evaluation.resumeEvidence.map((item) => trimEvidence(item)).slice(0, 4)
  ]).slice(0, 5);

  return {
    name: profile.name,
    location: profile.location,
    portfolio: profile.portfolio,
    title: job.title,
    summary: `${profile.name} is positioned for ${job.title} at ${job.company} through ${competencies.slice(0, 4).join(", ")}. This version prioritizes evidence already present in the ${resume.name} resume lane and avoids unsupported claims.`,
    competencies,
    proofPoints,
    projects,
    education: ["Education, certifications, and formal credentials retained from the selected source resume lane."],
    skills: unique([...profile.strongestSkills, ...profile.skillsToUseMore, ...keywords]).slice(0, 12)
  };
}

function rankedProofPoints(resume: ResumeRecord, keywords: string[]) {
  const candidates = [...resume.evidence, ...splitResumeText(resume.extractedText)];
  const ranked = candidates
    .map((item) => ({
      item: trimEvidence(item),
      score: keywords.reduce((count, keyword) => count + (item.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0)
    }))
    .filter((item) => item.item.length > 30)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.item);

  return unique(ranked).slice(0, 8);
}

function splitResumeText(text: string) {
  return text
    .split(/(?:\n|●|\u2022|\. )+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 35 && item.length < 260);
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

function trimEvidence(value: string) {
  return value
    .replace(/^[^:]+:\s*/, "")
    .replace(/\s+/g, " ")
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
