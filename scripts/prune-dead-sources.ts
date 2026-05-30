/**
 * Validate every enabled scan source and disable the ones that are dead.
 *
 * "Dead" = HTTP 404 (slug doesn't exist on the ATS).
 * For sources that time out or otherwise fail, we run a second validation
 * pass; only sources that fail BOTH passes are disabled, to avoid disabling
 * a healthy source over a transient network blip.
 *
 * Disabling is non-destructive — it writes a row to scan_source_overrides
 * so the source can be re-enabled from the UI later. YAML and custom
 * sources are both touched.
 *
 * Usage:
 *   npx tsx scripts/prune-dead-sources.ts
 */

import { loadScanConfig } from "../src/lib/scanner/careerops-scanner";
import { validateAllSources, type SourceValidationResult } from "../src/lib/scanner/source-validator";
import { getCustomScanSources, getScanSourceOverrides, setScanSourceEnabled } from "../src/lib/db/queries";

type Source = {
  name: string;
  careersUrl: string;
  apiType: "greenhouse" | "ashby" | "lever" | null;
};

function detectApiType(careersUrl: string, api?: string): Source["apiType"] {
  const probe = api && api.length > 0 ? api : careersUrl;
  if (/greenhouse\.io/i.test(probe)) return "greenhouse";
  if (/ashbyhq\.com/i.test(probe)) return "ashby";
  if (/lever\.co/i.test(probe)) return "lever";
  return null;
}

function collectEnabledSources(): Source[] {
  const config = loadScanConfig();
  const yamlCompanies = config.tracked_companies ?? [];
  const customSources = getCustomScanSources();
  const overrides = getScanSourceOverrides();

  const yamlNames = new Set(yamlCompanies.map((c) => c.name));
  const merged: Array<{ name: string; careersUrl: string; api: string; defaultEnabled: boolean }> = [
    ...yamlCompanies.map((c) => ({
      name: c.name,
      careersUrl: c.careers_url ?? "",
      api: c.api ?? "",
      defaultEnabled: c.enabled !== false,
    })),
    ...customSources
      .filter((c) => !yamlNames.has(c.name))
      .map((c) => ({
        name: c.name,
        careersUrl: c.careersUrl,
        api: c.api,
        defaultEnabled: c.enabled,
      })),
  ];

  return merged
    .filter((s) => (s.name in overrides ? overrides[s.name] : s.defaultEnabled))
    .map((s) => ({
      name: s.name,
      careersUrl: s.careersUrl,
      apiType: detectApiType(s.careersUrl, s.api),
    }))
    .filter((s) => s.apiType !== null);
}

function logProgress(done: number, total: number) {
  if (done % 40 === 0 || done === total) {
    process.stdout.write(`  ${done}/${total}\n`);
  }
}

async function main() {
  const sources = collectEnabledSources();
  console.log(`Validating ${sources.length} enabled sources (pass 1)…`);
  const pass1 = await validateAllSources(sources, logProgress);
  const byName1 = new Map(pass1.map((r) => [r.name, r]));

  const needsRecheck = pass1.filter((r) => r.status === "unknown").map((r) => r.name);
  const recheckMap = new Map<string, SourceValidationResult>();
  if (needsRecheck.length > 0) {
    const recheckSources = sources.filter((s) => needsRecheck.includes(s.name));
    console.log(`\nRe-checking ${recheckSources.length} sources that failed pass 1…`);
    const pass2 = await validateAllSources(recheckSources, logProgress);
    for (const r of pass2) recheckMap.set(r.name, r);
  }

  let disabledDead = 0;
  let disabledTimeout = 0;
  const stillValid: string[] = [];
  const disabled: Array<{ name: string; reason: string }> = [];

  for (const source of sources) {
    const r1 = byName1.get(source.name);
    if (!r1) continue;
    if (r1.status === "dead") {
      setScanSourceEnabled(source.name, false);
      disabled.push({ name: source.name, reason: "HTTP 404" });
      disabledDead++;
      continue;
    }
    if (r1.status === "unknown") {
      const r2 = recheckMap.get(source.name);
      if (r2 && (r2.status === "unknown" || r2.status === "dead")) {
        setScanSourceEnabled(source.name, false);
        const reason = r2.status === "dead" ? "HTTP 404 (pass 2)" : `unreachable: ${r2.error ?? r1.error ?? "timeout"}`;
        disabled.push({ name: source.name, reason });
        disabledTimeout++;
        continue;
      }
    }
    stillValid.push(source.name);
  }

  console.log(`\n── Summary ──`);
  console.log(`Sources checked:        ${sources.length}`);
  console.log(`Still valid:            ${stillValid.length}`);
  console.log(`Disabled (404):         ${disabledDead}`);
  console.log(`Disabled (unreachable): ${disabledTimeout}`);
  console.log(`Total disabled:         ${disabled.length}`);

  if (disabled.length > 0) {
    console.log(`\nDisabled sources:`);
    for (const d of disabled.slice(0, 100)) {
      console.log(`  - ${d.name} (${d.reason})`);
    }
    if (disabled.length > 100) console.log(`  …and ${disabled.length - 100} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
