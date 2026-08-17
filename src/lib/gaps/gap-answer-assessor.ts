import { tryGetActiveProvider } from "../ai/factory";
import type { AIMessage } from "../ai/provider";
import type { GapAnswerQualityStatus, JsonValue } from "../db/types";
import { formatGapEvidenceContext, type GapEvidenceContext } from "./evidence-context";
import { gapSubject } from "./gap-text";

export type GapAnswerAssessment = {
  status: GapAnswerQualityStatus;
  /** First entry of `followUpQuestions`, kept for existing callers and rows. */
  followUpQuestion: string;
  /** At most MAX_FOLLOW_UPS questions, each one required to write a resume line. */
  followUpQuestions: string[];
  rationale: string;
  signals: string[];
  assessedBy: "ai" | "heuristic";
};

type RawAssessment = {
  status?: string;
  followUpQuestion?: string;
  followUpQuestions?: unknown;
  rationale?: string;
  signals?: unknown;
};

/**
 * Hard ceiling on follow-ups. A gap answer exists to support one or two resume
 * bullets; interrogating the user past that point costs more than the bullet is
 * worth and makes the loop feel endless.
 */
const MAX_FOLLOW_UPS = 2;

const GENERIC_FOLLOW_UP = "Roughly what scale did you work at here — team size, users, or budget?";

function followUpFor(gapText: string): string {
  const subject = gapSubject(gapText);
  if (!subject) return GENERIC_FOLLOW_UP;
  return `Roughly what scale did you work at for ${subject.charAt(0).toLowerCase()}${subject.slice(1)} — how many people, users, or how large a budget?`;
}

function hasConcreteContext(answer: string): boolean {
  return /\b(at|for|with|while|during|as|on|within)\b.+\b(team|role|project|program|client|company|org|organization|initiative|launch|platform|product)\b/i.test(answer)
    || /\b(my role|project|program|initiative|team|client|stakeholder|vendor|partner|portfolio|selected companies)\b/i.test(answer);
}

function hasAction(answer: string): boolean {
  return /\b(led|owned|managed|built|designed|implemented|launched|shipped|created|developed|facilitated|coached|trained|negotiated|analyzed|automated|improved|reduced|increased|delivered|coordinated|partnered|governed|hired|mentored|supervised)\b/i.test(answer);
}

function hasScaleOrOutcome(answer: string): boolean {
  return /\b(\d+|percent|%|users?|teams?|people|reports?|designers?|engineers?|stakeholders?|clients?|revenue|cost|budget|faster|reduced|increased|improved|launched|delivered|saved|promoted)\b/i.test(answer);
}

/**
 * An answer that merely repeats the evaluator's complaint carries no evidence.
 * The job-level modal used to prefill the gap sentence into the answer box, so
 * rows shaped like this exist in the database and must not read as addressed.
 */
function isEchoOfGap(gapText: string, answer: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const gap = normalize(gapText);
  if (gap.length < 20) return false;
  return normalize(answer).includes(gap);
}

function heuristicAssess(gapText: string, answer: string): GapAnswerAssessment {
  const trimmed = answer.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const signals: string[] = [];

  if (hasConcreteContext(trimmed)) signals.push("role_or_project_context");
  if (hasAction(trimmed)) signals.push("personal_action");
  if (hasScaleOrOutcome(trimmed)) signals.push("scale_or_outcome");

  // Where + what + how much is enough to write a truthful bullet. Employers,
  // titles, and dates are not required here — they are already on the resume.
  const strongEnough =
    !isEchoOfGap(gapText, trimmed) &&
    words.length >= 10 &&
    hasConcreteContext(trimmed) &&
    hasAction(trimmed) &&
    hasScaleOrOutcome(trimmed);

  const followUp = followUpFor(gapText);
  return {
    status: strongEnough ? "addressed" : "needs_followup",
    followUpQuestion: strongEnough ? "" : followUp,
    followUpQuestions: strongEnough ? [] : [followUp],
    rationale: strongEnough
      ? "The answer names where this happened, what the candidate did, and at what scale — enough for a resume line."
      : "The answer still needs the scale or result before a resume line can be written from it.",
    signals,
    assessedBy: "heuristic",
  };
}

function coerceAssessment(gapText: string, raw: RawAssessment): GapAnswerAssessment {
  const status: GapAnswerQualityStatus = raw.status === "addressed" ? "addressed" : "needs_followup";

  const listed = Array.isArray(raw.followUpQuestions)
    ? raw.followUpQuestions
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
  const single = raw.followUpQuestion?.trim();
  const merged = listed.length > 0 ? listed : (single ? [single] : []);
  const followUpQuestions = status === "addressed" ? [] : merged.slice(0, MAX_FOLLOW_UPS);

  if (status !== "addressed" && followUpQuestions.length === 0) {
    followUpQuestions.push(followUpFor(gapText));
  }

  const signals = Array.isArray(raw.signals)
    ? raw.signals.filter((item): item is string => typeof item === "string").slice(0, 6)
    : [];

  return {
    status,
    followUpQuestion: followUpQuestions[0] ?? "",
    followUpQuestions,
    rationale: raw.rationale?.trim() || "",
    signals,
    assessedBy: "ai",
  };
}

export async function assessGapAnswer(
  gapText: string,
  answer: string,
  context?: GapEvidenceContext
): Promise<GapAnswerAssessment> {
  const trimmed = answer.trim();
  if (!trimmed) {
    const followUp = followUpFor(gapText);
    return {
      status: "needs_followup",
      followUpQuestion: followUp,
      followUpQuestions: [followUp],
      rationale: "Empty answers cannot inform resume tailoring.",
      signals: [],
      assessedBy: "heuristic",
    };
  }

  const provider = tryGetActiveProvider();
  if (!provider) return heuristicAssess(gapText, trimmed);

  const contextBlock = context ? formatGapEvidenceContext(context) : "";

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You check whether a job seeker's answer to a resume gap is usable, and ask for anything still missing.

THE ONLY TEST THAT MATTERS: could a resume writer produce a truthful, specific bullet from the answer plus the facts already on file? If yes, return "addressed". Do not hold out for more.

NEVER ask for:
- Employers, job titles, dates, or durations. These are already on the resume and asking for them again is a defect.
- Anything the answer already states, even loosely. If the answer says the candidate did something at named companies, that is settled — do not ask them to confirm it or re-list the companies.
- Detail that would not change the wording of a resume bullet.

ASK ONLY FOR (in priority order, and only when genuinely absent):
1. Scale — how many people, users, teams, or how large a budget.
2. A concrete outcome or deliverable.

Return AT MOST ${MAX_FOLLOW_UPS} questions, and prefer one. Ask nothing when the answer is usable. Each question must be short, direct, and answerable in a sentence.

An answer that only restates the gap itself contains no evidence — treat it as empty.`
    },
    {
      role: "user",
      content: `Gap or red flag:
${gapText}

Candidate's answer:
${trimmed}
${contextBlock ? `\n${contextBlock}\n` : ""}
Return this JSON shape:
{"status":"addressed|needs_followup","followUpQuestions":["string"],"rationale":"string","signals":["string"]}`
    }
  ];

  try {
    const raw = await provider.generateJSON<RawAssessment>(
      messages,
      '{"status":"needs_followup","followUpQuestions":["string"],"rationale":"string","signals":[]}',
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
    followUpQuestions: assessment.followUpQuestions,
  };
}

/**
 * Read back the persisted question list so the UI never regenerates it.
 *
 * Falls back through: stored list → legacy single-question column → a
 * deterministic scale question derived from the gap. The last step keeps rows
 * whose stale questions were cleared in bulk from rendering a "Needs detail"
 * badge with nothing beside it; the real question arrives on the next save.
 */
export function followUpQuestionsFromJson(
  assessment: JsonValue,
  fallback: string,
  gapText?: string
): string[] {
  const stored = (assessment as { followUpQuestions?: unknown } | null)?.followUpQuestions;
  const questions = Array.isArray(stored)
    ? stored.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (questions.length > 0) return questions.slice(0, MAX_FOLLOW_UPS);
  if (fallback.trim()) return [fallback.trim()];
  return gapText?.trim() ? [followUpFor(gapText)] : [];
}
