import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDaysAgo } from "@/lib/dates";

/** Fixed "now" so the day arithmetic is not wall-clock dependent. */
function freezeNow(local: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(local));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDaysAgo", () => {
  it("falls back when there is no timestamp to age", () => {
    expect(formatDaysAgo(null)).toBe("never");
    expect(formatDaysAgo(undefined)).toBe("never");
    expect(formatDaysAgo("")).toBe("never");
    expect(formatDaysAgo("not a date")).toBe("never");
  });

  it("counts calendar days, not elapsed hours", () => {
    // 11pm yesterday is only ~9 hours old but is a different day, and reading
    // "today" the next morning is what makes a staleness cue useless.
    freezeNow("2026-08-27T08:00:00");
    expect(formatDaysAgo(new Date("2026-08-26T23:00:00").toISOString())).toBe("yesterday");
  });

  it("treats anything earlier the same day as today", () => {
    freezeNow("2026-08-27T23:30:00");
    expect(formatDaysAgo(new Date("2026-08-27T00:10:00").toISOString())).toBe("today");
  });

  it("names the previous day and counts the rest", () => {
    freezeNow("2026-08-27T12:00:00");
    expect(formatDaysAgo(new Date("2026-08-26T12:00:00").toISOString())).toBe("yesterday");
    expect(formatDaysAgo(new Date("2026-08-25T12:00:00").toISOString())).toBe("2 days ago");
    expect(formatDaysAgo(new Date("2026-06-27T12:00:00").toISOString())).toBe("61 days ago");
  });

  it("keeps counting past a long neglect, rather than saturating", () => {
    // The label exists to shame a stale source list; "100 days ago" has to read as
    // 100 days ago, not "a while".
    freezeNow("2026-08-27T12:00:00");
    expect(formatDaysAgo(new Date("2026-05-19T12:00:00").toISOString())).toBe("100 days ago");
    expect(formatDaysAgo(new Date("2025-08-27T12:00:00").toISOString())).toBe("365 days ago");
  });

  it("does not report a future timestamp as negative days", () => {
    freezeNow("2026-08-27T12:00:00");
    expect(formatDaysAgo(new Date("2026-08-29T12:00:00").toISOString())).toBe("today");
  });
});
