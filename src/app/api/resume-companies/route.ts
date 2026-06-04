export const dynamic = "force-dynamic";

export async function GET() {
  const { getResumeBuilderVersions } = await import("@/lib/db/queries");
  const versions = getResumeBuilderVersions();

  const seen = new Set<string>();
  const companies: Array<{ name: string; dateRange: string }> = [];

  for (const version of versions) {
    for (const section of version.sections) {
      if (section.type === "experience" && section.experience) {
        for (const entry of section.experience) {
          const name = entry.organization?.trim();
          if (name && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            companies.push({ name, dateRange: entry.dateRange ?? "" });
          }
        }
      }
    }
  }

  return Response.json({ companies });
}
