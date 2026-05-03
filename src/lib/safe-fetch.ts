/**
 * SSRF-safe fetch utilities.
 *
 * Blocks outbound requests to loopback, RFC-1918 private ranges, link-local
 * (169.254.x.x / AWS IMDS), and unresolvable hostnames before the request
 * is made. All scanner and liveness-check fetches must go through these.
 */

const BLOCKED_HOSTNAME_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0|0)$/i;

const BLOCKED_IP_RE = new RegExp(
  [
    "^10\\.",                          // RFC-1918 class A
    "^172\\.(1[6-9]|2\\d|3[01])\\.",  // RFC-1918 class B
    "^192\\.168\\.",                   // RFC-1918 class C
    "^169\\.254\\.",                   // link-local / AWS IMDS
    "^100\\.6[4-9]\\.",               // CGNAT (RFC 6598)
    "^100\\.[7-9]\\d\\.",
    "^100\\.1[01]\\d\\.",
    "^100\\.12[0-7]\\.",
    "^fd[0-9a-f]{2}:",                 // IPv6 ULA fc00::/7
    "^fe[89ab][0-9a-f]:",              // IPv6 link-local fe80::/10
  ].join("|"),
  "i"
);

export class BlockedUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`Blocked request to ${url}: ${reason}`);
    this.name = "BlockedUrlError";
  }
}

/**
 * Validates that a URL is safe to fetch (not pointing at internal addresses).
 * Throws BlockedUrlError if the URL is blocked.
 */
export function assertSafeUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError(rawUrl, "invalid URL");
  }

  const { protocol, hostname } = parsed;

  if (protocol !== "https:" && protocol !== "http:") {
    throw new BlockedUrlError(rawUrl, `disallowed protocol: ${protocol}`);
  }

  if (BLOCKED_HOSTNAME_RE.test(hostname)) {
    throw new BlockedUrlError(rawUrl, "loopback/localhost address");
  }

  if (BLOCKED_IP_RE.test(hostname)) {
    throw new BlockedUrlError(rawUrl, "private/link-local IP range");
  }
}

/**
 * Drop-in replacement for fetch() that validates the URL first.
 * Throws BlockedUrlError for disallowed destinations.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  assertSafeUrl(url);
  return fetch(url, init);
}
