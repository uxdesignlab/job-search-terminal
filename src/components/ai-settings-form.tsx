"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui";
import type { AISettingsRecord, AIProviderName } from "@/lib/db/types";
import { saveAISettingsAction } from "@/app/settings/actions";

type ProviderTestState = {
  status: "idle" | "testing" | "ok" | "error";
  latencyMs?: number;
  model?: string;
  error?: string;
};

type Props = {
  settings: AISettingsRecord;
  onSaved?: () => void;
  submitLabel?: string;
  compact?: boolean;
};

const PROVIDER_META: Record<AIProviderName, { label: string; keyPlaceholder?: string }> = {
  anthropic: { label: "Claude (Anthropic)", keyPlaceholder: "sk-ant-…" },
  gemini: { label: "Gemini (Google)", keyPlaceholder: "AIza…" },
  openai: { label: "OpenAI", keyPlaceholder: "sk-…" },
  ollama: { label: "Ollama (Local)" }
};

const ALL_PROVIDERS: AIProviderName[] = ["anthropic", "gemini", "openai", "ollama"];
const CLOUD_MODEL_OPTIONS: Record<AIProviderName, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"],
  openai: ["gpt-5.4-mini", "gpt-5.5", "gpt-5.4", "gpt-5.4-nano"],
  ollama: []
};

function SortableProviderRow({
  id,
  rank,
  enabled,
  onToggle,
}: {
  id: AIProviderName;
  rank: number;
  enabled: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : undefined, zIndex: isDragging ? 10 : undefined }}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 ${enabled ? "border-border bg-surface" : "border-border/40 bg-surface/40 opacity-50"}`}
    >
      <button
        className="text-muted hover:text-ink cursor-grab active:cursor-grabbing shrink-0 touch-none"
        type="button"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span className="w-6 text-center text-xs font-mono text-muted shrink-0">
        {enabled && rank >= 0 ? `#${rank + 1}` : "—"}
      </span>
      <input
        checked={enabled}
        className="accent-[var(--color-accent)] shrink-0"
        onChange={onToggle}
        type="checkbox"
      />
      <span className={`flex-1 text-sm ${enabled ? "text-ink" : "text-muted"}`}>
        {PROVIDER_META[id].label}
      </span>
    </div>
  );
}

export function AISettingsForm({ compact = false, onSaved, settings, submitLabel = "Save settings" }: Props) {
  const router = useRouter();

  // Cloud provider keys
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicApiKey);
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey);
  const [openaiKey, setOpenaiKey] = useState(settings.openaiApiKey);

  // Cloud provider models
  const [anthropicModel, setAnthropicModel] = useState(settings.anthropicModel || "claude-sonnet-4-6");
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || "gemini-2.5-flash");
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel || "gpt-5.4-mini");

  // Ollama
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(settings.ollamaBaseUrl || "http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel || "llama3.1:8b");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaPickerOpen, setOllamaPickerOpen] = useState(false);
  const [ollamaPickerLoading, setOllamaPickerLoading] = useState(false);
  const [ollamaPickerError, setOllamaPickerError] = useState("");
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);

  // Provider priority order — the full ordered list; only enabled ones are sent as the chain
  const initOrder = settings.providerOrderJson.length > 0 ? settings.providerOrderJson : ["openai", "anthropic", "gemini"] as AIProviderName[];
  // Ensure all 4 providers are present (append any missing ones at the end, disabled)
  const fullInitOrder: AIProviderName[] = [
    ...initOrder,
    ...ALL_PROVIDERS.filter((p) => !initOrder.includes(p))
  ];
  const [providerOrder, setProviderOrder] = useState<AIProviderName[]>(fullInitOrder);
  const [enabledProviders, setEnabledProviders] = useState<Set<AIProviderName>>(
    new Set(settings.providerOrderJson.length > 0 ? settings.providerOrderJson : ["openai"])
  );

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setProviderOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as AIProviderName);
        const newIndex = prev.indexOf(over.id as AIProviderName);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  // UI state
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testStates, setTestStates] = useState<Record<AIProviderName, ProviderTestState>>({
    anthropic: { status: "idle" },
    gemini: { status: "idle" },
    openai: { status: "idle" },
    ollama: { status: "idle" }
  });
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showAdvanced, setShowAdvanced] = useState(!compact);

  // Effective ordered chain (enabled providers in priority order)
  const effectiveChain = providerOrder.filter((p) => enabledProviders.has(p));
  const activeProvider: AIProviderName = effectiveChain[0] ?? "openai";

  // Check Ollama reachability on mount when it's in the chain
  const checkOllamaReachability = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/ollama-models");
      const data = await res.json() as { models: string[]; error?: string };
      setOllamaReachable(!data.error);
    } catch {
      setOllamaReachable(false);
    }
  }, []);

  useEffect(() => {
    if (enabledProviders.has("ollama")) {
      checkOllamaReachability();
    }
  }, [enabledProviders, checkOllamaReachability]);

  function keyFor(p: AIProviderName): string {
    if (p === "anthropic") return anthropicKey;
    if (p === "gemini") return geminiKey;
    if (p === "openai") return openaiKey;
    return ollamaBaseUrl;
  }

  function modelFor(p: AIProviderName): string {
    if (p === "anthropic") return anthropicModel;
    if (p === "gemini") return geminiModel;
    if (p === "openai") return openaiModel;
    return ollamaModel;
  }

  async function testProvider(provider: AIProviderName) {
    setTestStates((prev) => ({ ...prev, [provider]: { status: "testing" } }));
    try {
      const body =
        provider === "ollama"
          ? { provider, baseUrl: ollamaBaseUrl, model: ollamaModel }
          : { provider, apiKey: keyFor(provider), model: modelFor(provider) };

      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json() as { ok: boolean; latencyMs: number; model: string; error?: string };
      setTestStates((prev) => ({
        ...prev,
        [provider]: data.ok
          ? { status: "ok", latencyMs: data.latencyMs, model: data.model }
          : { status: "error", error: data.error }
      }));
      if (provider === "ollama") setOllamaReachable(data.ok);
    } catch {
      setTestStates((prev) => ({ ...prev, [provider]: { status: "error", error: "Request failed" } }));
    }
  }

  async function openOllamaPicker() {
    setOllamaPickerOpen(true);
    setOllamaPickerLoading(true);
    setOllamaPickerError("");
    try {
      const res = await fetch("/api/ai/ollama-models");
      const data = await res.json() as { models: string[]; error?: string };
      if (data.error) {
        setOllamaPickerError(data.error);
        setOllamaModels([]);
      } else {
        setOllamaModels(data.models);
        setOllamaPickerError("");
      }
    } catch {
      setOllamaPickerError("Failed to fetch models. Is Ollama running?");
      setOllamaModels([]);
    } finally {
      setOllamaPickerLoading(false);
    }
  }

  function toggleProvider(id: AIProviderName) {
    setEnabledProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("activeProvider", activeProvider);
    fd.set("anthropicApiKey", anthropicKey);
    fd.set("geminiApiKey", geminiKey);
    fd.set("openaiApiKey", openaiKey);
    fd.set("anthropicModel", anthropicModel);
    fd.set("geminiModel", geminiModel);
    fd.set("openaiModel", openaiModel);
    fd.set("ollamaBaseUrl", ollamaBaseUrl);
    fd.set("ollamaModel", ollamaModel);
    fd.set("fallbackProvider", effectiveChain[1] ?? "");
    fd.set("providerOrderJson", JSON.stringify(effectiveChain));
    fd.set("braveSearchApiKey", braveSearchApiKey);
    fd.set("adzunaAppId", adzunaAppId);
    fd.set("adzunaApiKey", adzunaApiKey);
    startTransition(async () => {
      await saveAISettingsAction(fd);
      setSaved(true);
      router.refresh();
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
    });
  }

  const [braveSearchApiKey, setBraveSearchApiKey] = useState(settings.braveSearchApiKey ?? "");
  const [adzunaAppId, setAdzunaAppId] = useState(settings.adzunaAppId ?? "");
  const [adzunaApiKey, setAdzunaApiKey] = useState(settings.adzunaApiKey ?? "");

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>

      {/* ── Priority list ─────────────────────────────────────── */}
      <div className="grid gap-3">
        <div>
          <label className="text-sm font-medium text-ink">Provider priority</label>
          <p className="text-xs text-muted mt-0.5">Enable providers and drag them into priority order. The first enabled provider is used; others are fallbacks.</p>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={providerOrder} strategy={verticalListSortingStrategy}>
            <div className="grid gap-2">
              {providerOrder.map((id) => (
                <SortableProviderRow
                  key={id}
                  id={id}
                  rank={effectiveChain.indexOf(id)}
                  enabled={enabledProviders.has(id)}
                  onToggle={() => toggleProvider(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Ollama config (shown when enabled) ───────────────── */}
      {enabledProviders.has("ollama") && (
        <div className="grid gap-3 border border-border rounded-md p-4">
          <span className="text-sm font-medium text-ink">Ollama configuration</span>

          {/* Unreachability warning */}
          {ollamaReachable === false && (
            <div className="flex items-start gap-2 rounded-md bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 px-3 py-2 text-xs text-[var(--color-danger)]">
              <span>⚠</span>
              <span>
                Ollama is not reachable at <span className="font-mono">{ollamaBaseUrl}</span>. Run{" "}
                <span className="font-mono">ollama serve</span> to start it.
              </span>
              <button className="ml-auto shrink-0 underline" onClick={checkOllamaReachability} type="button">Retry</button>
            </div>
          )}

          <div className="grid gap-2">
            <label className="text-xs text-muted">Base URL</label>
            <input
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              type="text"
              value={ollamaBaseUrl}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs text-muted">Model</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama3.1:8b"
                type="text"
                value={ollamaModel}
              />
              <button
                className="shrink-0 text-xs text-[var(--color-accent)] border border-border rounded-md px-3 py-1.5 hover:bg-surface disabled:opacity-50"
                onClick={openOllamaPicker}
                type="button"
              >
                Choose…
              </button>
            </div>
          </div>

          {/* Model picker popup */}
          {ollamaPickerOpen && (
            <div className="border border-border rounded-md bg-surface shadow-md p-3 grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink">Installed models</span>
                <button className="text-xs text-muted hover:text-ink" onClick={() => setOllamaPickerOpen(false)} type="button">✕</button>
              </div>
              {ollamaPickerLoading && <p className="text-xs text-muted">Loading…</p>}
              {ollamaPickerError && (
                <div className="grid gap-2">
                  <p className="text-xs text-[var(--color-danger)]">{ollamaPickerError}</p>
                  <button className="w-fit text-xs text-[var(--color-accent)] underline" onClick={openOllamaPicker} type="button">Retry</button>
                </div>
              )}
              {!ollamaPickerLoading && !ollamaPickerError && ollamaModels.length === 0 && (
                <p className="text-xs text-muted">No models found. Run <span className="font-mono">ollama pull llama3.1:8b</span> to download one.</p>
              )}
              {ollamaModels.map((m) => (
                <button
                  key={m}
                  className={`text-left text-sm px-2 py-1.5 rounded hover:bg-[var(--color-accent)]/10 font-mono ${m === ollamaModel ? "text-[var(--color-accent)] font-medium" : "text-ink"}`}
                  onClick={() => { setOllamaModel(m); setOllamaPickerOpen(false); }}
                  type="button"
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Test connection */}
          <div className="flex items-center gap-3">
            <button
              className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
              disabled={testStates.ollama.status === "testing"}
              onClick={() => testProvider("ollama")}
              type="button"
            >
              {testStates.ollama.status === "testing" ? "Testing…" : "Test connection"}
            </button>
            {testStates.ollama.status === "ok" && (
              <span className="text-xs text-[var(--color-success)]">Connected · {testStates.ollama.model} · {testStates.ollama.latencyMs}ms</span>
            )}
            {testStates.ollama.status === "error" && (
              <span className="text-xs text-[var(--color-danger)]">{testStates.ollama.error}</span>
            )}
          </div>

          {/* Quality callout */}
          <div className="rounded-md bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20 px-3 py-2 text-xs text-muted grid gap-1">
            <span className="font-medium text-ink">Model quality guide</span>
            <span>≥64 GB RAM/VRAM: <span className="font-mono">qwen2.5:72b</span>, <span className="font-mono">llama3.1:70b</span> — near cloud quality</span>
            <span>≥12 GB: <span className="font-mono">qwen2.5:14b</span>, <span className="font-mono">mistral-nemo</span> — good for all features</span>
            <span>≥8 GB: <span className="font-mono">llama3.1:8b</span>, <span className="font-mono">qwen2.5:7b</span> — adequate for simple tasks</span>
          </div>
        </div>
      )}

      {compact && !showAdvanced && (
        <button className="w-fit text-xs font-medium text-accent hover:underline" onClick={() => setShowAdvanced(true)} type="button">
          Show optional model and integration settings
        </button>
      )}

      {/* ── Cloud provider cards ──────────────────────────────── */}
      {showAdvanced && (
        <div className="grid gap-4">
          <label className="text-sm font-medium text-ink">API keys &amp; models</label>
          {(["anthropic", "gemini", "openai"] as AIProviderName[]).map((id) => {
            const meta = PROVIDER_META[id];
            const key = keyFor(id);
            const model = modelFor(id);
            const setKey = id === "anthropic" ? setAnthropicKey : id === "gemini" ? setGeminiKey : setOpenaiKey;
            const setModel = id === "anthropic" ? setAnthropicModel : id === "gemini" ? setGeminiModel : setOpenaiModel;
            const ts = testStates[id];
            const visible = !!showKeys[id];
            const isActive = activeProvider === id;
            return (
              <div key={id} className="grid gap-3 border border-border rounded-md p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{meta.label}</span>
                  {isActive && <span className="text-xs font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 rounded">Active</span>}
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-muted">API Key</label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono"
                      onChange={(e) => setKey(e.target.value)}
                      placeholder={meta.keyPlaceholder ?? ""}
                      type={visible ? "text" : "password"}
                      value={key}
                    />
                    <button
                      className="text-xs text-muted hover:text-ink px-2 py-1 border border-border rounded-md"
                      onClick={() => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))}
                      type="button"
                    >
                      {visible ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-muted">Model</label>
                  <select
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    onChange={(e) => setModel(e.target.value)}
                    value={model}
                  >
                    {CLOUD_MODEL_OPTIONS[id].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
                    disabled={ts.status === "testing" || !key}
                    onClick={() => testProvider(id)}
                    type="button"
                  >
                    {ts.status === "testing" ? "Testing…" : "Test connection"}
                  </button>
                  {ts.status === "ok" && (
                    <span className="text-xs text-[var(--color-success)]">
                      Connected · {ts.model} · {ts.latencyMs}ms
                    </span>
                  )}
                  {ts.status === "error" && (
                    <span className="text-xs text-[var(--color-danger)]">{ts.error}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Discovery & Aggregators ───────────────────────────── */}
      {showAdvanced && (
        <div className="grid gap-3 border border-border rounded-md p-4">
          <span className="text-sm font-medium text-ink">Discovery &amp; Aggregators</span>
          <p className="text-xs text-muted">Optional keys for search-based source discovery (Brave) and job aggregator scanning (Adzuna).</p>

          <div className="grid gap-2">
            <label className="text-xs text-muted">Brave Search API Key <span className="text-muted/60">(for Sources &rarr; Search discover)</span></label>
            <input
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              onChange={(e) => setBraveSearchApiKey(e.target.value)}
              placeholder="BSA…"
              type="password"
              value={braveSearchApiKey}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <label className="text-xs text-muted">Adzuna App ID</label>
              <input
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                onChange={(e) => setAdzunaAppId(e.target.value)}
                placeholder="xxxxxxxx"
                type="text"
                value={adzunaAppId}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-muted">Adzuna API Key</label>
              <input
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                onChange={(e) => setAdzunaApiKey(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                type="password"
                value={adzunaApiKey}
              />
            </div>
          </div>
          <p className="text-xs text-muted/70">Free Adzuna keys: <span className="font-mono">developer.adzuna.com</span>. Free Brave Search keys: <span className="font-mono">brave.com/search/api</span>.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button disabled={isPending} type="submit" variant="primary">
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {saved && <span className="text-xs text-[var(--color-success)]">Saved</span>}
      </div>
    </form>
  );
}
