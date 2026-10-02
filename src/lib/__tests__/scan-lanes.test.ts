import { describe, expect, it } from "vitest";
import { isScanLane, scanLaneHint } from "@/lib/scan-lanes";

describe("scan lanes", () => {
  it("recognises the three sources Disable cannot affect, and nothing else", () => {
    expect(["Adzuna", "Dice", "Himalayas"].every(isScanLane)).toBe(true);
    expect(isScanLane("Acme")).toBe(false);
    expect(isScanLane("himalayas")).toBe(false); // error rows use the exact label
  });

  it("tells the user what to do instead of disabling", () => {
    expect(scanLaneHint("Adzuna")).toContain("Settings → AI Provider");
    expect(scanLaneHint("Himalayas")).toBe("Himalayas is part of every scan, so there is nothing to disable here.");
    expect(scanLaneHint("Acme")).toBeNull();
  });
});
