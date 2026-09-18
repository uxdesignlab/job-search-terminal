import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: mocks.safeFetch }));
import { checkJobLiveness, verifyJobPosting } from "@/lib/scanner/liveness-checker";
const identity = { title: "Design Director", company: "Acme" };
const employer = "https://careers.example.com/jobs/9";
const board = "https://himalayas.app/companies/acme/jobs/design-director";
const open = '<main><h1>Design Director</h1><p>Acme is hiring. This position is available.</p><a>Apply now</a></main>';
function response(body: string, status = 200, url = employer) { return { status, url, text: async () => body }; }
beforeEach(() => { mocks.safeFetch.mockReset(); });
describe("posting evidence", () => {
  it.each(["<p>Welcome to careers</p>", "<a>Apply now</a>", '<h1>Other role</h1><p>Acme</p><a>Apply now</a>'])("does not infer availability from a working page: %s", async (body) => {
    mocks.safeFetch.mockResolvedValue(response(body));
    expect((await checkJobLiveness(employer, identity)).status).toBe("uncertain");
  });
  it("requires matching identity and does not misread positive availability as closed", async () => {
    mocks.safeFetch.mockResolvedValue(response(open));
    expect((await checkJobLiveness(employer, identity)).status).toBe("active");
  });
  it("does not trust generic apply copy on an aggregator", async () => {
    mocks.safeFetch.mockResolvedValue(response(open, 200, board));
    expect((await checkJobLiveness(board, identity)).status).toBe("uncertain");
  });
  it("does not treat a Remote Rocketship listing as employer proof", async () => {
    const remoteRocketship = "https://www.remoterocketship.com/company/acme/jobs/design-director-united-states-remote";
    mocks.safeFetch.mockResolvedValue(response(open, 200, remoteRocketship));
    expect((await checkJobLiveness(remoteRocketship, identity)).status).toBe("uncertain");
  });
  it.each(["https://careers.example.com/", "https://careers.example.com/jobs", "https://careers.example.com/login"])("treats general redirect %s as uncertain", async (url) => {
    mocks.safeFetch.mockResolvedValue(response(open, 200, url));
    expect((await checkJobLiveness(employer, identity)).status).toBe("uncertain");
  });
  it.each(["Just a moment. Verify you are human", "Sign in to view this job. No longer accepting applications"])("does not trust challenge/login text", async (body) => {
    mocks.safeFetch.mockResolvedValue(response(body));
    expect((await checkJobLiveness(employer, identity)).status).toBe("uncertain");
  });
  it("does not trust LinkedIn closure text without a session", async () => {
    const url = "https://linkedin.com/jobs/view/1";
    mocks.safeFetch.mockResolvedValue(response("No longer accepting applications", 200, url));
    expect((await checkJobLiveness(url, identity)).status).toBe("uncertain");
  });
  it.each([404, 410])("records missing job-specific HTTP %s", async (status) => {
    mocks.safeFetch.mockResolvedValue(response("", status));
    expect((await checkJobLiveness(employer, identity)).status).toBe("expired");
  });
  it.each([403, 429, 500])("keeps HTTP %s uncertain", async (status) => {
    mocks.safeFetch.mockResolvedValue(response("", status));
    expect((await checkJobLiveness(employer, identity)).status).toBe("uncertain");
  });
  it("does not treat unrelated closure copy as a job-specific verdict", async () => {
    mocks.safeFetch.mockResolvedValue(response("<main><p>Some positions are no longer accepting applications.</p></main>"));
    expect((await checkJobLiveness(employer, identity)).status).toBe("uncertain");
  });
  it("detects explicit closure with a working page", async () => {
    mocks.safeFetch.mockResolvedValue(response("<main><h1>This position has been filled</h1></main>"));
    expect((await checkJobLiveness(employer, identity)).status).toBe("expired");
  });
  it("ignores closure copy in scripts and related-job cards", async () => {
    mocks.safeFetch.mockResolvedValue(response(open + '<script>"This position has been filled"</script><aside>Related jobs: this position is closed</aside>'));
    expect((await checkJobLiveness(employer, identity)).status).toBe("active");
  });
  it("uses expiry only from matching structured job data", async () => {
    const schema = (title: string) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title, hiringOrganization: { name: 'Acme' }, validThrough: '2020-01-01' })}</script>`;
    mocks.safeFetch.mockResolvedValue(response(open + schema(identity.title)));
    expect((await checkJobLiveness(employer, identity)).status).toBe("expired");
    mocks.safeFetch.mockResolvedValue(response(open + schema("Other job")));
    expect((await checkJobLiveness(employer, identity)).status).toBe("active");
  });
  it("prefers a matching open employer role over a stale board", async () => {
    mocks.safeFetch.mockImplementation(async (url) => url === employer ? response(open) : response("This job has expired", 200, board));
    expect((await verifyJobPosting({ ...identity, url: board, sourceUrl: board, originalPostingUrl: employer })).status).toBe("active");
    expect(mocks.safeFetch.mock.calls[0][0]).toBe(employer);
  });
  it("uses employer redirect identity, not the source board host", async () => {
    mocks.safeFetch.mockResolvedValue(response(open));
    expect((await checkJobLiveness(board, identity)).status).toBe("active");
  });
  it("network failures remain uncertain", async () => {
    mocks.safeFetch.mockRejectedValue(new Error("offline"));
    expect((await checkJobLiveness(employer, identity)).status).toBe("uncertain");
  });
  it("stops rather than recording cancellation as uncertainty", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(verifyJobPosting({ ...identity, url: employer, sourceUrl: "", originalPostingUrl: "" }, controller.signal)).rejects.toThrow();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });
});
