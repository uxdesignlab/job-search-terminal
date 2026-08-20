import { createHash } from "node:crypto";

/**
 * Contact identity: how two records are recognized as the same person, and how a
 * person is suppressed without keeping what was meant to be forgotten
 * (PRD v0.2.1 §37).
 */

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * LinkedIn URLs arrive with tracking parameters, trailing slashes, locale
 * subdomains and mixed case. Two spellings of one profile must not become two
 * people, so everything except the vanity slug is discarded.
 */
export function normalizeLinkedInUrl(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  const withoutQuery = raw.split(/[?#]/)[0].replace(/\/+$/, "");
  const match = withoutQuery.match(/linkedin\.com\/(?:in|pub)\/([^/]+)/);
  return match ? `linkedin.com/in/${match[1]}` : withoutQuery;
}

/**
 * Identifiers a person can be recognized by, strongest first (§37).
 * Prefixed by type so an email and a provider id can never collide.
 */
export function identityKeys(contact: {
  sourceProvider?: string;
  sourceRecordId?: string;
  linkedinUrl?: string;
  workEmail?: string;
}): string[] {
  const keys: string[] = [];
  if (contact.sourceProvider && contact.sourceProvider !== "manual" && contact.sourceRecordId) {
    keys.push(`${contact.sourceProvider}:${contact.sourceRecordId}`);
  }
  const linkedin = normalizeLinkedInUrl(contact.linkedinUrl ?? "");
  if (linkedin) keys.push(`linkedin:${linkedin}`);
  const email = normalizeEmail(contact.workEmail ?? "");
  if (email) keys.push(`email:${email}`);
  return keys;
}

/**
 * One-way fingerprint for suppression.
 *
 * The point of "Forget this person" is that JST stops holding their details, so
 * storing the identifier in order to recognize it later would defeat the request.
 * A SHA-256 of the prefixed identifier can be recomputed from a future search
 * result and compared, but cannot be read back into an email address or a name.
 */
export function identityFingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function fingerprintsFor(contact: Parameters<typeof identityKeys>[0]): string[] {
  return identityKeys(contact).map(identityFingerprint);
}
