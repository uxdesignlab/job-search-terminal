import { describe, expect, it } from "vitest";
import { packScanSources, unpackScanSources, type ScanSourceRow } from "@/lib/scan-source-index";

const rows: ScanSourceRow[] = [
  { name: "Acme", careersUrl: "https://jobs.ashbyhq.com/acme", apiType: "ashby", enabled: true, removable: false, industry: "Fintech" },
  { name: "Bolt", careersUrl: "http://bolt.example/careers", apiType: null, enabled: false, removable: true, industry: "" },
  { name: "Crate", careersUrl: "https://job-boards.greenhouse.io/crate", apiType: "greenhouse", enabled: true, removable: true, industry: "" },
  { name: "Dune", careersUrl: "https://jobs.lever.co/dune", apiType: "lever", enabled: false, removable: false, industry: "Games" },
  { name: "Echo", careersUrl: "", apiType: null, enabled: true, removable: true, industry: "" },
  { name: "Fjord", careersUrl: "jobs.fjord.example:8443/open", apiType: null, enabled: true, removable: true, industry: "" },
  { name: "Gale", careersUrl: "https://gale.example:8443/jobs", apiType: null, enabled: true, removable: true, industry: "" },
];

describe("scan source wire format", () => {
  it("round-trips every field", () => {
    expect(unpackScanSources(packScanSources(rows)).sources).toEqual(rows);
  });

  it("folds the last check into the rows and reads it back", () => {
    const packed = packScanSources(rows, [
      { name: "Acme", status: "valid", jobCount: 12 },
      { name: "Bolt", status: "dead", jobCount: null },
      { name: "Crate", status: "unknown", jobCount: null, error: "HTTP 503: try later" },
      { name: "Dune", status: "unknown", jobCount: null },
      { name: "Echo", status: "valid", jobCount: null },
      { name: "Not a source", status: "valid", jobCount: 3 },
    ]);
    const { sources, live } = unpackScanSources(packed);
    expect(sources).toEqual(rows);
    expect(Object.fromEntries(live)).toEqual({
      Acme: { status: "valid", jobCount: 12 },
      Bolt: { status: "dead", jobCount: null },
      Crate: { status: "unknown", jobCount: null, error: "HTTP 503: try later" },
      Dune: { status: "unknown", jobCount: null },
      Echo: { status: "valid", jobCount: null },
    });
  });

  it("leaves unchecked sources without a Live entry", () => {
    const { live } = unpackScanSources(packScanSources(rows, [{ name: "Acme", status: "dead", jobCount: null }]));
    expect([...live.keys()]).toEqual(["Acme"]);
  });

  it("is much smaller than the plain objects it replaces", () => {
    const many: ScanSourceRow[] = Array.from({ length: 8000 }, (_, i) => ({
      name: `company${i}`,
      careersUrl: `https://job-boards.greenhouse.io/company${i}`,
      apiType: "greenhouse",
      enabled: i % 7 !== 0,
      removable: true,
      industry: "",
    }));
    const packed = JSON.stringify(packScanSources(many)).length;
    expect(packed).toBeLessThan(JSON.stringify(many).length / 2);
  });
});
