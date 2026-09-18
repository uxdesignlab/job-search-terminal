import { describe, expect, it } from "vitest";
import { applyRangeSelection } from "@/lib/range-selection";
const ids = ["a", "b", "c", "d", "e"];
const run = (selected: string[], anchor: string | null, target: string, checked = true, shift = true, displayed = ids) => [...applyRangeSelection(new Set(selected), displayed, anchor, target, checked, shift)].sort();
describe("checkbox ranges", () => {
  it("selects both inclusive endpoints and intermediate rows", () => expect(run(["b"], "b", "e")).toEqual(["b", "c", "d", "e"]));
  it("works upward and preserves unrelated selections", () => expect(run(["a", "outside"], "e", "c")).toEqual(["a", "c", "d", "e", "outside"]));
  it("deselects a mixed range without toggling unchecked intermediates", () => expect(run(["a", "b", "d", "e"], "b", "d", false)).toEqual(["a", "e"]));
  it("falls back to a single checkbox without a valid anchor", () => {
    expect(run([], null, "c")).toEqual(["c"]);
    expect(run([], "filtered-out", "c")).toEqual(["c"]);
    expect(run([], "a", "c", true, false)).toEqual(["c"]);
  });
  it("follows displayed order and excludes filtered rows", () => expect(run([], "e", "a", true, true, ["e", "c", "a"])).toEqual(["a", "c", "e"]));
  it("cannot reach another page", () => expect(run(["a"], "a", "e", true, true, ["d", "e"])).toEqual(["a", "e"]));
  it("ignores a non-selectable target", () => expect(run(["a"], "a", "disabled", true)).toEqual(["a"]));
});
