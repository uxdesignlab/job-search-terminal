import type { JobKeywordSignal } from "../db/types";
import { normalizeKeywordText as normalize } from "../text/normalize-keyword";

type RawKeywordSignal = Partial<JobKeywordSignal> & { keyword?: unknown };

const CATEGORIES = new Set<JobKeywordSignal["category"]>([
  "title", "technical", "soft", "domain", "tool", "methodology", "credential",
]);

const SOURCES = new Set<JobKeywordSignal["source"]>([
  "job_title", "basic_qualification", "required_qualification", "preferred_qualification", "responsibility", "description",
]);

const LOW_SIGNAL_PHRASES = new Set([
  "best in class solutions",
  "excellent communication skills",
  "strong communication skills",
  "written verbal and interpersonal communication skills",
  "share work daily",
  "highly iterative collaborative environment",
  "fast paced environment",
  "attention to detail",
  "team player",
  "problem solving skills",
  "strategy skills",
  "conceptual thinking",
]);

export function keywordSignalWeight(priority: JobKeywordSignal["priority"]): number {
  if (priority === "critical") return 5;
  if (priority === "required") return 3;
  return 1;
}

export function normalizeKeywordSignals(
  rawSignals: unknown[],
  job: { title: string; description: string },
): JobKeywordSignal[] {
  const searchablePosting = normalize(`${job.title}\n${job.description}`);
  const normalizedTitle = normalize(job.title);
  const normalizedDescription = normalize(job.description);
  // The description we pass in commonly repeats the title (the evaluator feeds
  // the whole job context, which starts with a "Title: …" line). Remove every
  // occurrence of the title so that a sub-phrase of the title only survives the
  // invented-variant check below when it also appears in the posting body on
  // its own — otherwise the title itself would satisfy the check.
  const searchableDescription = normalizedTitle
    ? stripPhrase(normalizedDescription, normalizedTitle)
    : normalizedDescription;
  const seen = new Set<string>();
  const accepted: JobKeywordSignal[] = [];

  for (const raw of rawSignals) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as RawKeywordSignal;
    const keyword = typeof candidate.keyword === "string" ? candidate.keyword.trim() : "";
    const normalized = normalize(keyword);
    if (!keyword || !normalized || seen.has(normalized)) continue;
    if (!containsNormalizedPhrase(searchablePosting, normalized)) continue;
    if (normalized !== normalizedTitle && containsNormalizedPhrase(normalizedTitle, normalized) && !containsNormalizedPhrase(searchableDescription, normalized)) continue;
    if (!isUsefulPhrase(normalized, candidate.category)) continue;

    const category = CATEGORIES.has(candidate.category as JobKeywordSignal["category"])
      ? candidate.category as JobKeywordSignal["category"]
      : "technical";
    const source = SOURCES.has(candidate.source as JobKeywordSignal["source"])
      ? candidate.source as JobKeywordSignal["source"]
      : "description";
    const priority = priorityFor(keyword, job.title, source, candidate.priority);
    seen.add(normalized);
    accepted.push({
      keyword,
      priority,
      category: normalize(job.title) === normalized ? "title" : category,
      source: normalize(job.title) === normalized ? "job_title" : source,
      rationale: typeof candidate.rationale === "string" ? candidate.rationale.trim().slice(0, 180) : "",
    });
  }

  if (normalizedTitle && !seen.has(normalizedTitle)) {
    accepted.unshift({
      keyword: job.title.trim(),
      priority: "critical",
      category: "title",
      source: "job_title",
      rationale: "Exact target title from the job posting.",
    });
  }

  return accepted
    .sort((a, b) => keywordSignalWeight(b.priority) - keywordSignalWeight(a.priority))
    .slice(0, 18);
}

export function legacyKeywordSignals(
  keywords: string[],
  job: { title: string; description: string },
): JobKeywordSignal[] {
  const description = job.description;
  return normalizeKeywordSignals(
    keywords.map((keyword) => {
      const source = inferSource(keyword, description);
      const appearances = countNormalizedPhrase(normalize(description), normalize(keyword));
      return {
        keyword,
        source,
        category: normalize(keyword) === normalize(job.title) ? "title" : "technical",
        // A phrase is "required" when it comes from a responsibilities section
        // or is repeated in the posting; section detection in `priorityFor`
        // handles explicit qualification sections. No domain-specific phrase
        // list — that generalizes across postings instead of hard-coding one.
        priority: source === "responsibility" || appearances >= 2 ? "required" : "preferred",
        rationale: sourceLabel(source),
      };
    }),
    job,
  );
}

function priorityFor(
  keyword: string,
  title: string,
  source: JobKeywordSignal["source"],
  requested: JobKeywordSignal["priority"] | undefined,
): JobKeywordSignal["priority"] {
  if (normalize(keyword) === normalize(title)) return "critical";
  if (source === "basic_qualification" || source === "required_qualification") return "critical";
  if (source === "preferred_qualification") return "preferred";
  if (source === "responsibility") return "required";
  return requested === "critical" || requested === "required" ? "required" : "preferred";
}

function inferSource(keyword: string, description: string): JobKeywordSignal["source"] {
  const normDesc = normalize(description);
  const normKw = normalize(keyword);
  if (!normKw) return "description";
  // A phrase can appear in several sections (e.g. under both Responsibilities
  // and Preferred). Scan every occurrence and keep the strongest section rather
  // than blindly trusting the first match.
  let best: JobKeywordSignal["source"] = "description";
  let bestStrength = -1;
  for (let idx = normDesc.indexOf(normKw); idx >= 0; idx = normDesc.indexOf(normKw, idx + 1)) {
    const source = sectionForPrefix(normDesc.slice(0, idx));
    const strength = sourceStrength(source);
    if (strength > bestStrength) {
      bestStrength = strength;
      best = source;
    }
  }
  return best;
}

function sectionForPrefix(before: string): JobKeywordSignal["source"] {
  const lastBasic = Math.max(before.lastIndexOf("basic qualifications"), before.lastIndexOf("required qualifications"), before.lastIndexOf("requirements"));
  const lastPreferred = Math.max(before.lastIndexOf("preferred qualifications"), before.lastIndexOf("nice to have"));
  const lastResponsibilities = Math.max(before.lastIndexOf("what you will do"), before.lastIndexOf("responsibilities"), before.lastIndexOf("what youll do"));
  if (lastPreferred > lastBasic && lastPreferred > lastResponsibilities) return "preferred_qualification";
  if (lastBasic > lastPreferred && lastBasic > lastResponsibilities) return "basic_qualification";
  if (lastResponsibilities >= 0) return "responsibility";
  return "description";
}

// Higher = stronger requirement signal, used to break ties across sections.
function sourceStrength(source: JobKeywordSignal["source"]): number {
  if (source === "basic_qualification" || source === "required_qualification") return 3;
  if (source === "responsibility") return 2;
  if (source === "preferred_qualification") return 1;
  return 0;
}

function sourceLabel(source: JobKeywordSignal["source"]): string {
  if (source === "job_title") return "Target title.";
  if (source === "basic_qualification" || source === "required_qualification") return "Explicit qualification in the posting.";
  if (source === "preferred_qualification") return "Preferred qualification in the posting.";
  if (source === "responsibility") return "Core responsibility in the posting.";
  return "Relevant phrase from the posting.";
}

function isUsefulPhrase(normalized: string, category: unknown): boolean {
  if (LOW_SIGNAL_PHRASES.has(normalized)) return false;
  const terms = normalized.split(" ").filter(Boolean);
  if (terms.length > 6) return false;
  if (terms.length === 1 && !["tool", "credential"].includes(String(category)) && normalized.length < 5) return false;
  return true;
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

// Remove every whole-phrase occurrence of `phrase` from space-delimited `text`.
function stripPhrase(text: string, phrase: string): string {
  const needle = ` ${phrase} `;
  let padded = ` ${text} `;
  while (padded.includes(needle)) {
    padded = padded.replace(needle, "  ");
  }
  return padded.replace(/\s+/g, " ").trim();
}

function countNormalizedPhrase(text: string, phrase: string): number {
  if (!phrase) return 0;
  return ` ${text} `.split(` ${phrase} `).length - 1;
}
