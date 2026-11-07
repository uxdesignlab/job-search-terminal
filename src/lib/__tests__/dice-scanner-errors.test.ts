import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: fetchMock }));

import { diceToolErrorMessage, runDiceScan } from "@/lib/scanner/dice-scanner";

const OUTAGE =
  "Error calling tool 'search_jobs': Job search failed: DSP login did not return an access token (status: PASSWORD_RESET_REQUIRED)";

function sse(body: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("diceToolErrorMessage", () => {
  it("keeps Dice's reason and drops the tool-call prefix", () => {
    expect(diceToolErrorMessage({ isError: true, content: [{ type: "text", text: OUTAGE }] })).toBe(
      "Dice search failed: Job search failed: DSP login did not return an access token (status: PASSWORD_RESET_REQUIRED)",
    );
  });

  it("says so when Dice gives no reason", () => {
    expect(diceToolErrorMessage({ isError: true })).toBe("Dice search failed with no reason given");
  });
});

describe("runDiceScan when Dice itself is failing", () => {
  afterEach(() => fetchMock.mockReset());

  it("reports the failure once instead of once per title", async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const msg = JSON.parse(init.body);
      if (msg.method === "initialize") return sse({ jsonrpc: "2.0", id: msg.id, result: {} });
      if (msg.method === "notifications/initialized") return new Response(null, { status: 202 });
      return sse({
        jsonrpc: "2.0",
        id: msg.id,
        result: { isError: true, content: [{ type: "text", text: OUTAGE }] },
      });
    });

    const result = await runDiceScan({
      titles: ["Designer", "Design Lead", "Head of Design", "UX Director", "Principal Designer"],
      locations: ["Tennessee, United States"],
      remotePreference: "all",
    });

    expect(result.errors).toEqual([
      "Dice search failed: Job search failed: DSP login did not return an access token (status: PASSWORD_RESET_REQUIRED)",
    ]);
    const searches = fetchMock.mock.calls.filter(([, init]) => JSON.parse(init.body).method === "tools/call");
    expect(searches).toHaveLength(2);
  });

  it("keeps searching when a success comes between two identical failures", async () => {
    let searchCount = 0;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const msg = JSON.parse(init.body);
      if (msg.method === "initialize") return sse({ jsonrpc: "2.0", id: msg.id, result: {} });
      if (msg.method === "notifications/initialized") return new Response(null, { status: 202 });
      searchCount += 1;
      // Searches 1 and 3 fail; search 2 succeeds with no jobs; the rest succeed empty.
      const fails = searchCount === 1 || searchCount === 3;
      return sse({
        jsonrpc: "2.0",
        id: msg.id,
        result: fails
          ? { isError: true, content: [{ type: "text", text: OUTAGE }] }
          : { content: [{ type: "text", text: "[]" }] },
      });
    });

    const result = await runDiceScan({
      titles: ["A", "B", "C", "D", "E"],
      locations: ["Tennessee, United States"],
      remotePreference: "all",
    });

    expect(result.errors).toHaveLength(2);
    expect(searchCount).toBe(5);
  });
});
