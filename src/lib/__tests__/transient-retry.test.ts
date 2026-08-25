import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));

import {
  computeBackoffMs,
  fetchWithRetry,
  retryAfterMs,
  TRANSIENT_RETRY_STATUS,
  type BackoffConfig,
} from "@/lib/scanner/transient-retry";

const BACKOFF: BackoffConfig = { baseMs: 1_000, factor: 2, jitterMs: 250, maxDelayMs: 10_000 };

/** Retries are driven through an injected sleep so tests never wait on real time. */
const opts = (overrides: Partial<Parameters<typeof fetchWithRetry>[2]> = {}) => ({
  attempts: 3,
  timeoutMs: 15_000,
  backoff: BACKOFF,
  random: () => 0,
  sleep: async () => {},
  ...overrides,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => String(body) });
const fail = (status: number, retryAfter: string | null = null) => ({
  ok: false,
  status,
  headers: { get: () => retryAfter },
});
const aborted = () => Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

beforeEach(() => {
  mocks.safeFetch.mockReset();
});

describe("fetchWithRetry", () => {
  it("returns the read value on the first success", async () => {
    mocks.safeFetch.mockResolvedValue(ok({ results: [1, 2] }));
    const outcome = await fetchWithRetry("https://example.test", (r) => r.json(), opts());
    expect(outcome).toEqual({ kind: "value", value: { results: [1, 2] } });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a transient gateway failure and then succeeds", async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(fail(502))
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok({ results: [] }));
    const outcome = await fetchWithRetry("https://example.test", (r) => r.json(), opts());
    expect(outcome.kind).toBe("value");
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
  });

  it("reports exhaustion with the last retryable status once attempts run out", async () => {
    mocks.safeFetch.mockResolvedValue(fail(502));
    const outcome = await fetchWithRetry("https://example.test", (r) => r.json(), opts());
    expect(outcome).toEqual({ kind: "exhausted", lastStatus: 502, timedOut: false });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
  });

  it("returns a non-retryable status immediately without reading the body", async () => {
    const read = vi.fn();
    mocks.safeFetch.mockResolvedValue(fail(401));
    const outcome = await fetchWithRetry("https://example.test", read, opts());
    expect(outcome).toMatchObject({ kind: "status", status: 401 });
    expect(read).not.toHaveBeenCalled();
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("passes an abort signal on every attempt so a hung request cannot run forever", async () => {
    mocks.safeFetch.mockResolvedValue(ok({}));
    await fetchWithRetry("https://example.test", (r) => r.json(), opts());
    const init = mocks.safeFetch.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("flags exhaustion caused by timeouts distinctly from gateway errors", async () => {
    mocks.safeFetch.mockRejectedValue(aborted());
    const outcome = await fetchWithRetry("https://example.test", (r) => r.json(), opts());
    expect(outcome).toEqual({ kind: "exhausted", lastStatus: null, timedOut: true });
  });

  it("retries a body that terminates mid-read", async () => {
    const terminated = { ok: true, status: 200, json: async () => { throw new Error("terminated"); } };
    mocks.safeFetch.mockResolvedValueOnce(terminated).mockResolvedValueOnce(ok({ results: [] }));
    const outcome = await fetchWithRetry("https://example.test", (r) => r.json(), opts());
    expect(outcome.kind).toBe("value");
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  it("waits the server-supplied Retry-After instead of its own backoff", async () => {
    const slept: number[] = [];
    mocks.safeFetch.mockResolvedValueOnce(fail(429, "5")).mockResolvedValueOnce(ok({}));
    await fetchWithRetry(
      "https://example.test",
      (r) => r.json(),
      opts({ sleep: async (ms: number) => { slept.push(ms); } }),
    );
    expect(slept).toEqual([5_000]);
  });

  it("stops retrying when the server asks for a longer wait than the lane tolerates", async () => {
    const slept: number[] = [];
    mocks.safeFetch.mockResolvedValue(fail(429, "3600"));
    const outcome = await fetchWithRetry(
      "https://example.test",
      (r) => r.json(),
      opts({ sleep: async (ms: number) => { slept.push(ms); } }),
    );
    expect(outcome).toEqual({ kind: "exhausted", lastStatus: 429, timedOut: false, retryAfterMs: 3_600_000 });
    // Crucially: it neither slept for the hour nor kept hammering the endpoint.
    expect(slept).toEqual([]);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("still honours a Retry-After that fits inside the cap", async () => {
    const slept: number[] = [];
    mocks.safeFetch.mockResolvedValueOnce(fail(429, "5")).mockResolvedValueOnce(ok({}));
    const outcome = await fetchWithRetry(
      "https://example.test",
      (r) => r.json(),
      opts({ sleep: async (ms: number) => { slept.push(ms); } }),
    );
    expect(outcome.kind).toBe("value");
    expect(slept).toEqual([5_000]);
  });

  it("does not sleep after the final attempt", async () => {
    const slept: number[] = [];
    mocks.safeFetch.mockResolvedValue(fail(502));
    await fetchWithRetry(
      "https://example.test",
      (r) => r.json(),
      opts({ sleep: async (ms: number) => { slept.push(ms); } }),
    );
    expect(slept).toHaveLength(2);
  });
});

describe("computeBackoffMs", () => {
  it("grows exponentially across attempts", () => {
    const noJitter = () => 0;
    expect(computeBackoffMs(0, null, BACKOFF, noJitter)).toBe(1_000);
    expect(computeBackoffMs(1, null, BACKOFF, noJitter)).toBe(2_000);
    expect(computeBackoffMs(2, null, BACKOFF, noJitter)).toBe(4_000);
  });

  it("lets a server-supplied Retry-After win over backoff", () => {
    expect(computeBackoffMs(2, 1_500, BACKOFF, () => 0)).toBe(1_500);
  });

  it("never exceeds maxDelayMs, however far the exponential schedule runs", () => {
    expect(computeBackoffMs(10, null, BACKOFF, () => 0)).toBe(10_000);
  });

  it("adds jitter so parallel retries do not synchronise", () => {
    expect(computeBackoffMs(0, null, BACKOFF, () => 0.999)).toBeGreaterThan(
      computeBackoffMs(0, null, BACKOFF, () => 0),
    );
  });
});

describe("retryAfterMs", () => {
  const withHeader = (value: string | null) => ({ headers: { get: () => value } });

  it("parses a delay in seconds", () => {
    expect(retryAfterMs(withHeader("7"))).toBe(7_000);
  });

  it("never returns a negative delay for a past date", () => {
    expect(retryAfterMs(withHeader(new Date(Date.now() - 60_000).toUTCString()))).toBe(0);
  });

  it("returns null when the header is absent or unparseable", () => {
    expect(retryAfterMs(withHeader(null))).toBeNull();
    expect(retryAfterMs(withHeader("soon"))).toBeNull();
  });
});

describe("TRANSIENT_RETRY_STATUS", () => {
  it("covers gateway and rate-limit statuses but not client or generic server errors", () => {
    expect([...TRANSIENT_RETRY_STATUS].sort()).toEqual([429, 502, 503, 504]);
    expect(TRANSIENT_RETRY_STATUS.has(404)).toBe(false);
    expect(TRANSIENT_RETRY_STATUS.has(401)).toBe(false);
  });
});
