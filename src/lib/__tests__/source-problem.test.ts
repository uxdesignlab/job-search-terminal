import { describe, expect, it } from "vitest";
import { classifySourceErrorMessage, describeSourceProblem } from "@/lib/scanner/source-problem";

describe("classifySourceErrorMessage", () => {
  it.each([
    ["HTTP 404", "not-found"],
    ["HTTP 410", "not-found"],
    ["HTTP 403", "refused"],
    ["HTTP 502", "temporary"],
    ["HTTP 429", "temporary"],
    ["Fetch timed out after 12s — the careers API may be slow or down", "temporary"],
    ["fetch failed", "temporary"],
    // The offline case: DNS failed for every board, which says nothing about the boards.
    [
      "Blocked request to https://boards-api.greenhouse.io/v1/boards/figma/jobs: hostname could not be resolved",
      "temporary",
    ],
    ["getaddrinfo ENOTFOUND api.lever.co", "temporary"],
    ["FETCH_TIMEOUT_MS is not defined", "app-error"],
    ["Cannot read properties of undefined (reading 'jobs')", "app-error"],
    ["Something unexpected", "other"],
  ])("%s → %s", (message, kind) => {
    expect(classifySourceErrorMessage(message)).toBe(kind);
  });
});

describe("describeSourceProblem", () => {
  it("flags an unsupported careers URL before looking at any evidence", () => {
    const p = describeSourceProblem({ apiType: null, lastScanError: { error: "HTTP 502", at: "2026-10-01T00:00:00Z" } });
    expect(p.kind).toBe("malformed");
    expect(p.suggestion).toBe("remove");
  });

  it("says the source was turned off by hand when nothing went wrong", () => {
    expect(describeSourceProblem({ apiType: "greenhouse" }).kind).toBe("manual");
  });

  it("explains a scan error and dates it", () => {
    const p = describeSourceProblem({
      apiType: "greenhouse",
      lastScanError: { error: "HTTP 404", at: "2026-10-01T00:00:00Z" },
    });
    expect(p).toMatchObject({ kind: "not-found", detail: "HTTP 404", evidenceSource: "scan", suggestion: "remove" });
  });

  it("lets a newer check override an older scan error", () => {
    const p = describeSourceProblem({
      apiType: "ashby",
      lastScanError: { error: "Fetch timed out after 12s", at: "2026-10-01T00:00:00Z" },
      lastCheck: { status: "valid", jobCount: 7, checkedAt: "2026-11-01T00:00:00Z" },
    });
    expect(p.kind).toBe("responds");
    expect(p.explanation).toContain("7 open jobs");
    expect(p.suggestion).toBe("re-enable");
  });

  it("ignores a check older than the latest scan error", () => {
    const p = describeSourceProblem({
      apiType: "lever",
      lastScanError: { error: "HTTP 404", at: "2026-11-02T00:00:00Z" },
      lastCheck: { status: "valid", jobCount: 3, checkedAt: "2026-11-01T00:00:00Z" },
    });
    expect(p.kind).toBe("not-found");
  });

  it("maps a dead check verdict to not found and an unknown one by its error", () => {
    expect(
      describeSourceProblem({ apiType: "lever", lastCheck: { status: "dead", jobCount: null, checkedAt: "2026-11-01T00:00:00Z" } })
        .kind,
    ).toBe("not-found");
    expect(
      describeSourceProblem({
        apiType: "lever",
        lastCheck: { status: "unknown", jobCount: null, error: "HTTP 503", checkedAt: "2026-11-01T00:00:00Z" },
      }).kind,
    ).toBe("temporary");
  });
});
