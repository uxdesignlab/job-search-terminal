import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage, AIProvider } from "../ai/provider";
import { autoSaveEvaluationStories, getJobById, getRoleDirections, getResumes, getSkills, getStories, getUserProfile, saveJobEvaluation } from "../db/queries";
import type { EvaluationSections, JobEvaluationResultInput, JobRecord, StructuredStory } from "../db/types";
import { coerceResumeBaseToLane, pickResumeBase } from "./resume-lane-picker";
import { buildJobContext, buildSystemPrompt, type ResumeExcerpt } from "./prompts";

export type BlockName = "a" | "b" | "c" | "d" | "e" | "f" | "g";

export type BlockUpdate = {
  block: BlockName;
  label: string;
  content: string[];
};

export type EvaluationCallback = (update: BlockUpdate) => void;
export type BlockStartCallback = (block: BlockName) => void;

// ─── Block A: Role Summary ─────────────────────────────────────────────────

type BlockAResult = {
  archetype: string;
  domain: string;
  seniority: string;
  teamContext: string;
  remoteReality: string;
  summary: string[];
};

async function runBlockA(provider: AIProvider, systemPrompt: string, jobCtx: string): Promise<BlockAResult> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Analyze this job posting and return a JSON object with:
- "archetype": the best-fit role archetype from: "IC / Individual Contributor", "Leadership / Management", "Operations / Program Management", "Technical Specialist", "Education / Training", "Other"
- "domain": what the company/product does (1 sentence)
- "seniority": IC / Senior IC / Lead / Principal / Director / VP / Unknown
- "teamContext": likely team structure and reporting (1 sentence)
- "remoteReality": Remote / Hybrid / Onsite / Unknown
- "summary": 4 bullet strings summarizing the role (archetype, seniority, remote, one-line TL;DR fit verdict)`
    }
  ];
  return provider.generateJSON<BlockAResult>(messages, '{"archetype":"string","domain":"string","seniority":"string","teamContext":"string","remoteReality":"string","summary":["string"]}');
}

// ─── Block B: CV Match ─────────────────────────────────────────────────────

type BlockBResult = {
  fitScore: number;
  recommendation: string;
  strengths: string[];
  gaps: string[];
  redFlags: string[];
  requirementMatch: string[];
  resumeEvidence: string[];
  summary: string[];
};

async function runBlockB(provider: AIProvider, systemPrompt: string, jobCtx: string, blockA: BlockAResult): Promise<BlockBResult> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Role archetype detected: ${blockA.archetype} | Seniority: ${blockA.seniority}

Assess the candidate's CV match against this job. Return a JSON object with:
- "fitScore": integer 0-100 (overall fit considering skills, seniority, domain, constraints)
- "recommendation": one of "Priority apply" / "Strong apply" / "Review manually" / "Skip"
- "strengths": up to 6 strings — specific skills/experiences from the profile that match
- "gaps": up to 5 strings — genuine capability or experience gaps
- "redFlags": up to 4 strings — deal breakers, location conflicts, seniority mismatches
- "requirementMatch": up to 6 strings — job requirements matched by the profile
- "resumeEvidence": up to 5 strings — specific resume proof points that are relevant
- "summary": 3-4 bullet strings summarizing the match assessment`
    }
  ];
  return provider.generateJSON<BlockBResult>(messages, '{"fitScore":0,"recommendation":"string","strengths":[],"gaps":[],"redFlags":[],"requirementMatch":[],"resumeEvidence":[],"summary":[]}');
}

// ─── Block C: Level Strategy ───────────────────────────────────────────────

async function runBlockC(provider: AIProvider, systemPrompt: string, jobCtx: string, blockA: BlockAResult, blockB: BlockBResult): Promise<string[]> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Detected: ${blockA.archetype} | ${blockA.seniority} | Fit score: ${blockB.fitScore}%

Advise on seniority positioning and negotiation. Return JSON: { "strategy": ["bullet 1", ...] }
Include: how to position seniority, market demand signals, 2-3 negotiation angles, and whether to apply above/at/below title level. Up to 5 bullets.`
    }
  ];
  const result = await provider.generateJSON<{ strategy: string[] }>(messages, '{"strategy":[]}');
  return result.strategy;
}

// ─── Block D: Compensation ─────────────────────────────────────────────────

async function runBlockD(
  provider: AIProvider,
  systemPrompt: string,
  jobCtx: string,
  blockA: BlockAResult,
  job: { title: string; company: string; location: string }
): Promise<string[]> {
  // Attempt real-time market data via web search if the provider supports it
  let searchContext = "";
  if (provider.webSearch) {
    const query = `${blockA.archetype} ${blockA.seniority} salary range ${job.location || "United States"} 2024 2025 site:levels.fyi OR site:glassdoor.com OR site:linkedin.com/salary`;
    const searchResult = await provider.webSearch(query).catch(() => null);
    if (searchResult) {
      searchContext = `\n\nReal-time compensation data from web search:\n${searchResult.slice(0, 1500)}`;
    }
  }

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Role: ${blockA.archetype} | ${blockA.seniority} | Domain: ${blockA.domain}
Company: ${job.company} | Location: ${job.location}${searchContext}

Research compensation context. Return JSON: { "compensation": ["bullet 1", ...] }
Include: estimated base salary band for this role/seniority/location, total comp context (equity/bonus), market demand context, whether comp is likely above/at/below candidate's stated needs. Up to 5 bullets.${searchContext ? " Prefer the real-time search data over training knowledge for current ranges." : " No live market data available — estimate from training knowledge."}`
    }
  ];
  const result = await provider.generateJSON<{ compensation: string[] }>(messages, '{"compensation":[]}');
  return result.compensation;
}

// ─── Block E: Personalization Plan ────────────────────────────────────────

export type KeywordEntry = {
  keyword: string;
  priority: "required" | "preferred";
  category: "title" | "technical" | "soft" | "domain" | "tool" | "methodology" | "credential";
};

type BlockEResult = {
  plan: string[];
  keywords: KeywordEntry[];
};

async function runBlockE(provider: AIProvider, systemPrompt: string, jobCtx: string, blockA: BlockAResult, blockB: BlockBResult): Promise<BlockEResult> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Archetype: ${blockA.archetype} | Gaps: ${blockB.gaps.slice(0, 3).join("; ")}

Create a CV/LinkedIn personalization roadmap. Return JSON:
- "plan": up to 6 bullet strings — specific summary rewrites, bullet reorders, skills to emphasize, LinkedIn headline changes
- "keywords": 20-25 ATS keyword objects. ATS systems do exact-phrase scanning — precision matters more than breadth.

EXTRACTION RULES (follow strictly):
1. Use the verbatim phrase from the job posting — never paraphrase or invent a synonym.
2. ALWAYS include the target job title and its closest 1-2 variants as "title" category keywords (e.g. "Senior Product Designer", "Product Design Lead"). These carry the highest ATS weight.
3. Extract every named tool, platform, certification, and framework exactly as written (Figma, Workday, AWS, PMP, etc.) — these are exact-match signals.
4. Pull hard-skill phrases from Required/Qualifications sections; mark those "required".
5. Pull soft-skill and context phrases from Preferred/Nice-to-have; mark those "preferred".
6. For "X+ years of [skill]" requirements, extract the skill phrase (e.g. "product design leadership", "enterprise UX") — not the years number itself.
7. Include domain phrases that distinguish this role from generic ones (e.g. "healthcare SaaS", "B2B enterprise", "design operations").
8. Do NOT include standalone adjectives ("strong", "excellent") — only include them inside a meaningful phrase.
9. Do NOT duplicate semantically identical phrases — pick the longer/more specific one.
10. Aim for 20-25 keywords covering: title variants, hard skills, soft skills, tools, domain context, and methodology.

Each keyword object:
- "keyword": verbatim phrase (1-6 words; single-word tools/certs are fine)
- "priority": "required" (in Required/Must-have section or stated multiple times) | "preferred" (Preferred/Nice-to-have or mentioned once)
- "category": "title" | "technical" | "soft" | "domain" | "tool" | "methodology" | "credential"`
    }
  ];
  const raw = await provider.generateJSON<{ plan: string[]; keywords: unknown[] }>(messages, '{"plan":[],"keywords":[]}');
  const keywords: KeywordEntry[] = (raw.keywords ?? [])
    .filter((k): k is KeywordEntry => typeof k === "object" && k !== null && "keyword" in k)
    .map((k) => ({
      keyword: String((k as KeywordEntry).keyword),
      priority: (k as KeywordEntry).priority === "preferred" ? "preferred" : "required",
      category: (["title", "technical", "soft", "domain", "tool", "methodology", "credential"] as const).includes((k as KeywordEntry).category)
        ? (k as KeywordEntry).category
        : "technical"
    }));
  return { plan: raw.plan ?? [], keywords };
}

// ─── Block F: Interview Plan ───────────────────────────────────────────────

type BlockFResult = {
  lines: string[];
  structured: StructuredStory[];
};

/**
 * Generates 3-5 STAR+Reflection interview stories tailored to the role.
 *
 * @param existingStoryTitles - Question strings from the current story bank,
 *   injected into the prompt so the LLM avoids exact duplicates and builds
 *   on material already captured across prior evaluations.
 */
async function runBlockF(
  provider: AIProvider,
  systemPrompt: string,
  jobCtx: string,
  blockA: BlockAResult,
  blockE: BlockEResult,
  existingStoryTitles: string[]
): Promise<BlockFResult> {
  const bankContext =
    existingStoryTitles.length > 0
      ? `\n\nExisting stories already in the story bank (do not duplicate; build on or contrast these instead):\n${existingStoryTitles.map((t) => `- "${t}"`).join("\n")}`
      : "";

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Role: ${blockA.archetype} | Key keywords: ${blockE.keywords.slice(0, 8).map((k) => k.keyword).join(", ")}${bankContext}

Generate 3-5 STAR+Reflection interview stories for this specific role. Return JSON: { "stories": [{ "question": "string", "points": ["S: ...", "T: ...", "A: ...", "R: ...", "Reflection: ..."] }] }

Each story should:
- Map to a likely interview question for this specific role/company
- Use only experiences from the candidate profile
- Include measurable outcomes in the Result
- Include a Reflection on what was learned or what you'd do differently`
    }
  ];

  const result = await provider.generateJSON<{ stories: Array<{ question: string; points: string[] }> }>(messages, '{"stories":[]}');

  // Parse the structured points into labelled fields before flattening
  const structured: StructuredStory[] = result.stories.map((s) => {
    const extract = (prefix: string) =>
      s.points.find((p) => p.startsWith(prefix))?.replace(prefix, "").trim() ?? "";
    return {
      question: s.question,
      situation: extract("S:"),
      task: extract("T:"),
      action: extract("A:"),
      result: extract("R:"),
      reflection: extract("Reflection:")
    };
  });

  const lines = result.stories.flatMap((s) => [`Q: ${s.question}`, ...s.points, ""]).filter(Boolean);

  return { lines, structured };
}

// ─── Block G: Posting Legitimacy ──────────────────────────────────────────

type BlockGResult = {
  assessment: string;
  legitimacy: string[];
};

async function runBlockG(provider: AIProvider, systemPrompt: string, jobCtx: string, job: JobRecord): Promise<BlockGResult> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Posted: ${job.datePosted || job.firstSeenDate} | First seen: ${job.firstSeenDate}

Assess this posting's legitimacy. Return JSON:
- "assessment": one of "High Confidence" / "Proceed with Caution" / "Suspicious"
- "legitimacy": 3-5 bullet strings — freshness signals, quality indicators, repost/ghost job patterns, any concerns

Signals to evaluate: posting age, description quality, salary transparency, specificity of requirements, recruiter vs direct, known company vs unknown.`
    }
  ];
  return provider.generateJSON<BlockGResult>(messages, '{"assessment":"string","legitimacy":[]}');
}

// ─── Resume Excerpt Builder ───────────────────────────────────────────────

const MAX_EXCERPT_CHARS_PER_RESUME = 1800;
const MAX_RESUME_EXCERPTS = 2;

function buildResumeExcerpts(resumes: { name: string; extractedText: string; activeStatus: boolean }[]): ResumeExcerpt[] {
  return resumes
    .filter((r) => r.activeStatus && r.extractedText && r.extractedText.length > 100)
    .slice(0, MAX_RESUME_EXCERPTS)
    .map((r) => ({
      name: r.name,
      excerpt: r.extractedText.slice(0, MAX_EXCERPT_CHARS_PER_RESUME)
    }));
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export async function evaluateJobWithAI(jobId: string, onBlock?: EvaluationCallback, onBlockStart?: BlockStartCallback): Promise<JobEvaluationResultInput> {
  const start = Date.now();
  const provider = getActiveProvider();

  let job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  // Auto-fetch JD for scanned jobs that don't have a description yet
  if (!job.rawDescription && job.url) {
    const { fetchJobDescription } = await import("../scanner/jd-fetcher");
    const { saveJobDescription } = await import("../db/queries");
    const desc = await fetchJobDescription(job);
    if (desc) {
      saveJobDescription(jobId, desc);
      job = { ...job, rawDescription: desc, parsedDescription: desc };
    }
  }

  const profile = getUserProfile();
  const skills = getSkills();
  const roleDirections = getRoleDirections();
  const resumes = getResumes();

  const resumeExcerpts = buildResumeExcerpts(resumes);
  const systemPrompt = buildSystemPrompt(profile, skills, roleDirections, resumeExcerpts);
  const jobCtx = buildJobContext(job);

  // All blocks run sequentially — avoids rate-limit/503 from parallel API calls,
  // and gives better streaming UX (one block appears at a time).
  onBlockStart?.("a");
  const blockA = await withRetry(() => runBlockA(provider, systemPrompt, jobCtx));
  onBlock?.({ block: "a", label: "A. Role summary", content: blockA.summary });

  onBlockStart?.("b");
  const blockB = await withRetry(() => runBlockB(provider, systemPrompt, jobCtx, blockA));
  onBlock?.({ block: "b", label: "B. CV match", content: blockB.summary });

  onBlockStart?.("c");
  const blockCContent = await withRetry(() => runBlockC(provider, systemPrompt, jobCtx, blockA, blockB));
  onBlock?.({ block: "c", label: "C. Level strategy", content: blockCContent });

  onBlockStart?.("d");
  const blockDContent = await withRetry(() => runBlockD(provider, systemPrompt, jobCtx, blockA, { title: job.title, company: job.company, location: job.location }));
  onBlock?.({ block: "d", label: "D. Comp and demand", content: blockDContent });

  onBlockStart?.("e");
  const blockE = await withRetry(() => runBlockE(provider, systemPrompt, jobCtx, blockA, blockB));
  onBlock?.({ block: "e", label: "E. Personalization plan", content: blockE.plan });

  // Fetch existing story bank titles to feed as context into Block F
  const existingStoryTitles = getStories()
    .filter((s) => s.sourceBlockF !== "evaluation" || s.sourceJobId !== jobId)
    .map((s) => s.title)
    .slice(0, 8);

  onBlockStart?.("f");
  const blockFResult = await withRetry(() => runBlockF(provider, systemPrompt, jobCtx, blockA, blockE, existingStoryTitles));
  onBlock?.({ block: "f", label: "F. Interview plan", content: blockFResult.lines });

  onBlockStart?.("g");
  const blockGResult = await withRetry(() => runBlockG(provider, systemPrompt, jobCtx, job));
  onBlock?.({ block: "g", label: "G. Posting legitimacy", content: blockGResult.legitimacy });

  const sections: EvaluationSections = {
    roleSummary: blockA.summary,
    matchWithResume: blockB.summary,
    levelStrategy: blockCContent,
    compensationDemand: blockDContent,
    tailoringPlan: blockE.plan,
    interviewPlan: blockFResult.lines,
    postingLegitimacy: blockGResult.legitimacy,
    storiesStructured: blockFResult.structured
  };

  const score = Math.max(10, Math.min(98, blockB.fitScore));
  const resumeBase = pickResumeBase(blockA.archetype, resumes.map((r) => r.name));

  // Required keywords first, then preferred — used for ATS prioritization in tailoring
  const orderedKeywords = [
    ...blockE.keywords.filter((k) => k.priority === "required"),
    ...blockE.keywords.filter((k) => k.priority === "preferred"),
  ].map((k) => k.keyword);

  return {
    id: `evaluation-${job.id}`,
    jobId: job.id,
    fitScore: score,
    scoreLabel: scoreLabelFor(score),
    roleArchetype: blockA.archetype,
    summary: `${blockA.archetype} · ${blockA.seniority} · ${score}% fit · ${blockB.recommendation}`,
    strengths: blockB.strengths,
    gaps: blockB.gaps,
    redFlags: blockB.redFlags,
    recommendation: blockB.recommendation,
    resumeBaseRecommendation: resumeBase,
    requirementMatch: blockB.requirementMatch,
    resumeEvidence: blockB.resumeEvidence,
    sections,
    legitimacyLabel: blockGResult.assessment,
    keywords: orderedKeywords,
    userCorrection: {},
    providerUsed: provider.name,
    modelUsed: provider.effectiveModel,
    tokensUsed: 0,
    generationMs: Date.now() - start,
    whyItMatches: blockB.strengths.slice(0, 3).join("; ") || "Pending review.",
    mainConcern: blockB.redFlags[0] ?? blockB.gaps[0] ?? "No major concern identified.",
    salaryNotes: blockDContent[0] ?? "Compensation data not available."
  };
}

export async function runAndSaveJobWithAI(jobId: string, onBlock?: EvaluationCallback, onBlockStart?: BlockStartCallback): Promise<JobEvaluationResultInput> {
  const result = await evaluateJobWithAI(jobId, onBlock, onBlockStart);
  saveJobEvaluation(result);
  // Auto-populate story bank from Block F structured output (replaces prior auto-saved stories for this job)
  if (result.sections.storiesStructured && result.sections.storiesStructured.length > 0) {
    autoSaveEvaluationStories(jobId, result.sections.storiesStructured);
  }
  const resumeNames = getResumes().map((r) => r.name);
  return {
    ...result,
    resumeBaseRecommendation: coerceResumeBaseToLane(
      result.resumeBaseRecommendation,
      result.roleArchetype,
      resumeNames
    )
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function scoreLabelFor(score: number) {
  if (score >= 85) return "Strong fit";
  if (score >= 70) return "Review";
  if (score >= 55) return "Selective";
  return "Weak fit";
}
