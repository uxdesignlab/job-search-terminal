import type { ResumeTemplateInput } from "./resume-template";
import type { JobKeywordSignal } from "../db/types";
import { keywordSignalWeight } from "../evaluation/keyword-signals";
import { normalizeKeywordText as normalizeForKeywordMatching } from "../text/normalize-keyword";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "the",
  "through",
  "to",
  "with",
]);

const GENERIC_TERMS = new Set([
  "ability",
  "abilities",
  "activities",
  "across",
  "experience",
  "experiences",
  "methods",
  "multiple",
  "relevant",
  "skills",
  "strong",
]);

export type KeywordCoverageDetails = {
  covered: string[];
  missing: string[];
  total: number;
  percentage: number;
};

// Three-tier text alignment: exact phrase > related wording in context > missing.
// This describes the app's own comparison and does not reproduce an employer ATS score.
export type KeywordStrengthDetails = {
  exact: string[];
  partial: string[];
  missing: string[];
  total: number;
  exactScore: number;   // Unweighted share of phrases present verbatim.
  broadScore: number;   // Unweighted share with exact or related-term presence.
  alignmentScore: number; // Priority-weighted text alignment; partial matches earn half credit.
  matchedWeight: number;
  totalWeight: number;
};

export type KeywordInput = string | JobKeywordSignal;

export function keywordCoverageFor(content: ResumeTemplateInput, keywords: KeywordInput[]) {
  return keywordStrengthDetailsForText(extractVisibleResumeText(content), keywords).alignmentScore;
}

export function keywordStrengthDetailsForText(text: string, keywords: KeywordInput[]): KeywordStrengthDetails {
  const normalizedText = normalizeForKeywordMatching(text);
  const relevant = uniqueKeywordEntries(keywords);
  if (relevant.length === 0) {
    return { exact: [], partial: [], missing: [], total: 0, exactScore: 0, broadScore: 0, alignmentScore: 0, matchedWeight: 0, totalWeight: 0 };
  }
  const exact: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  for (const entry of relevant) {
    if (exactPhraseHit(normalizedText, entry.normalized)) {
      exact.push(entry.label);
    } else if (keywordHit(normalizedText, entry.normalized)) {
      partial.push(entry.label);
    } else {
      missing.push(entry.label);
    }
  }
  const exactSet = new Set(exact);
  const partialSet = new Set(partial);
  const totalWeight = relevant.reduce((sum, entry) => sum + entry.weight, 0);
  const matchedWeight = relevant.reduce((sum, entry) => {
    if (exactSet.has(entry.label)) return sum + entry.weight;
    if (partialSet.has(entry.label)) return sum + entry.weight * 0.5;
    return sum;
  }, 0);
  return {
    exact,
    partial,
    missing,
    total: relevant.length,
    exactScore: Math.round((exact.length / relevant.length) * 100),
    broadScore: Math.round(((exact.length + partial.length) / relevant.length) * 100),
    alignmentScore: totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : 0,
    matchedWeight,
    totalWeight,
  };
}

// Whether a keyword phrase (or any of its "or"-alternatives) is present verbatim.
export function isKeywordInText(text: string, keyword: string): boolean {
  const normalizedText = normalizeForKeywordMatching(text);
  const normalizedKeyword = normalizeForKeywordMatching(keyword);
  return keywordHit(normalizedText, normalizedKeyword);
}

export function missingKeywordsFor(content: ResumeTemplateInput, keywords: KeywordInput[]): string[] {
  // Match keywordCoverageFor: only look at rendered resume text, never the
  // hidden target-role `title` metadata field (which would otherwise mask a
  // missing title keyword as already covered).
  return keywordCoverageDetailsForText(extractVisibleResumeText(content), keywords).missing;
}

export function keywordCoverageDetailsForText(text: string, keywords: KeywordInput[]): KeywordCoverageDetails {
  const normalizedText = normalizeForKeywordMatching(text);
  const relevant = uniqueKeywordEntries(keywords);
  if (relevant.length === 0) {
    return { covered: [], missing: [], total: 0, percentage: 0 };
  }

  const covered = relevant.filter((keyword) => keywordHit(normalizedText, keyword.normalized)).map((keyword) => keyword.label);
  const missing = relevant.filter((keyword) => !keywordHit(normalizedText, keyword.normalized)).map((keyword) => keyword.label);

  return {
    covered,
    missing,
    total: relevant.length,
    percentage: Math.round((covered.length / relevant.length) * 100),
  };
}

function extractTextValues(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractTextValues).join(" ");
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).map(extractTextValues).join(" ");
  }
  return "";
}

function extractVisibleResumeText(content: ResumeTemplateInput): string {
  return extractTextValues({
    name: content.name,
    headline: content.headline,
    contactItems: content.contactItems,
    summaryHeading: content.summaryHeading,
    summary: content.summary,
    impactHeading: content.impactHeading,
    impactItems: content.impactItems,
    experienceHeading: content.experienceHeading,
    experience: content.experience,
    skillsHeading: content.skillsHeading,
    skills: content.skills,
    recognitionHeading: content.recognitionHeading,
    recognition: content.recognition,
    extraSections: content.extraSections,
    education: content.education,
  });
}

// Exact phrase match only — no term-by-term fallback.
function exactPhraseHit(normalizedText: string, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return false;
  if (containsPhrase(normalizedText, normalizedKeyword)) return true;
  const alternatives = normalizedKeyword
    .split(/\s+or\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return alternatives.some((alt) => containsPhrase(normalizedText, alt));
}

function keywordHit(normalizedText: string, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return false;
  if (containsPhrase(normalizedText, normalizedKeyword)) return true;

  const alternatives = normalizedKeyword
    .split(/\s+or\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return alternatives.some((alternative) => keywordPartHit(normalizedText, alternative));
}

function keywordPartHit(normalizedText: string, normalizedKeyword: string): boolean {
  if (containsPhrase(normalizedText, normalizedKeyword)) return true;

  const terms = keywordTerms(normalizedKeyword);
  if (terms.length === 0) return false;
  return termsWithinWindow(normalizedText, terms, 30);
}

function keywordTerms(keyword: string): string[] {
  return unique(
    keyword
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2 && !STOP_WORDS.has(term) && !GENERIC_TERMS.has(term)),
  );
}

function termHit(normalizedText: string, term: string): boolean {
  return containsPhrase(normalizedText, term) || singularCandidates(term).some((candidate) => containsPhrase(normalizedText, candidate));
}

function termsWithinWindow(normalizedText: string, terms: string[], windowSize: number): boolean {
  const words = normalizedText.split(" ").filter(Boolean);
  const required = terms.length <= 4 ? terms.length : Math.max(4, Math.ceil(terms.length * 0.65));
  if (words.length === 0) return false;
  // Precompute, per word position, which term indices it satisfies (one pass),
  // then slide a fixed-width window counting distinct terms present. This is
  // O(words × terms) instead of re-joining and re-scanning a 30-word slice at
  // every start index, which mattered because this runs live on every keystroke
  // in the resume editor.
  const matchedTermsAt: number[][] = words.map((word) => {
    const wrapped = ` ${word} `;
    const matched: number[] = [];
    for (let t = 0; t < terms.length; t += 1) {
      if (termHit(wrapped, terms[t])) matched.push(t);
    }
    return matched;
  });
  const countInWindow = new Array<number>(terms.length).fill(0);
  let distinct = 0;
  for (let end = 0; end < words.length; end += 1) {
    for (const t of matchedTermsAt[end]) {
      if (countInWindow[t] === 0) distinct += 1;
      countInWindow[t] += 1;
    }
    const outgoing = end - windowSize;
    if (outgoing >= 0) {
      for (const t of matchedTermsAt[outgoing]) {
        countInWindow[t] -= 1;
        if (countInWindow[t] === 0) distinct -= 1;
      }
    }
    if (distinct >= required) return true;
  }
  return false;
}

function singularCandidates(term: string): string[] {
  const candidates: string[] = [];
  if (term.endsWith("ies") && term.length > 4) {
    candidates.push(`${term.slice(0, -3)}y`);
  }
  if (term.endsWith("es") && term.length > 4) {
    candidates.push(term.slice(0, -2));
  }
  if (term.endsWith("s") && term.length > 3) {
    candidates.push(term.slice(0, -1));
  }
  return candidates;
}

function containsPhrase(normalizedText: string, normalizedPhrase: string): boolean {
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueKeywordEntries(keywords: KeywordInput[]): Array<{ label: string; normalized: string; weight: number }> {
  const seen = new Set<string>();
  const entries: Array<{ label: string; normalized: string; weight: number }> = [];

  for (const keywordInput of keywords) {
    const keyword = typeof keywordInput === "string" ? keywordInput : keywordInput.keyword;
    const label = keyword.trim().toLowerCase();
    const normalized = normalizeForKeywordMatching(keyword);
    if (!label || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push({
      label,
      normalized,
      weight: typeof keywordInput === "string" ? 3 : keywordSignalWeight(keywordInput.priority),
    });
  }

  return entries;
}
