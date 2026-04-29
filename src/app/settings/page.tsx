import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Select, Shell } from "@/components/ui";

const mockSources = ["Working Nomads", "Hiring Cafe", "Remotive", "Wellfound", "The Muse"];

export default function SettingsPage() {
  return (
    <Shell activeItem="Settings">
      <div className="grid gap-6">
        <PageHeader
          description="Static settings shell for future profile, source, and local app configuration."
          eyebrow="Settings"
          title="Settings"
        />

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Search preferences</CardTitle>
              <CardDescription>Saved preferences for the local search workspace.</CardDescription>
            </CardHeader>
            <div className="grid gap-4">
              <Select label="Remote preference" name="remote-preference">
                <option>Remote first</option>
                <option>Hybrid considered</option>
                <option>Local only</option>
              </Select>
              <Select label="Search mode" name="search-mode">
                <option>Direct and adjacent roles</option>
                <option>Direct roles only</option>
                <option>Include stretch roles</option>
              </Select>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configured sources</CardTitle>
              <CardDescription>Sources selected for future job discovery.</CardDescription>
            </CardHeader>
            <div className="flex flex-wrap gap-2">
              {mockSources.map((source) => (
                <Badge key={source}>{source}</Badge>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
