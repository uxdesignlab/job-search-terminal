const COUNTRY_TOKENS = new Set([
  "australia",
  "belarus",
  "canada",
  "france",
  "germany",
  "united kingdom",
  "united states",
  "united states of america",
  "usa",
]);

const US_STATE_TOKENS = new Set([
  "alabama", "al", "alaska", "ak", "arizona", "az", "arkansas", "ar", "california", "ca", "colorado", "co",
  "connecticut", "ct", "delaware", "de", "florida", "fl", "georgia", "ga", "hawaii", "hi", "idaho", "id",
  "illinois", "il", "indiana", "in", "iowa", "ia", "kansas", "ks", "kentucky", "ky", "louisiana", "la",
  "maine", "me", "maryland", "md", "massachusetts", "ma", "michigan", "mi", "minnesota", "mn",
  "mississippi", "ms", "missouri", "mo", "montana", "mt", "nebraska", "ne", "nevada", "nv",
  "new hampshire", "nh", "new jersey", "nj", "new mexico", "nm", "new york", "ny", "north carolina", "nc",
  "north dakota", "nd", "ohio", "oh", "oklahoma", "ok", "oregon", "or", "pennsylvania", "pa",
  "rhode island", "ri", "south carolina", "sc", "south dakota", "sd", "tennessee", "tn", "texas", "tx",
  "utah", "ut", "vermont", "vt", "virginia", "va", "washington", "wa", "west virginia", "wv",
  "wisconsin", "wi", "wyoming", "wy", "district of columbia", "dc",
]);

/**
 * Reads a location tag input's submitted value.
 *
 * Deliberately not `splitListValue`, which also splits on commas: a location is
 * itself comma-separated ("Tennessee, United States"), so comma-splitting throws
 * away the entry boundaries the tag input encoded as newlines and leaves
 * `normalizePreferredLocations` to guess them back. It guesses wrong whenever one
 * entry ends in a country name and another begins right after — saving
 * "Tennessee, United States" plus "Canada" collapsed into the single bogus entry
 * "Tennessee, United States, Canada".
 */
export function splitLocationLines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return cleanLocationList(value.split("\n"));
}

/** Trims, drops blanks, and de-duplicates without re-joining anything. */
export function cleanLocationList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Repairs legacy values that were stored already split into separate entries
 * ("Nashville", "Tennessee", "United States" → "Nashville, Tennessee, United States").
 */
export function normalizePreferredLocations(values: string[]): string[] {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  const normalized: string[] = [];

  for (let index = 0; index < cleaned.length; index += 1) {
    const current = cleaned[index];
    const next = cleaned[index + 1];
    const afterNext = cleaned[index + 2];

    if (current.includes(",")) {
      normalized.push(current);
      continue;
    }

    if (next && afterNext && isCountry(afterNext)) {
      normalized.push(`${current}, ${next}, ${afterNext}`);
      index += 2;
      continue;
    }

    if (next && (isCountry(next) || isRegion(next))) {
      normalized.push(`${current}, ${next}`);
      index += 1;
      continue;
    }

    normalized.push(current);
  }

  return [...new Set(normalized)];
}

function isCountry(value: string) {
  return COUNTRY_TOKENS.has(value.toLowerCase());
}

function isRegion(value: string) {
  return US_STATE_TOKENS.has(value.toLowerCase());
}
