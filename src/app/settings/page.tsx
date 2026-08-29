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
  getProfileSupplements,
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
} from "@/lib/db/queries";
import { Badge, Card, CardDescription, CardHeader, CardTitle, Input, PageHeader, SubmitButton } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { AISettingsForm } from "@/components/ai-settings-form";
import { ResumeOnboardingButton } from "@/components/resume-onboarding-button";
import { maskApiKey } from "@/lib/ai/masked-key";
import { TitleFiltersEditor } from "@/components/title-filters-editor";
import { ProfileSupplementsEditor } from "@/components/profile-supplements-editor";
import { DiscoveredSourcesButton } from "@/components/discovered-sources-button";
import { ScanJobsForm } from "@/components/scan-jobs-form";
import { ScanSourcesTable, type CompanyScanResultSummary } from "@/components/scan-sources-table";
import { RemoveAllCleanupButton } from "@/components/remove-all-cleanup-button";
import { AggregatorScanButton } from "@/components/aggregator-scan-button";
import { DiceScanButton } from "@/components/dice-scan-button";
import { detectApi, loadScanConfig, runCareerOpsScanner } from "@/lib/scanner/careerops-scanner";
import { runSourceDiscovery, runSearchDiscovery } from "@/lib/scanner/source-discovery";
import type { SourceValidationResult } from "@/lib/scanner/source-validator";
import { cn } from "@/lib/utils";
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

const TABS = [
  { id: "ai", label: "AI Provider" },
  { id: "integrations", label: "Integrations" },
  { id: "sources", label: "Sources" },
  { id: "scan-sources", label: "Scan sources" },
  { id: "cleanup", label: "Cleanup" },
  { id: "preferences", label: "Preferences" },
  { id: "data", label: "Data & Backup" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab = "ai" } = await searchParams;
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

  // Serialised for the client table so the Live column opens on the last check
  // instead of "Not validated" on every row.
  const latestSourceCheck = getLatestSourceCheckRun();
  const lastSourceCheck = latestSourceCheck
    ? { completedAt: latestSourceCheck.completedAt, results: latestSourceCheck.results }
    : undefined;

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
  const scanConfig = loadScanConfig();
  const yamlCompanies = scanConfig.tracked_companies ?? [];
  syncCompanyProfilesFromYaml(yamlCompanies);
  const profileMap = getCompanyProfiles();
  const dbFilters = getTitleFilters();
  const positiveKeywords =
    dbFilters.positive.length > 0 || dbFilters.negative.length > 0
      ? dbFilters.positive
      : (scanConfig.title_filter?.positive ?? []);
  const negativeKeywords =
    dbFilters.positive.length > 0 || dbFilters.negative.length > 0
      ? dbFilters.negative
      : (scanConfig.title_filter?.negative ?? []);
  const overrides = getScanSourceOverrides();
  const customSources = getCustomScanSources();
  const supplements = getProfileSupplements();
  const scanSchedule = getScanSchedule();

  const yamlNames = new Set(yamlCompanies.map((c) => c.name));

  const allCompanies = [
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

  const allDiscovered = loadDiscoveredSources();
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
    const results = await validateAllSources(
      allCompanies.map((c) => ({ name: c.name, careersUrl: c.careersUrl, apiType: c.apiType }))
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
    const result = await runAggregatorScan({
      adzunaAppId: currentSettings.adzunaAppId,
      adzunaApiKey: currentSettings.adzunaApiKey,
      titles: profile.targetRoles,
      locations: profile.preferredLocations,
      remotePreference: profile.remotePreference,
      freshnessWindowHours: getScanSchedule().freshnessWindowHours,
    });
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

  async function removeCleanupCandidateAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    deleteCustomScanSource(name);
    revalidatePath("/settings");
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
      intervalHours: 6,
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
          description="Configure your AI provider, API keys, and job scan sources."
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
            <AISettingsForm settings={maskedSettings} />
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

        {/* ── Scan sources tab ────────────────────────────────────────────── */}
        {activeTab === "scan-sources" && (
          <Card>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>Scan sources</CardTitle>
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
              sources={allCompanies}
              onToggle={toggleSourceEnabledAction}
              onToggleAll={toggleAllSourcesAction}
              onRemove={removeSourceAction}
              onSaveIndustry={saveIndustryAction}
              onScanCompany={scanCompanyJobsAction}
              onScanAllEnabled={scanAllEnabledCareerSourcesAction}
              onValidateAll={validateAllSourcesAction}
              lastCheck={lastSourceCheck}
            />
          </Card>
        )}

        {/* ── Sources tab ─────────────────────────────────────────────────── */}
        {activeTab === "sources" && (
          <>
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
                      Aggregates from many sources. Requires an App ID and API Key —{" "}
                      configure them in the AI Provider tab.
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
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>Cleanup review</CardTitle>
                <CardDescription>
                  Review disabled or malformed user-added sources. Nothing is removed automatically.
                </CardDescription>
              </div>
              {cleanupCandidates.length > 0 && (
                <RemoveAllCleanupButton
                  names={cleanupCandidates.map((source) => source.name)}
                  onRemoveAll={removeAllCleanupCandidatesAction}
                />
              )}
            </div>
            {cleanupCandidates.length > 0 ? (
              <ul className="grid gap-2">
                {cleanupCandidates.map((source) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2" key={source.name}>
                    <div>
                      <p className="text-sm font-medium text-ink">{source.name}</p>
                      <p className="text-xs text-muted">
                        {!source.apiType ? "Unsupported or malformed ATS URL" : "Disabled user-added source"}
                      </p>
                    </div>
                    <form action={removeCleanupCandidateAction}>
                      <input name="name" type="hidden" value={source.name} />
                      <SubmitButton label="Remove source" savedLabel="Removed" variant="secondary" />
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No user-added sources need cleanup review.</p>
            )}
          </Card>
        )}

        {/* ── Preferences tab ──────────────────────────────────────────────── */}
        {activeTab === "preferences" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Title filters</CardTitle>
                <CardDescription>
                  Only jobs whose titles match a positive keyword (and no negative keyword) are imported.
                  Changes saved here override{" "}
                  <code className="rounded bg-surface px-1 py-0.5 text-xs font-mono">config/portals.yml</code>.
                </CardDescription>
              </CardHeader>
              <TitleFiltersEditor
                initialNegative={negativeKeywords}
                initialPositive={positiveKeywords}
                onSave={saveTitleFiltersAction}
              />
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profile supplements</CardTitle>
                <CardDescription>
                  Add experience or context not captured in your resume — managing teams, domain expertise,
                  certifications. These are injected into the AI when generating any tailored resume to help
                  address identified skill gaps.
                </CardDescription>
              </CardHeader>
              <ProfileSupplementsEditor
                initialSupplements={supplements.map((s) => ({
                  id: s.id,
                  content: s.content,
                  qualityStatus: s.qualityStatus,
                  followUpQuestion: s.followUpQuestion,
                }))}
              />
            </Card>
          </>
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
                <CardTitle>Automatic job scans</CardTitle>
                <CardDescription>
                  While the app is running, check approved sources every six hours and surface newly posted roles.
                </CardDescription>
              </CardHeader>
              <form action={saveScheduleAction} className="grid gap-4">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input defaultChecked={scanSchedule.enabled} name="enabled" type="checkbox" />
                  Enable scans every six hours
                </label>
                <p className="text-xs text-muted">
                  Scans keep postings from the last {scanSchedule.freshnessWindowHours} hours — change this under{" "}
                  <Link className="underline" href="/settings?tab=sources">Sources → Fresh posting window</Link>.
                </p>
                <p className="text-xs text-muted">
                  {scanSchedule.nextRunAt ? `Next scheduled scan: ${scanSchedule.nextRunAt}` : "Scheduling is currently off."}
                </p>
                <div><SubmitButton label="Save schedule" savedLabel="Schedule saved" /></div>
              </form>
            </Card>
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
