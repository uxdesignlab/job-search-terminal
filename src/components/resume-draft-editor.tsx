"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui";
import { renderResumeHtml, type ResumeTemplateInput } from "@/lib/documents/resume-template";

type ExperienceState = {
  title: string;
  organization: string;
  location: string;
  dateRange: string;
  bulletsText: string;
};

type EditorState = {
  name: string;
  headline: string;
  contactText: string;
  summary: string;
  impactText: string;
  skills: string;
  recognition: string;
  extraSections: Array<{ id?: string; title: string; itemsText: string }>;
  experience: ExperienceState[];
};

function draftToState(draft: ResumeTemplateInput): EditorState {
  return {
    name: draft.name,
    headline: draft.headline,
    contactText: draft.contactItems.join("\n"),
    summary: draft.summary,
    impactText: draft.impactItems.join("\n"),
    skills: draft.skills.join("\n"),
    recognition: draft.recognition.join("\n"),
    extraSections: (draft.extraSections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      itemsText: section.items.join("\n"),
    })),
    experience: draft.experience.map((e) => {
      // Existing saved drafts may have location embedded in organization as "Org | Location"
      const pipeIdx = e.location === undefined ? e.organization.indexOf(" | ") : -1;
      const org = pipeIdx >= 0 ? e.organization.slice(0, pipeIdx).trim() : e.organization;
      const loc = e.location ?? (pipeIdx >= 0 ? e.organization.slice(pipeIdx + 3).trim() : "");
      return {
        title: e.title,
        organization: org,
        location: loc,
        dateRange: e.dateRange,
        bulletsText: e.bullets.join("\n"),
      };
    }),
  };
}

function stateToDraft(state: EditorState, base: ResumeTemplateInput): ResumeTemplateInput {
  return {
    name: state.name,
    headline: state.headline,
    contactItems: state.contactText.split("\n").map((s) => s.trim()).filter(Boolean),
    title: base.title,
    summary: state.summary,
	    impactHeading: base.impactHeading,
	    impactItems: state.impactText.split("\n").map((s) => s.trim()).filter(Boolean),
	    experienceHeading: base.experienceHeading,
    experience: state.experience.map((e) => ({
      title: e.title,
      organization: e.organization,
      location: e.location || undefined,
      dateRange: e.dateRange,
      bullets: e.bulletsText.split("\n").map((s) => s.trim()).filter(Boolean),
    })),
	    skillsHeading: base.skillsHeading,
	    skills: state.skills.split("\n").map((s) => s.trim()).filter(Boolean),
	    recognitionHeading: base.recognitionHeading,
	    recognition: state.recognition.split("\n").map((s) => s.trim()).filter(Boolean),
    extraSections: state.extraSections
      .map((section) => ({
        id: section.id,
        title: section.title.trim(),
        items: section.itemsText.split("\n").map((s) => s.trim()).filter(Boolean),
      }))
      .filter((section) => section.title && section.items.length > 0),
    education: base.education,
  };
}

type Props = {
  documentId: string;
  jobId: string;
  initialDraft: ResumeTemplateInput;
  documentTitle: string;
  baseResume: string;
  keywordCoverage: number;
};

export function ResumeDraftEditor({ documentId, jobId, initialDraft, documentTitle, baseResume, keywordCoverage }: Props) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(() => draftToState(initialDraft));
  const [pdfStatus, setPdfStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [pdfError, setPdfError] = useState("");
  const [previewHtml, setPreviewHtml] = useState(() => renderResumeHtml(initialDraft));

  // Debounced live preview
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = stateToDraft(state, initialDraft);
      setPreviewHtml(renderResumeHtml(draft));
    }, 400);
    return () => clearTimeout(timer);
  }, [state, initialDraft]);

  const refreshPreview = useCallback(() => {
    setPreviewHtml(renderResumeHtml(stateToDraft(state, initialDraft)));
  }, [state, initialDraft]);

  const updateField = useCallback(<K extends keyof Omit<EditorState, "experience">>(
    key: K,
    value: EditorState[K]
  ) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateExperience = useCallback((idx: number, field: keyof ExperienceState, value: string) => {
    setState((prev) => ({
      ...prev,
      experience: prev.experience.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    }));
  }, []);

  const updateExtraSection = useCallback((idx: number, field: "title" | "itemsText", value: string) => {
    setState((prev) => ({
      ...prev,
      extraSections: prev.extraSections.map((section, i) => (i === idx ? { ...section, [field]: value } : section)),
    }));
  }, []);

  async function createPdf() {
    setPdfStatus("generating");
    setPdfError("");
    const draft = stateToDraft(state, initialDraft);
    try {
      const res = await fetch(`/api/generated-documents/${documentId}/render-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "PDF creation failed");
      setPdfStatus("done");
      router.push(`/jobs/${jobId}`);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : String(err));
      setPdfStatus("error");
    }
  }

  const inputCls = "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";
  const textareaCls = `${inputCls} resize-y leading-5`;
  const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted";
  const sectionCls = "mb-6";

  return (
    <div className="grid gap-4">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted">Edit resume draft</p>
          <h1 className="text-lg font-semibold text-ink">{documentTitle}</h1>
          <p className="mt-0.5 text-xs text-muted">
            Base: {baseResume} · {keywordCoverage}% keyword coverage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href={`/jobs/${jobId}`} variant="quiet">
            ← Back to job
          </LinkButton>
          {pdfStatus === "error" && (
            <p className="text-xs text-danger">{pdfError}</p>
          )}
          <Button
            disabled={pdfStatus === "generating"}
            onClick={createPdf}
            variant="primary"
          >
            {pdfStatus === "generating" ? "Creating PDF…" : "Create PDF →"}
          </Button>
        </div>
      </div>

      {/* Split editor / preview */}
      <div
        className="grid gap-0 overflow-hidden rounded-panel border border-border lg:grid-cols-[1fr_1fr]"
        style={{ height: "calc(100vh - 220px)" }}
      >
        {/* Left: editor */}
        <div className="overflow-y-auto border-b border-border bg-panel p-5 lg:border-b-0 lg:border-r">
          <p className="mb-4 text-xs text-muted">
            Edit any section below. The preview updates automatically.
          </p>

          {/* Header */}
          <div className={sectionCls}>
            <label className={labelCls}>Name</label>
            <input
              className={`${inputCls} mb-2`}
              value={state.name}
              onChange={(e) => updateField("name", e.target.value)}
              type="text"
            />
            <label className={labelCls}>Headline</label>
            <input
              className={`${inputCls} mb-2`}
              value={state.headline}
              onChange={(e) => updateField("headline", e.target.value)}
              type="text"
            />
            <label className={labelCls}>Contact info (one item per line)</label>
            <textarea
              className={textareaCls}
              rows={3}
              value={state.contactText}
              onChange={(e) => updateField("contactText", e.target.value)}
            />
          </div>

          {/* Summary */}
          <div className={sectionCls}>
            <label className={labelCls}>Professional Summary</label>
            <textarea
              className={textareaCls}
              rows={5}
              value={state.summary}
              onChange={(e) => updateField("summary", e.target.value)}
            />
          </div>

          {/* Key achievements */}
          {state.impactText !== "" || initialDraft.impactItems.length > 0 ? (
            <div className={sectionCls}>
              <label className={labelCls}>Key Achievements (one per line)</label>
              <textarea
                className={textareaCls}
                rows={Math.max(3, state.impactText.split("\n").length + 1)}
                value={state.impactText}
                onChange={(e) => updateField("impactText", e.target.value)}
              />
            </div>
          ) : null}

          {/* Experience */}
          <div className={sectionCls}>
            <p className={labelCls}>Professional Experience</p>
            {state.experience.map((exp, idx) => (
              <div key={idx} className="mb-4 rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Title</label>
                    <input
                      className={inputCls}
                      value={exp.title}
                      onChange={(e) => updateExperience(idx, "title", e.target.value)}
                      type="text"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Organization</label>
                    <input
                      className={inputCls}
                      value={exp.organization}
                      onChange={(e) => updateExperience(idx, "organization", e.target.value)}
                      type="text"
                    />
                  </div>
                </div>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Date range</label>
                    <input
                      className={inputCls}
                      value={exp.dateRange}
                      onChange={(e) => updateExperience(idx, "dateRange", e.target.value)}
                      type="text"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Location</label>
                    <input
                      className={inputCls}
                      value={exp.location}
                      onChange={(e) => updateExperience(idx, "location", e.target.value)}
                      placeholder="City, State"
                      type="text"
                    />
                  </div>
                </div>
                <label className={labelCls}>Bullets (one per line)</label>
                <textarea
                  className={textareaCls}
                  rows={Math.max(4, exp.bulletsText.split("\n").length + 1)}
                  value={exp.bulletsText}
                  onChange={(e) => updateExperience(idx, "bulletsText", e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className={sectionCls}>
            <label className={labelCls}>Skills (one per line)</label>
            <textarea
              className={textareaCls}
              rows={Math.max(4, state.skills.split("\n").length + 1)}
              value={state.skills}
              onChange={(e) => updateField("skills", e.target.value)}
            />
          </div>

          {/* Recognition */}
          {(state.recognition !== "" || initialDraft.recognition.length > 0) ? (
            <div className={sectionCls}>
              <label className={labelCls}>Recognition (one per line)</label>
              <textarea
                className={textareaCls}
                rows={Math.max(3, state.recognition.split("\n").length + 1)}
                value={state.recognition}
                onChange={(e) => updateField("recognition", e.target.value)}
              />
            </div>
          ) : null}

          {state.extraSections.map((section, idx) => (
            <div className={sectionCls} key={`${section.title}-${idx}`}>
              <label className={labelCls}>Section title</label>
              <input
                className={`${inputCls} mb-2`}
                value={section.title}
                onChange={(e) => updateExtraSection(idx, "title", e.target.value)}
                type="text"
              />
              <label className={labelCls}>Items (one per line)</label>
              <textarea
                className={textareaCls}
                rows={Math.max(3, section.itemsText.split("\n").length + 1)}
                value={section.itemsText}
                onChange={(e) => updateExtraSection(idx, "itemsText", e.target.value)}
              />
            </div>
          ))}

          {/* Education — display only */}
          {initialDraft.education.length > 0 && (
            <div className={sectionCls}>
              <p className={labelCls}>Education</p>
              {initialDraft.education.map((ed, i) => (
                <div key={i} className="mb-1 text-sm text-muted">
                  <span className="text-ink">{ed.degree}</span>
                  {ed.school ? ` · ${ed.school}` : ""}
                  {ed.focus ? ` · ${ed.focus}` : ""}
                </div>
              ))}
              <p className="mt-1 text-xs text-muted/60">Education is pulled from your resume and not editable here.</p>
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <div className="hidden flex-col bg-surface lg:flex">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-xs text-muted">Preview</span>
            <button
              className="rounded px-2 py-1 text-xs text-muted hover:bg-border hover:text-ink transition-colors"
              onClick={refreshPreview}
              type="button"
            >
              ↻ Refresh
            </button>
          </div>
          <iframe
            className="min-h-0 flex-1 w-full border-0"
            srcDoc={previewHtml}
            title="Resume preview"
          />
        </div>
      </div>

      {/* Mobile: preview below */}
      <div className="block rounded-panel border border-border bg-surface lg:hidden" style={{ height: 600 }}>
        <iframe
          className="h-full w-full border-0"
          srcDoc={previewHtml}
          title="Resume preview"
        />
      </div>
    </div>
  );
}
