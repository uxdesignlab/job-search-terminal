import { NextResponse } from "next/server";
import { safeFetch } from "@/lib/safe-fetch";

type NominatimResult = {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state_district?: string;
    county?: string;
    region?: string;
    state?: string;
    country?: string;
  };
  display_name?: string;
  osm_id?: number;
  place_id?: number;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const upstream = new URL("https://nominatim.openstreetmap.org/search");
  upstream.searchParams.set("q", query);
  upstream.searchParams.set("format", "jsonv2");
  upstream.searchParams.set("addressdetails", "1");
  upstream.searchParams.set("limit", "12");
  upstream.searchParams.set("accept-language", "en");

  try {
    const response = await safeFetch(upstream.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Job Search Terminal local app (https://github.com/uxdesignlab/job-search-terminal)",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ results: [] }, { status: 502 });
    }

    const data = await response.json() as NominatimResult[];
    const labels = data
      .map(formatLocation)
      .filter((value): value is string => Boolean(value));

    return NextResponse.json({ results: [...new Set(labels)].slice(0, 5) });
  } catch {
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}

function formatLocation(result: NominatimResult) {
  const address = result.address;
  if (!address) return null;

  const city = address.city ?? address.town ?? address.village ?? address.municipality;
  const region = address.state ?? address.state_district ?? address.county ?? address.region;
  const country = address.country;

  if (city) return joinParts([city, region, country]);
  if (region && country) return joinParts([region, country]);
  if (country) return country;

  return null;
}

function joinParts(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(trimmed);
  }

  return parts.join(", ");
}
