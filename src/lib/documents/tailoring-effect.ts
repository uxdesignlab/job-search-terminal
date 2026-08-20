import type { ResumeSectionModeInput } from "../db/types";
import type { ResumeTemplateInput } from "./resume-template";

export type UnchangedSection = {
  path: string;
  label: string;
  unchanged: number;
  total: number;
};

// Below this share of untouched lines a section still reads as tailored — a
// rewrite that leaves one bullet alone because it was already right is doing its
// job. At or above it, the section came back essentially as written.
const NOTABLE_UNCHANGED_SHARE = 0.5;

function modeFor(sectionId: string, sectionModes: ResumeSectionModeInput[]) {
  return sectionModes.find((mode) => mode.sectionId === sectionId)?.mode ?? "keep";
}

function countUnchanged(source: string[], tailored: string[]): { unchanged: number; total: number } {
  const total = Math.min(source.length, tailored.length);
  let unchanged = 0;
  for (let index = 0; index < total; index += 1) {
    if (source[index].trim() === tailored[index].trim()) unchanged += 1;
  }
  return { unchanged, total };
}

/**
 * Which selected sections the AI handed back as written.
 *
 * A provider outage is already reported, but a model that runs and declines to
 * rewrite is not: the draft stores a supported audit over source content and
 * reads as tailored. That is the same invisibility as a silently reverted
 * section, and it has been observed in practice — one run returned 24 of 25
 * experience bullets untouched.
 *
 * Measured on the AI's own output, before the evidence guard and the keyword
 * preservation pass run, because both of those restore source wording on purpose
 * and would otherwise be counted as the model doing nothing.
 */
export function analyzeTailoringEffect(
  source: ResumeTemplateInput,
  applied: ResumeTemplateInput,
  sectionModes: ResumeSectionModeInput[]
): { measured: UnchangedSection[]; notable: UnchangedSection[]; noOp: boolean } {
  const sections: UnchangedSection[] = [];

  if (modeFor("summary", sectionModes) === "update" && source.summary.trim()) {
    sections.push({
      path: "summary",
      label: "Summary",
      unchanged: source.summary.trim() === applied.summary.trim() ? 1 : 0,
      total: 1,
    });
  }

  if (modeFor("impact", sectionModes) === "update") {
    const counted = countUnchanged(source.impactItems, applied.impactItems);
    if (counted.total > 0) sections.push({ path: "impactItems", label: "Key achievements", ...counted });
  }

  if (modeFor("experience", sectionModes) === "update") {
    let unchanged = 0;
    let total = 0;
    applied.experience.forEach((entry, index) => {
      const counted = countUnchanged(source.experience[index]?.bullets ?? [], entry.bullets);
      unchanged += counted.unchanged;
      total += counted.total;
    });
    if (total > 0) sections.push({ path: "experience", label: "Experience bullets", unchanged, total });
  }

  (applied.extraSections ?? []).forEach((section, index) => {
    const modeId = section.id ?? `custom-${section.title}`;
    if (modeFor(modeId, sectionModes) !== "update") return;
    const counted = countUnchanged(source.extraSections?.[index]?.items ?? [], section.items);
    if (counted.total > 0) {
      sections.push({ path: `extraSections[${index}]`, label: section.title, ...counted });
    }
  });

  return {
    measured: sections,
    notable: sections.filter((section) => section.unchanged / section.total >= NOTABLE_UNCHANGED_SHARE),
    // Judged across every measured section, not the notable subset: a rewrite
    // that reworked the summary and left experience alone is a partial no-op,
    // not a total one.
    noOp: sections.length > 0 && sections.every((section) => section.unchanged === section.total),
  };
}

export function describeUnchanged(sections: UnchangedSection[]): string {
  if (sections.length === 0) return "";
  const parts = sections.map((section) =>
    section.total === 1
      ? section.label.toLowerCase()
      : `${section.unchanged} of ${section.total} ${section.label.toLowerCase()}`
  );
  return `AI tailoring ran but returned ${parts.join(", ")} exactly as written in your approved resume.`;
}
