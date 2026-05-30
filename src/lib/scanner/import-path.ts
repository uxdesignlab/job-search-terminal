import path from "node:path";

/**
 * Resolves a caller-supplied import file path and asserts it stays inside one of
 * the allowed import directories. Prevents path traversal / arbitrary local file
 * reads through the import API routes (e.g. `{ "filePath": "/etc/passwd" }`).
 *
 * Returns the absolute, normalized path when it is contained within an allowed
 * directory; returns null otherwise.
 */
export function resolveImportFilePathWithin(allowedDirs: string[], candidate: string): string | null {
  const resolved = path.resolve(candidate);
  for (const dir of allowedDirs) {
    const base = path.resolve(dir);
    if (resolved === base) continue; // a directory, not a file
    if (resolved.startsWith(base + path.sep)) return resolved;
  }
  return null;
}
