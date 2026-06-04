"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui";
import { keywordStrengthDetailsForText } from "@/lib/documents/keyword-coverage";
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

type KeywordProposal = {
  experienceIndex: number;
  sourceBulletIndex: number;
  organization: string;
  title: string;
  originalText: string;
  text: string;
  included: boolean;
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
  supportedKeywords: string[];
  tailoringStatus: string;
  fallbackReason: string;
};

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
    .join(" ");
}

// ---------- Keyword highlight helpers ----------

const HL_STOP = new Set(["a","an","and","are","as","at","be","by","for","from","in","is","of","on","or","the","to","with","that","this","or"]);

function extractHighlightTerms(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !HL_STOP.has(t));
}

// Script injected into the preview iframe srcDoc so the parent can drive text highlighting via
// postMessage. Never included in renderResumeHtml — purely a UI concern.
//
// Two highlight tiers:
//   kw-hl-phrase — bright yellow + outline: the full keyword phrase appears together here
//   kw-hl-term  — faint yellow: an individual keyword word appears here (partial coverage)
const HIGHLIGHT_SCRIPT = `
<style>
mark.kw-hl-phrase{background:#fef08a;color:inherit;border-radius:2px;padding:0 1px;outline:1.5px solid #ca8a04;}
mark.kw-hl-term{background:#fef9c3;color:inherit;border-radius:2px;padding:0 1px;}
</style>
<script>
(function(){
  function clear(){
    document.querySelectorAll('mark.kw-hl-phrase,mark.kw-hl-term').forEach(function(m){
      var p=m.parentNode; while(m.firstChild) p.insertBefore(m.firstChild,m); p.removeChild(m); p.normalize();
    });
  }
  function walk(node,phrase,terms){
    if(node.nodeType===3){
      var t=node.textContent,l=t.toLowerCase(),frag=document.createDocumentFragment(),rem=t,remL=l,changed=false;
      while(rem.length){
        var candidates=phrase?[phrase].concat(terms):terms;
        var best=-1,bLen=0,bIsPhrase=false;
        for(var i=0;i<candidates.length;i++){
          var pos=remL.indexOf(candidates[i]);
          if(pos!==-1&&(best===-1||pos<best||(pos===best&&candidates[i].length>bLen))){
            best=pos;bLen=candidates[i].length;bIsPhrase=!!(phrase&&candidates[i]===phrase);
          }
        }
        if(best===-1){frag.appendChild(document.createTextNode(rem));break;}
        if(best>0) frag.appendChild(document.createTextNode(rem.slice(0,best)));
        var mk=document.createElement('mark');
        mk.className=bIsPhrase?'kw-hl-phrase':'kw-hl-term';
        mk.textContent=rem.slice(best,best+bLen);
        frag.appendChild(mk);
        rem=rem.slice(best+bLen);remL=rem.toLowerCase();changed=true;
      }
      if(changed) node.parentNode.replaceChild(frag,node);
    } else if(node.nodeType===1&&!/^(MARK|SCRIPT|STYLE)$/.test(node.tagName)){
      Array.from(node.childNodes).forEach(function(c){walk(c,phrase,terms);});
    }
  }
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='highlight-keyword') return;
    clear();
    var phrase=e.data.phrase||'',terms=e.data.terms||[];
    if(phrase||terms.length) walk(document.body,phrase,terms);
    var first=document.querySelector('mark.kw-hl-phrase')||document.querySelector('mark.kw-hl-term');
    if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
  });
})();
<\/script>`;

// ---------- Styles ----------

const inputCls = "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";
const textareaCls = `${inputCls} resize-y leading-5`;
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted";

export function ResumeDraftEditor({ documentId, jobId, initialDraft, documentTitle, baseResume, keywordCoverage, keywords, supportedKeywords, tailoringStatus, fallbackReason }: Props) {
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
  const [activeHighlightKeyword, setActiveHighlightKeyword] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeHighlightRef = useRef<string | null>(null);
  activeHighlightRef.current = activeHighlightKeyword;
  const [kwExpanded, setKwExpanded] = useState(() => keywordCoverage < 70);
  const [confirmedKeywords, setConfirmedKeywords] = useState<string[]>([]);
  const [keywordToConfirm, setKeywordToConfirm] = useState("");
  const [keywordWizardStep, setKeywordWizardStep] = useState<"select" | "review">("select");
  const [selectedKeywordExperienceIndexes, setSelectedKeywordExperienceIndexes] = useState<number[]>([]);
  const [keywordExplanation, setKeywordExplanation] = useState("");
  const [keywordProposals, setKeywordProposals] = useState<KeywordProposal[]>([]);
  const [keywordEvidenceConfirmed, setKeywordEvidenceConfirmed] = useState(false);
  const [keywordConfirmationStatus, setKeywordConfirmationStatus] = useState("");
  const [keywordConfirmationBusy, setKeywordConfirmationBusy] = useState(false);
  const keywordCompanyOptions = useMemo(() =>
    state.experience
      .map((experience, experienceIndex) => ({ ...experience, experienceIndex }))
      .filter((experience) => experience.organization.trim() && experience.bulletsText.trim())
  , [state.experience]);

  const kwStrength = useMemo(() => {
    if (!keywords.length) {
      return { exact: [], partial: [], missing: [], total: 0, exactScore: keywordCoverage, broadScore: keywordCoverage };
    }
    return keywordStrengthDetailsForText(extractStateText(state), keywords);
  }, [state, keywords, keywordCoverage]);

  const liveKeywordCoverage = kwStrength.broadScore;
  const keywordTotal = kwStrength.total;
  // All keywords not present as exact phrases or partial matches
  const missingKw = kwStrength.missing;
  const supportedKeywordSet = new Set([...supportedKeywords, ...confirmedKeywords].map((kw) => kw.toLowerCase()));
  // Partial-match keywords supported by evidence — user should add as exact phrase
  const partialSupportedKw = kwStrength.partial.filter((kw) => supportedKeywordSet.has(kw.toLowerCase()));
  const partialUnsupportedKw = kwStrength.partial.filter((kw) => !supportedKeywordSet.has(kw.toLowerCase()));
  // Missing keywords
  const missingSupportedKw = missingKw.filter((kw) => supportedKeywordSet.has(kw.toLowerCase()));
  const unsupportedGapKw = missingKw.filter((kw) => !supportedKeywordSet.has(kw.toLowerCase()));

  function addKeywordToSkills(keyword: string) {
    setState((previous) => {
      if (previous.skills.toLowerCase().includes(keyword.toLowerCase())) return previous;
      return { ...previous, skills: [previous.skills.trim(), keyword].filter(Boolean).join("\n") };
    });
    setKeywordConfirmationStatus(`Added "${keyword}" to Skills.`);
  }

  function beginKeywordConfirmation(keyword: string) {
    setKeywordToConfirm(keyword);
    setKeywordWizardStep("select");
    setSelectedKeywordExperienceIndexes([]);
    setKeywordExplanation("");
    setKeywordProposals([]);
    setKeywordEvidenceConfirmed(false);
    setKeywordConfirmationStatus("");
  }

  function closeKeywordConfirmation() {
    setKeywordToConfirm("");
    setKeywordWizardStep("select");
    setSelectedKeywordExperienceIndexes([]);
    setKeywordExplanation("");
    setKeywordProposals([]);
    setKeywordEvidenceConfirmed(false);
  }

  function toggleKeywordCompany(experienceIndex: number) {
    setSelectedKeywordExperienceIndexes((current) => current.includes(experienceIndex)
      ? current.filter((index) => index !== experienceIndex)
      : [...current, experienceIndex]);
  }

  async function prepareKeywordProposals() {
    if (!keywordToConfirm || selectedKeywordExperienceIndexes.length === 0) return;
    setKeywordConfirmationBusy(true);
    setKeywordConfirmationStatus("");
    try {
      const experiences = selectedKeywordExperienceIndexes.map((experienceIndex) => {
        const experience = state.experience[experienceIndex];
        return {
          experienceIndex,
          title: experience.title,
          organization: experience.organization,
          bullets: experience.bulletsText.split("\n").map((bullet) => bullet.trim()).filter(Boolean),
        };
      });
      const response = await fetch(`/api/gaps/${jobId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keywordToConfirm,
          explanation: keywordExplanation.trim(),
          experiences,
        }),
      });
      const result = await response.json() as { error?: string; proposals?: Omit<KeywordProposal, "included">[] };
      if (!response.ok || !result.proposals?.length) throw new Error(result.error ?? "Could not prepare resume suggestions.");
      setKeywordProposals(result.proposals.map((proposal) => ({ ...proposal, included: true })));
      setKeywordEvidenceConfirmed(false);
      setKeywordWizardStep("review");
    } catch (error) {
      setKeywordConfirmationStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setKeywordConfirmationBusy(false);
    }
  }

  async function confirmKeywordEvidence() {
    if (!keywordToConfirm || selectedKeywordExperienceIndexes.length === 0 || !keywordEvidenceConfirmed) return;
    setKeywordConfirmationBusy(true);
    setKeywordConfirmationStatus("");
    try {
      const approvedResumeLines = keywordProposals
        .filter((proposal) => proposal.included && proposal.text.trim())
        .map((proposal) => ({ organization: proposal.organization, text: proposal.text.trim() }));
      const response = await fetch(`/api/gaps/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gapText: keywordToConfirm,
          confirmation: {
            companies: keywordProposals.map((proposal) => proposal.organization),
            explanation: keywordExplanation.trim(),
            approvedResumeLines,
          },
        }),
      });
      const result = await response.json() as {
        error?: string;
        followUpQuestion?: string;
        qualityStatus?: "addressed" | "needs_followup";
      };
      if (!response.ok) throw new Error(result.error ?? "Could not confirm keyword evidence.");
      if (result.qualityStatus !== "addressed") {
        setKeywordConfirmationStatus(result.followUpQuestion || "Add more detail before using this keyword.");
        return;
      }
      setConfirmedKeywords((current) => [...new Set([...current, keywordToConfirm])]);
      setState((previous) => ({
        ...previous,
        skills: previous.skills.toLowerCase().includes(keywordToConfirm.toLowerCase())
          ? previous.skills
          : [previous.skills.trim(), keywordToConfirm].filter(Boolean).join("\n"),
        experience: previous.experience.map((experience, index) => {
          const bullets = experience.bulletsText.split("\n").map((bullet) => bullet.trim()).filter(Boolean);
          for (const proposal of keywordProposals.filter((item) => item.included && item.experienceIndex === index && item.text.trim())) {
            if (proposal.sourceBulletIndex >= 0 && proposal.sourceBulletIndex < bullets.length) {
              bullets[proposal.sourceBulletIndex] = proposal.text.trim();
            }
          }
          return { ...experience, bulletsText: bullets.join("\n") };
        }),
      }));
      setKeywordConfirmationStatus(`Added "${keywordToConfirm}" to Skills and approved experience lines.`);
      closeKeywordConfirmation();
    } catch (error) {
      setKeywordConfirmationStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setKeywordConfirmationBusy(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewHtml(renderResumeHtml(stateToDraft(state, initialDraft, sectionOrder)));
    }, 400);
    return () => clearTimeout(timer);
  }, [state, initialDraft, sectionOrder]);

  const refreshPreview = useCallback(() => {
    setPreviewHtml(renderResumeHtml(stateToDraft(state, initialDraft, sectionOrder)));
  }, [state, initialDraft, sectionOrder]);

  // Stable function — reads keyword from ref so it can be used in onLoad without stale closures
  const postHighlight = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    const kw = activeHighlightRef.current;
    const phrase = kw
      ? kw.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim()
      : "";
    const terms = kw ? extractHighlightTerms(kw) : [];
    iframeRef.current.contentWindow.postMessage({ type: "highlight-keyword", phrase, terms }, "*");
  }, []);

  useEffect(() => {
    postHighlight();
  }, [activeHighlightKeyword, postHighlight]);

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
            <span className={kwStrength.exactScore >= 70 ? "text-success font-medium" : kwStrength.exactScore >= 40 ? "text-warning font-medium" : "text-danger font-medium"}>
              {kwStrength.exactScore}% ATS coverage
            </span>
            {kwStrength.partial.length > 0 && (
              <span className="ml-1 text-warning font-medium">· {kwStrength.partial.length} partial</span>
            )}
            {kwStrength.exactScore < 70 && (
              <span className="ml-1 text-muted">(target: 70%+ exact phrases)</span>
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
          {tailoringStatus === "source-only" && (
            <p className="mb-4 rounded-control border border-warning/35 bg-warning/8 px-3 py-2 text-xs leading-5 text-muted">
              This draft uses approved source content only{fallbackReason ? ` because AI tailoring could not complete: ${fallbackReason}` : ""}.
            </p>
          )}

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
                    kwStrength.exactScore >= 70 ? "text-success"
                    : kwStrength.exactScore >= 40 ? "text-warning"
                    : "text-danger"
                  }`}>
                    {kwStrength.exact.length}/{keywordTotal}
                  </span>
                  <svg
                    aria-hidden="true"
                    className={`h-3 w-3 text-muted transition-transform ${kwExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                  >
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>
              {kwExpanded && (
                <div className="border-t border-border px-3 pb-3 pt-2 grid gap-2.5">

                  {/* Exact phrase matches — ATS safe */}
                  {kwStrength.exact.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-success/80">
                        Exact phrase match — ATS safe
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {kwStrength.exact.map((kw) => {
                          const isActive = activeHighlightKeyword === kw;
                          return (
                            <button
                              key={kw}
                              type="button"
                              title={isActive ? "Click to clear highlight" : "Phrase appears verbatim — ATS will score this"}
                              onClick={() => setActiveHighlightKeyword(isActive ? null : kw)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                                isActive
                                  ? "border-success bg-success text-white"
                                  : "border-success/25 bg-success/10 text-success hover:border-success/60 hover:bg-success/20"
                              }`}
                            >
                              ✓ {kw}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Partial matches — individual words present but not as phrase */}
                  {kwStrength.partial.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warning/80">
                        Words present, not as a phrase — ATS may miss
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {kwStrength.partial.map((kw) => {
                          const isActive = activeHighlightKeyword === kw;
                          const isSupported = supportedKeywordSet.has(kw.toLowerCase());
                          return (
                            <button
                              key={kw}
                              type="button"
                              title={isActive ? "Click to clear" : isSupported ? "Your evidence supports this — add it as an exact phrase" : "Confirm evidence, then add as exact phrase"}
                              onClick={() => {
                                setActiveHighlightKeyword(isActive ? null : kw);
                              }}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                                isActive
                                  ? "border-warning bg-warning text-white"
                                  : "border-warning/35 bg-warning/10 text-warning hover:border-warning/60"
                              }`}
                            >
                              ~ {kw}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-[10px] text-muted leading-4">
                        Click a keyword to highlight where the words appear, then weave the exact phrase into that sentence.
                      </p>
                    </div>
                  )}

                  {/* Missing — supported by evidence, easy wins */}
                  {missingSupportedKw.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Add to resume — evidence confirmed
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {missingSupportedKw.map((kw) => (
                          <button
                            key={kw}
                            className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 text-xs text-accent hover:border-accent hover:bg-accent/10"
                            onClick={() => addKeywordToSkills(kw)}
                            title="Evidence confirmed — click to add to Skills"
                            type="button"
                          >
                            + {kw}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Partial unsupported + missing unsupported — need evidence */}
                  {(partialUnsupportedKw.length > 0 || unsupportedGapKw.length > 0) && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Needs confirmed evidence before use
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...partialUnsupportedKw, ...unsupportedGapKw].map((keyword) => (
                          <button
                            className="rounded-full border border-border bg-panel px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
                            key={keyword}
                            onClick={() => beginKeywordConfirmation(keyword)}
                            title="Confirm evidence before adding this keyword"
                            type="button"
                          >
                            ! {keyword}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {keywordConfirmationStatus && (
                    <p aria-live="polite" className="text-xs text-muted">{keywordConfirmationStatus}</p>
                  )}
                  {kwStrength.exact.length === keywordTotal && keywordTotal > 0 && (
                    <p className="text-xs font-medium text-success">All keywords present as exact phrases — strong ATS coverage.</p>
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
            <div className="flex items-center gap-2">
              {activeHighlightKeyword && (
                <span className="text-xs text-success font-medium">
                  Highlighting: {activeHighlightKeyword}
                </span>
              )}
              <button
                className="rounded px-2 py-1 text-xs text-muted hover:bg-border hover:text-ink transition-colors"
                onClick={refreshPreview}
                type="button"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
          <iframe
            ref={iframeRef}
            className="min-h-0 flex-1 w-full border-0"
            onLoad={postHighlight}
            srcDoc={previewHtml.replace("</body>", HIGHLIGHT_SCRIPT + "</body>")}
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
      {keywordToConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4">
          <section
            aria-labelledby="keyword-wizard-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-panel border border-border bg-panel p-5 shadow-lg"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">Add keyword</p>
                <h2 className="mt-1 text-base font-semibold text-ink" id="keyword-wizard-title">{keywordToConfirm}</h2>
              </div>
              <button className="text-sm text-muted hover:text-ink" onClick={closeKeywordConfirmation} type="button">Close</button>
            </div>
            {keywordWizardStep === "select" ? (
              <div className="mt-4 grid gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">Where did you apply this skill?</p>
                  <p className="mt-1 text-xs leading-5 text-muted">Select every company that applies. No writing is required.</p>
                </div>
                {keywordCompanyOptions.length > 0 ? (
                  <div className="grid max-h-56 gap-2 overflow-y-auto">
                    {keywordCompanyOptions.map((experience) => (
                      <label className="flex items-start gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={`${experience.organization}-${experience.experienceIndex}`}>
                        <input
                          checked={selectedKeywordExperienceIndexes.includes(experience.experienceIndex)}
                          className="mt-0.5"
                          onChange={() => toggleKeywordCompany(experience.experienceIndex)}
                          type="checkbox"
                        />
                        <span>
                          <span className="block font-medium">{experience.organization}</span>
                          <span className="block text-xs text-muted">{experience.title}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-control border border-warning/35 bg-warning/8 px-3 py-2 text-xs leading-5 text-muted">This resume lane has no companies to choose from. Add experience before confirming this keyword.</p>
                )}
                <label className="grid gap-1 text-sm text-ink">
                  Optional explanation
                  <textarea
                    className={textareaCls}
                    onChange={(event) => setKeywordExplanation(event.target.value)}
                    placeholder="Add context only when it makes the resume line more specific."
                    rows={3}
                    value={keywordExplanation}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={selectedKeywordExperienceIndexes.length === 0 || keywordConfirmationBusy} onClick={prepareKeywordProposals}>
                    {keywordConfirmationBusy ? "Writing resume suggestions…" : "Review resume edit"}
                  </Button>
                  <Button onClick={closeKeywordConfirmation} variant="quiet">Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">Review the proposed resume edit</p>
                  <p className="mt-1 text-xs leading-5 text-muted">Each suggestion rewrites an existing bullet for that role. Edit or remove any change before approving.</p>
                </div>
                <div className="grid max-h-72 gap-3 overflow-y-auto">
                  {keywordProposals.map((proposal, index) => (
                    <div className="grid gap-2 rounded-control border border-border bg-surface p-3" key={`${proposal.organization}-${index}`}>
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                        <input
                          checked={proposal.included}
                          onChange={(event) => setKeywordProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, included: event.target.checked } : item))}
                          type="checkbox"
                        />
                        Replace bullet · {proposal.organization} · {proposal.title}
                      </label>
                      <p className="text-xs leading-5 text-muted">Current: {proposal.originalText}</p>
                      <textarea
                        className={textareaCls}
                        disabled={!proposal.included}
                        onChange={(event) => setKeywordProposals((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))}
                        rows={3}
                        value={proposal.text}
                      />
                    </div>
                  ))}
                </div>
                <label className="flex items-start gap-2 text-xs leading-5 text-muted">
                  <input checked={keywordEvidenceConfirmed} onChange={(event) => setKeywordEvidenceConfirmed(event.target.checked)} type="checkbox" />
                  I confirm the selected companies and approved wording are accurate.
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!keywordEvidenceConfirmed || keywordConfirmationBusy} onClick={confirmKeywordEvidence}>
                    {keywordConfirmationBusy ? "Adding keyword…" : "Approve and add to resume"}
                  </Button>
                  <Button onClick={() => setKeywordWizardStep("select")} variant="secondary">Back</Button>
                  <Button onClick={closeKeywordConfirmation} variant="quiet">Cancel</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
