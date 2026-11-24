import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  addCustomScanSource,
  deleteCustomScanSource,
  getAISettings,
  getCompanyProfiles,
  getCustomScanSources,
  getLatestSourceCheckRun,
  getScanSourceOverrides,
  getScanSchedule,
  getTitleFilters,
  getUserProfile,
  saveTitleFilters,
  setScanSourceEnabled,
  saveScanSchedule,
  syncCompanyProfilesFromYaml,
  upsertCompanyProfile,
  getIntegration,
  getSuppressionCount,
  recordSourceCheckRun,
  getAIProviderStatuses,
  getLatestScanErrorsBySource,
  getSourceRecheckResults,
  recordSourceRecheckResults,
} from "@/lib/db/queries";
import { Badge, Card, CardDescription, CardHeader, CardTitle, Input, PageHeader, SubmitButton } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { AISettingsForm } from "@/components/ai-settings-form";
import { ResumeOnboardingButton } from "@/components/resume-onboarding-button";
import { maskApiKey } from "@/lib/ai/masked-key";
import { TitleFiltersEditor } from "@/components/title-filters-editor";
import { DiscoveredSourcesButton } from "@/components/discovered-sources-button";
import { ScanJobsForm } from "@/components/scan-jobs-form";
import { ScanSourcesTable, type CompanyScanResultSummary } from "@/components/scan-sources-table";
import { CleanupReviewPanel, type CleanupRecheckSummary, type CleanupReviewRow } from "@/components/cleanup-review-panel";
import { describeSourceProblem, type SourceCheckEvidence } from "@/lib/scanner/source-problem";
import { AggregatorScanButton } from "@/components/aggregator-scan-button";
import { DiceScanButton } from "@/components/dice-scan-button";
import { detectApi, loadScanConfig, runCareerOpsScanner, type PortalCompany } from "@/lib/scanner/careerops-scanner";
import { packScanSources } from "@/lib/scan-source-index";
import { runSourceDiscovery, runSearchDiscovery } from "@/lib/scanner/source-discovery";
import type { SourceValidationResult } from "@/lib/scanner/source-validator";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SCAN_INTERVAL_HOURS,
  SCAN_INTERVAL_OPTIONS,
  normalizeScanIntervalHours,
  scanIntervalLabel,
} from "@/lib/scanner/scan-interval";
import { LocalRelativeTimeLabel } from "@/components/local-time-label";
import { AccountBackupPanel } from "@/components/account-backup-panel";
import { clearForgottenContactsAction, disconnectClayAction, saveClayCredentialAction, saveClayRoutineAction, testClayConnectionAction } from "@/app/settings/actions";
import type { IntegrationConnectionStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const DISCOVERED_PATH = path.join(process.cwd(), "data", "discovered-sources.json");

type DiscoveredEntry = {
  slug: string;
  provider: string;
  careersUrl: string;
  apiUrl: string;
  validationStatus: string;
  companyDisplayName?: string | null;
  industry?: string | null;
};

function loadDiscoveredSources(): DiscoveredEntry[] {
  if (!existsSync(DISCOVERED_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(DISCOVERED_PATH, "utf-8")) as { entries?: DiscoveredEntry[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

function atsTypeFromUrl(careersUrl: string, apiUrl: string): "greenhouse" | "ashby" | "lever" | null {
  const detected = detectApi({ name: "", careers_url: careersUrl, api: apiUrl || undefined });
  return detected?.type ?? null;
}

/**
 * Every scan source the table shows: tracked companies from portals.yml plus the
 * user's own, with on/off overrides and industries applied.
 *
 * A plain function so server actions can rebuild the list from the database. An
 * action that closes over the page's copy instead has the whole list encrypted
 * into the page and posted back on every call — about 1.6 MB at 8,000 sources,
 * past Next's 1 MB action body limit.
 */
function listScanSources(
  yamlCompanies: PortalCompany[],
  customSources: ReturnType<typeof getCustomScanSources>,
  overrides: ReturnType<typeof getScanSourceOverrides>,
  profileMap: ReturnType<typeof getCompanyProfiles>,
) {
  const yamlNames = new Set(yamlCompanies.map((c) => c.name));

  return [
    ...yamlCompanies.map((c) => {
      const api = detectApi(c);
      const yamlDefault = c.enabled !== false;
      const enabled = Object.hasOwn(overrides, c.name) ? overrides[c.name] : yamlDefault;
      const industry = profileMap.get(c.name)?.industry ?? c.industry ?? "";
      return {
        name: c.name,
        careersUrl: c.careers_url ?? "",
        apiType: api?.type ?? null,
        enabled,
        removable: false as const,
        industry,
      };
    }),
    ...customSources
      .filter((c) => !yamlNames.has(c.name))
      .map((c) => {
        const enabled = Object.hasOwn(overrides, c.name) ? overrides[c.name] : c.enabled;
        const industry = profileMap.get(c.name)?.industry ?? "";
        return {
          name: c.name,
          careersUrl: c.careersUrl,
          apiType: atsTypeFromUrl(c.careersUrl, c.api),
          enabled,
          removable: true as const,
          industry,
        };
      }),
  ];
}

const CLAY_STATUS_LABEL: Record<IntegrationConnectionStatus, string> = {
  not_connected: "Not connected",
  connected: "Connected",
  invalid_credential: "Key rejected",
  unavailable: "Clay unreachable",
};

/** "Key rejected" is actionable and "unreachable" usually is not — different tones. */
const CLAY_STATUS_TONE: Record<IntegrationConnectionStatus, "neutral" | "success" | "warning" | "danger"> = {
  not_connected: "neutral",
  connected: "success",
  invalid_credential: "danger",
  unavailable: "warning",
};

// Tab ids stay stable for old links; Sources and Scan sources were relabelled in 0.24.0.
const TABS = [
  { id: "ai", label: "AI Provider" },
  { id: "integrations", label: "Integrations" },
  { id: "sources", label: "Scanning" },
  { id: "scan-sources", label: "Companies" },
  { id: "cleanup", label: "Cleanup" },
  { id: "data", label: "Data & Backup" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Tabs that no longer exist, mapped to where their content went. Preferences held
 * Title filters (now on Scanning) and Profile supplements (now on Profile → Resumes);
 * the setup checklist and older help links still point at it.
 */
const LEGACY_TABS: Record<string, TabId> = { preferences: "sources" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: requestedTab = "ai" } = await searchParams;
  const rawTab = LEGACY_TABS[requestedTab] ?? requestedTab;
  const activeTab = (TABS.some((t) => t.id === rawTab) ? rawTab : "ai") as TabId;
  // Masked on read — the raw credential never enters this payload.
  const forgottenCount = getSuppressionCount();
  const clayMetadata = getIntegration("clay")?.metadata as
    { enrichmentRoutineId?: string; autoEnrichSearchResults?: boolean } | undefined;
  const clayRoutineId = String(clayMetadata?.enrichmentRoutineId ?? "");
  const clayAutoEnrich = clayMetadata?.autoEnrichSearchResults === true;
  const clay = getIntegration("clay") ?? {
    maskedCredential: "", hasCredential: false, accountLabel: "",
    connectionStatus: "not_connected" as const, lastTestedAt: null,
  };

  // Which tabs need the scan-source list. Building it reads portals.yml, every
  // custom source and every override, and the profile sync below is a database
  // write — none of which the AI Provider or Integrations tabs should pay for.
  const needsSourceList = activeTab === "scan-sources" || activeTab === "cleanup";
  // Scanning shows the portals.yml title filters when none are saved.
  const needsScanConfig = needsSourceList || activeTab === "sources";

  // Folded into the client table so the Live column opens on the last check
  // instead of "Not validated" on every row.
  const latestSourceCheck = needsSourceList ? getLatestSourceCheckRun() : undefined;

  const settings = getAISettings();
  // Mask keys before they reach the client component — the full value is never
  // serialised into the RSC payload. The form detects the mask sentinel and
  // skips re-saving unchanged fields.
  const maskedSettings = {
    ...settings,
    anthropicApiKey: maskApiKey(settings.anthropicApiKey),
    openaiApiKey: maskApiKey(settings.openaiApiKey),
    geminiApiKey: maskApiKey(settings.geminiApiKey),
    braveSearchApiKey: maskApiKey(settings.braveSearchApiKey),
    adzunaApiKey: maskApiKey(settings.adzunaApiKey),
  };
  const creditStatuses = getAIProviderStatuses().map(({ provider, detectedAt }) => ({ provider, detectedAt }));
  const scanConfig = needsScanConfig ? loadScanConfig() : {};
  const yamlCompanies = needsSourceList ? (scanConfig.tracked_companies ?? []) : [];
  // Industries are only shown on Companies, so only that tab seeds them.
  if (activeTab === "scan-sources") syncCompanyProfilesFromYaml(yamlCompanies);
  const profileMap: ReturnType<typeof getCompanyProfiles> =
    activeTab === "scan-sources" ? getCompanyProfiles() : new Map();
  const dbFilters = getTitleFilters();
  const positiveKeywords =
    dbFilters.positive.length > 0 || dbFilters.negative.length > 0
      ? dbFilters.positive
      : (scanConfig.title_filter?.positive ?? []);
  const negativeKeywords =
    dbFilters.positive.length > 0 || dbFilters.negative.length > 0
      ? dbFilters.negative
      : (scanConfig.title_filter?.negative ?? []);
  const overrides = needsSourceList ? getScanSourceOverrides() : {};
  const customSources = needsSourceList ? getCustomScanSources() : [];
  const scanSchedule = getScanSchedule();

  const allCompanies = listScanSources(yamlCompanies, customSources, overrides, profileMap);

  const allDiscovered = activeTab === "scan-sources" ? loadDiscoveredSources() : [];
  const existingNames = new Set([
    ...yamlCompanies.map((c) => c.name.toLowerCase()),
    ...customSources.map((c) => c.name.toLowerCase()),
  ]);
  const importableDiscovered = allDiscovered.filter(
    (e) => e.validationStatus === "valid" && !existingNames.has(e.slug.toLowerCase())
  );
  const cleanupCandidates = allCompanies.filter(
    (company) => company.removable && (!company.enabled || !company.apiType)
  );
  // Why each candidate is here. Only computed when the tab is open: the scan-error
  // lookup walks every scan run's error list.
  const cleanupRows: CleanupReviewRow[] =
    activeTab === "cleanup" && cleanupCandidates.length > 0
      ? (() => {
          const scanErrors = getLatestScanErrorsBySource();
          const rechecks = getSourceRecheckResults();
          // A full "Validate all" is evidence too; whichever check is newer wins.
          const fullCheck = new Map<string, SourceCheckEvidence>(
            (latestSourceCheck?.results ?? []).map((r) => [
              r.name,
              { status: r.status, jobCount: r.jobCount, error: r.error, checkedAt: latestSourceCheck!.completedAt },
            ])
          );
          return cleanupCandidates.map((source) => {
            const recheck = rechecks.get(source.name);
            const full = fullCheck.get(source.name);
            const lastCheck =
              recheck && (!full || Date.parse(recheck.checkedAt) >= Date.parse(full.checkedAt)) ? recheck : full;
            return {
              name: source.name,
              careersUrl: source.careersUrl,
              canCheck: Boolean(source.apiType),
              problem: describeSourceProblem({
                apiType: source.apiType,
                lastScanError: scanErrors.get(source.name),
                lastCheck,
              }),
            };
          });
        })()
      : [];
  // ── Server actions ──────────────────────────────────────────────────────────

  async function discoverSourcesAction() {
    "use server";
    await runSourceDiscovery((msg) => {
      console.info(`[discover-sources] ${msg}`);
    });
    revalidatePath("/settings");
  }

  async function validateAllSourcesAction(): Promise<SourceValidationResult[]> {
    "use server";
    const { validateAllSources } = await import("@/lib/scanner/source-validator");
    const startedAt = new Date().toISOString();
    const current = listScanSources(
      loadScanConfig().tracked_companies ?? [],
      getCustomScanSources(),
      getScanSourceOverrides(),
      getCompanyProfiles(),
    );
    const results = await validateAllSources(
      current.map((c) => ({ name: c.name, careersUrl: c.careersUrl, apiType: c.apiType }))
    );
    // Persisted so the check outlives the page: this is what the Dashboard's "Last
    // source check" ages, and what pre-fills the Live column on the next visit.
    recordSourceCheckRun({
      startedAt,
      results: results.map((r) => ({
        name: r.name,
        status: r.status,
        jobCount: r.jobCount,
        ...(r.error ? { error: r.error } : {}),
      })),
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return results;
  }

  async function searchDiscoverSourcesAction() {
    "use server";
    const currentSettings = getAISettings();
    if (!currentSettings.braveSearchApiKey) throw new Error("Brave Search API key not configured");
    await runSearchDiscovery(currentSettings.braveSearchApiKey, (msg) => {
      console.info(`[search-discover] ${msg}`);
    });
    revalidatePath("/settings");
  }

  async function runAggregatorScanAction() {
    "use server";
    const currentSettings = getAISettings();
    const profile = getUserProfile();
    const { runAggregatorScan } = await import("@/lib/scanner/aggregator-scanner");
    // Without the title filters this button has no search terms at all — they
    // are where the Adzuna queries now come from, not the target roles.
    const result = await runAggregatorScan(
      {
        adzunaAppId: currentSettings.adzunaAppId,
        adzunaApiKey: currentSettings.adzunaApiKey,
        titles: profile.targetRoles,
        locations: profile.preferredLocations,
        remotePreference: profile.remotePreference,
        titleFilters: getTitleFilters(),
        freshnessWindowHours: getScanSchedule().freshnessWindowHours,
      },
      (msg) => {
        console.info(`[adzuna] ${msg}`);
      },
    );
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
    return result;
  }

  async function runDiceScanAction() {
    "use server";
    const profile = getUserProfile();
    const filters = getTitleFilters();
    const { runDiceScan } = await import("@/lib/scanner/dice-scanner");
    return runDiceScan({
      titles: profile.targetRoles,
      locations: profile.preferredLocations,
      remotePreference: profile.remotePreference,
      freshnessWindowHours: getScanSchedule().freshnessWindowHours,
      titleFilters: { positive: filters.positive, negative: filters.negative },
    });
  }

  async function toggleSourceEnabledAction(name: string, enabled: boolean) {
    "use server";
    setScanSourceEnabled(name, enabled);
    revalidatePath("/settings");
  }

  async function toggleAllSourcesAction(changes: Array<{ name: string; enabled: boolean }>) {
    "use server";
    for (const { name, enabled } of changes) {
      setScanSourceEnabled(name, enabled);
    }
    revalidatePath("/settings");
  }

  async function removeSourceAction(name: string) {
    "use server";
    deleteCustomScanSource(name);
    revalidatePath("/settings");
  }

  async function removeCleanupCandidateAction(name: string) {
    "use server";
    const trimmed = name.trim();
    if (!trimmed) return;
    deleteCustomScanSource(trimmed);
    revalidatePath("/settings");
  }

  /**
   * Asks each named board whether it still answers and remembers the verdict.
   * Deliberately changes nothing else: a board that works again stays off until
   * the user re-enables it, so a check can never quietly add sources to scans.
   */
  async function recheckCleanupSourcesAction(names: string[]): Promise<CleanupRecheckSummary> {
    "use server";
    const { validateAllSources } = await import("@/lib/scanner/source-validator");
    const wanted = new Set(names);
    // Read from the database, not the page's source list: anything a server action
    // closes over is serialized into the request, and the full list of several
    // thousand sources overflows Next's 1 MB action body limit.
    const targets = getCustomScanSources()
      .filter((c) => wanted.has(c.name))
      .map((c) => {
        // Check the same endpoint the scanner reads, not one rebuilt from the careers URL.
        const detected = detectApi({ name: c.name, careers_url: c.careersUrl, api: c.api || undefined });
        return { name: c.name, careersUrl: c.careersUrl, apiType: detected?.type ?? null, apiUrl: detected?.url };
      })
      .filter((c) => c.apiType);
    const results = await validateAllSources(targets);
    recordSourceRecheckResults(
      results.map((r) => ({
        name: r.name,
        status: r.status,
        jobCount: r.jobCount,
        ...(r.error ? { error: r.error } : {}),
        checkedAt: r.checkedAt,
      }))
    );
    revalidatePath("/settings");
    return {
      checked: results.length,
      responds: results.filter((r) => r.status === "valid").length,
      notFound: results.filter((r) => r.status === "dead").length,
      stillFailing: results.filter((r) => r.status === "unknown").length,
    };
  }

  async function reenableCleanupSourcesAction(names: string[]) {
    "use server";
    for (const name of new Set(names.map((n) => n.trim()).filter(Boolean))) {
      setScanSourceEnabled(name, true);
    }
    revalidatePath("/settings");
    revalidatePath("/dashboard");
  }

  /**
   * Clears the review list in one go, deleting only the intersection of two sets:
   * what the page showed the user, and what still qualifies right now.
   *
   * Both halves are load-bearing, in opposite directions. Re-deriving from the
   * database alone would delete a source that became a candidate after this page
   * rendered — never displayed, not in the count the user confirmed. Trusting the
   * submitted list alone would delete one that has since been re-enabled in
   * another tab and no longer qualifies. Neither is acceptable for an
   * irreversible bulk delete, so a source must be in both to go.
   */
  async function removeAllCleanupCandidatesAction(confirmedNames: string[]) {
    "use server";
    const confirmed = new Set(confirmedNames);
    const currentOverrides = getScanSourceOverrides();
    const trackedNames = new Set((loadScanConfig().tracked_companies ?? []).map((c) => c.name));
    for (const source of getCustomScanSources()) {
      if (!confirmed.has(source.name)) continue;
      if (trackedNames.has(source.name)) continue;
      const enabled = Object.hasOwn(currentOverrides, source.name)
        ? currentOverrides[source.name]
        : source.enabled;
      const apiType = atsTypeFromUrl(source.careersUrl, source.api);
      if (!enabled || !apiType) deleteCustomScanSource(source.name);
    }
    revalidatePath("/settings");
  }

  async function saveIndustryAction(name: string, industry: string) {
    "use server";
    upsertCompanyProfile(name, industry);
    revalidatePath("/settings");
  }

  async function addSourceAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const careersUrl = String(formData.get("careersUrl") ?? "").trim();
    const apiUrl = String(formData.get("apiUrl") ?? "").trim();
    if (!name || !careersUrl) return;
    addCustomScanSource(name, careersUrl, apiUrl);
    revalidatePath("/settings");
  }

  async function saveTitleFiltersAction(positive: string[], negative: string[]) {
    "use server";
    saveTitleFilters(positive, negative);
    revalidatePath("/settings");
  }

  async function saveScheduleAction(formData: FormData) {
    "use server";
    saveScanSchedule({
      enabled: formData.get("enabled") === "on",
      intervalHours: normalizeScanIntervalHours(formData.get("intervalHours")),
      freshnessWindowHours: getScanSchedule().freshnessWindowHours,
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
  }

  async function saveFreshnessAction(formData: FormData) {
    "use server";
    const freshness = Number(formData.get("freshnessWindowHours"));
    const freshnessWindowHours = freshness === 24 || freshness === 168 ? freshness : 72;
    const schedule = getScanSchedule();
    saveScanSchedule({
      enabled: schedule.enabled,
      intervalHours: schedule.intervalHours,
      freshnessWindowHours,
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
  }

  async function scanCompanyJobsAction(companyName: string): Promise<CompanyScanResultSummary> {
    "use server";
    const { careerOpsRunToJobSummary } = await import("@/lib/careerops-scan-to-summary");
    const result = await runCareerOpsScanner({
      companyExact: companyName,
      freshnessWindowHours: getScanSchedule().freshnessWindowHours,
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/jobs");
    return careerOpsRunToJobSummary(result, companyName);
  }

  async function scanAllEnabledCareerSourcesAction(): Promise<CompanyScanResultSummary> {
    "use server";
    const { careerOpsRunToJobSummary } = await import("@/lib/careerops-scan-to-summary");
    const result = await runCareerOpsScanner({
      freshnessWindowHours: getScanSchedule().freshnessWindowHours,
    });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/jobs");
    return careerOpsRunToJobSummary(result, "All enabled sources");
  }

  async function importDiscoveredAction(formData: FormData) {
    "use server";
    const discovered = loadDiscoveredSources();
    const entryMap = new Map(discovered.map((e) => [e.slug, e]));
    for (const key of formData.keys()) {
      if (key.startsWith("import_")) {
        const slug = key.slice("import_".length);
        const entry = entryMap.get(slug);
        if (entry) addCustomScanSource(slug, entry.careersUrl, entry.apiUrl);
      }
    }
    for (const key of formData.keys()) {
      if (key.startsWith("industry_")) {
        const slug = key.slice("industry_".length);
        const industry = String(formData.get(key) ?? "").trim();
        if (industry) upsertCompanyProfile(slug, industry);
      }
    }
    revalidatePath("/settings");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Shell activeItem="Settings">
      <div className="grid gap-6">
        <PageHeader
          description="Your AI provider and keys, how and when the app scans, and which companies it checks."
          eyebrow="Settings"
          title="Settings"
        />

        {/* Tab navigation */}
        <nav className="-mb-px flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/settings?tab=${t.id}`}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === t.id
                  ? "-mb-px border-b-2 border-accent text-ink"
                  : "text-muted hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* ── AI Provider tab ─────────────────────────────────────────────── */}
        {activeTab === "ai" && (
          <Card>
            <CardHeader>
              <CardTitle>AI Provider</CardTitle>
              <CardDescription>
                API keys are stored locally in your SQLite database and never sent anywhere except the selected provider.
              </CardDescription>
            </CardHeader>
            <AISettingsForm creditStatuses={creditStatuses} settings={maskedSettings} />
            {/* Second route back into the guided flow, for a user who dismissed it and
                would rather be walked through setup than assemble it tab by tab. */}
            {settings.onboardingDismissed && (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
                <ResumeOnboardingButton />
                <p className="text-xs leading-5 text-muted">
                  Reopens first-run setup on the Dashboard. Nothing already configured is changed.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* ── Companies tab (id scan-sources) ────────────────────────────────────────────── */}
        {activeTab === "scan-sources" && (
          <>
            {/* Add a company */}
            <Card>
              <CardHeader>
                <CardTitle>Add a company</CardTitle>
                <CardDescription>
                  Paste the company&apos;s careers page URL — Greenhouse, Ashby, and Lever are detected automatically.
                </CardDescription>
              </CardHeader>
              <form action={addSourceAction} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
                  <Input label="Company name" name="name" placeholder="Acme Corp" />
                  <Input
                    hint="e.g. https://jobs.ashbyhq.com/acme or https://job-boards.greenhouse.io/acme"
                    label="Careers page URL"
                    name="careersUrl"
                    placeholder="https://jobs.ashbyhq.com/acme"
                    type="url"
                  />
                  <Input
                    hint="Greenhouse only — leave blank for Ashby/Lever"
                    label="API URL (optional)"
                    name="apiUrl"
                    placeholder="https://boards-api.greenhouse.io/…"
                    type="url"
                  />
                </div>
                <div>
                  <SubmitButton label="Add company" savedLabel="Added" variant="primary" />
                </div>
              </form>
            </Card>

          <Card>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>Companies to scan</CardTitle>
                <CardDescription>
                  Toggle companies on/off — changes apply on the next scan. Click an industry badge to edit it.
                  Discovery looks for companies you are not yet tracking and adds them to Discovered sources
                  for you to review — it never turns a source on by itself.
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DiscoveredSourcesButton entries={importableDiscovered} onImport={importDiscoveredAction} />
                <ScanJobsForm
                  action={discoverSourcesAction}
                  label="Crawl for companies"
                  pendingLabel="Crawling…"
                />
                {settings.braveSearchApiKey && (
                  <ScanJobsForm
                    action={searchDiscoverSourcesAction}
                    label="Search for companies"
                    pendingLabel="Searching…"
                  />
                )}
              </div>
            </div>
            <ScanSourcesTable
              packedSources={packScanSources(allCompanies, latestSourceCheck?.results)}
              onToggle={toggleSourceEnabledAction}
              onToggleAll={toggleAllSourcesAction}
              onRemove={removeSourceAction}
              onSaveIndustry={saveIndustryAction}
              onScanCompany={scanCompanyJobsAction}
              onScanAllEnabled={scanAllEnabledCareerSourcesAction}
              onValidateAll={validateAllSourcesAction}
              lastCheckedAt={latestSourceCheck?.completedAt}
            />
          </Card>
          </>
        )}

        {/* ── Sources tab ─────────────────────────────────────────────────── */}
        {activeTab === "sources" && (
          <>
            {/* Automatic scans — lives beside the freshness window it depends on. It
                used to sit under Data & Backup, where nobody looking for "how often
                does it scan" would think to open. */}
            <Card>
              <CardHeader>
                <CardTitle>Automatic scans</CardTitle>
                <CardDescription>
                  While this app is running, it checks your scan sources in the background and adds newly posted
                  roles to Jobs. It never applies to a job or contacts anyone.
                </CardDescription>
              </CardHeader>
              <form action={saveScheduleAction} className="grid gap-4">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input defaultChecked={scanSchedule.enabled} name="enabled" type="checkbox" />
                  Scan automatically
                </label>
                <label className="grid max-w-xs gap-1 text-sm text-ink">
                  How often
                  <select
                    aria-describedby="scan-interval-hint"
                    className="rounded-control border border-border bg-surface px-3 py-2"
                    defaultValue={scanSchedule.intervalHours}
                    name="intervalHours"
                  >
                    {SCAN_INTERVAL_OPTIONS.map((hours) => (
                      <option key={hours} value={hours}>
                        {scanIntervalLabel(hours)}
                        {hours === DEFAULT_SCAN_INTERVAL_HOURS ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs leading-5 text-muted" id="scan-interval-hint">
                  Nothing shorter than 6 hours: more often would use up Adzuna&apos;s free monthly searches and get
                  scans slowed down by the job boards. If the app was closed when a scan was due, it runs shortly
                  after you start the app again.
                </p>
                <p className="text-xs text-muted" role="status">
                  {scanSchedule.runningSince ? (
                    "A scan is running now."
                  ) : scanSchedule.enabled && scanSchedule.nextRunAt ? (
                    <>
                      Next scan <LocalRelativeTimeLabel value={scanSchedule.nextRunAt} />
                    </>
                  ) : (
                    "Automatic scans are off. Scans run only when you start one."
                  )}
                  {scanSchedule.lastRunAt ? (
                    <>
                      {" · "}Last automatic scan <LocalRelativeTimeLabel value={scanSchedule.lastRunAt} />
                    </>
                  ) : null}
                </p>
                <div><SubmitButton label="Save schedule" savedLabel="Schedule saved" /></div>
              </form>
            </Card>

            {/* Fresh posting window */}
            <Card>
              <CardHeader>
                <CardTitle>Fresh posting window</CardTitle>
                <CardDescription>
                  Scans only keep roles posted within this window — older postings are skipped as stale. Applies to
                  company career-site, Dice, and Adzuna scans, both manual and scheduled.
                </CardDescription>
              </CardHeader>
              <form action={saveFreshnessAction} className="grid gap-4">
                <label className="grid max-w-xs gap-1 text-sm text-ink">
                  Keep postings from the last
                  <select className="rounded-control border border-border bg-surface px-3 py-2" defaultValue={scanSchedule.freshnessWindowHours} name="freshnessWindowHours">
                    <option value="24">Last 24 hours</option>
                    <option value="72">Last 72 hours (default)</option>
                    <option value="168">Last 7 days</option>
                  </select>
                </label>
                <div><SubmitButton label="Save window" savedLabel="Window saved" /></div>
              </form>
            </Card>

            {/* Title filters — what a scan keeps. Lived under a "Preferences" tab until
                0.24.0, which shared its name with Profile → Preferences. */}
            <Card>
              <CardHeader>
                <CardTitle>Title filters</CardTitle>
                <CardDescription>
                  Scans keep a job only when its title contains at least one Include word and none of the Exclude
                  words. Adzuna and Himalayas also search with your Include words.
                </CardDescription>
              </CardHeader>
              <TitleFiltersEditor
                initialNegative={negativeKeywords}
                initialPositive={positiveKeywords}
                onSave={saveTitleFiltersAction}
              />
            </Card>

            {/* Job aggregators */}
            <Card>
              <div className="mb-4 space-y-1">
                <CardTitle>Job aggregators</CardTitle>
                <CardDescription>
                  Pull matching jobs directly into your pipeline from aggregator APIs and MCP sources.
                </CardDescription>
              </div>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Dice</p>
                    <p className="text-xs text-muted">Tech-focused job board. Free, no credentials needed.</p>
                  </div>
                  <DiceScanButton onScan={runDiceScanAction} />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Adzuna</p>
                    <p className="text-xs text-muted">
                      Aggregates from many sources. Needs a free App ID and API Key.
                    </p>
                  </div>
                  <AggregatorScanButton
                    onScan={runAggregatorScanAction}
                    hasCredentials={Boolean(settings.adzunaAppId && settings.adzunaApiKey)}
                  />
                </div>
              </div>
            </Card>
          </>
        )}

        {/* ── Cleanup tab ─────────────────────────────────────────────────── */}
        {activeTab === "cleanup" && (
          <Card>
            <div className="mb-4 space-y-1">
              <CardTitle>Cleanup review</CardTitle>
              <CardDescription>
                User-added sources that are switched off or cannot be scanned, with the reason for each. Re-check
                asks the boards again; nothing is turned on or removed unless you click.
              </CardDescription>
            </div>
            <CleanupReviewPanel
              onReenable={reenableCleanupSourcesAction}
              onRecheck={recheckCleanupSourcesAction}
              onRemove={removeCleanupCandidateAction}
              onRemoveAll={removeAllCleanupCandidatesAction}
              rows={cleanupRows}
            />
          </Card>
        )}

        {/* ── Integrations tab (§60, §61) ──────────────────────────────── */}
        {activeTab === "integrations" && (
          <Card>
            <CardHeader>
              <CardTitle>Clay</CardTitle>
              <CardDescription>
                Optional. Connect your own Clay account to find real people around an
                opportunity. Job Search Terminal works normally without it — evaluation,
                resumes, and applications never depend on Clay.
              </CardDescription>
            </CardHeader>

            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={CLAY_STATUS_TONE[clay.connectionStatus]}>
                  {CLAY_STATUS_LABEL[clay.connectionStatus]}
                </Badge>
                {clay.accountLabel ? <span className="text-sm text-muted">{clay.accountLabel}</span> : null}
                {clay.lastTestedAt ? (
                  <span className="text-xs text-muted">Last tested {clay.lastTestedAt}</span>
                ) : null}
              </div>

              <form action={saveClayCredentialAction} className="grid gap-3">
                <Input
                  defaultValue={clay.maskedCredential}
                  label="Clay API key"
                  name="clayApiKey"
                  placeholder="Paste your Clay API key"
                  type="text"
                />
                <p className="text-xs text-muted">
                  Created in Clay under account settings. The key is stored locally and sent
                  only to Clay; this page never receives it back — it shows the last four
                  characters and nothing else. Saving tests the connection using Clay&apos;s
                  identity endpoint, which does not consume any of your search allowance.
                </p>
                <div>
                  <SubmitButton label="Save and test" savedLabel="Saved" />
                </div>
              </form>

              {clay.hasCredential ? (
                <form action={saveClayRoutineAction} className="grid gap-3 border-t border-border pt-4">
                  <Input
                    defaultValue={clayRoutineId}
                    label="Enrichment routine id (optional)"
                    name="enrichmentRoutineId"
                    placeholder="Paste a Clay routine id"
                  />
                  <p className="text-xs text-muted">
                    Clay has no direct &quot;find this person&apos;s email&quot; endpoint — enrichment runs a
                    routine you build in your own Clay workspace. Create one that takes a
                    LinkedIn URL and returns a work email, then paste its id here. Leave blank
                    to skip enrichment; everything else works without it.
                  </p>
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input defaultChecked={clayAutoEnrich} name="autoEnrichSearchResults" type="checkbox" />
                    <span>
                      Look up emails automatically for search results
                      <span className="block text-xs text-muted">
                        Runs the routine once for everyone a search returns, instead of you
                        clicking each person. Clay charges per person enriched either way, so
                        this spends your allowance faster — leave it off to enrich only the
                        people you have decided matter.
                      </span>
                    </span>
                  </label>
                  <div><SubmitButton label="Save enrichment settings" savedLabel="Saved" variant="secondary" /></div>
                </form>
              ) : null}

              {clay.hasCredential ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <form action={testClayConnectionAction}>
                    <SubmitButton label="Test connection" savedLabel="Tested" variant="secondary" />
                  </form>
                  <form action={disconnectClayAction}>
                    <SubmitButton label="Disconnect" savedLabel="Disconnected" variant="quiet" />
                  </form>
                </div>
              ) : null}
            </div>
          </Card>
        )}

        {activeTab === "integrations" && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Forgotten contacts</CardTitle>
              <CardDescription>
                People you chose to forget. Only a one-way fingerprint is kept — enough to
                recognise and discard them if a future search returns them again, and not
                enough to reconstruct who they were.
              </CardDescription>
            </CardHeader>
            <div className="grid gap-3">
              <p className="text-sm text-ink">
                {forgottenCount === 0
                  ? "Nobody is on this list."
                  : `${forgottenCount} fingerprint${forgottenCount === 1 ? "" : "s"} stored.`}
              </p>
              {forgottenCount > 0 && (
                <>
                  <p className="text-xs text-muted">
                    Clearing the list lets those people be added again. It restores nothing —
                    their details were deleted, not archived.
                  </p>
                  <form action={clearForgottenContactsAction}>
                    <SubmitButton label="Clear forgotten list" savedLabel="Cleared" variant="secondary" />
                  </form>
                </>
              )}
            </div>
          </Card>
        )}

        {activeTab === "data" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Account backup and restore</CardTitle>
                <CardDescription>
                  Save one portable archive before migrations, cleanup, or moving this local account to another machine.
                </CardDescription>
              </CardHeader>
              <AccountBackupPanel />
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}
