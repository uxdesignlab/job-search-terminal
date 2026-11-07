import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-fetch", () => ({
  safeFetch: vi.fn(async (url: string) => new Response(JSON.stringify({ jobs: [{}, {}] }), { status: 200, headers: { "x-url": url } })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("validateAllSources with an explicit API URL", () => {
  it("checks the scanner's endpoint for a company-hosted careers page", async () => {
    const { safeFetch } = await import("@/lib/safe-fetch");
    const { validateAllSources } = await import("@/lib/scanner/source-validator");
    const [result] = await validateAllSources([
      {
        name: "Acme",
        careersUrl: "https://acme.com/careers",
        apiType: "greenhouse",
        apiUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      },
    ]);
    expect(result).toMatchObject({ status: "valid", jobCount: 2 });
    expect(vi.mocked(safeFetch).mock.calls[0][0]).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs");
  });

  it("still cannot check a company-hosted page without one", async () => {
    const { validateAllSources } = await import("@/lib/scanner/source-validator");
    const [result] = await validateAllSources([
      { name: "Acme", careersUrl: "https://acme.com/careers", apiType: "greenhouse" },
    ]);
    expect(result).toMatchObject({ status: "unknown", error: "Cannot determine API URL" });
  });
});
