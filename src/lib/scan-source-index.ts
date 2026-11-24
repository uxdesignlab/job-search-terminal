/**
 * Compact wire format for the Settings → Scan sources table.
 *
 * The table needs every source on the client — counts, column filters, sort, the
 * name search and select-all all work across the whole list, not one page — but
 * at 8,000 sources an array of plain objects plus a separate last-check result
 * list costs well over 1 MB of page before a single row renders. Each source is
 * sent as a short positional tuple instead, with its last check folded in:
 *
 *   [name, careersUrl, flags, industry?, live?]
 *
 * - `careersUrl` drops a leading `https://`, which every URL repeats. Any other
 *   non-empty URL is sent whole behind a `!` marker, so decoding never has to
 *   guess whether a scheme was there (`host:8443/x` looks like one).
 * - `flags` packs the ATS (bits 0–1: 0 none, 1 greenhouse, 2 ashby, 3 lever),
 *   enabled (bit 2) and removable (bit 3).
 * - `industry` is omitted when empty and there is no live entry after it.
 * - `live` is the last whole-list check: a job count (number) for a live board,
 *   `null` for live with no count, `"d"` for dead, or `"u"` / `"u:<error>"` for
 *   unknown. Omitted when the source has never been checked.
 *
 * Plain module, no server-only imports: the server encodes, the client decodes.
 */

export type ScanSourceApiType = "greenhouse" | "ashby" | "lever" | null;

export type ScanSourceRow = {
  name: string;
  careersUrl: string;
  apiType: ScanSourceApiType;
  enabled: boolean;
  removable: boolean;
  industry: string;
};

export type ScanSourceLive = { status: string; jobCount: number | null; error?: string };

type LiveCode = number | null | "d" | "u" | `u:${string}`;

export type PackedScanSource =
  | [string, string, number]
  | [string, string, number, string]
  | [string, string, number, string, LiveCode];

const API_CODES: ScanSourceApiType[] = [null, "greenhouse", "ashby", "lever"];
const ENABLED_BIT = 4;
const REMOVABLE_BIT = 8;

const HTTPS = "https://";
const VERBATIM = "!";

function encodeUrl(url: string): string {
  if (!url) return url;
  return url.startsWith(HTTPS) ? url.slice(HTTPS.length) : VERBATIM + url;
}

function decodeUrl(url: string): string {
  if (!url) return url;
  return url.startsWith(VERBATIM) ? url.slice(VERBATIM.length) : HTTPS + url;
}

function encodeLive(live: ScanSourceLive): LiveCode {
  if (live.status === "valid") return live.jobCount;
  if (live.status === "dead") return "d";
  return live.error ? `u:${live.error}` : "u";
}

function decodeLive(code: LiveCode): ScanSourceLive {
  if (code === null || typeof code === "number") return { status: "valid", jobCount: code };
  if (code === "d") return { status: "dead", jobCount: null };
  return code.length > 2 ? { status: "unknown", jobCount: null, error: code.slice(2) } : { status: "unknown", jobCount: null };
}

export function packScanSources(
  sources: ScanSourceRow[],
  lastCheckResults: ReadonlyArray<{ name: string; status: string; jobCount: number | null; error?: string }> = [],
): PackedScanSource[] {
  const live = new Map(lastCheckResults.map((r) => [r.name, r]));
  return sources.map((s) => {
    const flags =
      Math.max(0, API_CODES.indexOf(s.apiType)) | (s.enabled ? ENABLED_BIT : 0) | (s.removable ? REMOVABLE_BIT : 0);
    const url = encodeUrl(s.careersUrl);
    const check = live.get(s.name);
    if (check) return [s.name, url, flags, s.industry, encodeLive(check)];
    if (s.industry) return [s.name, url, flags, s.industry];
    return [s.name, url, flags];
  });
}

export function unpackScanSources(packed: PackedScanSource[]): {
  sources: ScanSourceRow[];
  live: Map<string, ScanSourceLive>;
} {
  const live = new Map<string, ScanSourceLive>();
  const sources = packed.map((row) => {
    const [name, careersUrl, flags, industry = ""] = row;
    if (row.length === 5) live.set(name, decodeLive(row[4]));
    return {
      name,
      careersUrl: decodeUrl(careersUrl),
      apiType: API_CODES[flags & 3] ?? null,
      enabled: (flags & ENABLED_BIT) !== 0,
      removable: (flags & REMOVABLE_BIT) !== 0,
      industry,
    };
  });
  return { sources, live };
}
