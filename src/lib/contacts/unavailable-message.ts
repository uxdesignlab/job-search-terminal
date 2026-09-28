import type { ContactProviderError, ContactProviderUnavailableReason } from "./provider";

const REASONS: readonly ContactProviderUnavailableReason[] = [
  "network",
  "server_error",
  "request_rejected",
  "bad_response",
  "routine_failed",
  "routine_timeout",
];

/**
 * The query string an outreach action redirects with after a provider failure.
 *
 * Only the reason code and HTTP status travel in the URL — never Clay's response
 * body, which can echo back the company or titles that were searched.
 */
export function providerErrorQuery(error: ContactProviderError): string {
  const params = new URLSearchParams({ tab: "outreach", error: `clay-${error.kind}` });
  if (error.reason) params.set("reason", error.reason);
  if (error.httpStatus) params.set("status", String(error.httpStatus));
  return params.toString();
}

function parseReason(value: string | undefined): ContactProviderUnavailableReason | undefined {
  return REASONS.find((reason) => reason === value);
}

function parseStatus(value: string | undefined): number | undefined {
  if (!value || !/^\d{3}$/.test(value)) return undefined;
  return Number(value);
}

const UNAFFECTED = "No contacts were changed, and everything else in Job Search Terminal still works.";

/**
 * What to tell the user when Clay did not complete a request.
 *
 * Each reason asks something different of them — wait, check their connection,
 * or look at their routine in Clay — so each gets its own sentence. An unknown
 * or missing reason (an old bookmarked URL) falls back to the general wording.
 */
export function clayUnavailableMessage(rawReason: string | undefined, rawStatus: string | undefined): string {
  const reason = parseReason(rawReason);
  const status = parseStatus(rawStatus);
  const code = status ? ` (error ${status})` : "";

  switch (reason) {
    case "network":
      return `Job Search Terminal could not connect to Clay. Check your internet connection, then try again. ${UNAFFECTED}`;
    case "server_error":
      return `Clay had a problem on its side${code}. This is usually temporary — wait a few minutes and try again. ${UNAFFECTED}`;
    case "request_rejected":
      return `Clay turned down the request${code}. Check that the company website or LinkedIn page belongs to the employer, then try again. If it keeps happening, Clay may have changed how its search works. ${UNAFFECTED}`;
    case "bad_response":
      return `Clay answered, but not in the form Job Search Terminal expects. Try again; if it keeps happening, Clay may have changed how its service works. ${UNAFFECTED}`;
    case "routine_failed":
      return "Your Clay email lookup routine reported a failure. Open the routine in Clay to see what went wrong. The contact is unchanged.";
    case "routine_timeout":
      return "Your Clay email lookup routine is taking longer than a minute. It keeps running in Clay — try Find email again in a minute or two. The contact is unchanged.";
    default:
      return `Clay did not complete the request${code}. Try again in a few minutes. ${UNAFFECTED}`;
  }
}
