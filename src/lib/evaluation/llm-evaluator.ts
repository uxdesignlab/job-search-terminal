import { randomUUID } from "node:crypto";
import { getActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage, AIProvider } from "../ai/provider";
import { getJobById, getRoleDirections, getResumes, getSkills, getUserProfile, saveJobEvaluation } from "../db/queries";
import type { EvaluationSections, JobEvaluationResultInput, JobRecord } from "../db/types";
import { coerceResumeBaseToLane, pickResumeBase } from "./resume-lane-picker";
import { buildJobContext, buildSystemPrompt } from "./prompts";

export type BlockName = "a" | "b" | "c" | "d" | "e" | "f" | "g";

export type BlockUpdate = {
  block: BlockName;
  label: string;
  content: string[];
};

export type EvaluationCallback = (update: BlockUpdate) => void;

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

type BlockEResult = {
  plan: string[];
  keywords: string[];
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
- "keywords": 10-15 ATS keywords from this job posting to weave into the resume`
    }
  ];
  return provider.generateJSON<BlockEResult>(messages, '{"plan":[],"keywords":[]}');
}

// ─── Block F: Interview Plan ───────────────────────────────────────────────

async function runBlockF(provider: AIProvider, systemPrompt: string, jobCtx: string, blockA: BlockAResult, blockE: BlockEResult): Promise<string[]> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${jobCtx}

Role: ${blockA.archetype} | Key keywords: ${blockE.keywords.slice(0, 8).join(", ")}

Generate 3-5 STAR+Reflection interview stories for this specific role. Return JSON: { "stories": [{ "question": "string", "points": ["S: ...", "T: ...", "A: ...", "R: ...", "Reflection: ..."] }] }

Each story should:
- Map to a likely interview question for this specific role/company
- Use only experiences from the candidate profile
- Include measurable outcomes in the Result
- Include a Reflection on what was learned or what you'd do differently`
    }
  ];
  const result = await provider.generateJSON<{ stories: Array<{ question: string; points: string[] }> }>(messages, '{"stories":[]}');
  return result.stories.flatMap((s) => [`Q: ${s.question}`, ...s.points, ""]).filter(Boolean);
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

// ─── Orchestrator ──────────────────────────────────────────────────────────

export async function evaluateJobWithAI(jobId: string, onBlock?: EvaluationCallback): Promise<JobEvaluationResultInput> {
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

  const systemPrompt = buildSystemPrompt(profile, skills, roleDirections);
  const jobCtx = buildJobContext(job);

  // All blocks run sequentially — avoids rate-limit/503 from parallel API calls,
  // and gives better streaming UX (one block appears at a time).
  const blockA = await withRetry(() => runBlockA(provider, systemPrompt, jobCtx));
  onBlock?.({ block: "a", label: "A. Role summary", content: blockA.summary });

  const blockB = await withRetry(() => runBlockB(provider, systemPrompt, jobCtx, blockA));
  onBlock?.({ block: "b", label: "B. CV match", content: blockB.summary });

  const blockCContent = await withRetry(() => runBlockC(provider, systemPrompt, jobCtx, blockA, blockB));
  onBlock?.({ block: "c", label: "C. Level strategy", content: blockCContent });

  const blockDContent = await withRetry(() => runBlockD(provider, systemPrompt, jobCtx, blockA, { title: job.title, company: job.company, location: job.location }));
  onBlock?.({ block: "d", label: "D. Comp and demand", content: blockDContent });

  const blockE = await withRetry(() => runBlockE(provider, systemPrompt, jobCtx, blockA, blockB));
  onBlock?.({ block: "e", label: "E. Personalization plan", content: blockE.plan });

  const blockFContent = await withRetry(() => runBlockF(provider, systemPrompt, jobCtx, blockA, blockE));
  onBlock?.({ block: "f", label: "F. Interview plan", content: blockFContent });

  const blockGResult = await withRetry(() => runBlockG(provider, systemPrompt, jobCtx, job));
  onBlock?.({ block: "g", label: "G. Posting legitimacy", content: blockGResult.legitimacy });

  const sections: EvaluationSections = {
    roleSummary: blockA.summary,
    matchWithResume: blockB.summary,
    levelStrategy: blockCContent,
    compensationDemand: blockDContent,
    tailoringPlan: blockE.plan,
    interviewPlan: blockFContent,
    postingLegitimacy: blockGResult.legitimacy
  };

  const score = Math.max(10, Math.min(98, blockB.fitScore));
  const resumeBase = pickResumeBase(blockA.archetype, resumes.map((r) => r.name));

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
    keywords: blockE.keywords,
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

export async function runAndSaveJobWithAI(jobId: string, onBlock?: EvaluationCallback): Promise<JobEvaluationResultInput> {
  const result = await evaluateJobWithAI(jobId, onBlock);
  saveJobEvaluation(result);
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

// Keeps the randomUUID import used (for future batch IDs)
export { randomUUID };
