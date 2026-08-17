import { getResumeBuilderVersions, getResumes } from "../db/queries";

export type GapEvidenceContext = {
  /** Extracted text of the active resume, truncated for prompt budget. */
  resumeText: string;
  /** Employment history already on file: organization, title, and date range. */
  employmentFacts: string[];
};

const MAX_RESUME_CHARS = 3000;

/**
 * Facts the app already knows about the candidate.
 *
 * Every gap prompt gets this so the AI stops asking for things the resume
 * already answers — employers, titles, and dates above all. Re-asking for a
 * date that is sitting in the database is the fastest way to make the follow-up
 * loop feel worthless.
 */
export function loadGapEvidenceContext(): GapEvidenceContext {
  const resumes = getResumes();
  const resumeText = (resumes.find((resume) => resume.activeStatus) ?? resumes[0])?.extractedText ?? "";

  const employmentFacts: string[] = [];
  const seen = new Set<string>();
  for (const version of getResumeBuilderVersions()) {
    for (const section of version.sections) {
      if (section.type !== "experience" || !section.experience) continue;
      for (const entry of section.experience) {
        const organization = entry.organization?.trim();
        if (!organization) continue;
        const key = `${organization.toLowerCase()}|${entry.title?.trim().toLowerCase() ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        employmentFacts.push(
          [organization, entry.title?.trim(), entry.dateRange?.trim()].filter(Boolean).join(" — ")
        );
      }
    }
  }

  return { resumeText: resumeText.trim().slice(0, MAX_RESUME_CHARS), employmentFacts };
}

/** Render the context as a prompt block, or "" when nothing is on file. */
export function formatGapEvidenceContext(context: GapEvidenceContext): string {
  const parts: string[] = [];
  if (context.employmentFacts.length > 0) {
    parts.push(`EMPLOYMENT ALREADY ON FILE (employers, titles, and dates — never ask for these):\n${context.employmentFacts.map((fact) => `- ${fact}`).join("\n")}`);
  }
  if (context.resumeText) {
    parts.push(`RESUME TEXT ON FILE:\n${context.resumeText}`);
  }
  return parts.join("\n\n");
}
