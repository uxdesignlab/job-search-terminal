"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { matchRegionGroups, regionGroupForLabel, type RegionGroup } from "@/lib/profile/region-groups";

type PreferredLocationsInputProps = {
  defaultLocations: string[];
  /** Form field name. Defaults to the on-site/hybrid list. */
  name?: string;
  label?: string;
  inputId?: string;
  placeholder?: string;
  hint?: string;
  emptyLabel?: string;
  /**
   * Offer the supra-national region groups ("Europe", "APAC") as suggestions.
   *
   * On the remote list only. The matcher expands a group on either list, but the
   * on-site list asks where you would physically commute, and volunteering
   * "EMEA" as a commute target would be noise. Someone who would genuinely
   * relocate anywhere in Europe can still type it there.
   */
  suggestRegionGroups?: boolean;
};

export function PreferredLocationsInput({
  defaultLocations,
  name = "preferredLocations",
  label = "Preferred locations",
  inputId = "preferred-location-search",
  placeholder = "Start typing a city, state, or country (for example Nashville, Tennessee, or Canada)",
  hint = "Choose exact city, state, or country values used by filtering.",
  emptyLabel = "No preferred locations set.",
  suggestRegionGroups = false
}: PreferredLocationsInputProps) {
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

  /**
   * Which groups the list already holds, by group key rather than by label.
   *
   * A saved list can name a group in any of its spellings — the old hint told
   * people to type "EU", "LATAM", or "Asia Pacific" — so comparing label text
   * would miss those and offer the same region again, leaving two chips that
   * mean one thing.
   */
  const selectedGroupKeys = useMemo(() => {
    if (!suggestRegionGroups) return new Set<string>();
    return new Set(
      locations
        .map((location) => regionGroupForLabel(location)?.key)
        .filter((key): key is string => Boolean(key))
    );
  }, [locations, suggestRegionGroups]);

  /**
   * Region groups resolve locally and instantly. The geocoder cannot help here —
   * it answers "EU" with a French commune and "APAC" with a town in Uganda — so
   * these have to be offered from our own catalogue, ahead of its suggestions.
   */
  const groupMatches = useMemo<RegionGroup[]>(() => {
    if (!suggestRegionGroups) return [];
    return matchRegionGroups(query).filter((group) => !selectedGroupKeys.has(group.key));
  }, [query, selectedGroupKeys, suggestRegionGroups]);

  const hiddenValue = useMemo(() => locations.join("\n"), [locations]);
  const showSuggestions = groupMatches.length > 0 || results.length > 0 || loading;

  /**
   * Adds a location, rewriting a typed region alias to the catalogue's spelling.
   * The matcher accepts "eu" as readily as "European Union", but a chip reading
   * "eu" tells the user nothing about what it covers.
   *
   * A group the list already holds under a different spelling is dropped rather
   * than added beside it — "EU" and "European Union" are one region, not two.
   */
  function addLocation(location: string) {
    const typed = location.trim();
    const group = suggestRegionGroups ? regionGroupForLabel(typed) : null;
    const value = group?.label ?? typed;
    if (!value || locations.includes(value)) return;
    if (group && selectedGroupKeys.has(group.key)) return;
    setLocations((current) => [...current, value]);
    setQuery("");
    setResults([]);
  }

  function removeLocation(location: string) {
    setLocations((current) => current.filter((item) => item !== location));
  }

  /**
   * Enter adds what is typed. Without this it does nothing at all: the field sits
   * inside a form, so the keypress is spent on implicit submission rather than on
   * the list the user is editing.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !query.trim()) return;
    event.preventDefault();
    addLocation(query);
  }

  return (
    <div className="space-y-2">
      <input name={name} type="hidden" value={hiddenValue} />
      <label className="block text-sm font-medium text-ink" htmlFor={inputId}>
        {label}
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
        )) : <p className="text-sm text-muted">{emptyLabel}</p>}
      </div>
      <div className="relative">
        {/* The "add what I typed" escape hatch sits beside the input, not below
            the hint: the suggestion list drops over that space and used to cover
            the button outright whenever the geocoder returned a full five rows. */}
        <div className="flex items-start gap-2">
          <input
            autoComplete="off"
            className="min-h-11 w-full flex-1 rounded-control border border-border bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted"
            id={inputId}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            type="search"
            value={query}
          />
          {query.trim() ? (
            <Button className="shrink-0" onClick={() => addLocation(query)} type="button" variant="secondary">
              Add typed location
            </Button>
          ) : null}
        </div>
        {showSuggestions && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-control border border-border bg-panel shadow-lg">
            {groupMatches.length > 0 ? (
              <>
                <p className="border-b border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
                  Regions
                </p>
                {groupMatches.map((group) => (
                  <button
                    className="block w-full px-3 py-2 text-left hover:bg-surface"
                    key={group.key}
                    onClick={() => addLocation(group.label)}
                    type="button"
                  >
                    <span className="block text-sm text-ink">{group.label}</span>
                    <span className="block text-xs leading-5 text-muted">{group.covers}</span>
                  </button>
                ))}
              </>
            ) : null}
            {groupMatches.length > 0 && (results.length > 0 || loading) ? (
              <p className="border-y border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
                Places
              </p>
            ) : null}
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
      <p className="text-xs leading-5 text-muted">{hint}</p>
      <p className="text-xs leading-5 text-muted">
        Location suggestions use OpenStreetMap Nominatim data.
      </p>
    </div>
  );
}
