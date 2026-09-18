import { describe, expect, it } from "vitest";
import { cleanupCandidateReason, isJobProtectedFromAutomaticRemoval, savedJobAgeDays } from "@/lib/jobs/job-protection";
const now = Date.parse("2026-09-18T12:00:00Z");
const job = { status: "Found", archived: false, createdAt: "2026-08-01 12:00:00", userActivityAt: "", livenessStatus: "uncertain", livenessCheckedAt: "2026-09-18T12:00:00Z", livenessReason: "Could not verify" };

describe("cleanup protection", () => {
  it.each(["Reviewed", "Applied", "Rejected", "Skipped", "Resume generated", "Interviewing", "Recruiter responded", "Follow-up needed", "Unknown"])("protects %s", (status) => {
    expect(isJobProtectedFromAutomaticRemoval({ ...job, status }, now)).toBe(true);
    expect(cleanupCandidateReason({ ...job, status }, now)).toBeNull();
  });
  it("protects archived and previously acted-on Found jobs", () => {
    expect(isJobProtectedFromAutomaticRemoval({ ...job, archived: true }, now)).toBe(true);
    expect(isJobProtectedFromAutomaticRemoval({ ...job, userActivityAt: "2026-08-05" }, now)).toBe(true);
  });
  it("uses exactly 24 hours of grace, not the posting/first-seen date", () => {
    expect(isJobProtectedFromAutomaticRemoval({ ...job, createdAt: "2026-09-17T12:00:01Z", firstSeenDate: "2020-01-01" }, now)).toBe(true);
    expect(isJobProtectedFromAutomaticRemoval({ ...job, createdAt: "2026-09-17T12:00:00Z" }, now)).toBe(false);
  });
  it.each([undefined, "", "not a date", "2026-02-30", "2027-01-01"])("keeps invalid/missing/future saved date %s", (createdAt) => {
    expect(savedJobAgeDays(createdAt, now)).toBeNull();
    expect(cleanupCandidateReason({ ...job, createdAt }, now)).toBeNull();
  });
  it("offers only uncertain jobs at the 30 day boundary", () => {
    expect(cleanupCandidateReason({ ...job, createdAt: "2026-08-19T12:00:01Z" }, now)).toBeNull();
    expect(cleanupCandidateReason({ ...job, createdAt: "2026-08-19T12:00:00Z" }, now)).toBe("old_unverified");
    expect(cleanupCandidateReason({ ...job, livenessStatus: "active" }, now)).toBeNull();
    expect(cleanupCandidateReason({ ...job, livenessStatus: "expired" }, now)).toBe("closed");
  });
  it("requires recorded new verification evidence", () => {
    expect(cleanupCandidateReason({ ...job, livenessCheckedAt: "" }, now)).toBeNull();
    expect(cleanupCandidateReason({ ...job, livenessReason: "" }, now)).toBeNull();
  });
});
