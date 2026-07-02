"use client";

import { useMemo, useState } from "react";
import { Badge, EmptyState } from "@/components/ui";
import type { TaxonomyActivityRecord, TaxonomyConceptRecord } from "@/lib/db/types";

type Props = {
  taxonomy: TaxonomyConceptRecord[];
  activity: TaxonomyActivityRecord[];
  addTaxonomyAliasAction: (formData: FormData) => Promise<void>;
  archiveTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  mergeTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  removeTaxonomyAliasAction: (formData: FormData) => Promise<void>;
  restoreTaxonomyConceptAction: (formData: FormData) => Promise<void>;
  saveTaxonomyConceptAction: (formData: FormData) => Promise<void>;
};

function flattenConcepts(concepts: TaxonomyConceptRecord[]): TaxonomyConceptRecord[] {
  return concepts.flatMap((concept) => [concept, ...flattenConcepts(concept.children)]);
}

function matchesQuery(concept: TaxonomyConceptRecord, query: string): boolean {
  if (!query) return true;
  const haystack = [
    concept.label,
    concept.description,
    concept.path.join(" "),
    ...concept.aliases.map((alias) => alias.rawPhrase),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

// Matches at any depth, not just the next one or two levels — the taxonomy supports up
// to five levels (e.g. Research / User research / Qualitative research / Contextual
// inquiry), and a fixed-depth lookahead would silently hide matches past it.
function matchesQueryDeep(concept: TaxonomyConceptRecord, query: string): boolean {
  return matchesQuery(concept, query) || concept.children.some((child) => matchesQueryDeep(child, query));
}

function statusTone(status: TaxonomyConceptRecord["status"]) {
  return status === "archived" ? "warning" : "success";
}

function ConceptNode({
  concept,
  allConcepts,
  query,
  addTaxonomyAliasAction,
  archiveTaxonomyConceptAction,
  mergeTaxonomyConceptAction,
  removeTaxonomyAliasAction,
  restoreTaxonomyConceptAction,
  saveTaxonomyConceptAction,
}: {
  concept: TaxonomyConceptRecord;
  allConcepts: TaxonomyConceptRecord[];
  query: string;
} & Omit<Props, "taxonomy" | "activity">) {
  const [open, setOpen] = useState(false);
  const visibleChildren = concept.children.filter((child) => matchesQueryDeep(child, query));
  const visible = matchesQuery(concept, query) || visibleChildren.length > 0;
  // Children only render when the node is expanded, or a search is narrowing the tree
  // (so a query can still surface a nested match without manually expanding every
  // ancestor). Without this gate, a single wide branch — e.g. an uncategorized
  // "Other keywords" bucket with hundreds of entries — renders its full subtree by
  // default on every page load.
  const showChildren = open || query.length > 0;

  // Deferred until the node is actually expanded — with a large taxonomy (a fallback
  // "Other keywords" bucket alone can hold hundreds of concepts), eagerly filtering
  // allConcepts and rendering every option for every node on mount is what hangs the tab.
  const parentOptions = useMemo(() => {
    if (!open) return [];
    const descendantIds = new Set(flattenConcepts(concept.children).map((child) => child.id));
    return allConcepts.filter((item) => item.id !== concept.id && !descendantIds.has(item.id) && item.status !== "archived" && item.depth < 5);
  }, [open, allConcepts, concept]);
  const mergeOptions = useMemo(() => {
    if (!open) return [];
    return allConcepts.filter((item) => item.id !== concept.id && item.status !== "archived");
  }, [open, allConcepts, concept.id]);

  if (!visible) return null;

  return (
    <div className="rounded-control border border-border bg-surface">
      <button
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-ink">{concept.label}</span>
            <Badge tone={statusTone(concept.status)}>{concept.status === "archived" ? "Archived" : "Active"}</Badge>
            <span className="text-[10px] text-muted">Level {concept.depth}</span>
            <span className="text-[10px] text-muted">{concept.storyCount} stories · {concept.jobCount} jobs</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted">{concept.path.join(" / ")}</p>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-muted">{open ? "Hide ▴" : "Manage ▾"}</span>
      </button>

      {open ? (
        <div className="grid gap-3 border-t border-border px-3 py-3">
          <form action={saveTaxonomyConceptAction} className="grid gap-2 md:grid-cols-[1fr_1fr_1.2fr_auto]">
            <input name="id" type="hidden" value={concept.id} />
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Label</span>
              <input className="min-h-9 rounded-control border border-border bg-panel px-2 text-sm text-ink" name="label" defaultValue={concept.label} />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Parent</span>
              <select className="min-h-9 rounded-control border border-border bg-panel px-2 text-sm text-ink" name="parentId" defaultValue={concept.parentId ?? ""}>
                <option value="">Top level</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.path.join(" / ")}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Description</span>
              <input className="min-h-9 rounded-control border border-border bg-panel px-2 text-sm text-ink" name="description" defaultValue={concept.description} />
            </label>
            <button className="self-end rounded-control border border-accent bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90" type="submit">
              Save
            </button>
          </form>

          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <form action={addTaxonomyAliasAction} className="flex min-w-0 gap-2">
              <input name="conceptId" type="hidden" value={concept.id} />
              <input className="min-h-9 min-w-0 flex-1 rounded-control border border-border bg-panel px-2 text-sm text-ink" name="rawPhrase" placeholder="Add keyword or alias" />
              <button className="rounded-control border border-border bg-panel px-3 py-2 text-xs font-semibold text-ink hover:border-accent" type="submit">Add alias</button>
            </form>
            {concept.status === "archived" ? (
              <form action={restoreTaxonomyConceptAction}>
                <input name="id" type="hidden" value={concept.id} />
                <button className="rounded-control border border-border bg-panel px-3 py-2 text-xs font-semibold text-ink hover:border-accent" type="submit">Restore</button>
              </form>
            ) : (
              <form action={archiveTaxonomyConceptAction}>
                <input name="id" type="hidden" value={concept.id} />
                <button className="rounded-control border border-border bg-panel px-3 py-2 text-xs font-semibold text-muted hover:border-danger hover:text-danger" type="submit">Archive</button>
              </form>
            )}
          </div>

          {concept.aliases.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {concept.aliases.map((alias) => (
                <form action={removeTaxonomyAliasAction} key={alias.id}>
                  <input name="aliasId" type="hidden" value={alias.id} />
                  <button className="rounded-full border border-border bg-panel px-2 py-1 text-[10px] text-ink hover:border-danger hover:text-danger" type="submit">
                    {alias.rawPhrase} ×
                  </button>
                </form>
              ))}
            </div>
          ) : null}

          {mergeOptions.length > 0 ? (
            <form action={mergeTaxonomyConceptAction} className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
              <input name="sourceId" type="hidden" value={concept.id} />
              <label className="grid min-w-[14rem] flex-1 gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Merge into</span>
                <select className="min-h-9 rounded-control border border-border bg-panel px-2 text-sm text-ink" name="targetId" defaultValue="">
                  <option value="" disabled>Choose surviving tag</option>
                  {mergeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.path.join(" / ")}</option>
                  ))}
                </select>
              </label>
              <button className="rounded-control border border-border bg-panel px-3 py-2 text-xs font-semibold text-ink hover:border-accent" type="submit">Merge</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {showChildren && visibleChildren.length > 0 ? (
        <div className="grid gap-2 border-t border-border/60 p-2 pl-5">
          {visibleChildren.map((child) => (
            <ConceptNode
              addTaxonomyAliasAction={addTaxonomyAliasAction}
              allConcepts={allConcepts}
              archiveTaxonomyConceptAction={archiveTaxonomyConceptAction}
              concept={child}
              key={child.id}
              mergeTaxonomyConceptAction={mergeTaxonomyConceptAction}
              query={query}
              removeTaxonomyAliasAction={removeTaxonomyAliasAction}
              restoreTaxonomyConceptAction={restoreTaxonomyConceptAction}
              saveTaxonomyConceptAction={saveTaxonomyConceptAction}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TaxonomyManager({
  taxonomy,
  activity,
  addTaxonomyAliasAction,
  archiveTaxonomyConceptAction,
  mergeTaxonomyConceptAction,
  removeTaxonomyAliasAction,
  restoreTaxonomyConceptAction,
  saveTaxonomyConceptAction,
}: Props) {
  const [query, setQuery] = useState("");
  const allConcepts = useMemo(() => flattenConcepts(taxonomy), [taxonomy]);
  const activeCount = allConcepts.filter((concept) => concept.status !== "archived").length;
  const aliasCount = allConcepts.reduce((sum, concept) => sum + concept.aliases.length, 0);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 border-b border-border pb-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-control border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Active tags</p>
            <p className="text-lg font-semibold text-ink">{activeCount}</p>
          </div>
          <div className="rounded-control border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Aliases</p>
            <p className="text-lg font-semibold text-ink">{aliasCount}</p>
          </div>
          <div className="rounded-control border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Max depth</p>
            <p className="text-lg font-semibold text-ink">5 levels</p>
          </div>
        </div>

        <form action={saveTaxonomyConceptAction} className="grid gap-2 md:grid-cols-[1fr_1fr_1.2fr_auto]">
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">New tag</span>
            <input className="min-h-10 rounded-control border border-border bg-panel px-3 text-sm text-ink" name="label" placeholder="e.g. User interviews" />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Parent</span>
            <select className="min-h-10 rounded-control border border-border bg-panel px-3 text-sm text-ink" name="parentId" defaultValue="">
              <option value="">Top level</option>
              {allConcepts.filter((concept) => concept.status !== "archived" && concept.depth < 5).map((concept) => (
                <option key={concept.id} value={concept.id}>{concept.path.join(" / ")}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Description</span>
            <input className="min-h-10 rounded-control border border-border bg-panel px-3 text-sm text-ink" name="description" placeholder="Optional classification note" />
          </label>
          <button className="self-end rounded-control border border-accent bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:bg-accent/90" type="submit">
            Add tag
          </button>
        </form>

        <label className="grid gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Search taxonomy</span>
          <input
            className="min-h-10 rounded-control border border-border bg-panel px-3 text-sm text-ink"
            onChange={(event) => setQuery(event.target.value.toLowerCase())}
            placeholder="Search tags, aliases, or paths"
            value={query}
          />
        </label>
      </div>

      {taxonomy.length === 0 ? (
        <EmptyState
          title="No taxonomy yet"
          description="Tags appear after resume, job, or story evaluation. You can also add the first tag manually."
        />
      ) : (
        <div className="grid gap-2">
          {taxonomy.map((concept) => (
            <ConceptNode
              addTaxonomyAliasAction={addTaxonomyAliasAction}
              allConcepts={allConcepts}
              archiveTaxonomyConceptAction={archiveTaxonomyConceptAction}
              concept={concept}
              key={concept.id}
              mergeTaxonomyConceptAction={mergeTaxonomyConceptAction}
              query={query}
              removeTaxonomyAliasAction={removeTaxonomyAliasAction}
              restoreTaxonomyConceptAction={restoreTaxonomyConceptAction}
              saveTaxonomyConceptAction={saveTaxonomyConceptAction}
            />
          ))}
        </div>
      )}

      {activity.length > 0 ? (
        <div className="rounded-control border border-border bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Recent taxonomy activity</p>
          <div className="grid gap-1.5">
            {activity.slice(0, 8).map((item) => (
              <p className="text-xs text-muted" key={item.id}>
                <span className="font-medium text-ink">{item.action.replace(/_/g, " ")}</span> · {item.actor} · {new Date(item.createdAt).toLocaleString()}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
