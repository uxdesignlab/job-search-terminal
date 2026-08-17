import { tryGetActiveProvider } from "../ai/factory";
import { withRetry } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import { gapSubject } from "./gap-text";

export type GapDraft = {
  /** Proposed answer text, empty when the evidence on file cannot support one. */
  draft: string;
  /** Resume or bank fragments the draft was built from — shown so the user can check it. */
  basedOn: string[];
  /** What the user still has to supply. Populated when `draft` is empty or thin. */
  questions: string[];
  /** `heuristic` means no AI provider was configured and only questions came back. */
  draftedBy: "ai" | "heuristic";
};

type RawDraft = {
  draft?: string;
  basedOn?: unknown;
  questions?: unknown;
};

const MAX_EVIDENCE_CHARS = 6000;

function stringList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, limit)
    : [];
}

/**
 * Ceiling on questions, matching the assessor. Employers, titles, and dates are
 * deliberately absent — they are already on the resume.
 */
const MAX_QUESTIONS = 2;

function fallbackQuestions(gapText: string): string[] {
  const subject = gapSubject(gapText);
  const scaleQuestion = subject
    ? `What scale did you work at for ${subject.charAt(0).toLowerCase()}${subject.slice(1)} — how many people, users, or how large a budget?`
    : "What scale did you work at here — how many people, users, or how large a budget?";
  return [scaleQuestion, "What concrete outcome or deliverable came out of it?"];
}

/**
 * Propose a starting answer for a gap, grounded strictly in evidence already on
 * file. The draft is never saved by this function — it goes back to the UI for
 * the user to edit and approve, because only they can confirm it is true.
 */
export async function draftGapAnswer(gapText: string, evidence: string): Promise<GapDraft> {
  const provider = tryGetActiveProvider();
  const trimmedEvidence = evidence.trim().slice(0, MAX_EVIDENCE_CHARS);

  if (!provider || !trimmedEvidence) {
    return { draft: "", basedOn: [], questions: fallbackQuestions(gapText), draftedBy: "heuristic" };
  }

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You help a job seeker answer a gap an evaluator raised about their resume.

You are given the gap and the candidate's existing evidence (resume text and previously saved answers).

STRICT RULES:
1. Draw ONLY on the supplied evidence. Never invent employers, titles, dates, metrics, technologies, or outcomes.
2. If the evidence does not actually support an answer to this gap, return an empty draft and ask what is missing. An empty draft is the correct answer when the evidence is silent — do not stretch unrelated experience to cover the gap.
3. When you do draft, keep it to 1-3 sentences: where it happened, what the person personally did, the scope, and the result.
4. "basedOn" must quote or closely paraphrase the specific evidence fragments you used, so the candidate can verify each one.
5. "questions": AT MOST ${MAX_QUESTIONS}, and prefer one. Ask only for a fact that would change the wording of a resume bullet — normally the scale (how many people, users, budget) or a concrete outcome. NEVER ask for employers, job titles, dates, or durations; those are already on the resume. NEVER ask the candidate to confirm or re-list something their answer already states.`
    },
    {
      role: "user",
      content: `Gap or red flag:
${gapText}

Candidate's existing evidence:
${trimmedEvidence}

Return this JSON shape:
{"draft":"string","basedOn":["string"],"questions":["string"]}`
    }
  ];

  try {
    const raw = await withRetry(() =>
      provider.generateJSON<RawDraft>(
        messages,
        '{"draft":"string","basedOn":["string"],"questions":["string"]}',
        { maxTokens: 500 }
      )
    );
    const draft = typeof raw.draft === "string" ? raw.draft.trim() : "";
    const questions = stringList(raw.questions, MAX_QUESTIONS);
    return {
      draft,
      basedOn: stringList(raw.basedOn, 5),
      questions: questions.length > 0 ? questions : (draft ? [] : fallbackQuestions(gapText)),
      draftedBy: "ai",
    };
  } catch {
    return { draft: "", basedOn: [], questions: fallbackQuestions(gapText), draftedBy: "heuristic" };
  }
}
