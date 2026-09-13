"use client";

import { useState } from "react";
import type { ResumeCheck } from "@/lib/documents/resume-lint";

/** What the sections route returns, as the editor holds it until the user decides. */
export type SectionSuggestion = {
  action: "improve" | "regenerate";
  lines: string[];
  /** What each line was written from, in the same order. */
  sources?: string[];
  reverted: Array<{ label: string; claims: string[] }>;
  restored: Array<{ keywords: string[] }>;
  issues: Array<{ index: number; message: string }>;
  notice: string;
  providerUsed: string;
  modelUsed: string;
  ms: number;
};

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  ollama: "your local model",
};

function Spinner() {
  return (
    <svg aria-hidden="true" className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
    </svg>
  );
}

/**
 * ✨ Improve, ↻ Regenerate, and an optional instruction for either.
 *
 * Regenerate alone was a coin toss: the only way to get a different result was to ask
 * again and hope. The instruction lets the user say what was wrong — "shorter", "lead
 * with the accessibility work" — and the truth rules still apply to it.
 */
export function SectionAIControls({
  busy,
  busyAction,
  disabled,
  regenerateDisabled = false,
  improveLabel = "✨ Improve",
  note,
  onNoteChange,
  onImprove,
  onRegenerate,
  onCancel,
  onUndo,
  announcement = "",
  inputId,
}: {
  busy: boolean;
  busyAction?: "improve" | "regenerate";
  /** Disables ✨ Improve — there is nothing in the box to polish. */
  disabled?: boolean;
  /**
   * Regenerate starts from the approved resume, not the box, so an empty box is no
   * reason to disable it. The server says so if the approved resume has nothing either.
   */
  regenerateDisabled?: boolean;
  improveLabel?: string;
  note: string;
  onNoteChange: (value: string) => void;
  onImprove: () => void;
  onRegenerate?: () => void;
  onCancel: () => void;
  /** Present right after a suggestion was accepted: puts the previous text back. */
  onUndo?: () => void;
  /** Spoken to screen readers when a request finishes, since the result appears elsewhere. */
  announcement?: string;
  inputId: string;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  return (
    <div className="grid gap-1.5">
      <span aria-live="polite" className="sr-only">{announcement}</span>
      <div className="flex flex-wrap items-center gap-3">
        {busy ? (
          <>
            <span aria-live="polite" className="flex items-center gap-1 text-xs font-medium text-accent">
              <Spinner /> {busyAction === "regenerate" ? "Regenerating…" : "Improving…"}
            </span>
            <button className="text-xs text-muted hover:text-ink" onClick={onCancel} type="button">Cancel</button>
          </>
        ) : (
          <>
            <button
              className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={onImprove}
              title="Polish the text in this box for the posting, keeping what it says"
              type="button"
            >
              {improveLabel}
            </button>
            {onRegenerate && (
              <button
                className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                disabled={regenerateDisabled}
                onClick={onRegenerate}
                title="Write this section again from your approved resume"
                type="button"
              >
                ↻ Regenerate
              </button>
            )}
            {onUndo && (
              <button className="text-xs font-medium text-muted hover:text-ink" onClick={onUndo} type="button">
                Undo accept
              </button>
            )}
            {/* Only the grounded writer reads an instruction. A section without Regenerate
                uses the plain rewrite, which would silently ignore one. */}
            {onRegenerate && (
              <button
                aria-controls={inputId}
                aria-expanded={noteOpen}
                className="text-xs text-muted hover:text-ink"
                onClick={() => setNoteOpen((open) => !open)}
                type="button"
              >
                {noteOpen ? "Hide instruction" : "Add instruction"}
              </button>
            )}
          </>
        )}
      </div>
      {noteOpen && onRegenerate && (
        <div>
          <label className="sr-only" htmlFor={inputId}>What should change?</label>
          <input
            className="w-full rounded-control border border-border bg-panel px-2 py-1 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={busy}
            id={inputId}
            maxLength={500}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="What should change? For example: shorter, or lead with the accessibility work"
            type="text"
            value={note}
          />
        </div>
      )}
    </div>
  );
}

function describeWho(suggestion: SectionSuggestion): string {
  if (!suggestion.providerUsed) return "";
  const seconds = Math.max(1, Math.round(suggestion.ms / 1000));
  return `Written in ${seconds}s by ${PROVIDER_NAMES[suggestion.providerUsed] ?? suggestion.providerUsed}${suggestion.modelUsed ? ` (${suggestion.modelUsed})` : ""}.`;
}

/**
 * The suggestion, and what the checks did to it, before the user accepts anything.
 * A reverted line is shown as such: accepting a suggestion should never hide that part
 * of it is the old wording because the new wording claimed something unsupported.
 */
export function SectionSuggestionPanel({
  suggestion,
  onAccept,
  onDiscard,
}: {
  suggestion: SectionSuggestion;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const claims = [...new Set(suggestion.reverted.flatMap((revert) => revert.claims))];
  const keywords = [...new Set(suggestion.restored.flatMap((restore) => restore.keywords))];
  return (
    <div className="mb-3 rounded-control border border-accent/40 bg-accent/5 p-3">
      <p className="mb-2 text-xs font-semibold text-accent">
        {suggestion.action === "regenerate" ? "Regenerated from your approved resume" : "Improved suggestion"} — review, then accept or discard
      </p>
      <pre className="mb-2 whitespace-pre-wrap text-xs leading-5 text-ink">{suggestion.lines.join("\n")}</pre>
      <div className="mb-3 grid gap-1 text-[11px] leading-4 text-muted">
        {claims.length > 0 && (
          <p>
            <span className="font-semibold text-warning">Kept the earlier wording on {suggestion.reverted.length} {suggestion.reverted.length === 1 ? "line" : "lines"}</span>
            {" "}because the rewrite claimed something your evidence does not show: {claims.map((claim) => `"${claim}"`).join(", ")}.
            {" "}If a claim is true, add it to your Evidence Bank or a gap answer, then try again.
          </p>
        )}
        {keywords.length > 0 && (
          <p>Kept the earlier wording where the rewrite dropped job language: {keywords.map((keyword) => `"${keyword}"`).join(", ")}.</p>
        )}
        {suggestion.issues.length > 0 && (
          <p>
            <span className="font-semibold text-warning">Still worth a look:</span>{" "}
            {suggestion.issues.slice(0, 3).map((issue) => `${issue.index >= 0 && suggestion.lines.length > 1 ? `line ${issue.index + 1}: ` : ""}${issue.message}`).join(" ")}
          </p>
        )}
        {suggestion.notice && <p className="text-warning">{suggestion.notice}</p>}
        {describeWho(suggestion) && <p>{describeWho(suggestion)}</p>}
        {suggestion.sources && suggestion.sources.length === suggestion.lines.length && (
          <details>
            <summary className="cursor-pointer text-accent">Show what each line was written from</summary>
            <ol className="mt-1 grid gap-1.5">
              {suggestion.lines.map((line, index) => (
                <li key={index}>
                  <span className="block text-ink">{line}</span>
                  <span className="block">from: {suggestion.sources![index]}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-control border border-accent bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-[rgb(var(--color-accent-strong))]"
          onClick={onAccept}
          type="button"
        >Accept</button>
        <button
          className="rounded-control border border-border px-3 py-1 text-xs font-medium text-muted hover:text-ink"
          onClick={onDiscard}
          type="button"
        >Discard</button>
      </div>
    </div>
  );
}

/** The live "ATS & recruiter checks" list. Recomputed as the user types. */
export function ResumeChecksPanel({ checks }: { checks: ResumeCheck[] }) {
  const flagged = checks.filter((check) => check.status === "flag");
  const [expanded, setExpanded] = useState(flagged.length > 0);
  return (
    <div className="mb-4 overflow-hidden rounded-control border border-border bg-surface">
      <button
        aria-controls="resume-checks-details"
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-border/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">ATS &amp; recruiter checks</span>
        <span className={`text-xs font-semibold tabular-nums ${flagged.length === 0 ? "text-success" : "text-warning"}`}>
          {flagged.length === 0 ? "All clear" : `${flagged.length} to review`}
        </span>
      </button>
      {expanded && (
        <ul className="grid gap-2 border-t border-border px-3 pb-3 pt-2" id="resume-checks-details">
          {checks.map((check) => (
            <li className="flex gap-2 text-xs leading-5" key={check.id}>
              <span aria-hidden="true" className={check.status === "pass" ? "text-success" : "text-warning"}>
                {check.status === "pass" ? "✓" : "!"}
              </span>
              <span>
                <span className="font-medium text-ink">{check.label}</span>
                <span className="sr-only">{check.status === "pass" ? " — passes." : " — needs review."}</span>
                <span className="block text-muted">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
