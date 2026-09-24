import type { JobRecord, RequirementMatch } from "../db/types";

const COMPENSATION_LABEL = /\b(?:salary|compensation|pay|wage)(?:\s+range)?\b/i;
const CURRENCY_AMOUNT = /(?:[$£€]\s*\d[\d,.]*(?:\s*[kKmM])?|\b(?:USD|EUR|GBP)\s*\d[\d,.]*(?:\s*[kKmM])?)/i;
const EMPTY_SALARY = /^(?:not (?:captured|provided|specified|listed)|unavailable|unknown)/i;
const QUALIFICATIONS_HEADING = /^qualifications?\s*:?(?:\s*required)?$/i;
const REQUIRED_HEADING = /^(?:required|minimum|basic)(?:\s+qualifications?|\s+requirements?)?\s*:?$/i;
const PREFERRED_HEADING = /^(?:desired|preferred|nice to have)(?:\s+qualifications?|\s+requirements?)?\s*:?$/i;
const END_HEADING = /^(?:(?:target|base|annual|starting)\s+)?(?:benefits?|perks?|compensation|salary|pay|job locations?|equal opportunity|apply|about us)\b/i;
const BULLET = /^\s*(?:[-–—*•·▪◦]|\d+[.)])\s+/;

/** Copy a pay line from the saved posting. The model cannot create or erase it. */
export function extractPostedCompensation(job: Pick<JobRecord, "rawDescription" | "parsedDescription" | "salaryNotes">): string {
  const description = job.rawDescription || job.parsedDescription || "";
  for (const line of description.split(/\r?\n/)) {
    const value = line.replace(/\s+/g, " ").trim();
    if (COMPENSATION_LABEL.test(value) && CURRENCY_AMOUNT.test(value) && value.length <= 300) return value;
  }
  const scannerValue = job.salaryNotes?.trim() ?? "";
  return scannerValue && !EMPTY_SALARY.test(scannerValue) && CURRENCY_AMOUNT.test(scannerValue)
    ? scannerValue
    : "";
}

export type QualificationChecklist = { required: string[]; preferred: string[] };

export function numberedQualifications(checklist: QualificationChecklist): Array<{ id: string; kind: "Required" | "Preferred"; text: string }> {
  return [
    ...checklist.required.map((text) => ({ kind: "Required" as const, text })),
    ...checklist.preferred.map((text) => ({ kind: "Preferred" as const, text })),
  ].map((item, index) => ({ id: `Q${index + 1}`, ...item }));
}

export function expandQualificationReference(value: string, checklist: QualificationChecklist): string {
  const id = /^Q(\d+)$/i.exec(value.trim());
  return id ? numberedQualifications(checklist)[Number(id[1]) - 1]?.text ?? value : value;
}

const INFERRED_EVIDENCE = /\b(?:imply|impli(?:ed|es|cation)|assum(?:ed|ption)|likely|probably|not (?:explicitly )?(?:mentioned|listed|shown|stated))\b/i;

/** Map model answers back to exact posting lines; omissions are visible unknowns. */
export function reconcileQualificationMatches(
  checklist: QualificationChecklist,
  modelMatches: RequirementMatch[]
): { matches: RequirementMatch[]; warnings: string[] } {
  const numbered = numberedQualifications(checklist);
  if (numbered.length === 0) return { matches: modelMatches, warnings: [] };

  const byId = new Map<string, RequirementMatch>();
  const extra: RequirementMatch[] = [];
  for (const match of modelMatches) {
    const id = /^Q(\d+)(?:$|[\s.:-])/i.exec(match.requirement.trim());
    if (id && Number(id[1]) >= 1 && Number(id[1]) <= numbered.length) {
      if (!byId.has(`Q${Number(id[1])}`)) byId.set(`Q${Number(id[1])}`, match);
    } else {
      extra.push(match);
    }
  }

  let missing = 0;
  let inferred = 0;
  const matches = numbered.map(({ id, text }) => {
    const assessment = byId.get(id);
    if (!assessment) {
      missing += 1;
      return { requirement: text, status: "unknown" as const, evidence: "Not assessed in this run." };
    }
    if (assessment.status === "supported" && INFERRED_EVIDENCE.test(assessment.evidence)) {
      inferred += 1;
      return { requirement: text, status: "unknown" as const, evidence: "Direct evidence was not supplied." };
    }
    return { ...assessment, requirement: text };
  });
  const warnings = [
    ...(missing ? [`${missing} of ${numbered.length} explicit qualifications were not assessed by the model and are marked unknown.`] : []),
    ...(inferred ? [`${inferred} inferred qualification matches lacked direct evidence and are marked unknown.`] : []),
  ];
  return { matches: [...matches, ...extra], warnings };
}

/** Read explicit qualification sections, including ATS pages that omit bullets. */
export function extractQualificationChecklist(description: string): QualificationChecklist {
  const result: QualificationChecklist = { required: [], preferred: [] };
  let section: keyof QualificationChecklist | null = null;
  let inQualifications = false;

  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (QUALIFICATIONS_HEADING.test(line)) {
      inQualifications = true;
      section = /required/i.test(line) ? "required" : null;
      continue;
    }
    if (REQUIRED_HEADING.test(line)) { inQualifications = true; section = "required"; continue; }
    if (PREFERRED_HEADING.test(line)) { inQualifications = true; section = "preferred"; continue; }
    if (END_HEADING.test(line) && inQualifications) { section = null; inQualifications = false; continue; }
    if (!section) continue;
    const item = line.replace(BULLET, "").replace(/\s+/g, " ").trim();
    if (item.length < 12 || item.length > 350) continue;
    if (!result[section].includes(item)) result[section].push(item);
  }
  return result;
}
