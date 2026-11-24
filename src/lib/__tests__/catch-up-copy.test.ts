import { describe, expect, it } from "vitest";
import { catchUpStatusText, joinHosts, rateLimitCardCopy } from "@/lib/catch-up-copy";
import type { CatchUpStatus } from "@/lib/scanner/board-catch-up";

const base: CatchUpStatus = {
  state: "running",
  hosts: ["Greenhouse"],
  total: 2045,
  checked: 805,
  remaining: 1240,
  newJobsCount: 0,
  foundJobIds: [],
  startedAt: "2026-11-24T14:21:00Z",
  finishedAt: null,
  pausedUntil: null,
  etaMinutes: 14,
};

describe("rateLimitCardCopy", () => {
  it("names the host, says it is not the user's fault, and that nothing needs disabling", () => {
    const copy = rateLimitCardCopy({
      hosts: [{ host: "greenhouse", label: "Greenhouse", deferred: 2045, total: 4004 }],
      deferredTotal: 2045,
      alreadyQueued: 0,
    });
    expect(copy.title).toBe("Greenhouse asked us to slow down");
    const text = copy.paragraphs.join(" ");
    expect(text).toContain("4,004 of the companies");
    expect(text).toContain("Nothing is wrong with your setup");
    expect(text).toContain("other 2,045 boards");
    expect(text).toContain("You don't need to disable anything");
    expect(text).not.toMatch(/429|rate limit|queue/i);
  });

  it("explains a scan that only stepped around an earlier check", () => {
    const copy = rateLimitCardCopy({ hosts: [], deferredTotal: 0, alreadyQueued: 12 });
    expect(copy.title).toBe("Some boards are still being checked");
    expect(copy.paragraphs[0]).toContain("12 boards are still being checked");
  });
});

describe("catchUpStatusText", () => {
  it("describes a running check with time left and jobs so far", () => {
    expect(catchUpStatusText({ ...base, newJobsCount: 3 })).toBe(
      "Checking 1,240 more Greenhouse boards in the background · about 14 minutes left · 3 new jobs so far",
    );
  });

  it("says when the check is done, including when it found nothing", () => {
    expect(catchUpStatusText({ ...base, state: "finished", remaining: 0, newJobsCount: 9 })).toBe(
      "Background check done · 9 new jobs added",
    );
    expect(catchUpStatusText({ ...base, state: "finished", remaining: 0 })).toBe("Background check done · nothing new");
  });

  it("is silent when there is nothing to report", () => {
    expect(catchUpStatusText({ ...base, state: "idle" })).toBeNull();
  });

  it("joins several hosts in plain English", () => {
    expect(joinHosts(["Greenhouse", "Lever"])).toBe("Greenhouse and Lever");
  });
});
