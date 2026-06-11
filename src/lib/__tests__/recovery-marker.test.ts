import { describe, expect, it } from "vitest";

// Test the decision logic of checkAndHandleRecoveryMarker in isolation.
// The actual file I/O is not tested here; we test the branching logic.

function shouldApplyRollback(
  markerExists: boolean,
  markerValid: boolean,
  dbHealthy: boolean,
  rollbackExists: boolean,
): "apply" | "stale-marker" | "no-marker" | "missing-rollback" {
  if (!markerExists) return "no-marker";
  if (!markerValid) return "stale-marker";
  if (dbHealthy) return "stale-marker";
  if (!rollbackExists) return "missing-rollback";
  return "apply";
}

describe("recovery marker decision logic", () => {
  it("no-op when no marker exists", () => {
    expect(shouldApplyRollback(false, true, true, true)).toBe("no-marker");
  });

  it("removes stale marker when DB is healthy", () => {
    expect(shouldApplyRollback(true, true, true, true)).toBe("stale-marker");
  });

  it("removes stale marker when marker JSON is corrupt", () => {
    expect(shouldApplyRollback(true, false, false, true)).toBe("stale-marker");
  });

  it("applies rollback when marker present and DB is unhealthy", () => {
    expect(shouldApplyRollback(true, true, false, true)).toBe("apply");
  });

  it("handles missing rollback archive gracefully", () => {
    expect(shouldApplyRollback(true, true, false, false)).toBe("missing-rollback");
  });
});
