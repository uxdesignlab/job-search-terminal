"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedStory = {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  skills: string[];
  themes: string[];
};

type PracticePhase =
  | { phase: "idle" }
  | { phase: "recording"; seconds: number }
  | { phase: "transcribing" }
  | { phase: "done"; transcript: string; provider: string }
  | { phase: "parsing" }
  | { phase: "review"; story: ParsedStory; transcript: string }
  | { phase: "saved" };

type Props = {
  questions: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Field({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="grid gap-1">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</label>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
      <textarea
        className="w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        value={value}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VoicePractice({ questions }: Props) {
  const [questionIdx, setQuestionIdx] = useState(0);
  const [state, setState] = useState<PracticePhase>({ phase: "idle" });
  const [error, setError] = useState("");
  const [saveVoice, setSaveVoice] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const question = questions[questionIdx] ?? "";

  // ── Recording ───────────────────────────────────────────────────────────────

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick best supported mime type — webm is preferred, ogg fallback for Firefox
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
      setState({ phase: "recording", seconds: 0 });
      timerRef.current = setInterval(() => {
        secs++;
        setState({ phase: "recording", seconds: secs });
      }, 1000);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied — allow access in your browser then try again."
          : `Could not access microphone: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopTimer]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    stopTimer();
    setState({ phase: "transcribing" });
  }, [stopTimer]);

  // ── Transcription ───────────────────────────────────────────────────────────

  const transcribeAudio = useCallback(async (blob: Blob, mimeType: string) => {
    setState({ phase: "transcribing" });
    setError("");
    try {
      const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);

      const res = await fetch("/api/interview/transcribe", { method: "POST", body: formData });
      const data = (await res.json()) as { transcript?: string; provider?: string; error?: string; unsupported?: boolean };

      if (!res.ok) {
        setError(data.error ?? "Transcription failed");
        if (data.unsupported) {
          setState({ phase: "idle" });
        } else {
          setState({ phase: "idle" });
        }
        return;
      }
      setState({ phase: "done", transcript: data.transcript ?? "", provider: data.provider ?? "" });
    } catch (err) {
      setError(`Transcription error: ${err instanceof Error ? err.message : String(err)}`);
      setState({ phase: "idle" });
    }
  }, []);

  // ── Parse to STAR ───────────────────────────────────────────────────────────

  const parseAnswer = useCallback(async (transcript: string) => {
    setState({ phase: "parsing" });
    setError("");
    try {
      const res = await fetch("/api/interview/parse-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, transcript }),
      });
      if (!res.ok) throw new Error("Parse failed");
      const data = (await res.json()) as { story: ParsedStory };
      setState({ phase: "review", story: data.story, transcript });
    } catch {
      setError("Could not structure the answer — check your AI provider is configured in Settings.");
      setState((prev) => prev.phase === "parsing" ? { phase: "done", transcript, provider: "" } : prev);
    }
  }, [question]);

  // ── Story editing ───────────────────────────────────────────────────────────

  const updateField = useCallback((field: keyof ParsedStory, value: string) => {
    setState((prev) => {
      if (prev.phase !== "review") return prev;
      return {
        ...prev,
        story: {
          ...prev.story,
          [field]: field === "skills" || field === "themes"
            ? value.split(",").map((s) => s.trim()).filter(Boolean)
            : value,
        },
      };
    });
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────

  const saveStory = useCallback(async () => {
    if (state.phase !== "review") return;
    setError("");
    try {
      const res = await fetch("/api/interview/save-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...state.story, saveVoice, transcript: state.transcript }),
      });
      if (!res.ok) throw new Error("Save failed");
      setState({ phase: "saved" });
    } catch {
      setError("Failed to save — please try again.");
    }
  }, [state, saveVoice]);

  // ── Reset ────────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    stopTimer();
    setState({ phase: "idle" });
    setError("");
  }, [stopTimer]);

  useEffect(() => () => { mediaRecorderRef.current?.stop(); stopTimer(); }, [stopTimer]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const isRecording = state.phase === "recording";
  const isBusy = state.phase === "transcribing" || state.phase === "parsing";

  return (
    <div className="grid gap-6">

      {/* Question navigator */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Question {questionIdx + 1} of {questions.length}
          </p>
          <div className="flex gap-1">
            <button
              className="rounded px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-30"
              disabled={questionIdx === 0 || isBusy || isRecording}
              onClick={() => { reset(); setQuestionIdx((i) => i - 1); }}
              type="button"
            >
              ← Prev
            </button>
            <button
              className="rounded px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-30"
              disabled={questionIdx === questions.length - 1 || isBusy || isRecording}
              onClick={() => { reset(); setQuestionIdx((i) => i + 1); }}
              type="button"
            >
              Next →
            </button>
          </div>
        </div>

        <div className="rounded-control border border-border bg-surface px-4 py-3">
          <p className="text-sm font-medium leading-relaxed text-ink">{question}</p>
        </div>
      </div>

      {/* Idle */}
      {state.phase === "idle" && (
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            onClick={startRecording}
            type="button"
          >
            <span className="h-2 w-2 rounded-full bg-white" />
            Start recording
          </button>
          <p className="text-xs text-muted">Your answer will be transcribed by AI for maximum accuracy</p>
        </div>
      )}

      {/* Recording */}
      {state.phase === "recording" && (
        <div className="grid gap-3">
          <div className="flex items-center gap-4">
            <button
              className="inline-flex items-center gap-2 rounded-control border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/15"
              onClick={stopRecording}
              type="button"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
              Stop recording
            </button>
            <span className="font-mono text-sm tabular-nums text-muted">{fmtDuration(state.seconds)}</span>
          </div>

          {/* Animated waveform indicator */}
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

          <p className="text-xs text-muted">Speak naturally — AI will transcribe your full answer when you stop</p>
        </div>
      )}

      {/* Transcribing */}
      {state.phase === "transcribing" && (
        <div className="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-muted">Transcribing with AI…</p>
        </div>
      )}

      {/* Transcript ready — before STAR parse */}
      {state.phase === "done" && (
        <div className="grid gap-4">
          {state.provider && (
            <p className="text-[11px] text-muted">Transcribed by {state.provider}</p>
          )}
          <div className="rounded-control border border-border bg-surface px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Your answer</p>
            <p className="text-sm leading-relaxed text-ink">{state.transcript}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              onClick={() => parseAnswer(state.transcript)}
              type="button"
            >
              Structure into STAR story
            </button>
            <button
              className="rounded-control border border-border px-4 py-2 text-sm font-medium text-muted hover:text-ink"
              onClick={reset}
              type="button"
            >
              Record again
            </button>
          </div>
        </div>
      )}

      {/* Parsing */}
      {state.phase === "parsing" && (
        <div className="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-muted">Structuring your answer into STAR format…</p>
        </div>
      )}

      {/* STAR review + edit */}
      {state.phase === "review" && (
        <div className="grid gap-4 rounded-panel border border-border bg-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-ink">Edit and save your story</p>
            <button className="text-xs text-muted hover:text-ink" onClick={reset} type="button">
              Start over
            </button>
          </div>

          <Field label="Title" hint="Short label for quick recall" value={state.story.title}
            onChange={(v) => updateField("title", v)} rows={1} />
          <Field label="Situation" value={state.story.situation}
            onChange={(v) => updateField("situation", v)} />
          <Field label="Task" hint="Your specific responsibility" value={state.story.task}
            onChange={(v) => updateField("task", v)} />
          <Field label="Action" hint="Concrete steps you took" value={state.story.action}
            onChange={(v) => updateField("action", v)} />
          <Field label="Result" hint="Measurable outcome" value={state.story.result}
            onChange={(v) => updateField("result", v)} />
          <Field label="Reflection" hint="What you learned or would do differently"
            value={state.story.reflection} onChange={(v) => updateField("reflection", v)} />
          <Field label="Skills" hint="Comma-separated" value={state.story.skills.join(", ")}
            onChange={(v) => updateField("skills", v)} rows={2} />
          <Field label="Themes" hint="Comma-separated" value={state.story.themes.join(", ")}
            onChange={(v) => updateField("themes", v)} rows={1} />

          {/* Writing voice opt-in */}
          <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border bg-surface p-3">
            <input
              checked={saveVoice}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-accent))]"
              onChange={(e) => setSaveVoice(e.target.checked)}
              type="checkbox"
            />
            <div>
              <p className="text-sm font-medium text-ink">Also update my writing voice</p>
              <p className="text-xs text-muted">
                Your spoken answer will refine your writing style profile — AI-generated content will match how you naturally express ideas.
              </p>
            </div>
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            className="inline-flex items-center justify-center rounded-control border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
            onClick={saveStory}
            type="button"
          >
            Save to story bank
          </button>
        </div>
      )}

      {/* Saved */}
      {state.phase === "saved" && (
        <div className="grid gap-3 rounded-control border border-success/40 bg-success/8 px-4 py-3">
          <p className="text-sm font-semibold text-success">Story saved ✓</p>
          {saveVoice && <p className="text-xs text-muted">Writing voice updated.</p>}
          <div className="flex gap-2">
            <button
              className="rounded-control border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
              onClick={() => { reset(); setQuestionIdx((i) => Math.min(i + 1, questions.length - 1)); }}
              type="button"
            >
              Next question →
            </button>
            <button
              className="rounded-control border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
              onClick={reset}
              type="button"
            >
              Retry this question
            </button>
          </div>
        </div>
      )}

      {/* Errors outside review panel */}
      {error && state.phase !== "review" && (
        <p className="rounded-control border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
