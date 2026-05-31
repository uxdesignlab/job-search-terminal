import type { ResumeTemplateInput } from "./resume-template";

export type EvidenceAuditIssue = {
  path: string;
  claim: string;
  reason: string;
};

export type EvidenceAudit = {
  status: "supported" | "unsupported-claims";
  issues: EvidenceAuditIssue[];
};

const METRIC_PATTERN = /(?:[$£€]?\d[\d,.]*(?:%|\+)?)(?!\w)/g;
const GENERIC_RESUME_TERMS = new Set([
  "about", "across", "action", "advanced", "aligned", "approach", "based", "built", "collaborated",
  "created", "delivered", "designed", "developed", "drove", "enabled", "ensured", "executed", "focused",
  "improved", "including", "initiative", "initiatives", "integrated", "leadership", "leading", "managed",
  "optimized", "partnered", "process", "program", "programs", "project", "projects", "provided", "results",
  "role", "solution", "solutions", "strategy", "supported", "team", "teams", "through", "using", "with",
]);
const COMMON_WORDS = new Set([
  "and", "for", "from", "into", "that", "the", "their", "this", "those", "was", "were", "while",
]);

function metricsIn(text: string): Set<string> {
  return new Set((text.match(METRIC_PATTERN) ?? []).map((value) => value.toLowerCase()));
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9%+]+/g, " ").trim();
}

function claimTermsIn(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/\s+/)
      .filter((term) =>
        term.length >= 4 &&
        !/\d/.test(term) &&
        !COMMON_WORDS.has(term) &&
        !GENERIC_RESUME_TERMS.has(term)
      )
  );
}

function evidenceLinesFor(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function hasRelatedMetricEvidence(text: string, metric: string, evidenceLines: string[]) {
  const normalizedText = normalizeText(text);
  const textTerms = claimTermsIn(text);
  return evidenceLines.some((line) => {
    if (!metricsIn(line).has(metric)) return false;
    const normalizedLine = normalizeText(line);
    if (normalizedLine.includes(normalizedText) || normalizedText.includes(normalizedLine)) return true;
    const lineTerms = claimTermsIn(line);
    return [...textTerms].some((term) => lineTerms.has(term));
  });
}

function issuesForText(path: string, text: string, evidenceText: string): EvidenceAuditIssue[] {
  const evidenceLines = evidenceLinesFor(evidenceText);
  const evidenceTerms = claimTermsIn(evidenceText);
  const issues: EvidenceAuditIssue[] = [];
  for (const metric of metricsIn(text)) {
    if (!hasRelatedMetricEvidence(text, metric, evidenceLines)) {
      issues.push({
        path,
        claim: metric,
        reason: "This quantified claim is not present in a related approved resume line or confirmed evidence.",
      });
    }
  }
  for (const term of claimTermsIn(text)) {
    if (!evidenceTerms.has(term)) {
      issues.push({
        path,
        claim: term,
        reason: "This substantive claim term is not present in the approved resume lane or confirmed profile evidence.",
      });
    }
  }
  return issues;
}

export function evidenceTextForDraft(draft: ResumeTemplateInput): string {
  return [
    draft.name,
    draft.headline,
    ...draft.contactItems,
    draft.summary,
    ...draft.impactItems,
    ...draft.skills,
    ...draft.recognition,
    ...draft.experience.flatMap((entry) => [
      entry.title,
      entry.organization,
      entry.location ?? "",
      entry.dateRange,
      ...entry.bullets,
    ]),
    ...(draft.extraSections ?? []).flatMap((section) => [section.title, ...section.items]),
    ...draft.education.flatMap((entry) => [entry.degree, entry.school, entry.focus ?? ""]),
  ].join("\n");
}

export function auditDraftAgainstEvidence(draft: ResumeTemplateInput, evidenceText: string): EvidenceAudit {
  const issues: EvidenceAuditIssue[] = [];
  const inspect = (path: string, text: string) => {
    issues.push(...issuesForText(path, text, evidenceText));
  };

  inspect("headline", draft.headline);
  inspect("summary", draft.summary);
  draft.impactItems.forEach((item, index) => inspect(`impactItems[${index}]`, item));
  draft.skills.forEach((item, index) => inspect(`skills[${index}]`, item));
  draft.recognition.forEach((item, index) => inspect(`recognition[${index}]`, item));
  draft.experience.forEach((entry, entryIndex) => {
    entry.bullets.forEach((bullet, bulletIndex) => inspect(`experience[${entryIndex}].bullets[${bulletIndex}]`, bullet));
  });
  (draft.extraSections ?? []).forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => inspect(`extraSections[${sectionIndex}].items[${itemIndex}]`, item));
  });

  return { status: issues.length > 0 ? "unsupported-claims" : "supported", issues };
}

export function revertUnsupportedMetrics(
  source: ResumeTemplateInput,
  tailored: ResumeTemplateInput,
  evidenceText: string
): { draft: ResumeTemplateInput; audit: EvidenceAudit } {
  const hasUnsupportedClaims = (path: string, text: string) => issuesForText(path, text, evidenceText).length > 0;
  const reverted = {
    ...tailored,
    headline: hasUnsupportedClaims("headline", tailored.headline) ? source.headline : tailored.headline,
    summary: hasUnsupportedClaims("summary", tailored.summary) ? source.summary : tailored.summary,
    impactItems: tailored.impactItems.map((item, index) =>
      hasUnsupportedClaims(`impactItems[${index}]`, item) ? source.impactItems[index] ?? item : item
    ),
    skills: tailored.skills.map((item, index) =>
      hasUnsupportedClaims(`skills[${index}]`, item) ? source.skills[index] ?? item : item
    ),
    recognition: tailored.recognition.map((item, index) =>
      hasUnsupportedClaims(`recognition[${index}]`, item) ? source.recognition[index] ?? item : item
    ),
    experience: tailored.experience.map((entry, entryIndex) => ({
      ...entry,
      bullets: entry.bullets.map((bullet, bulletIndex) =>
        hasUnsupportedClaims(`experience[${entryIndex}].bullets[${bulletIndex}]`, bullet)
          ? source.experience[entryIndex]?.bullets[bulletIndex] ?? bullet
          : bullet
      ),
    })),
    extraSections: (tailored.extraSections ?? []).map((section, sectionIndex) => ({
      ...section,
      items: section.items.map((item, itemIndex) =>
        hasUnsupportedClaims(`extraSections[${sectionIndex}].items[${itemIndex}]`, item)
          ? source.extraSections?.[sectionIndex]?.items[itemIndex] ?? item
          : item
      ),
    })),
  };
  return { draft: reverted, audit: auditDraftAgainstEvidence(reverted, evidenceText) };
}
