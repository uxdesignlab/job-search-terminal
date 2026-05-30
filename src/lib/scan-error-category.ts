/**
 * Classifies ATS / scan fetch failures for dashboard UX (dead vs slow vs other).
 */

export type ScanErrorCategory = "dead_or_unreachable" | "timeout_or_slow" | "other";

export type ScanRunErrorEntry = {
  company: string;
  error: string;
  /** Set by the scanner when known; UI falls back to {@link classifyScanErrorMessage}. */
  category?: ScanErrorCategory;
};

export function classifyScanErrorMessage(message: string): ScanErrorCategory {
  const m = message.toLowerCase();
  if (
    m.includes("fetch timed out") ||
    m.includes("timed out after") ||
    m.includes("operation was aborted") ||
    m.includes("the operation was aborted") ||
    m.includes("this operation was aborted") ||
    m.includes("the user aborted a request")
  ) {
    return "timeout_or_slow";
  }
  if (
    m.includes("http 404") ||
    m.includes("http 410") ||
    m.includes("not found in scan sources") ||
    m.includes("careers url is missing") ||
    m.includes("not a supported ats") ||
    m.includes("cannot determine api")
  ) {
    return "dead_or_unreachable";
  }
  if (
    m.includes("enotfound") ||
    m.includes("econnrefused") ||
    m.includes("getaddrinfo") ||
    m.includes("enetunreach") ||
    m.includes("eai_again")
  ) {
    return "dead_or_unreachable";
  }
  return "other";
}

export function scanErrorCategoryLabel(category: ScanErrorCategory): string {
  switch (category) {
    case "dead_or_unreachable":
      return "Dead or missing";
    case "timeout_or_slow":
      return "Timed out";
    default:
      return "Other error";
  }
}

export function scanErrorCategoryDescription(category: ScanErrorCategory): string {
  switch (category) {
    case "dead_or_unreachable":
      return "Host responded with not found, or the careers URL / API could not be reached.";
    case "timeout_or_slow":
      return "No response within the time limit — the board may be slow or overloaded; the listing may still exist.";
    default:
      return "HTTP or network error that is not clearly a missing listing or a timeout.";
  }
}
