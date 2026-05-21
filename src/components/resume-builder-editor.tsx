"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { ResumeBuilderSection, ResumeBuilderSectionType, ResumeBuilderVersionRecord } from "@/lib/db/types";
import { renderBuilderPreviewHtml } from "@/lib/documents/resume-template";

type Props = {
  resumeId: string;
  resumeName: string;
  version: ResumeBuilderVersionRecord;
  isNew?: boolean;
  backHref?: string;
  /** When provided, Back/Approve/Delete call this instead of navigating (used for wizard inline mode). */
  onDone?: () => void;
};

const inputCls = "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";
const textareaCls = `${inputCls} resize-y leading-5`;
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted";

type SectionAIState = {
  status: "idle" | "loading" | "showing" | "error";
  improved?: string;
  error?: string;
};

function cloneSections(sections: ResumeBuilderSection[]) {
  return JSON.parse(JSON.stringify(sections)) as ResumeBuilderSection[];
}

function itemsToText(items?: string[]) {
  return (items ?? []).join("\n");
}

function textToItems(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}


function getSectionContent(section: ResumeBuilderSection): string {
  if (section.type === "summary") return section.text ?? "";
  if (["impact", "skills", "recognition", "custom"].includes(section.type)) return itemsToText(section.items);
  if (section.type === "experience") {
    return (section.experience ?? [])
      .map((e) => `${e.title} at ${e.organization}\n${itemsToText(e.bullets)}`)
      .join("\n\n");
  }
  return "";
}

function applyImprovedContent(section: ResumeBuilderSection, improved: string): ResumeBuilderSection {
  if (section.type === "summary") return { ...section, text: improved };
  if (["impact", "skills", "recognition", "custom"].includes(section.type)) {
    return { ...section, items: textToItems(improved) };
  }
  return section;
}

const ADD_SECTION_OPTIONS: { type: ResumeBuilderSectionType; label: string }[] = [
  { type: "summary", label: "Summary" },
  { type: "impact", label: "Key Achievements" },
  { type: "experience", label: "Experience" },
  { type: "skills", label: "Skills" },
  { type: "recognition", label: "Awards & Recognition" },
  { type: "education", label: "Education" },
  { type: "custom", label: "Custom section" },
];

const SECTION_DEFAULTS: Record<ResumeBuilderSectionType, Partial<ResumeBuilderSection>> = {
  header: { header: { name: "", headline: "", contactItems: [] } },
  summary: { text: "" },
  impact: { title: "Key Achievements", items: [] },
  experience: { title: "Professional Experience", experience: [{ title: "", organization: "", location: "", dateRange: "", bullets: [] }] },
  skills: { title: "Skills", items: [] },
  recognition: { title: "Awards & Recognition", items: [] },
  education: { title: "Education", education: [{ degree: "", school: "", focus: "" }] },
  custom: { title: "New section", items: [] },
};

const SECTION_TITLES: Record<ResumeBuilderSectionType, string> = {
  header: "Contact",
  summary: "Professional Summary",
  impact: "Key Achievements",
  experience: "Professional Experience",
  skills: "Skills",
  recognition: "Awards & Recognition",
  education: "Education",
  custom: "New section",
};

function canImproveWithAI(type: ResumeBuilderSectionType): boolean {
  return ["summary", "impact", "skills", "recognition", "custom", "experience"].includes(type);
}

export function ResumeBuilderEditor({ resumeId, resumeName, version, isNew = false, backHref = "/resumes", onDone }: Props) {
  const router = useRouter();
  const [sections, setSections] = useState<ResumeBuilderSection[]>(() => cloneSections(version.sections));
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [previewHtml, setPreviewHtml] = useState(() => renderBuilderPreviewHtml(version.sections, resumeName));
  const [sectionAI, setSectionAI] = useState<Record<string, SectionAIState>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [hasSaved, setHasSaved] = useState(!isNew);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewHtml(renderBuilderPreviewHtml(sections, resumeName));
    }, 400);
    return () => clearTimeout(timer);
  }, [sections, resumeName]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    if (showAddMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAddMenu]);

  useEffect(() => {
    if (!isNew || hasSaved) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isNew, hasSaved]);

  const refreshPreview = useCallback(() => {
    setPreviewHtml(renderBuilderPreviewHtml(sections, resumeName));
  }, [sections, resumeName]);

  function updateSection(index: number, next: ResumeBuilderSection) {
    setSections((prev) => prev.map((section, i) => (i === index ? next : section)));
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [section] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, section);
      return copy;
    });
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function addSection(type: ResumeBuilderSectionType) {
    const id = `${type}-${Date.now()}`;
    const defaults = SECTION_DEFAULTS[type];
    const title = SECTION_TITLES[type];
    setSections((prev) => [...prev, { id, type, title, ...defaults } as ResumeBuilderSection]);
    setShowAddMenu(false);
  }

  function addExperienceEntry(sectionIndex: number) {
    setSections((prev) =>
      prev.map((section, i) => {
        if (i !== sectionIndex || section.type !== "experience") return section;
        return {
          ...section,
          experience: [
            ...(section.experience ?? []),
            { title: "", organization: "", location: "", dateRange: "", bullets: [] },
          ],
        };
      })
    );
  }

  function removeExperienceEntry(sectionIndex: number, entryIndex: number) {
    setSections((prev) =>
      prev.map((section, i) => {
        if (i !== sectionIndex || section.type !== "experience") return section;
        return {
          ...section,
          experience: (section.experience ?? []).filter((_, ei) => ei !== entryIndex),
        };
      })
    );
  }

  function addEducationEntry(sectionIndex: number) {
    setSections((prev) =>
      prev.map((section, i) => {
        if (i !== sectionIndex || section.type !== "education") return section;
        return {
          ...section,
          education: [...(section.education ?? []), { degree: "", school: "", focus: "" }],
        };
      })
    );
  }

  function removeEducationEntry(sectionIndex: number, entryIndex: number) {
    setSections((prev) =>
      prev.map((section, i) => {
        if (i !== sectionIndex || section.type !== "education") return section;
        return {
          ...section,
          education: (section.education ?? []).filter((_, ei) => ei !== entryIndex),
        };
      })
    );
  }

  async function improveWithAI(index: number) {
    const section = sections[index];
    const content = getSectionContent(section);
    if (!content.trim()) return;

    setSectionAI((prev) => ({ ...prev, [section.id]: { status: "loading" } }));

    try {
      const res = await fetch("/api/resume-sections/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType: section.type, content }),
      });
      const data = (await res.json()) as { improved?: string; error?: string };
      if (!res.ok || !data.improved) throw new Error(data.error ?? "AI improvement failed");
      setSectionAI((prev) => ({ ...prev, [section.id]: { status: "showing", improved: data.improved } }));
    } catch (err) {
      setSectionAI((prev) => ({
        ...prev,
        [section.id]: { status: "error", error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  function acceptAIImprovement(index: number) {
    const section = sections[index];
    const ai = sectionAI[section.id];
    if (ai?.status !== "showing" || !ai.improved) return;
    updateSection(index, applyImprovedContent(section, ai.improved));
    setSectionAI((prev) => ({ ...prev, [section.id]: { status: "idle" } }));
  }

  function discardAIImprovement(sectionId: string) {
    setSectionAI((prev) => ({ ...prev, [sectionId]: { status: "idle" } }));
  }

  async function save(nextStatus: "needs_review" | "approved", afterSave?: () => void) {
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(`/api/resume-versions/${resumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          sections,
          sourceHash: version.sourceHash
        })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      setHasSaved(true);
      setStatus("idle");
      if (afterSave) {
        afterSave();
      } else if (nextStatus === "approved") {
        onDone ? onDone() : router.push("/resumes");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function deleteResume() {
    setIsDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/resume/${resumeId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDone ? onDone() : router.push("/resumes");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-muted">Resume builder</p>
          <h1 className="text-xl font-semibold text-ink">{resumeName}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Review the structured source resume. This approved version is what job-specific resume generation will use.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!showDeleteConfirm ? (
            <button
              className="text-sm font-medium text-danger hover:underline disabled:opacity-50"
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(true)}
              type="button"
            >
              Remove
            </button>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted">Delete this resume?</span>
              <button
                className="font-semibold text-danger hover:underline disabled:opacity-50"
                disabled={isDeleting}
                onClick={deleteResume}
                type="button"
              >
                {isDeleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                className="text-muted hover:underline"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                Cancel
              </button>
            </span>
          )}
          {deleteError && <span className="text-xs text-danger">{deleteError}</span>}
          <button
            className="rounded-control border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-ink"
            onClick={() => {
              if (isNew && !hasSaved) {
                setShowLeaveDialog(true);
              } else {
                onDone ? onDone() : router.push(backHref);
              }
            }}
            type="button"
          >
            Back
          </button>
          <Button disabled={status === "saving"} onClick={() => save("needs_review")} variant="secondary">
            {status === "saving" ? "Saving…" : "Save draft"}
          </Button>
          <Button disabled={status === "saving" || sections.length === 0} onClick={() => save("approved")}>
            Approve version
          </Button>
        </div>
      </div>

      {status === "error" && <p className="text-sm text-danger">{error}</p>}

      <div
        className="grid gap-0 overflow-hidden rounded-panel border border-border lg:grid-cols-[1fr_1fr]"
        style={{ height: "calc(100vh - 220px)" }}
      >
        <div className="overflow-y-auto border-b border-border bg-panel p-5 lg:border-b-0 lg:border-r">
          <p className="mb-4 text-xs text-muted">
            Edit any source section below. Use ✨ Improve to refine content with AI. The preview updates automatically.
          </p>

          <div className="grid gap-3">
            {sections.map((section, index) => {
              const ai = sectionAI[section.id] ?? { status: "idle" };
              return (
                <section className="rounded-panel border border-border bg-surface p-4" key={section.id}>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <label className={labelCls}>Section title</label>
                      <input
                        className={inputCls}
                        value={section.title}
                        onChange={(event) => updateSection(index, { ...section, title: event.target.value })}
                        type="text"
                      />
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      {canImproveWithAI(section.type) && (
                        <button
                          className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={ai.status === "loading" || !getSectionContent(section).trim()}
                          onClick={() => improveWithAI(index)}
                          title="Improve this section with AI"
                          type="button"
                        >
                          {ai.status === "loading" ? (
                            <span className="flex items-center gap-1">
                              <svg aria-hidden="true" className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                              </svg>
                              Improving…
                            </span>
                          ) : "✨ Improve"}
                        </button>
                      )}
                      <button className="text-xs text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30" disabled={index === 0} onClick={() => moveSection(index, -1)} title="Move section up" type="button">↑ Move up</button>
                      <button className="text-xs text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)} title="Move section down" type="button">↓ Move down</button>
                      {section.type !== "header" && (
                        <button className="text-xs text-danger hover:underline" onClick={() => removeSection(index)} type="button">Remove</button>
                      )}
                    </div>
                  </div>

                  {/* AI improvement suggestion */}
                  {ai.status === "showing" && ai.improved && (
                    <div className="mb-4 rounded-control border border-accent/40 bg-accent/5 p-3">
                      <p className="mb-2 text-xs font-semibold text-accent">AI suggestion — review and accept or discard</p>
                      <pre className="mb-3 whitespace-pre-wrap text-xs leading-5 text-ink">{ai.improved}</pre>
                      <div className="flex gap-2">
                        <button
                          className="rounded-control border border-accent bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-[rgb(var(--color-accent-strong))]"
                          onClick={() => acceptAIImprovement(index)}
                          type="button"
                        >
                          Accept
                        </button>
                        <button
                          className="rounded-control border border-border px-3 py-1 text-xs font-medium text-muted hover:text-ink"
                          onClick={() => discardAIImprovement(section.id)}
                          type="button"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  )}

                  {ai.status === "error" && (
                    <p className="mb-3 text-xs text-danger">{ai.error}</p>
                  )}

                  {section.type === "header" && (
                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelCls}>Name</label>
                          <input
                            className={inputCls}
                            placeholder="Your full name"
                            value={section.header?.name ?? ""}
                            onChange={(event) => updateSection(index, {
                              ...section,
                              header: { name: event.target.value, headline: section.header?.headline ?? "", contactItems: section.header?.contactItems ?? [] }
                            })}
                            type="text"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Headline</label>
                          <input
                            className={inputCls}
                            placeholder="e.g. Senior Product Designer"
                            value={section.header?.headline ?? ""}
                            onChange={(event) => updateSection(index, {
                              ...section,
                              header: { name: section.header?.name ?? "", headline: event.target.value, contactItems: section.header?.contactItems ?? [] }
                            })}
                            type="text"
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Contact items (one per line)</label>
                        <textarea
                          className={textareaCls}
                          placeholder={"email@example.com\n(555) 123-4567\nlinkedin.com/in/yourname\nPortfolio: yoursite.com"}
                          rows={Math.max(4, (section.header?.contactItems ?? []).length + 1)}
                          value={itemsToText(section.header?.contactItems)}
                          onChange={(event) => updateSection(index, {
                            ...section,
                            header: { name: section.header?.name ?? "", headline: section.header?.headline ?? "", contactItems: textToItems(event.target.value) }
                          })}
                        />
                      </div>
                    </div>
                  )}

                  {section.type === "summary" && (
                    <textarea
                      className={textareaCls}
                      placeholder="Write a compelling 3–4 sentence professional summary highlighting your unique value proposition, key skills, and career goals..."
                      rows={5}
                      value={section.text ?? ""}
                      onChange={(event) => updateSection(index, { ...section, text: event.target.value })}
                    />
                  )}

                  {["impact", "skills", "recognition", "custom"].includes(section.type) && (
                    <textarea
                      className={textareaCls}
                      placeholder={
                        section.type === "skills"
                          ? "React, TypeScript, Figma, SQL, Agile..."
                          : section.type === "impact"
                          ? "Reduced page load time by 40%, improving user retention by 15%\nLed a team of 6 to deliver a $2M product launch on time..."
                          : "One item per line"
                      }
                      rows={Math.max(4, (section.items ?? []).length + 1)}
                      value={itemsToText(section.items)}
                      onChange={(event) => updateSection(index, { ...section, items: textToItems(event.target.value) })}
                    />
                  )}

                  {section.type === "experience" && (
                    <div className="grid gap-4">
                      {(section.experience ?? []).map((entry, entryIndex) => (
                        <div className="rounded-control border border-border bg-panel p-3" key={entryIndex}>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold text-muted">Role {entryIndex + 1}</p>
                            {(section.experience ?? []).length > 1 && (
                              <button
                                className="text-xs text-danger hover:underline"
                                onClick={() => removeExperienceEntry(index, entryIndex)}
                                type="button"
                              >
                                Remove role
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className={labelCls}>Title</label>
                              <input
                                className={inputCls}
                                placeholder="e.g. Senior Product Designer"
                                value={entry.title}
                                onChange={(event) => {
                                  const experience = [...(section.experience ?? [])];
                                  experience[entryIndex] = { ...entry, title: event.target.value };
                                  updateSection(index, { ...section, experience });
                                }}
                                type="text"
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Organization</label>
                              <input
                                className={inputCls}
                                placeholder="e.g. Acme Corp"
                                value={entry.organization}
                                onChange={(event) => {
                                  const experience = [...(section.experience ?? [])];
                                  experience[entryIndex] = { ...entry, organization: event.target.value };
                                  updateSection(index, { ...section, experience });
                                }}
                                type="text"
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Date range</label>
                              <input
                                className={inputCls}
                                placeholder="e.g. Jan 2022 – Present"
                                value={entry.dateRange}
                                onChange={(event) => {
                                  const experience = [...(section.experience ?? [])];
                                  experience[entryIndex] = { ...entry, dateRange: event.target.value };
                                  updateSection(index, { ...section, experience });
                                }}
                                type="text"
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Location</label>
                              <input
                                className={inputCls}
                                placeholder="e.g. Remote / Nashville, TN"
                                value={entry.location ?? ""}
                                onChange={(event) => {
                                  const experience = [...(section.experience ?? [])];
                                  experience[entryIndex] = { ...entry, location: event.target.value };
                                  updateSection(index, { ...section, experience });
                                }}
                                type="text"
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="mb-1.5 flex items-center justify-between">
                              <label className={labelCls} style={{ margin: 0 }}>Bullets (one per line)</label>
                              <button
                                className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                                disabled={!entry.bullets.join("").trim() && !entry.title.trim()}
                                onClick={async () => {
                                  const content = `${entry.title} at ${entry.organization}\n${itemsToText(entry.bullets)}`;
                                  const aiKey = `${section.id}-entry-${entryIndex}`;
                                  setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "loading" } }));
                                  try {
                                    const res = await fetch("/api/resume-sections/improve", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ sectionType: "experience", content }),
                                    });
                                    const data = (await res.json()) as { improved?: string; error?: string };
                                    if (!res.ok || !data.improved) throw new Error(data.error ?? "Failed");
                                    setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "showing", improved: data.improved } }));
                                  } catch (err) {
                                    setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "error", error: err instanceof Error ? err.message : "Failed" } }));
                                  }
                                }}
                                type="button"
                              >
                                {sectionAI[`${section.id}-entry-${entryIndex}`]?.status === "loading" ? (
                                  <span className="flex items-center gap-1">
                                    <svg aria-hidden="true" className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                                    </svg>
                                    Improving…
                                  </span>
                                ) : "✨ Improve bullets"}
                              </button>
                            </div>
                            {/* AI suggestion for this experience entry */}
                            {(() => {
                              const aiKey = `${section.id}-entry-${entryIndex}`;
                              const entryAI = sectionAI[aiKey];
                              if (entryAI?.status === "showing" && entryAI.improved) {
                                const bulletLines = entryAI.improved
                                  .split("\n")
                                  .filter((line) => !line.startsWith(entry.title) && !line.startsWith(entry.organization))
                                  .filter(Boolean);
                                return (
                                  <div className="mb-3 rounded-control border border-accent/40 bg-accent/5 p-3">
                                    <p className="mb-2 text-xs font-semibold text-accent">AI suggestion</p>
                                    <pre className="mb-2 whitespace-pre-wrap text-xs leading-5 text-ink">{bulletLines.join("\n")}</pre>
                                    <div className="flex gap-2">
                                      <button
                                        className="rounded-control border border-accent bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-[rgb(var(--color-accent-strong))]"
                                        onClick={() => {
                                          const exp = [...(section.experience ?? [])];
                                          exp[entryIndex] = { ...entry, bullets: textToItems(bulletLines.join("\n")) };
                                          updateSection(index, { ...section, experience: exp });
                                          setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "idle" } }));
                                        }}
                                        type="button"
                                      >
                                        Accept
                                      </button>
                                      <button
                                        className="rounded-control border border-border px-3 py-1 text-xs font-medium text-muted hover:text-ink"
                                        onClick={() => setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "idle" } }))}
                                        type="button"
                                      >
                                        Discard
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                              if (entryAI?.status === "error") {
                                return <p className="mb-2 text-xs text-danger">{entryAI.error}</p>;
                              }
                              return null;
                            })()}
                            <textarea
                              className={textareaCls}
                              placeholder={"Led cross-functional team of 8 to redesign onboarding flow\nReduced drop-off rate by 32% within 60 days of launch\nConducted 20+ user interviews to validate design decisions"}
                              rows={Math.max(4, entry.bullets.length + 1)}
                              value={itemsToText(entry.bullets)}
                              onChange={(event) => {
                                const experience = [...(section.experience ?? [])];
                                experience[entryIndex] = { ...entry, bullets: textToItems(event.target.value) };
                                updateSection(index, { ...section, experience });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <button
                        className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                        onClick={() => addExperienceEntry(index)}
                        type="button"
                      >
                        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Add role
                      </button>
                    </div>
                  )}

                  {section.type === "education" && (
                    <div className="grid gap-3">
                      {(section.education ?? []).map((entry, entryIndex) => (
                        <div className="rounded-control border border-border bg-panel p-3" key={entryIndex}>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold text-muted">Entry {entryIndex + 1}</p>
                            {(section.education ?? []).length > 1 && (
                              <button
                                className="text-xs text-danger hover:underline"
                                onClick={() => removeEducationEntry(index, entryIndex)}
                                type="button"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <label className={labelCls}>Degree</label>
                              <input
                                className={inputCls}
                                placeholder="e.g. B.S. Computer Science"
                                value={entry.degree}
                                onChange={(event) => {
                                  const education = [...(section.education ?? [])];
                                  education[entryIndex] = { ...entry, degree: event.target.value };
                                  updateSection(index, { ...section, education });
                                }}
                                type="text"
                              />
                            </div>
                            <div>
                              <label className={labelCls}>School</label>
                              <input
                                className={inputCls}
                                placeholder="e.g. State University"
                                value={entry.school}
                                onChange={(event) => {
                                  const education = [...(section.education ?? [])];
                                  education[entryIndex] = { ...entry, school: event.target.value };
                                  updateSection(index, { ...section, education });
                                }}
                                type="text"
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Focus / Honors</label>
                              <input
                                className={inputCls}
                                placeholder="e.g. Magna Cum Laude"
                                value={entry.focus ?? ""}
                                onChange={(event) => {
                                  const education = [...(section.education ?? [])];
                                  education[entryIndex] = { ...entry, focus: event.target.value };
                                  updateSection(index, { ...section, education });
                                }}
                                type="text"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                        onClick={() => addEducationEntry(index)}
                        type="button"
                      >
                        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Add entry
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Add section */}
          <div className="relative mt-4" ref={addMenuRef}>
            <button
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
              onClick={() => setShowAddMenu((prev) => !prev)}
              type="button"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Add section
              <svg aria-hidden="true" className={`h-3 w-3 transition-transform ${showAddMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showAddMenu && (
              <div className="absolute bottom-full left-0 z-10 mb-1 w-48 overflow-hidden rounded-control border border-border bg-panel shadow-lg">
                {ADD_SECTION_OPTIONS.map((opt) => (
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-ink hover:bg-border"
                    key={opt.type}
                    onClick={() => addSection(opt.type)}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="hidden flex-col bg-surface lg:flex">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-xs text-muted">Preview</span>
            <button
              className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-border hover:text-ink"
              onClick={refreshPreview}
              type="button"
            >
              ↻ Refresh
            </button>
          </div>
          <iframe
            className="min-h-0 w-full flex-1 border-0"
            srcDoc={previewHtml}
            title="Resume builder preview"
          />
        </div>
      </div>

      <div className="block rounded-panel border border-border bg-surface lg:hidden" style={{ height: 600 }}>
        <iframe
          className="h-full w-full border-0"
          srcDoc={previewHtml}
          title="Resume builder preview"
        />
      </div>

      {showLeaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-panel border border-border bg-surface p-6 shadow-xl">
            <h2 className="text-base font-semibold text-ink">Leave without saving?</h2>
            <p className="mt-2 text-sm leading-5 text-muted">
              This resume has never been saved. If you leave, it will be permanently deleted.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                className="w-full rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-[rgb(var(--color-accent-strong))] disabled:opacity-50"
                disabled={status === "saving"}
                onClick={() => save("needs_review", () => {
                  setShowLeaveDialog(false);
                  onDone ? onDone() : router.push(backHref);
                })}
                type="button"
              >
                {status === "saving" ? "Saving…" : "Save draft and leave"}
              </button>
              <button
                className="w-full rounded-control border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"
                disabled={isDeleting}
                onClick={async () => {
                  setShowLeaveDialog(false);
                  await deleteResume();
                }}
                type="button"
              >
                {isDeleting ? "Deleting…" : "Delete and leave"}
              </button>
              <button
                className="w-full rounded-control border border-border px-4 py-2 text-sm text-muted hover:text-ink"
                onClick={() => {
                  setShowLeaveDialog(false);
                  onDone ? onDone() : router.push(backHref);
                }}
                type="button"
              >
                Leave without saving
              </button>
              <button
                className="mt-1 text-sm text-muted hover:underline"
                onClick={() => setShowLeaveDialog(false)}
                type="button"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
