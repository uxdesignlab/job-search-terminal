import type { ResumeTemplateInput } from "./resume-template";

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

export function keywordCoverageFor(content: ResumeTemplateInput, keywords: string[]) {
  return keywordCoverageDetailsForText(extractTextValues(content), keywords).percentage;
}

export function missingKeywordsFor(content: ResumeTemplateInput, keywords: string[]): string[] {
  return keywordCoverageDetailsForText(extractTextValues(content), keywords).missing;
}

export function keywordCoverageDetailsForText(text: string, keywords: string[]): KeywordCoverageDetails {
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

  const matchedTerms = terms.filter((term) => termHit(normalizedText, term));

  if (terms.length <= 4) {
    return matchedTerms.length === terms.length;
  }

  return matchedTerms.length >= Math.max(4, Math.ceil(terms.length * 0.65));
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

function normalizeForKeywordMatching(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueKeywordEntries(keywords: string[]): Array<{ label: string; normalized: string }> {
  const seen = new Set<string>();
  const entries: Array<{ label: string; normalized: string }> = [];

  for (const keyword of keywords) {
    const label = keyword.trim().toLowerCase();
    const normalized = normalizeForKeywordMatching(keyword);
    if (!label || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push({ label, normalized });
  }

  return entries;
}
