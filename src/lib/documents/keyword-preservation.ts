import type { JobKeywordSignal } from "../db/types";
import { keywordMatchTier, type KeywordMatchTier } from "./keyword-coverage";
import { evidenceTextForDraft } from "./evidence-audit";
import type { ResumeTemplateInput } from "./resume-template";

export type KeywordRestore = {
  path: string;
  keywords: string[];
};

/**
 * One addressable piece of resume text, so a lost keyword can be traced back to
 * the exact line that carried it and only that line is restored.
 */
type Unit = {
  path: string;
  sourceText: string;
  tailoredText: string;
  restore: (draft: ResumeTemplateInput) => void;
};

function unitsFor(source: ResumeTemplateInput, tailored: ResumeTemplateInput): Unit[] {
  const units: Unit[] = [
    {
      path: "summary",
      sourceText: source.summary,
      tailoredText: tailored.summary,
      restore: (draft) => { draft.summary = source.summary; },
    },
    {
      path: "headline",
      sourceText: source.headline,
      tailoredText: tailored.headline,
      restore: (draft) => { draft.headline = source.headline; },
    },
  ];

  tailored.impactItems.forEach((item, index) => {
    const original = source.impactItems[index];
    if (original === undefined) return;
    units.push({
      path: `impactItems[${index}]`,
      sourceText: original,
      tailoredText: item,
      restore: (draft) => { draft.impactItems[index] = original; },
    });
  });

  tailored.experience.forEach((entry, entryIndex) => {
    entry.bullets.forEach((bullet, bulletIndex) => {
      const original = source.experience[entryIndex]?.bullets[bulletIndex];
      if (original === undefined) return;
      units.push({
        path: `experience[${entryIndex}].bullets[${bulletIndex}]`,
        sourceText: original,
        tailoredText: bullet,
        restore: (draft) => { draft.experience[entryIndex].bullets[bulletIndex] = original; },
      });
    });
  });

  (tailored.extraSections ?? []).forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      const original = source.extraSections?.[sectionIndex]?.items[itemIndex];
      if (original === undefined) return;
      units.push({
        path: `extraSections[${sectionIndex}].items[${itemIndex}]`,
        sourceText: original,
        tailoredText: item,
        restore: (draft) => { draft.extraSections![sectionIndex].items[itemIndex] = original; },
      });
    });
  });

  return units;
}

function cloneDraft(draft: ResumeTemplateInput): ResumeTemplateInput {
  return {
    ...draft,
    impactItems: [...draft.impactItems],
    skills: [...draft.skills],
    recognition: [...draft.recognition],
    experience: draft.experience.map((entry) => ({ ...entry, bullets: [...entry.bullets] })),
    extraSections: (draft.extraSections ?? []).map((section) => ({ ...section, items: [...section.items] })),
  };
}

function tiersIn(draft: ResumeTemplateInput, keywords: JobKeywordSignal[]): Map<string, KeywordMatchTier> {
  const text = evidenceTextForDraft(draft);
  return new Map(keywords.map((signal) => [signal.keyword, keywordMatchTier(text, signal)]));
}

/**
 * Tailoring must not cost the resume a phrase it already matched.
 *
 * The tailorer is told which keywords are *missing* from the source draft, and
 * nothing checked the other direction — so a rewrite could quietly drop a phrase
 * the untouched resume already had ("service design" becoming "service maps")
 * and still report healthy coverage. Any keyword present before tailoring and
 * absent after is restored by putting back the specific line that carried it,
 * which leaves the rest of the rewrite intact.
 *
 * Restoring one line often brings back several lost phrases at once, so the
 * remaining loss is recomputed after every restore and the pass stops as soon as
 * nothing is missing.
 */
export function restoreLostKeywords(
  source: ResumeTemplateInput,
  tailored: ResumeTemplateInput,
  keywords: JobKeywordSignal[]
): { draft: ResumeTemplateInput; restored: KeywordRestore[] } {
  if (keywords.length === 0) return { draft: tailored, restored: [] };

  // Only exact matches are defended. A related-wording match is fuzzy token
  // overlap across the whole document — no single line owns it, so there is
  // nothing precise to restore, and reverting a line on that basis would trade
  // real tailoring for no gain an ATS can see.
  const sourceTiers = tiersIn(source, keywords);
  const defended = keywords.filter((signal) => sourceTiers.get(signal.keyword) === "exact");
  if (defended.length === 0) return { draft: tailored, restored: [] };

  let draft = tailored;
  const restored: KeywordRestore[] = [];
  const units = unitsFor(source, tailored).filter((unit) => unit.sourceText !== unit.tailoredText);
  const alreadyRestored = new Set<string>();
  const unrepairable = new Set<string>();

  // Highest-priority losses first, so when two lines could each repair a keyword
  // the one carrying the more important phrase is the one that comes back.
  const weight = (signal: JobKeywordSignal) =>
    signal.priority === "critical" ? 0 : signal.priority === "required" ? 1 : 2;

  const lostIn = (draftUnderTest: ResumeTemplateInput) => {
    const tiers = tiersIn(draftUnderTest, defended);
    return defended
      .filter((signal) => tiers.get(signal.keyword) !== "exact" && !unrepairable.has(signal.keyword))
      .sort((a, b) => weight(a) - weight(b));
  };

  for (;;) {
    const lost = lostIn(draft);
    if (lost.length === 0) break;

    const signal = lost[0];
    const carrier = units.find((unit) =>
      !alreadyRestored.has(unit.path) &&
      keywordMatchTier(unit.sourceText, signal) === "exact" &&
      keywordMatchTier(unit.tailoredText, signal) !== "exact"
    );
    if (!carrier) {
      // The phrase spanned text the rewrite reshaped, so there is no single line
      // to put back. Skip it and keep repairing the rest — an unrepairable loss
      // must not abandon the losses that can still be fixed.
      unrepairable.add(signal.keyword);
      continue;
    }

    draft = cloneDraft(draft);
    carrier.restore(draft);
    alreadyRestored.add(carrier.path);

    const stillLost = new Set(lostIn(draft).map((entry) => entry.keyword));
    restored.push({
      path: carrier.path,
      keywords: lost.filter((entry) => !stillLost.has(entry.keyword)).map((entry) => entry.keyword),
    });
  }

  return { draft, restored };
}

export function describeRestores(restores: KeywordRestore[]): string {
  if (restores.length === 0) return "";
  const keywords = [...new Set(restores.flatMap((restore) => restore.keywords))];
  return `Kept the source wording in ${restores.length} ${restores.length === 1 ? "line" : "lines"} so the resume did not lose job language it already matched: ${keywords.map((keyword) => `"${keyword}"`).join(", ")}.`;
}
