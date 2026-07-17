import type { JobKeywordSignal } from "../db/types";

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
  const searchableDescription = normalizedDescription.startsWith(normalizedTitle)
    ? normalizedDescription.slice(normalizedTitle.length).trim()
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
      const coreMethod = ["prototyping early and often", "multiple rounds of testing"].includes(normalize(keyword));
      return {
        keyword,
        source,
        category: normalize(keyword) === normalize(job.title) ? "title" : "technical",
        priority: coreMethod || source === "responsibility" || appearances >= 2 ? "required" : "preferred",
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
  const keywordIndex = normalize(description).indexOf(normalize(keyword));
  if (keywordIndex < 0) return "description";
  const before = normalize(description).slice(0, keywordIndex);
  const lastBasic = Math.max(before.lastIndexOf("basic qualifications"), before.lastIndexOf("required qualifications"), before.lastIndexOf("requirements"));
  const lastPreferred = Math.max(before.lastIndexOf("preferred qualifications"), before.lastIndexOf("nice to have"));
  const lastResponsibilities = Math.max(before.lastIndexOf("what you will do"), before.lastIndexOf("responsibilities"), before.lastIndexOf("what youll do"));
  if (lastPreferred > lastBasic && lastPreferred > lastResponsibilities) return "preferred_qualification";
  if (lastBasic > lastPreferred && lastBasic > lastResponsibilities) return "basic_qualification";
  if (lastResponsibilities >= 0) return "responsibility";
  return "description";
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

function countNormalizedPhrase(text: string, phrase: string): number {
  if (!phrase) return 0;
  return ` ${text} `.split(` ${phrase} `).length - 1;
}

function normalize(value: string): string {
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
