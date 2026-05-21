"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
};

export function AISettingsForm({ onSaved, settings, submitLabel = "Save settings" }: Props) {
  const router = useRouter();
  const [activeProvider, setActiveProvider] = useState<AIProviderName>(settings.activeProvider);
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicApiKey);
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey);
  const [openaiKey, setOpenaiKey] = useState(settings.openaiApiKey);
  const [anthropicModel, setAnthropicModel] = useState(settings.anthropicModel || "claude-sonnet-4-6");
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || "gemini-2.5-flash");
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel || "gpt-5.4-mini");
  const [fallbackProvider, setFallbackProvider] = useState(settings.fallbackProvider);
  const [braveSearchApiKey, setBraveSearchApiKey] = useState(settings.braveSearchApiKey ?? "");
  const [adzunaAppId, setAdzunaAppId] = useState(settings.adzunaAppId ?? "");
  const [adzunaApiKey, setAdzunaApiKey] = useState(settings.adzunaApiKey ?? "");
  const [showKeys, setShowKeys] = useState<Record<AIProviderName, boolean>>({ anthropic: false, gemini: false, openai: false });
  const [testStates, setTestStates] = useState<Record<AIProviderName, ProviderTestState>>({
    anthropic: { status: "idle" },
    gemini: { status: "idle" },
    openai: { status: "idle" }
  });
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentKey = (p: AIProviderName) => (p === "anthropic" ? anthropicKey : p === "gemini" ? geminiKey : openaiKey);
  const currentModel = (p: AIProviderName) => (p === "anthropic" ? anthropicModel : p === "gemini" ? geminiModel : openaiModel);

  async function testProvider(provider: AIProviderName) {
    const apiKey = currentKey(provider);
    if (!apiKey) {
      setTestStates((prev) => ({ ...prev, [provider]: { status: "error", error: "Enter an API key first" } }));
      return;
    }
    setTestStates((prev) => ({ ...prev, [provider]: { status: "testing" } }));
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, model: currentModel(provider) })
      });
      const data = await res.json() as { ok: boolean; latencyMs: number; model: string; error?: string };
      setTestStates((prev) => ({
        ...prev,
        [provider]: data.ok
          ? { status: "ok", latencyMs: data.latencyMs, model: data.model }
          : { status: "error", error: data.error }
      }));
    } catch {
      setTestStates((prev) => ({ ...prev, [provider]: { status: "error", error: "Request failed" } }));
    }
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
    fd.set("fallbackProvider", fallbackProvider);
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

  const providers: { id: AIProviderName; label: string; keyState: string; setKey: (v: string) => void; modelState: string; setModel: (v: string) => void; modelOptions: string[] }[] = [
    {
      id: "anthropic",
      label: "Claude (Anthropic)",
      keyState: anthropicKey,
      setKey: setAnthropicKey,
      modelState: anthropicModel,
      setModel: setAnthropicModel,
      modelOptions: [
        "claude-sonnet-4-6",
        "claude-opus-4-7",
        "claude-haiku-4-5-20251001"
      ]
    },
    {
      id: "gemini",
      label: "Gemini (Google)",
      keyState: geminiKey,
      setKey: setGeminiKey,
      modelState: geminiModel,
      setModel: setGeminiModel,
      modelOptions: [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
      ]
    },
    {
      id: "openai",
      label: "OpenAI",
      keyState: openaiKey,
      setKey: setOpenaiKey,
      modelState: openaiModel,
      setModel: setOpenaiModel,
      modelOptions: [
        "gpt-5.4-mini",
        "gpt-5.5",
        "gpt-5.4",
        "gpt-5.4-nano"
      ]
    }
  ];

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      {/* Active provider */}
      <div className="grid gap-3">
        <label className="text-sm font-medium text-ink">Active provider</label>
        <div className="flex gap-3 flex-wrap">
          {providers.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                checked={activeProvider === p.id}
                className="accent-[var(--color-accent)]"
                name="activeProvider"
                onChange={() => setActiveProvider(p.id)}
                type="radio"
                value={p.id}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      {/* Per-provider key + model + test */}
      {providers.map((p) => {
        const ts = testStates[p.id];
        const visible = showKeys[p.id];
        return (
          <div key={p.id} className="grid gap-3 border border-border rounded-md p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{p.label}</span>
              {activeProvider === p.id && (
                <span className="text-xs font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 rounded">Active</span>
              )}
            </div>

            <div className="grid gap-2">
              <label className="text-xs text-muted">API Key</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono"
                  onChange={(e) => {
                    p.setKey(e.target.value);
                    if (e.target.value && activeProvider !== p.id) setActiveProvider(p.id);
                  }}
                  placeholder={`${p.id === "anthropic" ? "sk-ant-…" : p.id === "gemini" ? "AIza…" : "sk-…"}`}
                  type={visible ? "text" : "password"}
                  value={p.keyState}
                />
                <button
                  className="text-xs text-muted hover:text-ink px-2 py-1 border border-border rounded-md"
                  onClick={() => setShowKeys((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
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
                onChange={(e) => p.setModel(e.target.value)}
                value={p.modelState}
              >
                {p.modelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
                disabled={ts.status === "testing" || !p.keyState}
                onClick={() => testProvider(p.id)}
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

      {/* Fallback provider */}
      <div className="grid gap-2">
        <label className="text-xs text-muted">Fallback provider (optional)</label>
        <select
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] max-w-xs"
          onChange={(e) => setFallbackProvider(e.target.value)}
          value={fallbackProvider}
        >
          <option value="">None</option>
          {providers.filter((p) => p.id !== activeProvider).map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted">Used automatically if the active provider fails.</p>
      </div>

      {/* Discovery & Aggregators */}
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

      <div className="flex items-center gap-3">
        <Button disabled={isPending} type="submit" variant="primary">
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {saved && <span className="text-xs text-[var(--color-success)]">Saved</span>}
      </div>
    </form>
  );
}
