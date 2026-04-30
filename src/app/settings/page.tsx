import { getAISettings } from "@/lib/db/queries";
import { Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell } from "@/components/ui";
import { AISettingsForm } from "@/components/ai-settings-form";

export default function SettingsPage() {
  const settings = getAISettings();

  return (
    <Shell activeItem="Settings">
      <div className="grid gap-6">
        <PageHeader
          description="Configure your AI provider and API keys for evaluation, resume tailoring, and answer generation."
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
      </div>
    </Shell>
  );
}
