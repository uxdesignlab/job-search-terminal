"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui";
import { renderResumeHtml, type ResumeTemplateInput } from "@/lib/documents/resume-template";

type SectionAIState = {
  status: "idle" | "loading" | "showing" | "error";
  improved?: string;
  error?: string;
};

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
  summaryHeading: string;
  summary: string;
  impactHeading: string;
  impactText: string;
  experienceHeading: string;
  experience: ExperienceState[];
  skillsHeading: string;
  skills: string;
  recognitionHeading: string;
  recognition: string;
  extraSections: Array<{ id: string; title: string; itemsText: string }>;
};

function draftToState(draft: ResumeTemplateInput): EditorState {
  return {
    name: draft.name,
    headline: draft.headline,
    contactText: draft.contactItems.join("\n"),
    summaryHeading: draft.summaryHeading ?? "Professional Summary",
    summary: draft.summary,
    impactHeading: draft.impactHeading ?? "Key Achievements",
    impactText: draft.impactItems.join("\n"),
    experienceHeading: draft.experienceHeading ?? "Professional Experience",
    skillsHeading: draft.skillsHeading ?? "Skills",
    skills: draft.skills.join("\n"),
    recognitionHeading: draft.recognitionHeading ?? "Awards & Recognition",
    recognition: draft.recognition.join("\n"),
    extraSections: (draft.extraSections ?? []).map((section, i) => ({
      id: section.id ?? `extra-${i}`,
      title: section.title,
      itemsText: section.items.join("\n"),
    })),
    experience: draft.experience.map((e) => {
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

function stateToDraft(state: EditorState, base: ResumeTemplateInput, sectionOrder: string[]): ResumeTemplateInput {
  return {
    name: state.name,
    headline: state.headline,
    contactItems: state.contactText.split("\n").map((s) => s.trim()).filter(Boolean),
    title: base.title,
    summaryHeading: state.summaryHeading,
    summary: state.summary,
    impactHeading: state.impactHeading,
    impactItems: state.impactText.split("\n").map((s) => s.trim()).filter(Boolean),
    experienceHeading: state.experienceHeading,
    experience: state.experience.map((e) => ({
      title: e.title,
      organization: e.organization,
      location: e.location || undefined,
      dateRange: e.dateRange,
      bullets: e.bulletsText.split("\n").map((s) => s.trim()).filter(Boolean),
    })),
    skillsHeading: state.skillsHeading,
    skills: state.skills.split("\n").map((s) => s.trim()).filter(Boolean),
    recognitionHeading: state.recognitionHeading,
    recognition: state.recognition.split("\n").map((s) => s.trim()).filter(Boolean),
    extraSections: state.extraSections
      .map((section) => ({
        id: section.id,
        title: section.title.trim(),
        items: section.itemsText.split("\n").map((s) => s.trim()).filter(Boolean),
      }))
      .filter((section) => section.title && section.items.length > 0),
    education: base.education,
    sectionOrder,
  };
}

type Props = {
  documentId: string;
  jobId: string;
  initialDraft: ResumeTemplateInput;
  documentTitle: string;
  baseResume: string;
  keywordCoverage: number;
  keywords: string[];
};

// ---------- Keyword coverage utilities (client-side, mirrors resume-generator.ts) ----------

function kwHit(text: string, keyword: string): boolean {
  if (text.includes(keyword)) return true;
  const words = keyword.split(/[\s\-\/,]+/).filter((w) => w.length >= 2);
  return words.length > 0 && words.some((w) => text.includes(w));
}

function extractStateText(state: EditorState): string {
  return [
    state.name,
    state.headline,
    state.contactText,
    state.summary,
    state.impactText,
    state.skills,
    state.recognition,
    ...state.experience.flatMap((e) => [e.title, e.organization, e.bulletsText]),
    ...state.extraSections.map((s) => `${s.title} ${s.itemsText}`),
  ]
    .join(" ")
    .toLowerCase();
}

// ---------- Styles ----------

const inputCls = "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";
const textareaCls = `${inputCls} resize-y leading-5`;
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted";

export function ResumeDraftEditor({ documentId, jobId, initialDraft, documentTitle, baseResume, keywordCoverage, keywords }: Props) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(() => draftToState(initialDraft));
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    const order: string[] = ["summary"];
    if (initialDraft.impactItems.length > 0) order.push("impact");
    order.push("experience", "skills");
    if (initialDraft.recognition.length > 0) order.push("recognition");
    (initialDraft.extraSections ?? []).forEach((s, i) => order.push(s.id ?? `extra-${i}`));
    return order;
  });
  const [sectionAI, setSectionAI] = useState<Record<string, SectionAIState>>({});
  const [pdfStatus, setPdfStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [pdfError, setPdfError] = useState("");
  const [previewHtml, setPreviewHtml] = useState(() => renderResumeHtml(initialDraft));
  const [kwExpanded, setKwExpanded] = useState(() => keywordCoverage < 70);

  const { coveredKw, missingKw } = useMemo(() => {
    if (!keywords.length) return { coveredKw: [], missingKw: [] };
    const text = extractStateText(state);
    const normalized = [...new Set(keywords.map((k) => k.toLowerCase()))].filter(Boolean);
    const coveredKw = normalized.filter((kw) => kwHit(text, kw));
    const missingKw = normalized.filter((kw) => !kwHit(text, kw));
    return { coveredKw, missingKw };
  }, [state, keywords]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewHtml(renderResumeHtml(stateToDraft(state, initialDraft, sectionOrder)));
    }, 400);
    return () => clearTimeout(timer);
  }, [state, initialDraft, sectionOrder]);

  const refreshPreview = useCallback(() => {
    setPreviewHtml(renderResumeHtml(stateToDraft(state, initialDraft, sectionOrder)));
  }, [state, initialDraft, sectionOrder]);

  // --- Section ordering helpers ---

  function moveSectionById(id: string, direction: -1 | 1) {
    setSectionOrder((prev) => {
      const idx = prev.indexOf(id);
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  }

  function removeSectionById(id: string) {
    setSectionOrder((prev) => prev.filter((s) => s !== id));
  }

  // --- Section heading helpers ---

  function getSectionHeading(id: string): string {
    if (id === "summary") return state.summaryHeading;
    if (id === "impact") return state.impactHeading;
    if (id === "experience") return state.experienceHeading;
    if (id === "skills") return state.skillsHeading;
    if (id === "recognition") return state.recognitionHeading;
    return state.extraSections.find((s) => s.id === id)?.title ?? "";
  }

  function setSectionHeading(id: string, value: string) {
    if (id === "summary") setState((prev) => ({ ...prev, summaryHeading: value }));
    else if (id === "impact") setState((prev) => ({ ...prev, impactHeading: value }));
    else if (id === "experience") setState((prev) => ({ ...prev, experienceHeading: value }));
    else if (id === "skills") setState((prev) => ({ ...prev, skillsHeading: value }));
    else if (id === "recognition") setState((prev) => ({ ...prev, recognitionHeading: value }));
    else setState((prev) => ({
      ...prev,
      extraSections: prev.extraSections.map((s) => s.id === id ? { ...s, title: value } : s),
    }));
  }

  // --- AI improvement helpers ---

  function getSectionContent(id: string): string {
    if (id === "summary") return state.summary;
    if (id === "impact") return state.impactText;
    if (id === "skills") return state.skills;
    if (id === "recognition") return state.recognition;
    return state.extraSections.find((s) => s.id === id)?.itemsText ?? "";
  }

  function getSectionType(id: string): string {
    if (id === "summary") return "summary";
    if (id === "impact") return "impact";
    if (id === "skills") return "skills";
    if (id === "recognition") return "recognition";
    return "custom";
  }

  function applySectionImprovement(id: string, improved: string) {
    if (id === "summary") setState((prev) => ({ ...prev, summary: improved }));
    else if (id === "impact") setState((prev) => ({ ...prev, impactText: improved }));
    else if (id === "skills") setState((prev) => ({ ...prev, skills: improved }));
    else if (id === "recognition") setState((prev) => ({ ...prev, recognition: improved }));
    else setState((prev) => ({
      ...prev,
      extraSections: prev.extraSections.map((s) => s.id === id ? { ...s, itemsText: improved } : s),
    }));
  }

  async function improveSection(id: string) {
    const content = getSectionContent(id);
    if (!content.trim()) return;
    setSectionAI((prev) => ({ ...prev, [id]: { status: "loading" } }));
    try {
      const res = await fetch("/api/resume-sections/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType: getSectionType(id), content, jobKeywords: keywords }),
      });
      const data = (await res.json()) as { improved?: string; error?: string };
      if (!res.ok || !data.improved) throw new Error(data.error ?? "AI improvement failed");
      setSectionAI((prev) => ({ ...prev, [id]: { status: "showing", improved: data.improved } }));
    } catch (err) {
      setSectionAI((prev) => ({
        ...prev,
        [id]: { status: "error", error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  function acceptAIImprovement(id: string) {
    const ai = sectionAI[id];
    if (ai?.status !== "showing" || !ai.improved) return;
    applySectionImprovement(id, ai.improved);
    setSectionAI((prev) => ({ ...prev, [id]: { status: "idle" } }));
  }

  // --- PDF creation ---

  async function createPdf() {
    setPdfStatus("generating");
    setPdfError("");
    const draft = stateToDraft(state, initialDraft, sectionOrder);
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

  // --- Section content renderer ---

  function renderSectionContent(id: string) {
    if (id === "summary") {
      return (
        <textarea
          className={textareaCls}
          rows={5}
          value={state.summary}
          onChange={(e) => setState((prev) => ({ ...prev, summary: e.target.value }))}
        />
      );
    }

    if (id === "impact") {
      return (
        <textarea
          className={textareaCls}
          rows={Math.max(3, state.impactText.split("\n").length + 1)}
          value={state.impactText}
          onChange={(e) => setState((prev) => ({ ...prev, impactText: e.target.value }))}
        />
      );
    }

    if (id === "skills") {
      return (
        <textarea
          className={textareaCls}
          rows={Math.max(4, state.skills.split("\n").length + 1)}
          value={state.skills}
          onChange={(e) => setState((prev) => ({ ...prev, skills: e.target.value }))}
        />
      );
    }

    if (id === "recognition") {
      return (
        <textarea
          className={textareaCls}
          rows={Math.max(3, state.recognition.split("\n").length + 1)}
          value={state.recognition}
          onChange={(e) => setState((prev) => ({ ...prev, recognition: e.target.value }))}
        />
      );
    }

    if (id === "experience") {
      return (
        <div className="grid gap-4">
          {state.experience.map((exp, idx) => {
            const aiKey = `experience-entry-${idx}`;
            const entryAI = sectionAI[aiKey];
            return (
              <div key={idx} className="rounded-control border border-border bg-panel p-3">
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Title</label>
                    <input
                      className={inputCls}
                      value={exp.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setState((prev) => ({ ...prev, experience: prev.experience.map((entry, i) => i === idx ? { ...entry, title: val } : entry) }));
                      }}
                      type="text"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Organization</label>
                    <input
                      className={inputCls}
                      value={exp.organization}
                      onChange={(e) => {
                        const val = e.target.value;
                        setState((prev) => ({ ...prev, experience: prev.experience.map((entry, i) => i === idx ? { ...entry, organization: val } : entry) }));
                      }}
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
                      onChange={(e) => {
                        const val = e.target.value;
                        setState((prev) => ({ ...prev, experience: prev.experience.map((entry, i) => i === idx ? { ...entry, dateRange: val } : entry) }));
                      }}
                      type="text"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Location</label>
                    <input
                      className={inputCls}
                      value={exp.location}
                      onChange={(e) => {
                        const val = e.target.value;
                        setState((prev) => ({ ...prev, experience: prev.experience.map((entry, i) => i === idx ? { ...entry, location: val } : entry) }));
                      }}
                      placeholder="City, State"
                      type="text"
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className={labelCls} style={{ margin: 0 }}>Bullets (one per line)</label>
                    <button
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                      disabled={entryAI?.status === "loading" || (!exp.bulletsText.trim() && !exp.title.trim())}
                      onClick={async () => {
                        const content = `${exp.title} at ${exp.organization}\n${exp.bulletsText}`;
                        setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "loading" } }));
                        try {
                          const res = await fetch("/api/resume-sections/improve", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sectionType: "experience", content, jobKeywords: keywords }),
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
                      {entryAI?.status === "loading" ? (
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
                  {entryAI?.status === "showing" && entryAI.improved && (() => {
                    const bulletLines = entryAI.improved
                      .split("\n")
                      .filter((line) => !line.startsWith(exp.title) && !line.startsWith(exp.organization))
                      .filter(Boolean);
                    return (
                      <div className="mb-3 rounded-control border border-accent/40 bg-accent/5 p-3">
                        <p className="mb-2 text-xs font-semibold text-accent">AI suggestion</p>
                        <pre className="mb-2 whitespace-pre-wrap text-xs leading-5 text-ink">{bulletLines.join("\n")}</pre>
                        <div className="flex gap-2">
                          <button
                            className="rounded-control border border-accent bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-[rgb(var(--color-accent-strong))]"
                            onClick={() => {
                              const val = bulletLines.join("\n");
                              setState((prev) => ({
                                ...prev,
                                experience: prev.experience.map((entry, i) => i === idx ? { ...entry, bulletsText: val } : entry),
                              }));
                              setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "idle" } }));
                            }}
                            type="button"
                          >Accept</button>
                          <button
                            className="rounded-control border border-border px-3 py-1 text-xs font-medium text-muted hover:text-ink"
                            onClick={() => setSectionAI((prev) => ({ ...prev, [aiKey]: { status: "idle" } }))}
                            type="button"
                          >Discard</button>
                        </div>
                      </div>
                    );
                  })()}
                  {entryAI?.status === "error" && (
                    <p className="mb-2 text-xs text-danger">{entryAI.error}</p>
                  )}
                  <textarea
                    className={textareaCls}
                    rows={Math.max(4, exp.bulletsText.split("\n").length + 1)}
                    value={exp.bulletsText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setState((prev) => ({ ...prev, experience: prev.experience.map((entry, i) => i === idx ? { ...entry, bulletsText: val } : entry) }));
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Extra section
    const extra = state.extraSections.find((s) => s.id === id);
    if (extra) {
      return (
        <textarea
          className={textareaCls}
          rows={Math.max(3, extra.itemsText.split("\n").length + 1)}
          value={extra.itemsText}
          onChange={(e) => {
            const val = e.target.value;
            setState((prev) => ({
              ...prev,
              extraSections: prev.extraSections.map((s) => s.id === id ? { ...s, itemsText: val } : s),
            }));
          }}
        />
      );
    }

    return null;
  }

  return (
    <div className="grid gap-4">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted">Edit resume draft</p>
          <h1 className="text-lg font-semibold text-ink">{documentTitle}</h1>
          <p className="mt-0.5 text-xs text-muted">
            Base: {baseResume} ·{" "}
            <span className={keywordCoverage >= 70 ? "text-success font-medium" : keywordCoverage >= 40 ? "text-warning font-medium" : "text-danger font-medium"}>
              {keywordCoverage}% keyword coverage
            </span>
            {keywordCoverage < 70 && (
              <span className="ml-1 text-muted">(target: 70%+)</span>
            )}
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
            Edit any section below. Use ✨ Improve to refine content with AI — it will incorporate job keywords into suggestions. The preview updates automatically.
          </p>

          {/* Keyword coverage panel */}
          {keywords.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-control border border-border bg-surface">
              <button
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-border/40 transition-colors"
                onClick={() => setKwExpanded((v) => !v)}
                type="button"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Keyword Coverage</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold tabular-nums ${
                    coveredKw.length / keywords.length >= 0.7
                      ? "text-success"
                      : coveredKw.length / keywords.length >= 0.4
                      ? "text-warning"
                      : "text-danger"
                  }`}>
                    {coveredKw.length}/{keywords.length}
                  </span>
                  <svg
                    aria-hidden="true"
                    className={`h-3 w-3 text-muted transition-transform ${kwExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>
              {kwExpanded && (
                <div className="border-t border-border px-3 pb-3 pt-2">
                  {coveredKw.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {coveredKw.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                        >
                          ✓ {kw}
                        </span>
                      ))}
                    </div>
                  )}
                  {missingKw.length > 0 && (
                    <div className={`flex flex-wrap gap-1.5 ${coveredKw.length > 0 ? "mt-1.5" : ""}`}>
                      {missingKw.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-xs text-muted"
                          title="Not yet in resume — try editing or use ✨ Improve"
                        >
                          ○ {kw}
                        </span>
                      ))}
                    </div>
                  )}
                  {missingKw.length === 0 && (
                    <p className="text-xs font-medium text-success">All keywords covered!</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3">
            {/* Header — always first, not moveable */}
            <section className="rounded-panel border border-border bg-surface p-4">
              <p className={`${labelCls} mb-4`}>Contact</p>
              <div className="grid gap-3">
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    className={inputCls}
                    value={state.name}
                    onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
                    type="text"
                  />
                </div>
                <div>
                  <label className={labelCls}>Headline</label>
                  <input
                    className={inputCls}
                    value={state.headline}
                    onChange={(e) => setState((prev) => ({ ...prev, headline: e.target.value }))}
                    type="text"
                  />
                </div>
                <div>
                  <label className={labelCls}>Contact info (one item per line)</label>
                  <textarea
                    className={textareaCls}
                    rows={3}
                    value={state.contactText}
                    onChange={(e) => setState((prev) => ({ ...prev, contactText: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            {/* Moveable sections */}
            {sectionOrder.map((id, index) => {
              const ai = sectionAI[id] ?? { status: "idle" };
              const canImprove = id !== "experience";
              return (
                <section className="rounded-panel border border-border bg-surface p-4" key={id}>
                  {/* Section title + controls */}
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <label className={labelCls}>Section title</label>
                      <input
                        className={inputCls}
                        value={getSectionHeading(id)}
                        onChange={(e) => setSectionHeading(id, e.target.value)}
                        type="text"
                      />
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      {canImprove && (
                        <button
                          className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={ai.status === "loading" || !getSectionContent(id).trim()}
                          onClick={() => improveSection(id)}
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
                      <button
                        className="text-xs text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => moveSectionById(id, -1)}
                        title="Move section up"
                        type="button"
                      >↑ Move up</button>
                      <button
                        className="text-xs text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        disabled={index === sectionOrder.length - 1}
                        onClick={() => moveSectionById(id, 1)}
                        title="Move section down"
                        type="button"
                      >↓ Move down</button>
                      <button
                        className="text-xs text-danger hover:underline"
                        onClick={() => removeSectionById(id)}
                        type="button"
                      >Remove</button>
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
                          onClick={() => acceptAIImprovement(id)}
                          type="button"
                        >Accept</button>
                        <button
                          className="rounded-control border border-border px-3 py-1 text-xs font-medium text-muted hover:text-ink"
                          onClick={() => setSectionAI((prev) => ({ ...prev, [id]: { status: "idle" } }))}
                          type="button"
                        >Discard</button>
                      </div>
                    </div>
                  )}
                  {ai.status === "error" && (
                    <p className="mb-3 text-xs text-danger">{ai.error}</p>
                  )}

                  {/* Section content */}
                  {renderSectionContent(id)}
                </section>
              );
            })}

            {/* Education — always last, display only */}
            {initialDraft.education.length > 0 && (
              <section className="rounded-panel border border-border bg-surface p-4">
                <p className={labelCls}>Education</p>
                {initialDraft.education.map((ed, i) => (
                  <div key={i} className="mb-1 text-sm text-muted">
                    <span className="text-ink">{ed.degree}</span>
                    {ed.school ? ` · ${ed.school}` : ""}
                    {ed.focus ? ` · ${ed.focus}` : ""}
                  </div>
                ))}
                <p className="mt-1 text-xs text-muted/60">Education is pulled from your resume and not editable here.</p>
              </section>
            )}
          </div>
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
