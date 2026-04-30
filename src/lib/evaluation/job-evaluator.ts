import { getJobById, getResumes, getRoleDirections, getSkills, getUserProfile, saveJobEvaluation } from "../db/queries";
import type { EvaluationSections, JobEvaluationResultInput, JobRecord, ResumeRecord, RoleDirectionRecord, SkillRecord, UserProfileRecord } from "../db/types";
import { formatPostedDate } from "../dates";

type RoleSignal = {
  archetype: string;
  resumeBase: string;
  keywords: string[];
};

const roleSignals: RoleSignal[] = [
  {
    archetype: "Principal Product Design",
    resumeBase: "Principal / Product Design Leadership",
    keywords: ["principal", "product designer", "product design", "ux", "workflow", "strategy", "senior ic"]
  },
  {
    archetype: "Design Operations",
    resumeBase: "Design Operations",
    keywords: ["design operations", "designops", "operations", "governance", "planning", "rituals", "enablement"]
  },
  {
    archetype: "Accessibility / Design Systems",
    resumeBase: "Accessibility / Design Systems",
    keywords: ["accessibility", "wcag", "design systems", "design system", "governance", "component"]
  },
  {
    archetype: "UX Education",
    resumeBase: "Teaching / UX Education",
    keywords: ["instructor", "teaching", "education", "curriculum", "mentor", "coach", "academy"]
  },
  {
    archetype: "AI Product Strategy",
    resumeBase: "Principal / Product Design Leadership",
    keywords: ["ai product", "ai", "agent", "workflow", "automation", "product manager", "product strategy"]
  },
  {
    archetype: "Avoid",
    resumeBase: "No resume recommended",
    keywords: ["brand designer", "graphic designer", "visual designer", "onsite only", "junior", "intern"]
  }
];

export function evaluateJob(jobId: string) {
  const job = getJobById(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const profile = getUserProfile();
  const skills = getSkills();
  const roleDirections = getRoleDirections();
  const resumes = getResumes();
  const result = buildEvaluation(job, profile, skills, roleDirections, resumes);
  saveJobEvaluation(result);

  return result;
}

export function buildEvaluation(
  job: JobRecord,
  profile: UserProfileRecord,
  skills: SkillRecord[],
  roleDirections: RoleDirectionRecord[],
  resumes: ResumeRecord[]
): JobEvaluationResultInput {
  const jobText = normalize([job.title, job.company, job.location, job.remoteType, job.rawDescription, job.parsedDescription, job.summary].join(" "));
  const roleMatch = detectRoleSignal(jobText);
  const roleDirection = roleDirections.find((direction) => normalize(direction.roleFamily).includes(normalize(roleMatch.archetype.split(" / ")[0])));
  const matchingSkills = skills.filter((skill) => containsAny(jobText, keywordsForSkill(skill.skillName)));
  const matchingTargets = profile.targetRoles.filter((role) => containsAny(jobText, role.toLowerCase().split(/\s+|\/+/).filter((part) => part.length > 3)));
  const constraintRisks = profile.dealBreakers.filter((dealBreaker) => containsAny(jobText, dealBreaker.toLowerCase().split(/\s+|\/+/).filter((part) => part.length > 3)));
  const remoteSignal = remoteScore(job, profile);
  const evidence = resumeEvidenceFor(roleMatch, matchingSkills, resumes);
  const keywords = extractKeywords(jobText, [...roleMatch.keywords, ...matchingSkills.map((skill) => skill.skillName), ...profile.targetRoles]);
  const score = clampScore(
    42 +
      Math.min(22, matchingSkills.length * 4) +
      Math.min(14, matchingTargets.length * 5) +
      (roleDirection ? Math.round(roleDirection.score * 0.18) : 0) +
      remoteSignal.score -
      constraintRisks.length * 12 -
      (roleMatch.archetype === "Avoid" ? 30 : 0)
  );
  const recommendation = recommendationFor(score, constraintRisks, roleMatch.archetype);
  const strengths = [
    ...matchingSkills.slice(0, 5).map((skill) => `${skill.skillName}: ${skill.evidenceSource}`),
    ...matchingTargets.slice(0, 3).map((target) => `Target role alignment: ${target}`)
  ].slice(0, 6);
  const gaps = buildGaps(jobText, profile, roleMatch, matchingSkills, remoteSignal.label);
  const redFlags = buildRedFlags(job, constraintRisks);
  const legitimacyLabel = legitimacyFor(job, redFlags);
  const summary = `${roleMatch.archetype} evaluation for ${job.company}: ${scoreLabelFor(score).toLowerCase()} with ${matchingSkills.length} profile skill signals and ${evidence.length} resume evidence points.`;
  const whyItMatches = strengths.length > 0 ? strengths.slice(0, 3).join("; ") : "Limited direct evidence found. Review the job description manually before investing time.";
  const mainConcern = [...redFlags, ...gaps][0] ?? "No major concern found in the available job text.";
  const salaryNotes = job.salaryNotes && job.salaryNotes !== "Not captured by scanner." ? job.salaryNotes : "Compensation was not captured by the scanner; validate range before prioritizing.";
  const sections = buildSections({
    job,
    profile,
    roleMatch,
    roleDirection,
    strengths,
    gaps,
    redFlags,
    evidence,
    keywords,
    score,
    recommendation,
    legitimacyLabel,
    salaryNotes
  });

  return {
    id: `evaluation-${job.id}`,
    jobId: job.id,
    fitScore: score,
    scoreLabel: scoreLabelFor(score),
    roleArchetype: roleMatch.archetype,
    summary,
    strengths,
    gaps,
    redFlags,
    recommendation,
    resumeBaseRecommendation: roleMatch.resumeBase,
    requirementMatch: strengths,
    resumeEvidence: evidence,
    sections,
    legitimacyLabel,
    keywords,
    userCorrection: {},
    providerUsed: "",
    modelUsed: "",
    tokensUsed: 0,
    generationMs: 0,
    whyItMatches,
    mainConcern,
    salaryNotes
  };
}

function detectRoleSignal(jobText: string) {
  const matches = roleSignals
    .map((signal) => ({
      ...signal,
      count: signal.keywords.filter((keyword) => jobText.includes(keyword)).length
    }))
    .sort((a, b) => b.count - a.count);

  return matches[0]?.count > 0 ? matches[0] : roleSignals[0];
}

function resumeEvidenceFor(roleMatch: RoleSignal, skills: SkillRecord[], resumes: ResumeRecord[]) {
  const terms = new Set([...roleMatch.keywords, ...skills.flatMap((skill) => keywordsForSkill(skill.skillName))]);
  const snippets: string[] = [];

  for (const resume of resumes) {
    for (const item of resume.evidence) {
      if ([...terms].some((term) => normalize(item).includes(term))) {
        snippets.push(`${resume.name}: ${item}`);
        break;
      }
    }
  }

  return snippets.slice(0, 5);
}

function buildGaps(jobText: string, profile: UserProfileRecord, roleMatch: RoleSignal, skills: SkillRecord[], remoteLabel: string) {
  const gaps = new Set<string>();

  if (skills.length < 2) {
    gaps.add("Job text has limited direct overlap with the current skill inventory.");
  }

  if (roleMatch.archetype === "AI Product Strategy" && !jobText.includes("design")) {
    gaps.add("AI strategy signal exists, but product/design leadership scope needs confirmation.");
  }

  if (remoteLabel) {
    gaps.add(remoteLabel);
  }

  for (const constraint of profile.constraints) {
    if (constraint.toLowerCase().includes("strategic") && !containsAny(jobText, ["strategy", "strategic", "leadership", "principal", "director", "head"])) {
      gaps.add("Strategic scope is not obvious in the available job text.");
    }
  }

  return [...gaps].slice(0, 5);
}

function buildRedFlags(job: JobRecord, constraintRisks: string[]) {
  const redFlags = new Set<string>();

  for (const risk of constraintRisks) {
    redFlags.add(`Possible deal breaker: ${risk}`);
  }

  if (job.remoteType === "Onsite" || normalize(job.location).includes("onsite")) {
    redFlags.add("Onsite expectation conflicts with remote/selective hybrid preference.");
  }

  if (!job.salaryNotes || job.salaryNotes === "Not captured by scanner." || job.salaryNotes.toLowerCase().includes("not listed")) {
    redFlags.add("No compensation signal captured.");
  }

  if (!job.rawDescription && !job.parsedDescription) {
    redFlags.add("Only scanner metadata is available; full job description should be reviewed.");
  }

  return [...redFlags].slice(0, 5);
}

function buildSections(input: {
  job: JobRecord;
  profile: UserProfileRecord;
  roleMatch: RoleSignal;
  roleDirection?: RoleDirectionRecord;
  strengths: string[];
  gaps: string[];
  redFlags: string[];
  evidence: string[];
  keywords: string[];
  score: number;
  recommendation: string;
  legitimacyLabel: string;
  salaryNotes: string;
}): EvaluationSections {
  return {
    roleSummary: [
      `Archetype: ${input.roleMatch.archetype}`,
      `Seniority: ${seniorityFor(input.job.title)}`,
      `Remote: ${input.job.remoteType}`,
      `TL;DR: ${input.score}% fit, ${input.recommendation}.`
    ],
    matchWithResume: input.evidence.length > 0 ? input.evidence : ["No resume-lane evidence found from the available job text."],
    levelStrategy: [
      input.roleDirection ? `Role strategy: ${input.roleDirection.fitLevel} lane at ${input.roleDirection.score}%.` : "No exact role-direction record matched; using closest role archetype.",
      "Position seniority through evidence-backed strategy, systems, leadership, and measurable delivery.",
      "Do not add claims that are not supported by resume evidence."
    ],
    compensationDemand: [input.salaryNotes, "Live compensation research is deferred; validate salary before applying."],
    tailoringPlan: [
      `Recommended base: ${input.roleMatch.resumeBase}`,
      ...input.strengths.slice(0, 4).map((strength) => `Emphasize ${strength}.`)
    ],
    interviewPlan: [
      ...input.keywords.slice(0, 6).map((keyword) => `Prepare a STAR+R story for ${keyword}.`),
      "Prepare one answer for tradeoffs, one for stakeholder influence, and one for measurable outcome."
    ],
    postingLegitimacy: [
      `Assessment: ${input.legitimacyLabel}`,
      `Posted: ${formatPostedDate(input.job)}`,
      ...input.redFlags
    ]
  };
}

function remoteScore(job: JobRecord, profile: UserProfileRecord) {
  const remotePreferred = profile.workPreferences.some((preference) => preference.toLowerCase().includes("remote"));
  if (!remotePreferred) {
    return { score: 0, label: "" };
  }

  if (job.remoteType === "Remote" || normalize(job.location).includes("remote")) {
    return { score: 8, label: "" };
  }

  if (job.remoteType === "Hybrid") {
    return { score: -4, label: "Hybrid cadence needs confirmation against remote-first preference." };
  }

  return { score: -12, label: "Onsite requirement conflicts with remote-first preference." };
}

function recommendationFor(score: number, redFlags: string[], archetype: string) {
  if (archetype === "Avoid" || redFlags.length >= 2 || score < 55) return "Skip";
  if (score >= 85) return "Priority apply";
  if (score >= 72) return "Strong apply";
  return "Review manually";
}

function legitimacyFor(job: JobRecord, redFlags: string[]) {
  if (redFlags.some((flag) => flag.includes("Only scanner metadata"))) {
    return "Proceed with Caution";
  }

  if (job.freshnessLabel === "Possibly stale" || redFlags.length > 1) {
    return "Proceed with Caution";
  }

  return "High Confidence";
}

function keywordsForSkill(skill: string) {
  return skill.toLowerCase().split(/\s+|\/+/).filter((part) => part.length > 2);
}

function extractKeywords(jobText: string, candidates: string[]) {
  const keywords = candidates
    .flatMap((candidate) => candidate.toLowerCase().split(/\s+|\/+/))
    .filter((candidate) => candidate.length > 2)
    .filter((candidate) => jobText.includes(candidate));

  return [...new Set(keywords)].slice(0, 15);
}

function seniorityFor(title: string) {
  const text = normalize(title);
  if (containsAny(text, ["head", "director", "vp"])) return "Leadership";
  if (containsAny(text, ["principal", "staff", "lead"])) return "Senior IC / lead";
  if (text.includes("senior")) return "Senior";
  return "Not specified";
}

function containsAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => keyword.length > 0 && value.includes(keyword));
}

function scoreLabelFor(score: number) {
  if (score >= 85) return "Strong fit";
  if (score >= 70) return "Review";
  if (score >= 55) return "Selective";
  return "Weak fit";
}

function clampScore(score: number) {
  return Math.max(20, Math.min(96, score));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
