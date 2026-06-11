import { describe, expect, it } from "vitest";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { existsSync, rmSync } from "node:fs";

// Replicate waitForFileStable logic to unit test it without side effects.
async function waitForFileStable(
  filePath: string,
  maxRetries = 4,
  fsExists: (p: string) => boolean = existsSync,
  fsStat: (p: string) => { size: number } = statSync,
): Promise<boolean> {
  let prevSize = -1;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise<void>((r) => setTimeout(r, 1));
    if (!fsExists(filePath)) return false;
    const size = fsStat(filePath).size;
    if (size > 0 && size === prevSize) return true;
    prevSize = size;
  }
  return fsExists(filePath) && fsStat(filePath).size === prevSize && prevSize > 0;
}

describe("waitForFileStable", () => {
  it("returns false when file does not exist", async () => {
    const result = await waitForFileStable(
      "/nonexistent/path.json",
      4,
      () => false,
      () => ({ size: 0 }),
    );
    expect(result).toBe(false);
  });

  it("returns true when file size is stable and nonzero", async () => {
    let callCount = 0;
    const result = await waitForFileStable(
      "/some/path.json",
      4,
      () => true,
      () => { callCount++; return { size: callCount >= 2 ? 500 : 100 }; },
    );
    expect(result).toBe(true);
  });

  it("returns false when file disappears on second check", async () => {
    let callCount = 0;
    const result = await waitForFileStable(
      "/some/path.json",
      4,
      () => { callCount++; return callCount === 1; }, // only exists on first check
      () => ({ size: 500 }),
    );
    expect(result).toBe(false);
  });

  it("returns false when size is always zero (empty file)", async () => {
    const result = await waitForFileStable(
      "/some/path.json",
      4,
      () => true,
      () => ({ size: 0 }),
    );
    expect(result).toBe(false);
  });
});

describe("watcher startup sweep — file pattern matching", () => {
  const BROWSER_BOARD_FILE_PATTERN =
    /^(job-board|browser-board|linkedin|wellfound|workatastartup|glassdoor|indeed|monster)-jobs-.+\.json$/;

  it("matches valid browser board filenames", () => {
    const valid = [
      "linkedin-jobs-2026-06-11T14-30-00Z.json",
      "wellfound-jobs-2026-06-11T14-30-00Z.json",
      "monster-jobs-2026-06-11T14-30-00Z.json",
      "job-board-jobs-2026-06-11T14-30-00Z.json",
    ];
    for (const f of valid) {
      expect(BROWSER_BOARD_FILE_PATTERN.test(f), `Expected ${f} to match`).toBe(true);
    }
  });

  it("does not match .tmp files", () => {
    expect(BROWSER_BOARD_FILE_PATTERN.test("linkedin-jobs-2026-06-11T14-30-00Z.json.tmp")).toBe(false);
  });

  it("does not match unrelated files", () => {
    expect(BROWSER_BOARD_FILE_PATTERN.test("random-file.json")).toBe(false);
    expect(BROWSER_BOARD_FILE_PATTERN.test(".DS_Store")).toBe(false);
  });

  it("sweeps existing files in directory (integration smoke)", () => {
    const dir = path.join(os.tmpdir(), `jst-watcher-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });

    try {
      writeFileSync(path.join(dir, "linkedin-jobs-test.json"), '{"jobs":[]}');
      writeFileSync(path.join(dir, "skip-me.txt"), "not json");
      writeFileSync(path.join(dir, "linkedin-jobs-test.json.tmp"), "partial");

      const matches = readdirSync(dir).filter(
        (f) => !f.endsWith(".tmp") && BROWSER_BOARD_FILE_PATTERN.test(f),
      );
      expect(matches).toEqual(["linkedin-jobs-test.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
