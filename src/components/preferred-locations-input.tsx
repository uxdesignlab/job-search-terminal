"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type PreferredLocationsInputProps = {
  defaultLocations: string[];
};

export function PreferredLocationsInput({ defaultLocations }: PreferredLocationsInputProps) {
  const [locations, setLocations] = useState(defaultLocations);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      async function searchLocations() {
        try {
          setLoading(true);
          const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query.trim())}`, {
            signal: controller.signal,
          });
          if (!response.ok) return;
          const data = await response.json() as { results?: string[] };
          setResults((data.results ?? []).filter((result) => !locations.includes(result)));
        } catch {
          if (!controller.signal.aborted) setResults([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      }

      void searchLocations();
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [locations, query]);

  const hiddenValue = useMemo(() => locations.join("\n"), [locations]);

  function addLocation(location: string) {
    const value = location.trim();
    if (!value || locations.includes(value)) return;
    setLocations((current) => [...current, value]);
    setQuery("");
    setResults([]);
  }

  function removeLocation(location: string) {
    setLocations((current) => current.filter((item) => item !== location));
  }

  return (
    <div className="space-y-2">
      <input name="preferredLocations" type="hidden" value={hiddenValue} />
      <label className="block text-sm font-medium text-ink" htmlFor="preferred-location-search">
        Preferred locations
      </label>
      <div className="flex flex-wrap gap-2">
        {locations.length > 0 ? locations.map((location) => (
          <span
            className="inline-flex min-h-8 items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-sm text-ink"
            key={location}
          >
            {location}
            <button
              aria-label={`Remove ${location}`}
              className="text-muted hover:text-danger"
              onClick={() => removeLocation(location)}
              type="button"
            >
              ×
            </button>
          </span>
        )) : <p className="text-sm text-muted">No preferred locations set.</p>}
      </div>
      <div className="relative">
        <input
          autoComplete="off"
          className="min-h-11 w-full rounded-control border border-border bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted"
          id="preferred-location-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing a city, state, or country (for example Nashville, Tennessee, or Canada)"
          type="search"
          value={query}
        />
        {(results.length > 0 || loading) && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-control border border-border bg-panel shadow-lg">
            {loading && results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">Searching...</p>
            ) : null}
            {results.map((result) => (
              <button
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface"
                key={result}
                onClick={() => addLocation(result)}
                type="button"
              >
                {result}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-muted">
          Choose exact city, state, or country values used by filtering.
        </p>
        {query.trim() ? (
          <Button onClick={() => addLocation(query)} type="button" variant="quiet">
            Add typed location
          </Button>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted">
        Location suggestions use OpenStreetMap Nominatim data.
      </p>
    </div>
  );
}
