"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui";
import type { ResumeBuilderSection, ResumeBuilderVersionRecord } from "@/lib/db/types";
import { renderResumeHtml, type ResumeTemplateInput } from "@/lib/documents/resume-template";

type Props = {
  resumeId: string;
  resumeName: string;
  version: ResumeBuilderVersionRecord;
};

const inputCls = "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";
const textareaCls = `${inputCls} resize-y leading-5`;
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted";

function cloneSections(sections: ResumeBuilderSection[]) {
  return JSON.parse(JSON.stringify(sections)) as ResumeBuilderSection[];
}

function itemsToText(items?: string[]) {
  return (items ?? []).join("\n");
}

function textToItems(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function sectionsToTemplate(sections: ResumeBuilderSection[], fallbackName: string): ResumeTemplateInput {
  const template: ResumeTemplateInput = {
    name: fallbackName,
    headline: "",
    contactItems: [],
    title: fallbackName,
    summaryHeading: "Professional Summary",
    summary: "",
    impactHeading: "Key Achievements",
    impactItems: [],
    experienceHeading: "Professional Experience",
    experience: [],
    skillsHeading: "Skills",
    skills: [],
    recognitionHeading: "Awards and Recognition",
    recognition: [],
    extraSections: [],
    educationHeading: "Education",
    education: [],
  };

  for (const section of sections) {
    if (section.type === "header" && section.header) {
      template.name = section.header.name || template.name;
      template.headline = section.header.headline;
      template.contactItems = section.header.contactItems;
    } else if (section.type === "summary") {
      template.summaryHeading = section.title || template.summaryHeading;
      template.summary = section.text ?? "";
    } else if (section.type === "impact") {
      template.impactHeading = section.title || template.impactHeading;
      template.impactItems = section.items ?? [];
    } else if (section.type === "experience") {
      template.experienceHeading = section.title || template.experienceHeading;
      template.experience = section.experience ?? [];
    } else if (section.type === "skills") {
      template.skillsHeading = section.title || template.skillsHeading;
      template.skills = section.items ?? [];
    } else if (section.type === "recognition") {
      template.recognitionHeading = section.title || template.recognitionHeading;
      template.recognition = section.items ?? [];
    } else if (section.type === "education") {
      template.educationHeading = section.title || template.educationHeading;
      template.education = section.education ?? [];
    } else if (section.type === "custom") {
      template.extraSections?.push({ id: section.id, title: section.title, items: section.items ?? [] });
    }
  }

  return template;
}

export function ResumeBuilderEditor({ resumeId, resumeName, version }: Props) {
  const router = useRouter();
  const [sections, setSections] = useState<ResumeBuilderSection[]>(() => cloneSections(version.sections));
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [previewHtml, setPreviewHtml] = useState(() => renderResumeHtml(sectionsToTemplate(version.sections, resumeName)));

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewHtml(renderResumeHtml(sectionsToTemplate(sections, resumeName)));
    }, 400);
    return () => clearTimeout(timer);
  }, [sections, resumeName]);

  const refreshPreview = useCallback(() => {
    setPreviewHtml(renderResumeHtml(sectionsToTemplate(sections, resumeName)));
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

  function addSection() {
    const id = `custom-${Date.now()}`;
    setSections((prev) => [
      ...prev,
      { id, type: "custom", title: "New section", items: [] }
    ]);
  }

  async function save(nextStatus: "needs_review" | "approved") {
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
      if (nextStatus === "approved") {
        router.push("/resumes");
      } else {
        setStatus("idle");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
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
          <LinkButton href="/resumes" variant="quiet">Back</LinkButton>
          <Button disabled={status === "saving"} onClick={() => save("needs_review")} variant="secondary">
            {status === "saving" ? "Saving..." : "Save draft"}
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
            Edit any source section below. The preview updates automatically.
          </p>

          <div className="grid gap-3">
            {sections.map((section, index) => (
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
                  <div className="mt-6 flex items-center gap-2">
                    <button className="text-xs text-muted hover:text-ink" disabled={index === 0} onClick={() => moveSection(index, -1)} type="button">Move up</button>
                    <button className="text-xs text-muted hover:text-ink" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)} type="button">Move down</button>
                    {section.type !== "header" && (
                      <button className="text-xs text-danger hover:underline" onClick={() => removeSection(index)} type="button">Remove</button>
                    )}
                  </div>
                </div>

                {section.type === "header" && (
                  <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input
                      className={inputCls}
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
                  <label className={labelCls}>Contact items</label>
                  <textarea
                    className={textareaCls}
                    rows={3}
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
                    rows={5}
                    value={section.text ?? ""}
                    onChange={(event) => updateSection(index, { ...section, text: event.target.value })}
                  />
                )}

                {["impact", "skills", "recognition", "custom"].includes(section.type) && (
                  <textarea
                    className={textareaCls}
                    rows={Math.max(4, (section.items ?? []).length + 1)}
                    value={itemsToText(section.items)}
                    onChange={(event) => updateSection(index, { ...section, items: textToItems(event.target.value) })}
                  />
                )}

                {section.type === "experience" && (
                  <div className="grid gap-4">
                    {(section.experience ?? []).map((entry, entryIndex) => (
                      <div className="rounded-control border border-border bg-panel p-3" key={entryIndex}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>Title</label>
                        <input
                          className={inputCls}
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
                    <label className={`${labelCls} mt-3`}>Bullets</label>
                    <textarea
                      className={textareaCls}
                      rows={Math.max(4, entry.bullets.length + 1)}
                      value={itemsToText(entry.bullets)}
                      onChange={(event) => {
                        const experience = [...(section.experience ?? [])];
                        experience[entryIndex] = { ...entry, bullets: textToItems(event.target.value) };
                        updateSection(index, { ...section, experience });
                      }}
                    />
                  </div>
                    ))}
                  </div>
                )}

                {section.type === "education" && (
                  <div className="grid gap-3">
                    {(section.education ?? []).map((entry, entryIndex) => (
                      <div className="grid gap-3 rounded-control border border-border bg-panel p-3 sm:grid-cols-3" key={entryIndex}>
                    <div>
                      <label className={labelCls}>Degree</label>
                      <input
                        className={inputCls}
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
                      <label className={labelCls}>Focus</label>
                      <input
                        className={inputCls}
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
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="mt-4">
            <Button onClick={addSection} variant="secondary">Add section</Button>
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
    </div>
  );
}
