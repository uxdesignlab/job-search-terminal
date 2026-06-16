import { tryGetActiveProvider } from "@/lib/ai/factory";

export async function GET() {
  const provider = tryGetActiveProvider();
  if (!provider) {
    return Response.json({ providerName: "", modelName: "" });
  }
  return Response.json({ providerName: provider.name, modelName: provider.effectiveModel });
}
