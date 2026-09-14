import { describe, expect, it } from "vitest";
import { resolveSectionModes, templateFromApprovedSections } from "../documents/resume-generator";
import type { JobRecord, ResumeBuilderSection, UserProfileRecord } from "../db/types";

const section = (id: string, type: ResumeBuilderSection["type"]): ResumeBuilderSection => ({
  id,
  type,
  title: type,
});

describe("resume section modes", () => {
  it("resolves a mode by section type when the lane uses blank-starter ids", () => {
    // A lane created from the blank starter carries ids like "s-summary", while
    // every consumer asks for the mode of "summary". Without the alias the
    // summary was never sent to the AI and never applied back.
    const modes = resolveSectionModes(
      [section("s-header", "header"), section("s-summary", "summary"), section("s-experience", "experience")],
      []
    );

    expect(modes.find((mode) => mode.sectionId === "summary")?.mode).toBe("update");
    expect(modes.find((mode) => mode.sectionId === "experience")?.mode).toBe("update");
    expect(modes.find((mode) => mode.sectionId === "header")?.mode).toBe("keep");
    expect(modes.find((mode) => mode.sectionId === "s-summary")?.mode).toBe("update");
  });

  it("carries a submitted mode onto the type alias", () => {
    const modes = resolveSectionModes(
      [section("s-summary", "summary")],
      [{ sectionId: "s-summary", mode: "keep" }]
    );

    expect(modes.every((mode) => mode.mode === "keep")).toBe(true);
  });

  it("does not let a second section of a type shadow the one addressed by its own id", () => {
    const modes = resolveSectionModes(
      [section("experience", "experience"), section("custom-teaching", "experience")],
      [{ sectionId: "experience", mode: "update" }, { sectionId: "custom-teaching", mode: "keep" }]
    );

    expect(modes.filter((mode) => mode.sectionId === "experience")).toHaveLength(1);
    expect(new Map(modes.map((mode) => [mode.sectionId, mode.mode])).get("experience")).toBe("update");
  });

  it("prints the summary under the heading the approved lane gives it", () => {
    // Every generated resume said "Professional Summary" over an approved "Summary",
    // which made a freshly generated resume look like an older version.
    const profile = { name: "Sam Lee", location: "", portfolio: "" } as UserProfileRecord;
    const job = { title: "Design Director" } as JobRecord;
    const titled = templateFromApprovedSections([{ ...section("summary", "summary"), title: "Summary", text: "Leads design." }], profile, job, []);
    expect(titled.summaryHeading).toBe("Summary");

    const untitled = templateFromApprovedSections([{ ...section("summary", "summary"), title: "", text: "Leads design." }], profile, job, []);
    expect(untitled.summaryHeading).toBe("Professional Summary");
  });
});
