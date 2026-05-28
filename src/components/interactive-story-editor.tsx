"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";

type ParsedStory = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  skills: string[];
  themes: string[];
  sourceJobId: string | null;
  sourceBlockF: string;
};

type Props = {
  question: string;
  jobId?: string | null;
  initialStory?: ParsedStory | null;
  onClose?: () => void;
  onSaved?: () => void;
};

type InputMode = "record" | "type";

type EditorState =
  | { phase: "input" }
  | { phase: "recording"; seconds: number }
  | { phase: "transcribing" }
  | { phase: "done"; transcript: string }
  | { phase: "parsing" }
  | { phase: "editing"; story: ParsedStory; editingField: string | null; tempValue: string; savedFields: Record<string, boolean> };

function fmtDuration(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const STAR_DETAILS: Record<string, { label: string; abbr: string; color: string; hint: string }> = {
  title: { label: "Title", abbr: "Title", color: "bg-slate-100 text-slate-800 border-slate-300", hint: "Short memorable name for this story" },
  situation: { label: "Situation", abbr: "S", color: "bg-blue-50 text-blue-700 border-blue-200", hint: "Context and background of the project" },
  task: { label: "Task", abbr: "T", color: "bg-violet-50 text-violet-700 border-violet-200", hint: "Your specific responsibility or challenge" },
  action: { label: "Action", abbr: "A", color: "bg-amber-50 text-amber-700 border-amber-200", hint: "Concrete steps you took (what YOU did)" },
  result: { label: "Result", abbr: "R", color: "bg-emerald-50 text-emerald-700 border-emerald-200", hint: "Measurable outcome or impact" },
  reflection: { label: "Reflection", abbr: "↺", color: "bg-slate-50 text-slate-600 border-slate-200", hint: "What you learned or would do differently" },
  skills: { label: "Skills", abbr: "Skills", color: "bg-purple-50 text-purple-700 border-purple-200", hint: "Comma-separated list of skills demonstrated" },
  themes: { label: "Themes", abbr: "Themes", color: "bg-rose-50 text-rose-700 border-rose-200", hint: "Comma-separated list of themes (e.g., leadership, ambiguity)" },
};

export function InteractiveStoryEditor({ question, jobId = null, initialStory = null, onClose, onSaved }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>("type");
  const [rawText, setRawText] = useState("");
  const [editorState, setEditorState] = useState<EditorState>({ phase: "input" });
  const [error, setError] = useState("");
  const [saveVoice, setSaveVoice] = useState(false);
  const [savingFieldStatus, setSavingFieldStatus] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If initialStory is provided, go straight to editing mode
  useEffect(() => {
    if (initialStory) {
      setEditorState({
        phase: "editing",
        story: initialStory,
        editingField: null,
        tempValue: "",
        savedFields: {},
      });
    }
  }, [initialStory]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"]
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await transcribeAudio(blob, recorder.mimeType || "audio/webm");
      };

      recorder.start(500);
      mediaRecorderRef.current = recorder;

      let secs = 0;
      setEditorState({ phase: "recording", seconds: 0 });
      timerRef.current = setInterval(() => {
        secs++;
        setEditorState({ phase: "recording", seconds: secs });
      }, 1000);
    } catch (err) {
      setError(`Microphone access error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [stopTimer]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    stopTimer();
    setEditorState({ phase: "transcribing" });
  }, [stopTimer]);

  // ── Transcription ───────────────────────────────────────────────────────────
  const transcribeAudio = async (blob: Blob, mimeType: string) => {
    setError("");
    try {
      const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);

      const res = await fetch("/api/interview/transcribe", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Transcription failed");
      setEditorState({ phase: "done", transcript: data.transcript ?? "" });
    } catch (err) {
      setError(`Transcription error: ${err instanceof Error ? err.message : String(err)}`);
      setEditorState({ phase: "input" });
    }
  };

  // ── Parse/Structure into STAR ───────────────────────────────────────────────
  const processStoryText = async (textToProcess: string) => {
    setEditorState({ phase: "parsing" });
    setError("");
    try {
      const res = await fetch("/api/interview/parse-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, transcript: textToProcess }),
      });
      if (!res.ok) throw new Error("AI parsing failed");
      const data = await res.json();
      
      const newStoryId = crypto.randomUUID();
      const initialStoryData: ParsedStory = {
        id: newStoryId,
        title: data.story.title || "Draft story",
        situation: data.story.situation || "",
        task: data.story.task || "",
        action: data.story.action || "",
        result: data.story.result || "",
        reflection: data.story.reflection || "",
        skills: data.story.skills || [],
        themes: data.story.themes || [],
        sourceJobId: jobId,
        sourceBlockF: jobId ? "evaluation" : "voice-practice",
      };

      // Save initial draft immediately to the database so section-by-section works
      await fetch("/api/interview/save-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...initialStoryData, saveVoice, transcript: textToProcess }),
      });

      setEditorState({
        phase: "editing",
        story: initialStoryData,
        editingField: null,
        tempValue: "",
        savedFields: {},
      });
      if (onSaved) onSaved();
    } catch (err) {
      setError(`AI structure error: ${err instanceof Error ? err.message : String(err)}. Make sure active AI provider is configured.`);
      setEditorState({ phase: "input" });
    }
  };

  // ── Section-by-Section Save ────────────────────────────────────────────────
  const saveSectionField = async (field: keyof ParsedStory, value: string | string[]) => {
    if (editorState.phase !== "editing") return;
    setSavingFieldStatus(field);
    setError("");
    
    let processedValue: string | string[] = value;
    if (field === "skills" || field === "themes") {
      processedValue = typeof value === "string" 
        ? value.split(",").map((s) => s.trim()).filter(Boolean)
        : value;
    }

    const updatedStory = {
      ...editorState.story,
      [field]: processedValue,
    };

    try {
      const res = await fetch("/api/interview/save-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updatedStory,
          saveVoice: false,
          transcript: "",
        }),
      });

      if (!res.ok) throw new Error("Save failed");

      setEditorState({
        phase: "editing",
        story: updatedStory,
        editingField: null,
        tempValue: "",
        savedFields: {
          ...editorState.savedFields,
          [field]: true,
        },
      });

      // Reset the visual "Saved" checkmark after 2 seconds
      setTimeout(() => {
        setEditorState((current) => {
          if (current.phase !== "editing") return current;
          return {
            ...current,
            savedFields: {
              ...current.savedFields,
              [field]: false,
            },
          };
        });
      }, 2000);

      if (onSaved) onSaved();
    } catch {
      setError(`Failed to save section: ${field}`);
    } finally {
      setSavingFieldStatus(null);
    }
  };

  const startEditingField = (field: keyof ParsedStory) => {
    if (editorState.phase !== "editing") return;
    const value = editorState.story[field];
    setEditorState({
      ...editorState,
      editingField: field,
      tempValue: Array.isArray(value) ? value.join(", ") : String(value),
    });
  };

  const cancelEditingField = () => {
    if (editorState.phase !== "editing") return;
    setEditorState({
      ...editorState,
      editingField: null,
      tempValue: "",
    });
  };

  const reset = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    stopTimer();
    setEditorState({ phase: "input" });
    setRawText("");
    setError("");
  };

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      stopTimer();
    };
  }, [stopTimer]);

  const isBusy =
    editorState.phase === "transcribing" ||
    editorState.phase === "parsing";

  return (
    <div className="grid gap-5">
      {/* Target Question context */}
      <div className="rounded-control border border-border bg-surface px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-0.5">Question Prompt</p>
        <p className="text-sm font-medium text-ink leading-relaxed">{question}</p>
      </div>

      {error && (
        <div className="rounded-control border border-danger/20 bg-danger/5 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      {/* INPUT STAGE */}
      {editorState.phase === "input" && (
        <div className="grid gap-4">
          <div className="flex border-b border-border">
            <button
              onClick={() => setInputMode("type")}
              className={`px-4 py-2 text-xs font-semibold uppercase border-b-2 transition-colors ${inputMode === "type" ? "border-accent text-accent" : "border-transparent text-muted"}`}
            >
              Type draft
            </button>
            <button
              onClick={() => setInputMode("record")}
              className={`px-4 py-2 text-xs font-semibold uppercase border-b-2 transition-colors ${inputMode === "record" ? "border-accent text-accent" : "border-transparent text-muted"}`}
            >
              Record audio
            </button>
          </div>

          {inputMode === "type" ? (
            <div className="grid gap-3">
              <textarea
                className="w-full min-h-[140px] rounded-control border border-border bg-panel px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Type or paste your raw draft here. Don't worry about structuring it, the AI will build the STAR story for you!"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
              <div className="flex flex-col gap-2.5">
                <label className="flex cursor-pointer items-start gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={saveVoice}
                    onChange={(e) => setSaveVoice(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-accent))]"
                  />
                  <span className="text-xs text-muted">
                    Update writing voice profile with this text
                  </span>
                </label>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted">Provide any raw notes or complete sentences.</p>
                  <button
                    className="rounded-control border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                    disabled={!rawText.trim() || isBusy}
                    onClick={() => processStoryText(rawText)}
                  >
                    Convert to STAR
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-control border border-accent bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90"
                  onClick={startRecording}
                  type="button"
                >
                  <span className="h-2 w-2 rounded-full bg-white" />
                  Start recording
                </button>
                <p className="text-xs text-muted">Speak naturally — AI will transcribe and structure your response.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RECORDING STAGE */}
      {editorState.phase === "recording" && (
        <div className="grid gap-3">
          <div className="flex items-center gap-4">
            <button
              className="inline-flex items-center gap-2 rounded-control border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/15"
              onClick={stopRecording}
              type="button"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
              Stop recording
            </button>
            <span className="font-mono text-sm tabular-nums text-muted">{fmtDuration(editorState.seconds)}</span>
          </div>

          <div className="flex h-10 items-center gap-0.5 rounded-control border border-accent/30 bg-accent/5 px-4">
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={i}
                className="inline-block w-1 rounded-full bg-accent opacity-60"
                style={{
                  height: `${20 + Math.sin((Date.now() / 200 + i * 0.8)) * 10}px`,
                  animationDelay: `${i * 40}ms`,
                  animation: "wave 0.8s ease-in-out infinite alternate",
                }}
              />
            ))}
            <style>{`@keyframes wave { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }`}</style>
          </div>
        </div>
      )}

      {/* TRANSCRIBING / AI PROCESSING STAGE */}
      {(editorState.phase === "transcribing" || editorState.phase === "parsing") && (
        <div className="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-muted">
            {editorState.phase === "transcribing" ? "Transcribing voice with AI..." : "Structuring details into STAR format..."}
          </p>
        </div>
      )}

      {/* TRANSCRIPT DONE - CONFIRMATION */}
      {editorState.phase === "done" && (
        <div className="grid gap-3">
          <div className="rounded-control border border-border bg-surface px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Your Recording</p>
            <p className="text-sm leading-relaxed text-ink">{editorState.transcript}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="flex cursor-pointer items-start gap-2 select-none">
              <input
                type="checkbox"
                checked={saveVoice}
                onChange={(e) => setSaveVoice(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-accent))]"
              />
              <span className="text-xs text-muted">
                Update writing voice profile with this transcript
              </span>
            </label>
            <div className="flex gap-2">
              <button
                className="rounded-control border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
                onClick={() => processStoryText(editorState.transcript)}
              >
                Structure into STAR story
              </button>
              <button
                className="rounded-control border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
                onClick={reset}
              >
                Record again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION BY SECTION STAR EDITOR */}
      {editorState.phase === "editing" && (
        <div className="grid gap-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div>
              <p className="text-xs font-semibold text-ink">STAR Story Editor</p>
              <p className="text-[11px] text-muted">Tweak and save each section individually</p>
            </div>
            <button onClick={reset} className="text-xs text-muted hover:text-accent font-medium">
              Start over
            </button>
          </div>

          <div className="grid gap-3">
            {Object.keys(STAR_DETAILS).map((fieldKey) => {
              const field = fieldKey as keyof ParsedStory;
              const detail = STAR_DETAILS[fieldKey];
              const isEditingThis = editorState.editingField === field;
              const isSaved = editorState.savedFields[field];
              const isSaving = savingFieldStatus === field;
              
              const value = editorState.story[field];

              return (
                <div
                  key={field}
                  className={`rounded-control border p-3 bg-panel transition-all ${
                    isEditingThis ? "border-accent ring-1 ring-accent" : "border-border hover:border-accent/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center rounded border text-[9px] font-bold px-1.5 py-0.5 leading-none ${detail.color}`}
                      >
                        {detail.abbr}
                      </span>
                      <span className="text-xs font-semibold text-ink">{detail.label}</span>
                    </div>

                    <div className="flex gap-2">
                      {isEditingThis ? (
                        <>
                          <button
                            className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
                            disabled={isSaving}
                            onClick={() => saveSectionField(field, editorState.tempValue)}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            className="text-[11px] font-medium text-muted hover:underline"
                            onClick={cancelEditingField}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {isSaved && <span className="text-[11px] text-success font-medium">✓ Saved</span>}
                          <button
                            className="text-[11px] font-medium text-accent hover:underline"
                            onClick={() => startEditingField(field)}
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditingThis ? (
                    <div className="grid gap-1.5 mt-1">
                      <textarea
                        className="w-full resize-y min-h-[60px] rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none"
                        value={editorState.tempValue}
                        onChange={(e) => setEditorState({ ...editorState, tempValue: e.target.value })}
                        placeholder={detail.hint}
                        rows={field === "skills" || field === "themes" ? 1 : 3}
                      />
                      <p className="text-[10px] text-muted">{detail.hint}</p>
                    </div>
                  ) : (
                    <div className="mt-1">
                      {field === "skills" || field === "themes" ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Array.isArray(value) && value.length > 0 ? (
                            value.map((tag) => (
                              <Badge key={tag} tone={field === "skills" ? "neutral" : "success"}>
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted italic">None specified. Click Edit to add some.</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
                          {String(value) || <span className="text-muted italic">Click edit to add content.</span>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            {onClose && (
              <button
                className="rounded-control border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-ink bg-panel"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
