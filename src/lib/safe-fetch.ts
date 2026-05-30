/**
 * SSRF-safe fetch utilities.
 *
 * Blocks outbound requests to loopback, RFC-1918 private ranges, CGNAT,
 * link-local (169.254.x.x / AWS IMDS), and their IPv6 equivalents before the
 * request is made. All scanner and liveness-check fetches must go through these.
 *
 * Protection happens at three layers:
 *  1. Literal-host check on the URL (fast reject of obvious internal targets).
 *  2. DNS resolution — the hostname is resolved and every returned address is
 *     checked, so a public hostname that points at an internal IP is rejected.
 *  3. Redirects are followed manually and each hop is re-validated, so a remote
 *     server cannot redirect into an internal address.
 *
 * Residual risk: DNS rebinding between the resolution check and the actual
 * connection (TOCTOU) is not fully closed, but the resolution check raises the
 * bar substantially over a hostname-only filter.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

const BLOCKED_IPV4_RE = new RegExp(
  [
    "^127\\.",                          // loopback
    "^10\\.",                           // RFC-1918 class A
    "^172\\.(1[6-9]|2\\d|3[01])\\.",   // RFC-1918 class B
    "^192\\.168\\.",                    // RFC-1918 class C
    "^169\\.254\\.",                    // link-local / AWS IMDS
    "^100\\.6[4-9]\\.",                // CGNAT (RFC 6598) 100.64.0.0/10
    "^100\\.[7-9]\\d\\.",
    "^100\\.1[01]\\d\\.",
    "^100\\.12[0-7]\\.",
    "^0\\.",                            // "this" network / 0.0.0.0
  ].join("|")
);

export class BlockedUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`Blocked request to ${url}: ${reason}`);
    this.name = "BlockedUrlError";
  }
}

function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IPV4_RE.test(ip);
}

function isBlockedIpv6(rawIp: string): boolean {
  const ip = rawIp.toLowerCase();
  if (ip === "::1" || ip === "::") return true;        // loopback / unspecified
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(ip)) return true;               // link-local fe80::/10
  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible addresses
  const mapped = ip.match(/(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

function isBlockedAddress(addr: string): boolean {
  const kind = isIP(addr);
  if (kind === 4) return isBlockedIpv4(addr);
  if (kind === 6) return isBlockedIpv6(addr);
  return false;
}

/** Strips the surrounding brackets from an IPv6 URL host (e.g. "[::1]" -> "::1"). */
function unwrapHost(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

/**
 * Synchronous structural validation: protocol allow-list plus a literal-host
 * check. Does not resolve DNS — use {@link safeFetch} for the full guarantee.
 * Throws BlockedUrlError if the URL is structurally disallowed.
 */
export function assertSafeUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError(rawUrl, "invalid URL");
  }

  const { protocol } = parsed;
  if (protocol !== "https:" && protocol !== "http:") {
    throw new BlockedUrlError(rawUrl, `disallowed protocol: ${protocol}`);
  }

  const host = unwrapHost(parsed.hostname).toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost") || host === "0") {
    throw new BlockedUrlError(rawUrl, "loopback/localhost address");
  }

  if (isIP(host) && isBlockedAddress(host)) {
    throw new BlockedUrlError(rawUrl, "private/link-local IP range");
  }
}

/**
 * Resolves the hostname and asserts every returned address is publicly routable.
 * Throws BlockedUrlError if resolution fails or any address is blocked.
 */
async function assertResolvedHostSafe(rawUrl: string): Promise<void> {
  const host = unwrapHost(new URL(rawUrl).hostname);

  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedUrlError(rawUrl, "private/link-local IP range");
    return;
  }

  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError(rawUrl, "hostname could not be resolved");
  }

  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new BlockedUrlError(rawUrl, `resolves to blocked address ${record.address}`);
    }
  }
}

/**
 * Drop-in replacement for fetch() that validates the URL (and every redirect
 * hop) against the SSRF allow-list before each request is made.
 *
 * Redirects are followed manually so each target is re-validated. When the
 * caller passes `redirect: "manual"` or `redirect: "error"`, the first redirect
 * response is returned untouched (still validated) rather than followed.
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const followRedirects = (init?.redirect ?? "follow") === "follow";
  let currentUrl = url;

  for (let redirects = 0; ; redirects++) {
    assertSafeUrl(currentUrl);
    await assertResolvedHostSafe(currentUrl);

    const response = await fetch(currentUrl, { ...init, redirect: "manual" });

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400 && location;
    if (!isRedirect || !followRedirects) {
      return response;
    }

    if (redirects >= MAX_REDIRECTS) {
      throw new BlockedUrlError(currentUrl, "too many redirects");
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
}
