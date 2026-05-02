import { revalidatePath } from "next/cache";
import {
  addCustomScanSource,
  deleteCustomScanSource,
  getAISettings,
  getCustomScanSources,
  getScanSourceOverrides,
  getTitleFilters,
  saveTitleFilters,
  setScanSourceEnabled
} from "@/lib/db/queries";
import { Badge, Card, CardDescription, CardHeader, CardTitle, Input, PageHeader, SubmitButton } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { AISettingsForm } from "@/components/ai-settings-form";
import { TitleFiltersEditor } from "@/components/title-filters-editor";
import { detectApi, loadScanConfig } from "@/lib/scanner/careerops-scanner";

export const dynamic = "force-dynamic";

function atsTypeFromUrl(careersUrl: string, apiUrl: string): "greenhouse" | "ashby" | "lever" | null {
  const detected = detectApi({ name: "", careers_url: careersUrl, api: apiUrl || undefined });
  return detected?.type ?? null;
}

function AtsTypeBadge({ type }: { type: "greenhouse" | "ashby" | "lever" | null }) {
  if (!type) return <Badge tone="danger">Unknown ATS</Badge>;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return <Badge>{label}</Badge>;
}

export default function SettingsPage() {
  const settings = getAISettings();
  const scanConfig = loadScanConfig();
  const yamlCompanies = scanConfig.tracked_companies ?? [];
  const dbFilters = getTitleFilters();
  // Show DB filters when set; YAML filters as fallback for display
  const positiveKeywords = dbFilters.positive.length > 0 || dbFilters.negative.length > 0
    ? dbFilters.positive
    : (scanConfig.title_filter?.positive ?? []);
  const negativeKeywords = dbFilters.positive.length > 0 || dbFilters.negative.length > 0
    ? dbFilters.negative
    : (scanConfig.title_filter?.negative ?? []);
  const overrides = getScanSourceOverrides();
  const customSources = getCustomScanSources();

  const yamlNames = new Set(yamlCompanies.map((c) => c.name));

  const allCompanies = [
    ...yamlCompanies.map((c) => {
      const api = detectApi(c);
      const yamlDefault = c.enabled !== false;
      const enabled = c.name in overrides ? overrides[c.name] : yamlDefault;
      return { name: c.name, careersUrl: c.careers_url ?? "", apiType: api?.type ?? null, enabled, isCustom: false };
    }),
    ...customSources
      .filter((c) => !yamlNames.has(c.name))
      .map((c) => {
        const enabled = c.name in overrides ? overrides[c.name] : c.enabled;
        return { name: c.name, careersUrl: c.careersUrl, apiType: atsTypeFromUrl(c.careersUrl, c.api), enabled, isCustom: true };
      })
  ];

  async function saveSourceTogglesAction(formData: FormData) {
    "use server";

    for (const key of formData.keys()) {
      if (key.startsWith("enabled_")) {
        const name = key.slice("enabled_".length);
        setScanSourceEnabled(name, formData.get(key) === "on");
      }
    }
    // Persist unchecked boxes (browser omits unchecked checkboxes from form data)
    const checkedNames = new Set(
      [...formData.keys()].filter((k) => k.startsWith("enabled_")).map((k) => k.slice("enabled_".length))
    );
    const config = loadScanConfig();
    const custom = getCustomScanSources();
    const allNames = [...(config.tracked_companies ?? []).map((c) => c.name), ...custom.map((c) => c.name)];
    for (const name of allNames) {
      if (!checkedNames.has(name)) setScanSourceEnabled(name, false);
    }
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

  async function deleteSourceAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "");
    if (name) deleteCustomScanSource(name);
    revalidatePath("/settings");
  }

  async function saveTitleFiltersAction(positive: string[], negative: string[]) {
    "use server";

    saveTitleFilters(positive, negative);
    revalidatePath("/settings");
  }

  return (
    <Shell activeItem="Settings">
      <div className="grid gap-6">
        <PageHeader
          description="Configure your AI provider, API keys, and job scan sources."
          eyebrow="Settings"
          title="Settings"
        />

        <Card>
          <CardHeader>
            <CardTitle>AI Provider</CardTitle>
            <CardDescription>
              API keys are stored locally in your SQLite database and never sent anywhere except the selected provider.
            </CardDescription>
          </CardHeader>
          <AISettingsForm settings={settings} />
        </Card>

        {/* Scan sources with checkbox toggles */}
        <Card>
          <CardHeader>
            <CardTitle>Scan sources</CardTitle>
            <CardDescription>
              Toggle which companies are included in the next scan. Changes take effect immediately.
            </CardDescription>
          </CardHeader>
          <form action={saveSourceTogglesAction}>
            <div className="grid gap-0.5">
              {allCompanies.map((company) => (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 hover:bg-surface"
                  key={company.name}
                >
                  <input
                    className="h-4 w-4 rounded border-border accent-accent"
                    defaultChecked={company.enabled}
                    name={`enabled_${company.name}`}
                    type="checkbox"
                  />
                  <span className="flex-1 text-sm font-medium text-ink">{company.name}</span>
                  <AtsTypeBadge type={company.apiType} />
                  {company.isCustom && <Badge tone="warning">Custom</Badge>}
                  {company.careersUrl ? (
                    <a
                      className="text-xs text-accent hover:underline"
                      href={company.careersUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Careers ↗
                    </a>
                  ) : null}
                  {company.isCustom ? (
                    <button
                      className="text-xs text-muted hover:text-danger"
                      formAction={deleteSourceAction}
                      name="name"
                      type="submit"
                      value={company.name}
                    >
                      Remove
                    </button>
                  ) : null}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <SubmitButton label="Save toggles" savedLabel="Saved" variant="secondary" />
            </div>
          </form>
        </Card>

        {/* Add new company */}
        <Card>
          <CardHeader>
            <CardTitle>Add a company</CardTitle>
            <CardDescription>
              Paste the company&apos;s careers page URL — Greenhouse, Ashby, and Lever are detected automatically from the URL.
            </CardDescription>
          </CardHeader>
          <form action={addSourceAction} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
              <Input
                label="Company name"
                name="name"
                placeholder="Acme Corp"
              />
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

        {/* Title filters — interactive editor */}
        <Card>
          <CardHeader>
            <CardTitle>Title filters</CardTitle>
            <CardDescription>
              Only jobs whose titles match a positive keyword (and no negative keyword) are imported.
              Changes saved here override <code className="rounded bg-surface px-1 py-0.5 text-xs font-mono">config/portals.yml</code>.
            </CardDescription>
          </CardHeader>
          <TitleFiltersEditor
            initialNegative={negativeKeywords}
            initialPositive={positiveKeywords}
            onSave={saveTitleFiltersAction}
          />
        </Card>
      </div>
    </Shell>
  );
}
