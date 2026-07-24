import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Server-only. Extra source-host display names read from `config/source-labels.local.json`,
 * which is gitignored so a local setup can name the boards it scans without publishing
 * that list. Mirrors the `portals.yml` / `portals.example.yml` fallback used by
 * careerops-scanner.
 *
 * Shape: `{ "hosts": { "example.com": "Example Board" } }`
 *
 * Entries here take precedence over the public host list in `job-table-helpers`. When
 * the file is absent, unknown hosts simply render as their bare hostname.
 */
let cached: Array<[string, string]> | null = null;

export function getSourceLabelOverrides(): Array<[string, string]> {
  if (cached) return cached;
  cached = [];
  try {
    const configPath = path.join(process.cwd(), "config", "source-labels.local.json");
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    const hosts = (parsed as { hosts?: unknown })?.hosts;
    if (hosts && typeof hosts === "object") {
      cached = Object.entries(hosts as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([host, label]) => [host.toLowerCase().replace(/^www\./, ""), label]);
    }
  } catch {
    /* the local override file is optional */
  }
  return cached;
}
