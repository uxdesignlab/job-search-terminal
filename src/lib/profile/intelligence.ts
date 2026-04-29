export type SkillSignal = {
  name: string;
  category: string;
  terms: string[];
};

export const skillSignals: SkillSignal[] = [
  { name: "Product strategy", category: "Core leadership", terms: ["product strategy", "strategy", "roadmap", "product vision"] },
  { name: "UX leadership", category: "Core leadership", terms: ["ux leadership", "leadership", "design leadership", "mentoring"] },
  { name: "Design systems", category: "Specialized capability", terms: ["design system", "design systems", "component", "tokens"] },
  { name: "Accessibility", category: "Specialized capability", terms: ["accessibility", "wcag", "a11y", "inclusive"] },
  { name: "Design operations", category: "Specialized capability", terms: ["design operations", "designops", "operations", "process"] },
  { name: "Teaching and mentoring", category: "Specialized capability", terms: ["teaching", "instructor", "curriculum", "mentor", "mentoring"] },
  { name: "AI product strategy", category: "Adjacent direction", terms: ["ai", "artificial intelligence", "machine learning", "automation"] },
  { name: "Executive storytelling", category: "Core leadership", terms: ["executive", "stakeholder", "presentation", "storytelling"] },
  { name: "Systems leadership", category: "Core leadership", terms: ["systems", "governance", "standards", "scale"] }
];

export type ResumeEvidence = {
  skill: string;
  category: string;
  snippet: string;
};

export function normalizeResumeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function wordCount(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return text.trim().split(/\s+/).length;
}

export function extractEvidence(text: string): ResumeEvidence[] {
  const normalized = normalizeResumeText(text);
  const lower = normalized.toLowerCase();
  const evidence: ResumeEvidence[] = [];

  for (const signal of skillSignals) {
    const matchedTerm = signal.terms.find((term) => lower.includes(term));
    if (!matchedTerm) {
      continue;
    }

    const index = lower.indexOf(matchedTerm);
    const start = Math.max(0, index - 90);
    const end = Math.min(normalized.length, index + matchedTerm.length + 140);
    evidence.push({
      skill: signal.name,
      category: signal.category,
      snippet: normalized.slice(start, end).trim()
    });
  }

  return evidence;
}

export function splitListValue(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
