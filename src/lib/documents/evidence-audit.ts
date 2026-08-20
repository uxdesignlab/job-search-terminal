import type { ResumeTemplateInput } from "./resume-template";

export type EvidenceAuditIssue = {
  path: string;
  claim: string;
  reason: string;
  text: string;
};

// One section whose AI rewrite was thrown away and replaced with the approved
// source wording. Recorded so the draft can say the summary is not tailored
// instead of reporting a clean "supported" over untailored text.
export type EvidenceRevert = {
  path: string;
  label: string;
  claims: string[];
};

export type EvidenceAudit = {
  status: "supported" | "unsupported-claims";
  issues: EvidenceAuditIssue[];
  reverted?: EvidenceRevert[];
  // Lines kept at their source wording so tailoring did not drop job language
  // the resume already matched. Declared structurally rather than imported from
  // keyword-preservation, which reads this module.
  restored?: Array<{ path: string; keywords: string[] }>;
  // Selected sections the model handed back as written. Same reason for the
  // structural declaration as `restored`.
  unchanged?: Array<{ path: string; label: string; unchanged: number; total: number }>;
};

const METRIC_PATTERN = /(?:[$£€]?\d[\d,.]*(?:%|\+)?)(?!\w)/g;

// A rewrite is checked for *claims*, not for vocabulary. Deciding which is which
// by listing the words that are merely rhetoric does not work: the list leaked
// "strong", "brings", and "vision", then "consulting" and "expertise", then
// "stakes" and "cycle", each leak reverting a good summary over a word that
// asserts nothing. English has more rhetoric than any list can hold.
//
// So the default is inverted. An ordinary lowercase word is rhetoric unless it
// looks like a claim, and only two shapes count as claims:
//
//   1. Seniority, credential, and recognition words — inventing one misstates
//      the candidate's level or qualifications (GUARDED_CLAIM_TERMS).
//   2. Named entities — tools, employers, standards, products. Detected by case
//      rather than by list, so "Kubernetes" and "React" are checked without
//      anyone having to enumerate every tool that exists.
//
// Everything else — "high-stakes", "release cycle", "translates", "strong" — is
// how a resume writer connects facts, and is left alone.
//
// The posting's own unconfirmed requirements were tried as a third shape and
// removed: absent from the resume is not the same as false, and guarding them
// reverted summaries over "user needs" and "business outcomes". The keyword
// alignment panel already lists them for the user to judge, which is the right
// place for a decision this check cannot make.
const GUARDED_CLAIM_TERMS = new Set([
  "adjunct", "award", "awarded", "awards", "certification", "certifications", "certified", "chief",
  "cofounded", "cofounder", "director", "doctorate", "executive", "fellow", "fellowship", "founded",
  "founder", "head", "honored", "honoree", "licensed", "manager", "master", "masters", "nominated",
  "patent", "patents", "president", "principal", "professor", "recognized", "staff", "supervisor",
  "tenured", "vice", "winner",
]);

const COMMON_WORDS = new Set([
  "and", "for", "from", "into", "that", "the", "their", "this", "those", "was", "were", "while",
]);

const STEM_SUFFIXES = ["ingly", "edly", "ing", "ies", "ed", "es", "ly", "s"];

// Crude stemmer used only to compare a claim term against the evidence corpus.
// "translates" and "translate", or "wireframes" and "wireframe", are the same
// claim; treating them as different words reverted rewrites over grammar.
function stemTerm(term: string): string {
  let stem = term;
  for (const suffix of STEM_SUFFIXES) {
    if (stem.endsWith(suffix) && stem.length - suffix.length >= 4) {
      stem = suffix === "ies" ? `${stem.slice(0, -3)}y` : stem.slice(0, -suffix.length);
      break;
    }
  }
  return stem.length > 4 && stem.endsWith("e") ? stem.slice(0, -1) : stem;
}

const GUARDED_CLAIM_STEMS = new Set([...GUARDED_CLAIM_TERMS].map(stemTerm));

function metricsIn(text: string): Set<string> {
  return new Set((text.match(METRIC_PATTERN) ?? []).map((value) => value.toLowerCase()));
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9%+]+/g, " ").trim();
}

function candidateTerms(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !/\d/.test(term) && !COMMON_WORDS.has(term));
}

/**
 * Words that read as named entities: an internal capital, or capitalization
 * anywhere other than the start of a sentence or a bullet. "Figma", "WCAG",
 * "SaaS", and "Kubernetes" qualify; the first word of a sentence does not,
 * because every sentence starts capitalized whatever its meaning.
 */
function namedEntitiesIn(text: string): Set<string> {
  const entities = new Set<string>();
  const pattern = /[A-Za-z][A-Za-z'\u2019-]*/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const token = match[0];
    const before = text.slice(0, match.index).replace(/["'(\[\u2018\u201c]+$/, "");
    // A capital only means something away from the opening of a sentence, a line,
    // or a bullet, because those are capitalized whatever the word means.
    const atOpening = before.trim() === "" || /[.!?:;\n\u2022]\s*$/.test(before);
    const hasInternalCapital = /[a-z][A-Z]/.test(token) || /^[A-Z]{2,}$/.test(token.replace(/[^A-Za-z]/g, ""));

    if (hasInternalCapital || (/^[A-Z]/.test(token) && !atOpening)) {
      // Hyphenated compounds are split, because the words the claim check sees
      // are already split: "HIPAA-compliant" is read as "hipaa" and "compliant".
      for (const part of token.toLowerCase().split(/[^a-z]+/)) {
        if (part.length >= 3) entities.add(part);
      }
    }
  }

  return entities;
}

/** The terms a rewrite is not free to introduce without evidence. */
function claimTermsIn(text: string): Set<string> {
  const entities = namedEntitiesIn(text);
  return new Set(
    candidateTerms(text).filter((term) => GUARDED_CLAIM_STEMS.has(stemTerm(term)) || entities.has(term))
  );
}

function evidenceStemsIn(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/\s+/)
      .filter((term) => term.length >= 4 && !/\d/.test(term))
      .map(stemTerm)
  );
}

function evidenceLinesFor(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function hasRelatedMetricEvidence(text: string, metric: string, evidenceLines: string[]) {
  const normalizedText = normalizeText(text);
  // Relatedness is topical overlap, so it uses every content word rather than
  // only the ones that qualify as claims.
  const textStems = new Set(candidateTerms(text).map(stemTerm));
  return evidenceLines.some((line) => {
    if (!metricsIn(line).has(metric)) return false;
    const normalizedLine = normalizeText(line);
    if (normalizedLine.includes(normalizedText) || normalizedText.includes(normalizedLine)) return true;
    const lineStems = new Set(candidateTerms(line).map(stemTerm));
    return [...textStems].some((stem) => lineStems.has(stem));
  });
}

// The summary and headline condense the whole resume, so their numbers legitimately
// come from anywhere in it — "15+ years" belongs to no single line. Requiring a
// same-line match there reverted the section over figures the resume plainly states.
// Bullets keep the stricter per-line test, which is what stops a metric being moved
// between roles.
const DOCUMENT_SCOPED_METRIC_PATHS = new Set(["summary", "headline"]);

function atLeastValue(metric: string): number | null {
  const match = /^(\d[\d,]*)\+$/.exec(metric);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

// "10+ years" is entailed by an approved resume that says "15+ years": stating
// less than the evidence supports is not a fabricated claim, and reverting the
// summary over it discarded an otherwise accurate rewrite. Only open-ended "N+"
// figures qualify, and only where metrics are already document-scoped.
function hasEntailedAtLeastEvidence(metric: string, evidenceText: string): boolean {
  const claimed = atLeastValue(metric);
  if (claimed === null) return false;
  return [...metricsIn(evidenceText)].some((known) => {
    const supported = atLeastValue(known);
    return supported !== null && supported >= claimed;
  });
}

function hasMetricEvidence(path: string, text: string, metric: string, evidenceText: string, evidenceLines: string[]) {
  if (DOCUMENT_SCOPED_METRIC_PATHS.has(path)) {
    return metricsIn(evidenceText).has(metric) || hasEntailedAtLeastEvidence(metric, evidenceText);
  }
  return hasRelatedMetricEvidence(text, metric, evidenceLines);
}

// Full check: metrics + claim terms. Used at generation time to revert AI-fabricated content.
function issuesForText(path: string, text: string, evidenceText: string): EvidenceAuditIssue[] {
  const evidenceLines = evidenceLinesFor(evidenceText);
  const evidenceStems = evidenceStemsIn(evidenceText);
  const issues: EvidenceAuditIssue[] = [];
  for (const metric of metricsIn(text)) {
    if (!hasMetricEvidence(path, text, metric, evidenceText, evidenceLines)) {
      issues.push({
        path,
        claim: metric,
        reason: "This quantified claim is not present in a related approved resume line or confirmed evidence.",
        text,
      });
    }
  }
  for (const term of claimTermsIn(text)) {
    if (!evidenceStems.has(stemTerm(term))) {
      issues.push({
        path,
        claim: term,
        reason: "This substantive claim term is not present in the approved resume lane or confirmed profile evidence.",
        text,
      });
    }
  }
  return issues;
}

// Metrics-only check: used at PDF export time so that manual edits to draft text are not blocked
// by vocabulary words the user legitimately typed that happen not to appear in the evidence corpus.
function metricIssuesForText(path: string, text: string, evidenceText: string): EvidenceAuditIssue[] {
  const evidenceLines = evidenceLinesFor(evidenceText);
  const issues: EvidenceAuditIssue[] = [];
  for (const metric of metricsIn(text)) {
    if (!hasMetricEvidence(path, text, metric, evidenceText, evidenceLines)) {
      issues.push({
        path,
        claim: metric,
        reason: "This quantified claim is not present in a related approved resume line or confirmed evidence.",
        text,
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
    issues.push(...metricIssuesForText(path, text, evidenceText));
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

const REVERT_LABELS: Record<string, string> = {
  headline: "Headline",
  summary: "Summary",
  impactItems: "Key achievement",
  skills: "Skill",
  recognition: "Recognition entry",
  experience: "Experience bullet",
  extraSections: "Custom section item",
};

function revertLabelFor(path: string): string {
  const root = path.split(/[[.]/)[0];
  return REVERT_LABELS[root] ?? root;
}

export function revertUnsupportedMetrics(
  source: ResumeTemplateInput,
  tailored: ResumeTemplateInput,
  evidenceText: string
): { draft: ResumeTemplateInput; audit: EvidenceAudit; reverted: EvidenceRevert[] } {
  const reverts: EvidenceRevert[] = [];
  // A revert is a silent loss of tailoring — the section reads as the approved
  // source wording while the document still reports a supported audit. Recording
  // the terms that caused it is what lets the editor say so.
  const revertedText = <T>(path: string, tailoredText: string, sourceText: T): string | T => {
    const issues = issuesForText(path, tailoredText, evidenceText);
    if (issues.length === 0) return tailoredText;
    reverts.push({
      path,
      label: revertLabelFor(path),
      claims: [...new Set(issues.map((issue) => issue.claim))],
    });
    return sourceText;
  };

  const reverted = {
    ...tailored,
    headline: revertedText("headline", tailored.headline, source.headline),
    summary: revertedText("summary", tailored.summary, source.summary),
    impactItems: tailored.impactItems.map((item, index) =>
      revertedText(`impactItems[${index}]`, item, source.impactItems[index] ?? item)
    ),
    skills: tailored.skills.map((item, index) =>
      revertedText(`skills[${index}]`, item, source.skills[index] ?? item)
    ),
    recognition: tailored.recognition.map((item, index) =>
      revertedText(`recognition[${index}]`, item, source.recognition[index] ?? item)
    ),
    experience: tailored.experience.map((entry, entryIndex) => ({
      ...entry,
      bullets: entry.bullets.map((bullet, bulletIndex) =>
        revertedText(
          `experience[${entryIndex}].bullets[${bulletIndex}]`,
          bullet,
          source.experience[entryIndex]?.bullets[bulletIndex] ?? bullet
        )
      ),
    })),
    extraSections: (tailored.extraSections ?? []).map((section, sectionIndex) => ({
      ...section,
      items: section.items.map((item, itemIndex) =>
        revertedText(
          `extraSections[${sectionIndex}].items[${itemIndex}]`,
          item,
          source.extraSections?.[sectionIndex]?.items[itemIndex] ?? item
        )
      ),
    })),
  };

  const audit = auditDraftAgainstEvidence(reverted, evidenceText);
  return { draft: reverted, audit: { ...audit, reverted: reverts }, reverted: reverts };
}

// One sentence naming what lost its tailoring and why, for the draft editor and
// the stored document. Empty when nothing was reverted.
export function describeReverts(reverts: EvidenceRevert[]): string {
  if (reverts.length === 0) return "";
  const byLabel = new Map<string, number>();
  for (const revert of reverts) {
    byLabel.set(revert.label, (byLabel.get(revert.label) ?? 0) + 1);
  }
  const sections = [...byLabel.entries()]
    .map(([label, count]) => (count > 1 ? `${count} ${label.toLowerCase()}s` : label.toLowerCase()))
    .join(", ");
  const claims = [...new Set(reverts.flatMap((revert) => revert.claims))].slice(0, 6);
  return `Reverted to your approved wording: ${sections}. Unsupported in your evidence: ${claims.map((claim) => `"${claim}"`).join(", ")}.`;
}
