import { tryGetActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import type { ParsedResumeSections } from "./resume-generator";

export type AIExtractedResume = {
  name?: string;
  headline?: string;
  contactItems?: string[];
  summary?: string;
  impactHeading?: string | null;
  impactItems?: string[];
  experienceHeading?: string;
  experience?: Array<{
    title: string;
    organization: string;
    location?: string | null;
    dateRange?: string | null;
    bullets: string[];
  }>;
  skills?: string[];
  recognition?: string[];
  education?: Array<{
    degree: string;
    school?: string | null;
    focus?: string | null;
  }>;
};

/**
 * Scores the quality of a heuristic extraction result (0–5).
 * Each point represents one key section that was successfully extracted:
 *   1. name present
 *   2. experience has ≥1 entry
 *   3. at least one experience entry has bullets
 *   4. skills non-empty
 *   5. summary non-trivially present (>20 chars)
 *
 * Scores below 4 indicate ≥2 sections are missing or empty and the AI layer
 * should be invoked to fill the gaps.
 */
export function assessExtractionQuality(parsed: ParsedResumeSections): number {
  let score = 0;
  if (parsed.name) score++;
  if (parsed.experience.length > 0) score++;
  if (parsed.experience.some((e) => e.bullets.length > 0)) score++;
  if (parsed.skills.length > 0) score++;
  if (parsed.summary.trim().length > 20) score++;
  return score;
}

const MAX_AI_EXTRACTION_CHARS = 12_000;

// Shape hint passed to generateJSON so providers that need a schema hint have one.
const EXTRACTION_HINT = JSON.stringify({
  name: "",
  headline: "",
  contactItems: [],
  summary: "",
  impactHeading: null,
  impactItems: [],
  experienceHeading: "Professional Experience",
  experience: [{ title: "", organization: "", location: null, dateRange: null, bullets: [] }],
  skills: [],
  recognition: [],
  education: [{ degree: "", school: null, focus: null }],
});

/**
 * Calls the configured AI provider to parse resume text into structured data.
 * Handles non-standard layouts, multi-column PDFs, and garbled reading order.
 * Returns null when no AI key is configured or the request fails.
 */
export async function extractResumeWithAI(sourceText: string): Promise<AIExtractedResume | null> {
  const provider = tryGetActiveProvider();
  if (!provider) return null;

  const text =
    sourceText.length > MAX_AI_EXTRACTION_CHARS
      ? sourceText.slice(0, MAX_AI_EXTRACTION_CHARS)
      : sourceText;

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a resume data extractor. Convert the provided resume text — which may be imperfectly extracted from a PDF — into structured JSON.

PDF text extraction frequently produces artifacts: multi-column layouts may interleave unrelated lines, section headings may run into preceding text, and reading order may not match the visual layout. Reason about what belongs where based on context, not just line order.

EXTRACTION RULES:
- Extract information faithfully. Do NOT invent, add, or embellish any content.
- Use null for missing optional fields and empty arrays for missing list fields.
- name: the candidate's full name (first line of the resume header).
- headline: the candidate's professional title or tagline, separate from the name.
- contactItems: each contact detail as its own string — phone, email, LinkedIn URL, portfolio URL, city/state.
- summary: the professional summary or profile paragraph. Omit if not present.
- impactHeading / impactItems: only populate when there is a dedicated highlights, key achievements, or selected impact section separate from experience bullets.
- experienceHeading: the exact section title used (e.g. "Professional Experience", "Work History").
- experience[].title: the candidate's job title at that role.
- experience[].organization: the employer name.
- experience[].location: city/state or "Remote" if shown.
- experience[].dateRange: the date range string exactly as written (e.g. "Jan 2020 – Present").
- experience[].bullets: one string per achievement or responsibility bullet.
- skills: flat array preserving the candidate's original skill strings. An item may be a category like "Product Design: Interaction Design, Prototyping" or a single skill name.
- recognition: awards, certifications, publications, and similar items as individual strings.
- education[].degree: include the field of study, e.g. "Master of Science, Computer Science" or "Bachelor of Arts, Graphic Design".
- education[].school: institution name.
- education[].focus: concentration, minor, or thesis topic if listed.`,
    },
    {
      role: "user",
      content: `Parse this resume into structured JSON. Return ONLY valid JSON — no explanation, no markdown code fences.

RESUME TEXT:
${text}`,
    },
  ];

  try {
    const result = await withRetry(() =>
      provider.generateJSON<AIExtractedResume>(messages, EXTRACTION_HINT)
    );
    return result ?? null;
  } catch {
    return null;
  }
}

/**
 * Merges a heuristic extraction with an AI extraction.
 *
 * Strategy: heuristic data wins when it is non-empty/non-trivial — the heuristic
 * parser has a profile-name anchor and deterministic section detection that AI
 * cannot replicate. AI output fills only the sections that the heuristic missed.
 *
 * Experience is the exception: if the heuristic produced entries but none have
 * bullets (garbled experience), the AI result is preferred since it can reason
 * across multi-column PDF artifacts.
 */
export function mergeExtractions(
  heuristic: ParsedResumeSections,
  ai: AIExtractedResume
): ParsedResumeSections {
  const preferArray = <T>(heuristicArr: T[], aiArr: T[] | undefined): T[] =>
    heuristicArr.length > 0 ? heuristicArr : (aiArr ?? []);

  const aiExperience = (ai.experience ?? []).map((e) => ({
    title: e.title ?? "",
    organization: e.organization ?? "",
    location: e.location ?? "",
    dateRange: e.dateRange ?? "",
    bullets: e.bullets ?? [],
  }));

  const aiEducation = (ai.education ?? []).map((e) => ({
    degree: e.degree ?? "",
    school: e.school ?? "",
    focus: e.focus ?? undefined,
  }));

  // When the heuristic parser found no experience entries but AI did, the
  // heuristic likely mis-bucketed everything into one section (e.g. all
  // experience bullets ended up under "Career Highlights" because no later
  // section boundary was detected). In that case trust AI wholesale rather
  // than letting heuristic's bad bucketing dominate.
  const heuristicMisbucketed =
    heuristic.experience.length === 0 && aiExperience.length > 0;

  if (heuristicMisbucketed) {
    return {
      name: heuristic.name || ai.name || "",
      headline: heuristic.headline || ai.headline || "",
      contactItems: preferArray(heuristic.contactItems, ai.contactItems),
      summary: ai.summary && ai.summary.trim().length > 20 ? ai.summary : heuristic.summary,
      impactHeading: ai.impactHeading || heuristic.impactHeading || "Key Achievements",
      impactItems: ai.impactItems ?? [],
      experienceHeading:
        ai.experienceHeading || heuristic.experienceHeading || "Professional Experience",
      experience: aiExperience,
      skills: ai.skills ?? [],
      recognition: ai.recognition ?? [],
      education: aiEducation.length > 0 ? aiEducation : heuristic.education,
    };
  }

  // Normal case: heuristic produced reasonable structure. Use AI only to fill
  // sections the heuristic missed — or when heuristic experience entries have
  // empty organization fields (single-line PDF layout where the heuristic
  // couldn't separate role title from employer).
  const experienceHasBullets = heuristic.experience.some((e) => e.bullets.length > 0);
  const heuristicHasMergedTitles = heuristic.experience.every(
    (e) => !e.organization || !e.organization.trim()
  );
  const useAIExperience =
    aiExperience.length > 0 && (!experienceHasBullets || heuristicHasMergedTitles);

  return {
    name: heuristic.name || ai.name || "",
    headline: heuristic.headline || ai.headline || "",
    contactItems: preferArray(heuristic.contactItems, ai.contactItems),
    summary: heuristic.summary.trim().length > 20 ? heuristic.summary : (ai.summary ?? ""),
    impactHeading: heuristic.impactHeading || ai.impactHeading || "Key Achievements",
    impactItems: preferArray(heuristic.impactItems, ai.impactItems),
    experienceHeading:
      heuristic.experienceHeading || ai.experienceHeading || "Professional Experience",
    experience: useAIExperience ? aiExperience : heuristic.experience,
    skills: preferArray(heuristic.skills, ai.skills),
    recognition: preferArray(heuristic.recognition, ai.recognition),
    education: heuristic.education.length > 0 ? heuristic.education : aiEducation,
  };
}
