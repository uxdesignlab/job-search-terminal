/** Secrets are replaced with `••••` + the last four characters before they cross into
 *  a client component or an API request body, so the full value never lands in an RSC
 *  payload or the browser. Anything that receives a key back from the client must run
 *  it through resolveMaskedKey first — the mask is display text, not a usable
 *  credential (its bullets are U+2022, which cannot even go in an HTTP header). */
export function maskApiKey(key: string): string {
  return key ? `••••${key.slice(-4)}` : "";
}

/** Swap the mask sentinel back for the stored key. Compares against the exact masked
 *  representation rather than a prefix so a key that happens to start with `••••` is
 *  not mistaken for the sentinel. */
export function resolveMaskedKey(submitted: string, stored: string): string {
  if (submitted === maskApiKey(stored)) return stored;
  return submitted;
}
