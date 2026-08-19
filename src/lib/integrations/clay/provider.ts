import { safeFetch } from "../../safe-fetch";
import { getIntegration, getIntegrationCredential, saveIntegrationMetadata } from "../../db/queries";
import { ContactProviderError } from "../../contacts/provider";
import type { ContactCandidate, ContactProvider, EnrichmentInput, EnrichmentResult, PeopleSearchInput } from "../../contacts/provider";
import type { ContactRole } from "../../db/types";

/**
 * Clay people search (PRD v0.2.1 §44–§45).
 *
 * Every Clay-shaped value stops here: the rest of JST sees ContactCandidate.
 * Structured-filters mode rather than the advanced-query beta, because the UI is
 * deterministic and button-driven and the core feature should not depend on beta
 * query behavior.
 *
 * Endpoints verified 2026-08-18 against https://developers.clay.com/searches/filters.
 */

const BASE = "https://api.clay.com/public/v0";
const FIELDS_PATH = "/search/filters-mode/fields";
const SEARCH_PATH = "/search/filters-mode";

/** §45: five people is enough to choose from, and each result costs allowance. */
export const DEFAULT_PEOPLE_LIMIT = 5;

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a catalog may be trusted when Clay is unreachable rather than failing outright. */
const CATALOG_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedCatalog = { fetchedAt: string; fields: string[] };

type ClayFieldsResponse = { fields?: Array<{ name?: string }> };
type ClaySearchCreateResponse = { search_id?: string; id?: string };
type ClayPerson = Record<string, unknown>;
type ClayRunResponse = { data?: ClayPerson[]; has_more?: boolean };

function requireKey(): string {
  const key = getIntegrationCredential("clay");
  if (!key) throw new ContactProviderError("not_connected", "Connect Clay in Settings → Integrations first.");
  return key;
}

/** Map Clay's HTTP codes onto §63's states — each needs a different thing from the user. */
async function raiseForStatus(res: Response): Promise<never> {
  const detail = await res.text().catch(() => "");
  const snippet = detail.slice(0, 200);
  if (res.status === 401 || res.status === 403) {
    throw new ContactProviderError("invalid_credential", "Clay rejected the API key. Re-check it in Settings → Integrations.");
  }
  if (res.status === 402) {
    // Documented as the search-result allowance being exhausted (§42).
    throw new ContactProviderError("allowance_reached", "Your Clay search allowance is used up for this period.");
  }
  if (res.status === 429) {
    throw new ContactProviderError("rate_limited", "Clay rate-limited the request. Try again shortly.");
  }
  throw new ContactProviderError("unavailable", `Clay returned HTTP ${res.status}. ${snippet}`.trim());
}

async function clayFetch(path: string, init: RequestInit & { key: string }): Promise<unknown> {
  const { key, ...rest } = init;
  let res: Response;
  try {
    res = await safeFetch(`${BASE}${path}`, {
      ...rest,
      headers: { Accept: "application/json", "Content-Type": "application/json", "clay-api-key": key, ...(rest.headers ?? {}) },
    });
  } catch (error) {
    throw new ContactProviderError("unavailable", `Could not reach Clay: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!res.ok) await raiseForStatus(res);
  return res.json();
}

function readCachedCatalog(): CachedCatalog | null {
  const metadata = getIntegration("clay")?.metadata as { fieldCatalog?: { people?: CachedCatalog } } | undefined;
  const cached = metadata?.fieldCatalog?.people;
  return cached && Array.isArray(cached.fields) ? cached : null;
}

function cacheAgeMs(cached: CachedCatalog): number {
  return Date.now() - new Date(cached.fetchedAt).getTime();
}

/**
 * The accepted filter names, cached (§44.1).
 *
 * Refetched every 24h. If Clay is unreachable, a catalog up to 7 days old is
 * still used rather than failing the whole search over metadata — but past that
 * it is treated as gone, because silently filtering on names Clay no longer
 * accepts would produce wrong results rather than an error.
 */
async function getFieldCatalog(key: string, options: { force?: boolean } = {}): Promise<string[]> {
  const cached = readCachedCatalog();
  if (!options.force && cached && cacheAgeMs(cached) < CATALOG_TTL_MS) return cached.fields;

  try {
    const body = (await clayFetch(`${FIELDS_PATH}?source_type=people`, { key, method: "GET" })) as ClayFieldsResponse;
    const fields = (body.fields ?? []).map((field) => field.name).filter((name): name is string => Boolean(name));
    saveIntegrationMetadata("clay", { fieldCatalog: { people: { fetchedAt: new Date().toISOString(), fields } } });
    return fields;
  } catch (error) {
    if (cached && cacheAgeMs(cached) < CATALOG_MAX_STALE_MS) {
      console.warn("[clay] field catalog refresh failed; using cached catalog:", error);
      return cached.fields;
    }
    throw error;
  }
}

/** Guidance is explicit: omit a filter rather than sending an empty array. */
function buildFilters(input: PeopleSearchInput, allowed: Set<string>): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  const put = (field: string, values: string[]) => {
    if (allowed.has(field) && values.length > 0) filters[field] = values;
  };
  if (input.companyIdentifier) put("company_identifier", [input.companyIdentifier]);
  put("job_title_keywords", input.titleKeywords);
  put("job_title_seniority_levels_v2", input.seniorityLevels);
  put("location_countries_include", input.countries);
  return filters;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pick(person: ClayPerson, keys: string[]): string {
  for (const key of keys) {
    const value = str(person[key]);
    if (value) return value;
  }
  return "";
}

/** `structured_location` comes back as an object; flatten it to something displayable. */
function readLocation(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const loc = value as Record<string, unknown>;
    return [str(loc.city), str(loc.state), str(loc.country)].filter(Boolean).join(", ");
  }
  return "";
}

/**
 * Verified 2026-08-18 against a live people search. Clay returns
 * `latest_experience_title` / `latest_experience_company` / `url` — not `title`,
 * `company` or `linkedin_url`. Guessing those names cost a search's worth of
 * results with every title blank, which collapsed role detection and ranking.
 *
 * The alternative spellings are kept as a second choice: the shape is not
 * contractually frozen, and reading two candidates costs nothing.
 */
function normalizePerson(person: ClayPerson): ContactCandidate | null {
  const name = pick(person, ["name", "full_name", "fullName"])
    || [pick(person, ["first_name", "firstName"]), pick(person, ["last_name", "lastName"])].filter(Boolean).join(" ");
  if (!name) return null;

  const title = pick(person, ["latest_experience_title", "title", "job_title", "jobTitle", "headline"]);
  return {
    // Clay's people results carry no stable record id, so dedupe falls to the
    // LinkedIn URL — §37's second tier, which is exactly what it is there for.
    providerRecordId: pick(person, ["id", "person_id", "profile_id"]),
    name,
    title,
    company: pick(person, ["latest_experience_company", "company", "company_name", "employer"]),
    linkedinUrl: pick(person, ["url", "linkedin_url", "linkedinUrl", "profile_url"]),
    // Search does not return emails; enrichment is a separate, explicit step (§49).
    workEmail: "",
    location: readLocation(person.structured_location ?? person.location),
    suggestedRole: roleFromTitle(title),
    profileConfidence: pick(person, ["confidence", "match_confidence"]),
  };
}

/** A starting guess only — the user sets the real relationship when saving. */
function roleFromTitle(title: string): ContactRole {
  const t = title.toLowerCase();
  if (/\b(recruit|talent|sourcer)\b/.test(t)) return "recruiter";
  if (/\b(chief|founder|president|cxo|coo|ceo|cto)\b/.test(t)) return "executive";
  if (/\b(vp|vice president|head of|director)\b/.test(t)) return "functional_leader";
  if (/\bmanager\b/.test(t)) return "hiring_manager";
  if (t) return "peer";
  return "other";
}

export class ClayProvider implements ContactProvider {
  readonly name = "clay";

  async searchPeople(input: PeopleSearchInput): Promise<ContactCandidate[]> {
    const key = requireKey();

    let allowed = new Set(await getFieldCatalog(key));
    let filters = buildFilters(input, allowed);
    if (Object.keys(filters).length === 0) {
      throw new ContactProviderError("ambiguous_company", "Not enough is known about this company to search — add a company domain first.");
    }

    let created: ClaySearchCreateResponse;
    try {
      created = (await clayFetch(SEARCH_PATH, {
        key, method: "POST",
        body: JSON.stringify({ source_type: "people", filters }),
      })) as ClaySearchCreateResponse;
    } catch (error) {
      // A rejected filter usually means the cached catalog has gone stale.
      // Refresh once and retry once — never loop on an invalid catalog (§44.1).
      if (!(error instanceof ContactProviderError) || error.kind !== "unavailable") throw error;
      allowed = new Set(await getFieldCatalog(key, { force: true }));
      filters = buildFilters(input, allowed);
      created = (await clayFetch(SEARCH_PATH, {
        key, method: "POST",
        body: JSON.stringify({ source_type: "people", filters }),
      })) as ClaySearchCreateResponse;
    }

    const searchId = created.search_id ?? created.id;
    if (!searchId) throw new ContactProviderError("unavailable", "Clay did not return a search id.");

    const limit = Math.max(1, Math.min(DEFAULT_PEOPLE_LIMIT, input.limit || DEFAULT_PEOPLE_LIMIT));
    const run = (await clayFetch(`${SEARCH_PATH}/${searchId}/run`, {
      key, method: "POST", body: JSON.stringify({ limit }),
    })) as ClayRunResponse;

    // §45: the iterator is stateful and `has_more` is deliberately ignored.
    // Continuing would spend more of the user's allowance than they asked for.
    return (run.data ?? [])
      .map(normalizePerson)
      .filter((candidate): candidate is ContactCandidate => candidate !== null)
      .slice(0, limit);
  }

  /**
   * Enrichment runs a routine the user built in Clay (§7.7, §49).
   *
   * The PRD assumed a direct "enrich this person" endpoint. Clay has none — the
   * only path is executing a pre-authored routine by id, asynchronously. JST does
   * not create routines or tables (§7 rules both out), so the routine id is
   * something the user configures once, pointing at their own workspace.
   *
   * Never automatic: §49 keeps search and enrichment separate so a five-result
   * search does not quietly become five enrichment charges.
   */
  /**
   * Enrich several people in one routine run.
   *
   * The routine endpoint accepts 1-100 items, so a five-person search costs one
   * API call rather than five. Clay still charges per person enriched — batching
   * saves round trips and latency, not credits.
   *
   * Results are keyed by the item id so an email lands on the right person even
   * if the routine returns them out of order or omits some.
   */
  async enrichPeople(inputs: EnrichmentInput[]): Promise<Map<string, EnrichmentResult>> {
    const results = new Map<string, EnrichmentResult>();
    if (inputs.length === 0) return results;

    const key = requireKey();
    const routineId = readEnrichmentRoutineId();
    if (!routineId) throw new ContactProviderError("not_connected", NO_ROUTINE_MESSAGE);

    const items = inputs.slice(0, MAX_ENRICHMENT_ITEMS).map((input, index) => ({
      id: `jst-${index}`,
      // Clay's managed function declares its input as the literal label
      // "Social Profile URL" — not a snake_case key. Verified against a live run.
      // §71: this is the only thing sent; no resume, notes or career history.
      inputs: { "Social Profile URL": input.linkedinUrl },
    }));

    const started = (await clayFetch(`/routines/${encodeURIComponent(routineId)}/run`, {
      key, method: "POST", body: JSON.stringify({ items }),
    })) as { routine_run_id?: string };

    const runId = started.routine_run_id;
    if (!runId) throw new ContactProviderError("unavailable", "Clay did not return a routine run id.");

    const run = await pollRoutineRun(key, runId);

    // Walk each returned item independently: one person failing to resolve must
    // not discard the emails found for everyone else.
    const rows = Array.isArray(run.data) ? run.data : Array.isArray(run.items) ? run.items : [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const id = str(row.id);
      const email = findEmail(row);
      if (id && email) results.set(id, { workEmail: email, emailConfidence: "unverified", provider: "clay-routine" });
    }

    // Map item ids back to the caller's original order.
    const byIndex = new Map<string, EnrichmentResult>();
    inputs.slice(0, MAX_ENRICHMENT_ITEMS).forEach((input, index) => {
      const found = results.get(`jst-${index}`);
      if (found) byIndex.set(input.linkedinUrl || input.name, found);
    });
    return byIndex;
  }

  async enrichPerson(input: EnrichmentInput): Promise<EnrichmentResult> {
    const key = requireKey();
    const routineId = readEnrichmentRoutineId();
    if (!routineId) {
      throw new ContactProviderError("not_connected", NO_ROUTINE_MESSAGE);
    }

    const started = (await clayFetch(`/routines/${encodeURIComponent(routineId)}/run`, {
      key,
      method: "POST",
      body: JSON.stringify({
        items: [{ id: "jst-1", inputs: { "Social Profile URL": input.linkedinUrl } }],
      }),
    })) as { routine_run_id?: string };

    const runId = started.routine_run_id;
    if (!runId) throw new ContactProviderError("unavailable", "Clay did not return a routine run id.");

    // One poller for both paths. This loop was duplicated inline and kept the old
    // endpoint after the shared one was corrected — exactly the drift that having
    // two copies invites.
    const run = await pollRoutineRun(key, runId);
    const email = findEmail(run);
    return {
      workEmail: email,
      // Clay reports no confidence for routine output, and inventing a
      // "verified" label for an unverified address would be worse than none.
      emailConfidence: email ? "unverified" : "",
      provider: "clay-routine",
    };
  }
}

const MAX_ENRICHMENT_ITEMS = 100;
const NO_ROUTINE_MESSAGE =
  "No Clay enrichment routine is configured. Build one in Clay that takes a LinkedIn URL and returns a work email, then paste its routine id in Settings → Integrations.";
// Measured, not guessed: a single-person run against Clay's managed enrichment
// function took ~35s. The original 15s window gave up on every real lookup.
// A batch of five is not five times slower — the routine fans out — but the
// window still needs headroom.
const ENRICHMENT_POLL_ATTEMPTS = 15;
const ENRICHMENT_POLL_INTERVAL_MS = 4000;

type ClayRoutineRun = { status?: string; data?: unknown; items?: unknown; results?: unknown };

/**
 * Poll until the run settles, then give up — the run finishes in Clay regardless.
 *
 * Endpoint and terminal status verified against a live run: results come from
 * `/routines/run/{id}/results` (singular "run"), and the completed status is
 * `complete`, not `completed`.
 */
async function pollRoutineRun(key: string, runId: string): Promise<ClayRoutineRun> {
  for (let attempt = 0; attempt < ENRICHMENT_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, ENRICHMENT_POLL_INTERVAL_MS));
    const progress = (await clayFetch(`/routines/run/${encodeURIComponent(runId)}/results`, { key, method: "GET" })) as ClayRoutineRun;
    if (progress.status === "complete" || progress.status === "completed") return progress;
    if (progress.status === "failed" || progress.status === "error") {
      throw new ContactProviderError("unavailable", "The Clay routine failed. Check the routine in Clay.");
    }
  }
  throw new ContactProviderError(
    "unavailable",
    `The Clay routine did not finish within ${(ENRICHMENT_POLL_ATTEMPTS * ENRICHMENT_POLL_INTERVAL_MS) / 1000}s. It is still running in Clay — try again shortly.`
  );
}

export function isAutoEnrichEnabled(): boolean {
  const metadata = getIntegration("clay")?.metadata as { autoEnrichSearchResults?: boolean } | undefined;
  return metadata?.autoEnrichSearchResults === true;
}

export function hasEnrichmentRoutine(): boolean {
  return readEnrichmentRoutineId().length > 0;
}

function readEnrichmentRoutineId(): string {
  const metadata = getIntegration("clay")?.metadata as { enrichmentRoutineId?: string } | undefined;
  return (metadata?.enrichmentRoutineId ?? "").trim();
}

/**
 * Pull the work email out of a routine result.
 *
 * Prefer a field whose *name* mentions email — Clay's managed function returns a
 * whole enriched profile alongside "Work Email", and a blind first-match walk
 * could pick up some other address from that payload. The unnamed walk stays as
 * a fallback, because a user-authored routine may name the field anything.
 */
function findEmail(payload: unknown, depth = 0): string {
  const named = findEmailByName(payload);
  if (named) return named;
  return findAnyEmail(payload, depth);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function findEmailByName(payload: unknown, depth = 0): string {
  if (depth > 6 || !payload || typeof payload !== "object") return "";
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findEmailByName(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (/email/i.test(key) && typeof value === "string" && EMAIL_RE.test(value.trim())) return value.trim();
  }
  for (const value of Object.values(payload as Record<string, unknown>)) {
    const found = findEmailByName(value, depth + 1);
    if (found) return found;
  }
  return "";
}

function findAnyEmail(payload: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (typeof payload === "string") return EMAIL_RE.test(payload.trim()) ? payload.trim() : "";
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findAnyEmail(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload as Record<string, unknown>)) {
      const found = findAnyEmail(value, depth + 1);
      if (found) return found;
    }
  }
  return "";
}
