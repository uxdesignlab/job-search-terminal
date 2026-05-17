import { NextResponse } from "next/server";
import { getAISettings, getUserProfile, getTitleFilters } from "@/lib/db/queries";
import { runAggregatorScan } from "@/lib/scanner/aggregator-scanner";

export async function POST() {
  try {
    const settings = getAISettings();
    const profile = getUserProfile();
    const titleFilters = getTitleFilters();
    const result = await runAggregatorScan({
      adzunaAppId: settings.adzunaAppId,
      adzunaApiKey: settings.adzunaApiKey,
      titles: profile.targetRoles,
      locations: profile.preferredLocations,
      remotePreference: profile.remotePreference,
      titleFilters,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
