import { tryGetActiveProvider } from "@/lib/ai/factory";
import type { AIMessage } from "@/lib/ai/provider";

export type KeywordProposalExperience = {
  experienceIndex: number;
  title: string;
  organization: string;
  bullets: string[];
};

export type KeywordResumeProposal = {
  experienceIndex: number;
  sourceBulletIndex: number;
  organization: string;
  title: string;
  originalText: string;
  text: string;
};

type GeneratedProposal = {
  experienceIndex?: unknown;
  sourceBulletIndex?: unknown;
  text?: unknown;
};

const METRIC_PATTERN = /(?:[$£€]?\d[\d,.]*(?:%|\+)?)(?!\w)/g;
const KEYWORD_CONTEXT_TERMS: Record<string, string[]> = {
  storytelling: ["translate", "stakeholder", "alignment", "direction", "concept", "workshop", "executive"],
  "interactive prototypes": ["prototype", "proof of concept", "interaction", "validation", "concept"],
  experimentation: ["prototype", "research", "test", "validation", "iteration"],
  inclusivity: ["accessibility", "inclusive", "wcag", "research", "standards"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function metricsIn(value: string) {
  return new Set((value.match(METRIC_PATTERN) ?? []).map((metric) => metric.toLowerCase()));
}

function includesAllMetricsFrom(text: string, evidence: string) {
  const evidenceMetrics = metricsIn(evidence);
  return [...metricsIn(text)].every((metric) => evidenceMetrics.has(metric));
}

function keywordTerms(keyword: string) {
  return normalize(keyword).split(" ").filter((term) => term.length > 2);
}

function scoreBullet(bullet: string, keyword: string) {
  const normalized = normalize(bullet);
  const terms = keywordTerms(keyword);
  const contextTerms = KEYWORD_CONTEXT_TERMS[normalize(keyword)] ?? [];
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 3 : 0), 0)
    + contextTerms.reduce((score, term) => score + (normalized.includes(term) ? 2 : 0), 0)
    + (/\b(design|prototype|research|strategy|experience|workflow|system|product|user)\b/i.test(bullet) ? 2 : 0)
    + Math.min(Math.floor(bullet.length / 90), 2);
}

function bestBulletIndex(experience: KeywordProposalExperience, keyword: string) {
  if (experience.bullets.length === 0) return -1;
  return experience.bullets.reduce((bestIndex, bullet, index) =>
    scoreBullet(bullet, keyword) > scoreBullet(experience.bullets[bestIndex], keyword) ? index : bestIndex
  , 0);
}

function ensureSentence(value: string) {
  const trimmed = value.trim().replace(/[.!?]+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

function fallbackProposal(experience: KeywordProposalExperience, keyword: string, order: number): KeywordResumeProposal {
  const sourceBulletIndex = bestBulletIndex(experience, keyword);
  const originalText = experience.bullets[sourceBulletIndex] ?? "";
  const sourceText = originalText.replace(/[.!?]+$/, "");
  const variants = [
    `${sourceText}, incorporating ${keyword} into the work`,
    `${sourceText}; applied ${keyword} as part of the design approach`,
    `${sourceText}, with ${keyword} integrated into the process`,
  ];
  return {
    experienceIndex: experience.experienceIndex,
    sourceBulletIndex,
    organization: experience.organization,
    title: experience.title,
    originalText,
    text: ensureSentence(variants[order % variants.length]),
  };
}

function safeGeneratedProposal(
  experience: KeywordProposalExperience,
  keyword: string,
  explanation: string,
  generated: GeneratedProposal | undefined,
  fallback: KeywordResumeProposal,
  usedTexts: Set<string>
) {
  if (
    generated?.experienceIndex !== experience.experienceIndex ||
    !Number.isInteger(generated.sourceBulletIndex) ||
    typeof generated.sourceBulletIndex !== "number" ||
    generated.sourceBulletIndex < 0 ||
    generated.sourceBulletIndex >= experience.bullets.length ||
    typeof generated.text !== "string"
  ) return fallback;

  const text = ensureSentence(generated.text);
  const originalText = experience.bullets[generated.sourceBulletIndex];
  const evidence = `${originalText}\n${explanation}`;
  const normalized = normalize(text);
  if (
    !normalized.includes(normalize(keyword)) ||
    normalized === normalize(originalText) ||
    usedTexts.has(normalized) ||
    !includesAllMetricsFrom(text, evidence)
  ) return fallback;

  return {
    experienceIndex: experience.experienceIndex,
    sourceBulletIndex: generated.sourceBulletIndex,
    organization: experience.organization,
    title: experience.title,
    originalText,
    text,
  };
}

export async function generateKeywordResumeProposals(input: {
  keyword: string;
  explanation?: string;
  experiences: KeywordProposalExperience[];
}) {
  const keyword = input.keyword.trim();
  const explanation = input.explanation?.trim() ?? "";
  const experiences = input.experiences.filter((experience) => experience.bullets.length > 0);
  const fallbacks = experiences.map((experience, index) => fallbackProposal(experience, keyword, index));
  const provider = tryGetActiveProvider();
  if (!provider || !keyword || experiences.length === 0) return fallbacks;

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are an expert resume writer. Rewrite one existing resume bullet for each selected role to naturally incorporate one user-confirmed keyword.

Rules:
- Use the context of that specific company, role, and its existing bullets.
- Choose the strongest relevant existing bullet and return its zero-based sourceBulletIndex.
- Preserve the original factual meaning. Do not invent tools, metrics, outcomes, scope, or responsibilities.
- Incorporate the exact keyword naturally.
- Write polished resume bullets with strong verbs and concise professional phrasing.
- Make every rewritten bullet meaningfully different. Do not repeat a template, sentence structure, or angle across roles.
- Do not mention the company name in the bullet unless it is necessary for clarity.
- Return exactly one proposal per selected experience.
- Return JSON only.`,
    },
    {
      role: "user",
      content: `Confirmed keyword:
${keyword}

Optional user context:
${explanation || "(none)"}

Selected experience entries:
${JSON.stringify(experiences, null, 2)}

Return:
{"proposals":[{"experienceIndex":0,"sourceBulletIndex":0,"text":"string"}]}`,
    },
  ];

  try {
    const result = await provider.generateJSON<{ proposals?: GeneratedProposal[] }>(
      messages,
      '{"proposals":[{"experienceIndex":0,"sourceBulletIndex":0,"text":"string"}]}',
      { maxTokens: 1200 }
    );
    const generatedByExperience = new Map(
      (result.proposals ?? []).map((proposal) => [proposal.experienceIndex, proposal])
    );
    const usedTexts = new Set<string>();
    return experiences.map((experience, index) => {
      const proposal = safeGeneratedProposal(
        experience,
        keyword,
        explanation,
        generatedByExperience.get(experience.experienceIndex),
        fallbacks[index],
        usedTexts
      );
      usedTexts.add(normalize(proposal.text));
      return proposal;
    });
  } catch {
    return fallbacks;
  }
}
