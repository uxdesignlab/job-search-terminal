"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, SearchableMultiSelect } from "@/components/ui";
import { InteractiveStoryEditor } from "./interactive-story-editor";
import type { ApplicationRecord, TaxonomyConceptRecord } from "@/lib/db/types";

type Story = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  skills: string[];
  themes: string[];
  tags: string[];
  conceptTags: TaxonomyConceptRecord[];
  rawKeywords: string[];
  sourceJobId: string | null;
  sourceBlockF: string;
  storyKind: "answered_question" | "standalone_story" | "evaluation_suggestion";
  questionId: string | null;
  promptText: string;
  qualityStatus: "ready" | "needs_detail" | "missing_result";
  qualityNotes: string;
  lastEvaluatedAt: string | null;
  sourceJobCompany: string;
  sourceJobTitle: string;
  assignedJobs: Array<{ jobId: string; company: string; role: string; status: string; source: "auto" | "manual" }>;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  assignmentJobs: ApplicationRecord[];
  stories: Story[];
  taxonomy: TaxonomyConceptRecord[];
  deleteStoryAction: (id: string) => Promise<void>;
};

const STAR_LABELS = {
  situation: { abbr: "S", color: "bg-blue-50 text-blue-700 border-blue-200" },
  task: { abbr: "T", color: "bg-violet-50 text-violet-700 border-violet-200" },
  action: { abbr: "A", color: "bg-amber-50 text-amber-700 border-amber-200" },
  result: { abbr: "R", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  reflection: { abbr: "↺", color: "bg-slate-50 text-slate-600 border-slate-200" },
};

const KIND_LABELS: Record<Story["storyKind"], string> = {
  answered_question: "Answered question",
  standalone_story: "Standalone story",
  evaluation_suggestion: "Job evaluation suggestion",
};

const QUALITY_LABELS: Record<Story["qualityStatus"], { label: string; tone: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready", tone: "success" },
  needs_detail: { label: "Needs detail", tone: "warning" },
  missing_result: { label: "Missing result", tone: "danger" },
};

const PAGE_SIZE = 20;
const COLLAPSED_TAG_LIMIT = 4;

function flattenConcepts(concepts: TaxonomyConceptRecord[]): TaxonomyConceptRecord[] {
  return concepts.flatMap((concept) => [concept, ...flattenConcepts(concept.children)]);
}

function descendantIds(concept: TaxonomyConceptRecord): string[] {
  return concept.children.flatMap((child) => [child.id, ...descendantIds(child)]);
}

function sourceLabel(story: Story) {
  if (story.storyKind === "standalone_story") return "Manual story";
  if (story.sourceBlockF === "voice-practice") return "Voice practice";
  if (story.sourceBlockF === "evaluation") return "AI evaluation";
  return "Custom answer";
}

function matchesDate(story: Story, range: string) {
  if (range === "all") return true;
  const days = Number(range);
  if (!Number.isFinite(days)) return true;
  const updated = new Date(story.updatedAt).getTime();
  if (!Number.isFinite(updated)) return true;
  return Date.now() - updated <= days * 24 * 60 * 60 * 1000;
}

export function StoryBankList({ assignmentJobs, stories, taxonomy, deleteStoryAction }: Props) {
  const router = useRouter();
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [source, setSource] = useState("all");
  const [quality, setQuality] = useState("all");
  const [selectedConcepts, setSelectedConcepts] = useState<Set<string>>(new Set());
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState("all");
  const [page, setPage] = useState(1);

  const handleSaved = () => {
    router.refresh();
  };

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const facets = useMemo(() => {
    const concepts = new Map<string, TaxonomyConceptRecord>();
    const jobs = new Map<string, string>();
    const counts = {
      answered: 0,
      standalone: 0,
      evaluation: 0,
      ready: 0,
      missingResult: 0,
      needsDetail: 0,
    };

    for (const story of stories) {
      story.conceptTags.forEach((item) => concepts.set(item.id, item));
      if (story.sourceJobId) {
        jobs.set(story.sourceJobId, [story.sourceJobCompany, story.sourceJobTitle].filter(Boolean).join(" · ") || story.sourceJobId);
      }
      for (const assignedJob of story.assignedJobs) {
        jobs.set(assignedJob.jobId, [assignedJob.company, assignedJob.role].filter(Boolean).join(" · ") || assignedJob.jobId);
      }
      if (story.storyKind === "answered_question") counts.answered++;
      if (story.storyKind === "standalone_story") counts.standalone++;
      if (story.storyKind === "evaluation_suggestion") counts.evaluation++;
      if (story.qualityStatus === "ready") counts.ready++;
      if (story.qualityStatus === "missing_result") counts.missingResult++;
      if (story.qualityStatus === "needs_detail") counts.needsDetail++;
    }

    return {
      concepts: Array.from(concepts.values()).sort((a, b) => a.label.localeCompare(b.label)),
      jobs: Array.from(jobs.entries()).sort((a, b) => a[1].localeCompare(b[1])),
      counts,
    };
  }, [stories]);

  const conceptOptions = useMemo(() => {
    const flat = flattenConcepts(taxonomy).filter((concept) => concept.status !== "archived");
    const source = flat.length > 0 ? flat : facets.concepts;
    return source.map((item) => ({ value: item.id, label: item.path.length > 0 ? item.path.join(" / ") : item.label }));
  }, [facets.concepts, taxonomy]);
  const positionOptions = useMemo(() => facets.jobs.map(([id, label]) => ({ value: id, label })), [facets.jobs]);
  const selectedConceptWithDescendants = useMemo(() => {
    const all = flattenConcepts(taxonomy);
    const byId = new Map(all.map((concept) => [concept.id, concept]));
    const ids = new Set<string>();
    for (const id of selectedConcepts) {
      ids.add(id);
      const concept = byId.get(id);
      if (concept) descendantIds(concept).forEach((childId) => ids.add(childId));
    }
    return ids;
  }, [selectedConcepts, taxonomy]);

  const filteredStories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return stories.filter((story) => {
      const searchable = [
        story.title,
        story.promptText,
        story.situation,
        story.task,
        story.action,
        story.result,
        story.reflection,
        story.sourceJobCompany,
        story.sourceJobTitle,
        ...story.conceptTags.flatMap((concept) => [concept.label, ...concept.path]),
        ...story.rawKeywords,
        ...story.tags,
        ...story.assignedJobs.flatMap((assignedJob) => [assignedJob.company, assignedJob.role, assignedJob.status]),
      ].join(" ").toLowerCase();

      if (query && !searchable.includes(query)) return false;
      if (kind !== "all" && story.storyKind !== kind) return false;
      if (quality !== "all" && story.qualityStatus !== quality) return false;
      if (source !== "all" && story.sourceBlockF !== source) return false;
      if (selectedConceptWithDescendants.size > 0 && !story.conceptTags.some((item) => selectedConceptWithDescendants.has(item.id))) return false;
      if (
        selectedPositions.size > 0 &&
        !(story.sourceJobId && selectedPositions.has(story.sourceJobId)) &&
        !story.assignedJobs.some((assignedJob) => selectedPositions.has(assignedJob.jobId))
      ) {
        return false;
      }
      if (!matchesDate(story, dateRange)) return false;
      return true;
    });
  }, [stories, search, kind, quality, source, selectedConceptWithDescendants, selectedPositions, dateRange]);

  useEffect(() => {
    setPage(1);
  }, [search, kind, quality, source, selectedConcepts, selectedPositions, dateRange]);

  const pageCount = Math.max(1, Math.ceil(filteredStories.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pagedStories = filteredStories.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const hasActiveFilters =
    search.trim() !== "" ||
    kind !== "all" ||
    quality !== "all" ||
    source !== "all" ||
    selectedConcepts.size > 0 ||
    selectedPositions.size > 0 ||
    dateRange !== "all";

  function clearAllFilters() {
    setSearch("");
    setKind("all");
    setQuality("all");
    setSource("all");
    setSelectedConcepts(new Set());
    setSelectedPositions(new Set());
    setDateRange("all");
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 border-b border-border pb-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-control border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Generated from jobs</p>
            <p className="text-lg font-semibold text-ink">{facets.counts.evaluation}</p>
          </div>
          <div className="rounded-control border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">User stories</p>
            <p className="text-lg font-semibold text-ink">{facets.counts.answered + facets.counts.standalone}</p>
          </div>
          <div className="rounded-control border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Ready</p>
            <p className="text-lg font-semibold text-ink">{facets.counts.ready}</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid min-w-0 gap-1 sm:col-span-2 xl:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Search</span>
            <input
              className="min-h-10 w-full min-w-0 rounded-control border border-border bg-panel px-3 py-2 text-sm text-ink"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, STAR text, company, tags"
              value={search}
            />
          </label>

          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Kind</span>
            <select className="min-h-10 w-full min-w-0 rounded-control border border-border bg-panel px-2 text-sm text-ink" onChange={(event) => setKind(event.target.value)} value={kind}>
              <option value="all">All</option>
              <option value="answered_question">Answered</option>
              <option value="standalone_story">Standalone</option>
              <option value="evaluation_suggestion">Job suggestions</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Source</span>
            <select className="min-h-10 w-full min-w-0 rounded-control border border-border bg-panel px-2 text-sm text-ink" onChange={(event) => setSource(event.target.value)} value={source}>
              <option value="all">All</option>
              <option value="evaluation">Evaluation</option>
              <option value="voice-practice">Voice</option>
              <option value="">Manual</option>
            </select>
          </label>

          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Quality</span>
            <select className="min-h-10 w-full min-w-0 rounded-control border border-border bg-panel px-2 text-sm text-ink" onChange={(event) => setQuality(event.target.value)} value={quality}>
              <option value="all">All</option>
              <option value="ready">Ready</option>
              <option value="needs_detail">Needs detail</option>
              <option value="missing_result">Missing result</option>
            </select>
          </label>

          <SearchableMultiSelect
            label={`Tags (${conceptOptions.length})`}
            onChange={setSelectedConcepts}
            options={conceptOptions}
            placeholder="Search grouped tags…"
            selected={selectedConcepts}
          />

          <SearchableMultiSelect
            label={`Position (${facets.jobs.length})`}
            onChange={setSelectedPositions}
            options={positionOptions}
            placeholder="Search company or role…"
            selected={selectedPositions}
          />

          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Updated</span>
            <select className="min-h-10 w-full min-w-0 rounded-control border border-border bg-panel px-2 text-sm text-ink" onChange={(event) => setDateRange(event.target.value)} value={dateRange}>
              <option value="all">Any time</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            Showing {filteredStories.length} of {stories.length} stories. Job evaluation suggestions stay visible, but are labeled separately from user-created stories.
          </p>
          {hasActiveFilters ? (
            <button className="text-xs font-medium text-accent underline underline-offset-2 hover:text-ink" onClick={clearAllFilters} type="button">
              Clear all filters
            </button>
          ) : null}
        </div>
      </div>

      {pagedStories.map((story) => {
        const isEditing = editingStoryId === story.id;
        const isExpanded = expandedIds.has(story.id);
        const qualityMeta = QUALITY_LABELS[story.qualityStatus];

        if (isEditing) {
          return (
            <div className="rounded-control border border-accent/40 bg-panel p-4 ring-1 ring-accent/30" key={story.id}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-semibold text-ink">Editing Story</p>
                <button
                  className="text-xs text-muted hover:text-ink font-medium"
                  onClick={() => setEditingStoryId(null)}
                >
                  Cancel
                </button>
              </div>
              <InteractiveStoryEditor
                assignmentJobs={assignmentJobs}
                question={`Tweak and complete story details for: ${story.title}`}
                initialStory={story}
                onClose={() => setEditingStoryId(null)}
                onSaved={handleSaved}
              />
            </div>
          );
        }

        const previewText = story.situation || story.promptText || story.result;
        const visibleTags = (story.conceptTags.length > 0 ? story.conceptTags.map((tag) => tag.label) : story.tags).slice(0, COLLAPSED_TAG_LIMIT);
        const hiddenTagCount = (story.conceptTags.length > 0 ? story.conceptTags.length : story.tags.length) - visibleTags.length;

        return (
          <div className="rounded-control border border-border bg-surface p-4 hover:border-accent/20 transition-all" key={story.id}>
            <button
              className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
              onClick={() => toggleExpanded(story.id)}
              type="button"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">{story.title}</h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Badge tone={qualityMeta.tone}>{qualityMeta.label}</Badge>
                  <Badge tone="neutral">{KIND_LABELS[story.storyKind]}</Badge>
                  {story.sourceJobId && (
                    <span className="text-[10px] text-accent font-semibold">
                      {[story.sourceJobCompany, story.sourceJobTitle].filter(Boolean).join(" · ") || "From job"}
                    </span>
                  )}
                  <span className="text-[10px] text-muted">{sourceLabel(story)}</span>
                  {story.assignedJobs.length > 0 ? (
                    <span className="text-[10px] text-muted">· {story.assignedJobs.length} {story.assignedJobs.length === 1 ? "position" : "positions"}</span>
                  ) : null}
                </div>
                {!isExpanded && previewText ? (
                  <p className="mt-1.5 max-w-2xl truncate text-xs text-muted">{previewText}</p>
                ) : null}
                {!isExpanded && visibleTags.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {visibleTags.map((tagItem) => (
                      <Badge key={tagItem} tone="neutral">{tagItem}</Badge>
                    ))}
                    {hiddenTagCount > 0 ? <span className="text-[10px] text-muted">+{hiddenTagCount} more</span> : null}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 text-[10px] font-medium text-muted">{isExpanded ? "Hide details ▴" : "Show details ▾"}</span>
            </button>

            {isExpanded ? (
              <>
                <div className="mt-3 flex items-center justify-end gap-3 border-t border-border pt-2.5">
                  {story.sourceJobId ? (
                    <Link className="text-xs text-accent font-medium hover:underline" href={`/jobs/${story.sourceJobId}`}>
                      View job ↗
                    </Link>
                  ) : null}
                  <button
                    className="text-xs text-accent font-medium hover:underline"
                    onClick={() => setEditingStoryId(story.id)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="text-xs text-muted hover:text-danger transition-colors"
                    onClick={async () => {
                      if (confirm("Are you sure you want to delete this story?")) {
                        await deleteStoryAction(story.id);
                        router.refresh();
                      }
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>

                {story.promptText ? (
                  <div className="mt-3 rounded-control border border-border/70 bg-panel px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Prompt</p>
                    <p className="text-xs leading-relaxed text-ink">{story.promptText}</p>
                  </div>
                ) : null}

                <div className="mt-3 divide-y divide-border/60">
                  {(["situation", "task", "action", "result", "reflection"] as const).map((field) => {
                    const text = story[field];
                    if (!text) return null;
                    const meta = STAR_LABELS[field];

                    return (
                      <div key={field} className="flex gap-3 py-2 items-start first:pt-0 last:pb-0">
                        <span className={`mt-0.5 shrink-0 inline-flex items-center justify-center rounded border text-[9px] font-bold w-5 h-5 leading-none ${meta.color}`}>
                          {meta.abbr}
                        </span>
                        <p className="text-xs text-ink leading-relaxed">{text}</p>
                      </div>
                    );
                  })}
                </div>

                {(story.conceptTags.length > 0 || story.rawKeywords.length > 0 || story.tags.length > 0) && (
                  <div className="mt-3 grid gap-2 border-t border-border/60 pt-2.5">
                    {story.conceptTags.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Grouped tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {story.conceptTags.map((tagItem) => (
                            <Badge key={tagItem.id} tone="neutral">{tagItem.path.length > 0 ? tagItem.path.join(" / ") : tagItem.label}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {(story.rawKeywords.length > 0 || story.tags.length > 0) ? (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Raw keywords</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(story.rawKeywords.length > 0 ? story.rawKeywords : story.tags).map((tagItem) => (
                            <Badge key={tagItem} tone="neutral">{tagItem}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {story.assignedJobs.length > 0 ? (
                  <div className="mt-3 border-t border-border/60 pt-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Used with positions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {story.assignedJobs.map((assignedJob) => (
                        <Badge key={assignedJob.jobId} tone={assignedJob.source === "auto" ? "success" : "neutral"}>
                          {assignedJob.company} · {assignedJob.role}
                          {assignedJob.source === "auto" ? " · Auto-matched" : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {story.qualityNotes ? (
                  <p className="mt-3 border-t border-border/60 pt-2.5 text-xs leading-5 text-muted">{story.qualityNotes}</p>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}

      {filteredStories.length === 0 ? (
        <div className="rounded-control border border-border bg-surface px-4 py-8 text-center">
          <p className="text-sm font-semibold text-ink">No stories match these filters.</p>
          <p className="mt-1 text-xs text-muted">Clear a filter or search for a broader tag, company, position, or STAR detail.</p>
        </div>
      ) : null}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted">
            Page {clampedPage} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-control border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40"
              disabled={clampedPage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              type="button"
            >
              ← Previous
            </button>
            <button
              className="rounded-control border border-border bg-panel px-3 py-1.5 text-xs font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40"
              disabled={clampedPage >= pageCount}
              onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
              type="button"
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
