import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));

import { checkJobLiveness } from "@/lib/scanner/liveness-checker";

function respond(body: string, status = 200) {
  mocks.safeFetch.mockResolvedValue({ status, text: async () => body } as unknown as Response);
}

/** Roughly what an unauthenticated LinkedIn job fetch returns for a live posting. */
const LINKEDIN_LOGIN_WALL = `
  <html><body>
    <h1>Sign in to view this job</h1>
    <p>No longer accepting applications</p>
    <a href="/login">Join now</a>
  </body></html>
`;

describe("checkJobLiveness", () => {
  beforeEach(() => {
    mocks.safeFetch.mockReset();
  });

  it("does not trust expiry copy from a session-gated host", async () => {
    respond(LINKEDIN_LOGIN_WALL);
    const result = await checkJobLiveness("https://www.linkedin.com/jobs/view/123");
    expect(result.status).toBe("uncertain");
  });

  it("still trusts a hard 404 from a session-gated host", async () => {
    respond("", 404);
    const result = await checkJobLiveness("https://www.linkedin.com/jobs/view/123");
    expect(result.status).toBe("expired");
  });

  it("still trusts expiry copy from an ordinary host", async () => {
    respond("<p>This position has been filled</p>");
    const result = await checkJobLiveness("https://careers.example.com/jobs/9");
    expect(result.status).toBe("expired");
  });

  it("treats a long page that merely mentions both words as active", async () => {
    // Previously `/opening.*closed/i` matched this via unanchored `.*`.
    respond(
      "<p>We have an opening on the design team. Our office is closed on federal holidays.</p><a>Apply now</a>",
    );
    const result = await checkJobLiveness("https://careers.example.com/jobs/9");
    expect(result.status).toBe("active");
  });

  it("reports a bot-challenge status code as uncertain, never expired", async () => {
    respond("", 403);
    const result = await checkJobLiveness("https://careers.example.com/jobs/9");
    expect(result.status).toBe("uncertain");
  });
});
