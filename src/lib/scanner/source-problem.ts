/**
 * Explains why a user-added source sits in Settings → Cleanup.
 *
 * Nothing records *why* a source was switched off — the Disable button on a scan
 * summary only writes `enabled = 0`. The evidence that does survive is the error
 * each scan logged (`scan_runs.errors_json`) and the verdict of any later check
 * (Cleanup → Re-check, or Sources → Validate all). This module turns the newest of
 * those into a plain-language reason and a suggested next step.
 *
 * The distinction that matters most to the user is "gone for good" versus "failed
 * once": a board that answered 404 should be removed, but one that timed out, or
 * failed because the computer was offline, is very likely fine and was switched off
 * by mistake. Treating the two alike is what made "Remove all" the only option.
 */

export type SourceProblemKind =
  | "responds"
  | "not-found"
  | "temporary"
  | "refused"
  | "app-error"
  | "malformed"
  | "manual"
  | "other";

export type SourceProblemSuggestion = "re-enable" | "remove" | "re-check";

export type SourceCheckEvidence = {
  status: "valid" | "dead" | "unknown";
  jobCount: number | null;
  error?: string;
  checkedAt: string;
};

export type SourceScanErrorEvidence = {
  error: string;
  at: string;
};

export type SourceProblem = {
  kind: SourceProblemKind;
  /** Short badge text. */
  label: string;
  /** One or two sentences a job seeker can act on. */
  explanation: string;
  suggestion: SourceProblemSuggestion;
  /** The raw message the explanation was derived from, when there is one. */
  detail?: string;
  /** When the evidence was recorded (ISO). */
  evidenceAt?: string;
  /** Where the evidence came from, for the "Last …" line. */
  evidenceSource?: "scan" | "check";
};

/** Display order for filters and grouping — most actionable first. */
export const SOURCE_PROBLEM_ORDER: SourceProblemKind[] = [
  "responds",
  "temporary",
  "app-error",
  "refused",
  "not-found",
  "malformed",
  "other",
  "manual",
];

export const SOURCE_PROBLEM_LABELS: Record<SourceProblemKind, string> = {
  responds: "Works again",
  temporary: "Temporary failure",
  "app-error": "App error",
  refused: "Access refused",
  "not-found": "Board not found",
  malformed: "Address not recognized",
  other: "Other error",
  manual: "Turned off by you",
};

const EXPLANATIONS: Record<Exclude<SourceProblemKind, "responds">, string> = {
  temporary:
    "The board did not answer in time, or your internet connection was down. This usually fixes itself — check it again before removing it.",
  "app-error":
    "An error inside Job Search Terminal stopped this board from being read. The board itself may be fine — check it again.",
  refused:
    "The job site refused the request. The board may be private or switched off by the company.",
  "not-found":
    "The job board address answers “not found”. The company has probably moved to a different job site or closed this board.",
  malformed:
    "The careers address is not a Greenhouse, Lever, or Ashby board, so it cannot be scanned.",
  other: "The board failed with an error that does not fit a known pattern. Check it again to see if it still happens.",
  manual: "No error was recorded for this source. It was switched off by hand.",
};

const SUGGESTIONS: Record<SourceProblemKind, SourceProblemSuggestion> = {
  responds: "re-enable",
  temporary: "re-check",
  "app-error": "re-check",
  refused: "re-check",
  "not-found": "remove",
  malformed: "remove",
  other: "re-check",
  manual: "re-enable",
};

/** Classifies one raw scanner / checker error message. */
export function classifySourceErrorMessage(message: string): Exclude<SourceProblemKind, "responds" | "malformed" | "manual"> {
  const m = message.toLowerCase();
  // First: a code error can mention a timeout constant ("FETCH_TIMEOUT_MS is not
  // defined") and must not be read as the board timing out.
  if (
    m.includes("is not defined") ||
    m.includes("is not a function") ||
    m.includes("cannot read propert") ||
    m.includes("referenceerror") ||
    m.includes("typeerror")
  ) {
    return "app-error";
  }
  if (/\bhttp 40[4]\b|\bhttp 410\b/.test(m)) return "not-found";
  if (/\bhttp 40[13]\b/.test(m)) return "refused";
  if (
    /\bhttp (408|425|429|5\d\d)\b/.test(m) ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("abort") ||
    m.includes("could not be resolved") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("socket") ||
    /\b(enotfound|econnreset|econnrefused|etimedout|eai_again|enetunreach|getaddrinfo)\b/.test(m)
  ) {
    return "temporary";
  }
  return "other";
}

function isNewer(a: string | undefined, b: string | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta)) return false;
  if (!Number.isFinite(tb)) return true;
  return ta >= tb;
}

function fromKind(
  kind: Exclude<SourceProblemKind, "responds">,
  extra: Pick<SourceProblem, "detail" | "evidenceAt" | "evidenceSource">,
): SourceProblem {
  return {
    kind,
    label: SOURCE_PROBLEM_LABELS[kind],
    explanation: EXPLANATIONS[kind],
    suggestion: SUGGESTIONS[kind],
    ...extra,
  };
}

/**
 * The newest evidence wins: a check made after the scan error describes the board
 * as it is now, and a scan error after an old check means it broke again since.
 */
export function describeSourceProblem(input: {
  /** Null when the careers URL is not a supported ATS. */
  apiType: string | null;
  lastScanError?: SourceScanErrorEvidence;
  lastCheck?: SourceCheckEvidence;
}): SourceProblem {
  if (!input.apiType) return fromKind("malformed", {});

  const { lastScanError, lastCheck } = input;
  if (lastCheck && isNewer(lastCheck.checkedAt, lastScanError?.at)) {
    const at = { evidenceAt: lastCheck.checkedAt, evidenceSource: "check" as const };
    if (lastCheck.status === "valid") {
      const jobs =
        lastCheck.jobCount == null
          ? "The last check reached this board."
          : `The last check reached this board and found ${lastCheck.jobCount} open job${lastCheck.jobCount === 1 ? "" : "s"}.`;
      return {
        kind: "responds",
        label: SOURCE_PROBLEM_LABELS.responds,
        explanation: `${jobs} Turn it back on to include it in scans.`,
        suggestion: "re-enable",
        ...at,
      };
    }
    if (lastCheck.status === "dead") return fromKind("not-found", { ...at, detail: lastCheck.error ?? "HTTP 404" });
    const detail = lastCheck.error ?? "No answer";
    return fromKind(classifySourceErrorMessage(detail), { ...at, detail });
  }

  if (lastScanError) {
    return fromKind(classifySourceErrorMessage(lastScanError.error), {
      detail: lastScanError.error,
      evidenceAt: lastScanError.at,
      evidenceSource: "scan",
    });
  }

  return fromKind("manual", {});
}
