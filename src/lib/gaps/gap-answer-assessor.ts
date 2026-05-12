import { tryGetActiveProvider } from "../ai/factory";
import type { AIMessage } from "../ai/provider";
import type { GapAnswerQualityStatus, JsonValue } from "../db/types";

export type GapAnswerAssessment = {
  status: GapAnswerQualityStatus;
  followUpQuestion: string;
  rationale: string;
  signals: string[];
  assessedBy: "ai" | "heuristic";
};

type RawAssessment = {
  status?: string;
  followUpQuestion?: string;
  rationale?: string;
  signals?: unknown;
};

const GENERIC_FOLLOW_UP =
  "Which role, project, or company used this skill, what did you personally do, and what result did it create?";

function cleanGapText(gapText: string): string {
  return gapText
    .replace(/^(no\s+explicit\s+(evidence|proof)\s+of|no\s+direct\s+evidence\s+of|no\s+evidence\s+of|no\s+|lacks?\s+|missing\s+|limited\s+|lack\s+of\s+)/i, "")
    .replace(/\.$/, "")
    .trim()
    .toLowerCase();
}

function followUpFor(gapText: string): string {
  const cleaned = cleanGapText(gapText);
  if (!cleaned) return GENERIC_FOLLOW_UP;
  return `Which role, project, or company used ${cleaned}, what did you personally do, and what result did it create?`;
}

function hasConcreteContext(answer: string): boolean {
  return /\b(at|for|with|while|during|as|on|within)\b.+\b(team|role|project|program|client|company|org|organization|initiative|launch|platform|product)\b/i.test(answer)
    || /\b(my role|project|program|initiative|team|client|stakeholder|vendor|partner|portfolio)\b/i.test(answer);
}

function hasAction(answer: string): boolean {
  return /\b(led|owned|managed|built|designed|implemented|launched|shipped|created|developed|facilitated|coached|trained|negotiated|analyzed|automated|improved|reduced|increased|delivered|coordinated|partnered|governed)\b/i.test(answer);
}

function hasOutcomeOrScope(answer: string): boolean {
  return /\b(\d+|percent|%|users?|teams?|people|reports?|stakeholders?|clients?|months?|weeks?|days?|revenue|cost|timeline|faster|reduced|increased|improved|launched|delivered|saved)\b/i.test(answer);
}

function heuristicAssess(gapText: string, answer: string): GapAnswerAssessment {
  const trimmed = answer.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const signals: string[] = [];

  if (words.length >= 18) signals.push("specific_length");
  if (hasConcreteContext(trimmed)) signals.push("role_or_project_context");
  if (hasAction(trimmed)) signals.push("personal_action");
  if (hasOutcomeOrScope(trimmed)) signals.push("scope_or_outcome");

  const strongEnough =
    words.length >= 18 &&
    hasConcreteContext(trimmed) &&
    hasAction(trimmed) &&
    hasOutcomeOrScope(trimmed);

  return {
    status: strongEnough ? "addressed" : "needs_followup",
    followUpQuestion: strongEnough ? "" : followUpFor(gapText),
    rationale: strongEnough
      ? "The answer includes enough concrete context, action, and scope to inform resume tailoring."
      : "The answer needs a role, project, personal action, and scope or outcome before it should influence resume tailoring.",
    signals,
    assessedBy: "heuristic",
  };
}

function coerceAssessment(gapText: string, raw: RawAssessment): GapAnswerAssessment {
  const status: GapAnswerQualityStatus = raw.status === "addressed" ? "addressed" : "needs_followup";
  const signals = Array.isArray(raw.signals)
    ? raw.signals.filter((item): item is string => typeof item === "string").slice(0, 6)
    : [];

  return {
    status,
    followUpQuestion: status === "addressed" ? "" : (raw.followUpQuestion?.trim() || followUpFor(gapText)),
    rationale: raw.rationale?.trim() || "",
    signals,
    assessedBy: "ai",
  };
}

export async function assessGapAnswer(gapText: string, answer: string): Promise<GapAnswerAssessment> {
  const trimmed = answer.trim();
  if (!trimmed) {
    return {
      status: "needs_followup",
      followUpQuestion: followUpFor(gapText),
      rationale: "Empty answers cannot inform resume tailoring.",
      signals: [],
      assessedBy: "heuristic",
    };
  }

  const provider = tryGetActiveProvider();
  if (!provider) return heuristicAssess(gapText, trimmed);

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You evaluate whether a job seeker's answer to an identified resume gap is specific enough to influence resume tailoring.

Return JSON only. Use status "addressed" only when the answer includes enough factual detail to write truthful resume language:
- where the experience happened, such as role, company, client, team, or project
- what the person personally did
- relevant scope, tools, methods, or stakeholders
- an outcome, deliverable, or concrete proof point

If the answer is vague, generic, aspirational, or missing where the skill was used, return "needs_followup" and one concise follow-up question.`
    },
    {
      role: "user",
      content: `Gap or red flag:
${gapText}

User answer:
${trimmed}

Return this JSON shape:
{"status":"addressed|needs_followup","followUpQuestion":"string","rationale":"string","signals":["string"]}`
    }
  ];

  try {
    const raw = await provider.generateJSON<RawAssessment>(
      messages,
      '{"status":"needs_followup","followUpQuestion":"string","rationale":"string","signals":[]}',
      { maxTokens: 300 }
    );
    return coerceAssessment(gapText, raw);
  } catch {
    return heuristicAssess(gapText, trimmed);
  }
}

export function assessmentToJson(assessment: GapAnswerAssessment): JsonValue {
  return {
    rationale: assessment.rationale,
    signals: assessment.signals,
    assessedBy: assessment.assessedBy,
  };
}
