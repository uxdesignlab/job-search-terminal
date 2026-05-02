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
  getScanSourceOverrides,
  getTitleFilters,
  saveTitleFilters,
  setScanSourceEnabled,
  syncCompanyProfilesFromYaml,
  upsertCompanyProfile,
} from "@/lib/db/queries";
import { Card, CardDescription, CardHeader, CardTitle, Input, PageHeader, SubmitButton } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { AISettingsForm } from "@/components/ai-settings-form";
import { TitleFiltersEditor } from "@/components/title-filters-editor";
import { ProfileSupplementsEditor } from "@/components/profile-supplements-editor";
import { DiscoveredSourcesButton } from "@/components/discovered-sources-button";
import { ScanJobsForm } from "@/components/scan-jobs-form";
import { ScanSourcesTable } from "@/components/scan-sources-table";
import { detectApi, loadScanConfig } from "@/lib/scanner/careerops-scanner";
import { runSourceDiscovery } from "@/lib/scanner/source-discovery";
import { cn } from "@/lib/utils";

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

const TABS = [
  { id: "ai", label: "AI Provider" },
  { id: "sources", label: "Sources" },
  { id: "preferences", label: "Preferences" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab = "ai" } = await searchParams;
  const activeTab = (TABS.some((t) => t.id === rawTab) ? rawTab : "ai") as TabId;

  const settings = getAISettings();
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

  const yamlNames = new Set(yamlCompanies.map((c) => c.name));

  const allCompanies = [
    ...yamlCompanies.map((c) => {
      const api = detectApi(c);
      const yamlDefault = c.enabled !== false;
      const enabled = c.name in overrides ? overrides[c.name] : yamlDefault;
      const industry = profileMap.get(c.name)?.industry ?? c.industry ?? "";
      return {
        name: c.name,
        careersUrl: c.careers_url ?? "",
        apiType: api?.type ?? null,
        enabled,
        isCustom: false as const,
        industry,
      };
    }),
    ...customSources
      .filter((c) => !yamlNames.has(c.name))
      .map((c) => {
        const enabled = c.name in overrides ? overrides[c.name] : c.enabled;
        const industry = profileMap.get(c.name)?.industry ?? "";
        return {
          name: c.name,
          careersUrl: c.careersUrl,
          apiType: atsTypeFromUrl(c.careersUrl, c.api),
          enabled,
          isCustom: true as const,
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

  // ── Server actions ──────────────────────────────────────────────────────────

  async function discoverSourcesAction() {
    "use server";
    await runSourceDiscovery((msg) => {
      console.info(`[discover-sources] ${msg}`);
    });
    revalidatePath("/settings");
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
        <nav className="-mb-px flex gap-1 border-b border-border">
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
            <AISettingsForm settings={settings} />
          </Card>
        )}

        {/* ── Sources tab ─────────────────────────────────────────────────── */}
        {activeTab === "sources" && (
          <>
            <Card>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>Scan sources</CardTitle>
                  <CardDescription>
                    Toggle companies on/off — changes apply on the next scan. Click an industry badge to edit it.
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DiscoveredSourcesButton entries={importableDiscovered} onImport={importDiscoveredAction} />
                  <ScanJobsForm
                    action={discoverSourcesAction}
                    label="Scan for new sources"
                    pendingLabel="Discovering…"
                  />
                </div>
              </div>
              <ScanSourcesTable
                sources={allCompanies}
                onToggle={toggleSourceEnabledAction}
                onToggleAll={toggleAllSourcesAction}
                onRemove={removeSourceAction}
                onSaveIndustry={saveIndustryAction}
              />
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
          </>
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
                initialSupplements={supplements.map((s) => ({ id: s.id, content: s.content }))}
              />
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}
