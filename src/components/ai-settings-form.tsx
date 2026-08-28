"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui";
import type { AISettingsRecord, AIProviderName } from "@/lib/db/types";
import { OPENAI_LATEST_SENTINEL, OPENAI_MODEL_OPTIONS } from "@/lib/ai/openai-models";
import { ANTHROPIC_LATEST_SENTINELS, ANTHROPIC_MODEL_OPTIONS } from "@/lib/ai/anthropic-models";
import { GEMINI_LATEST_SENTINELS, GEMINI_MODEL_OPTIONS } from "@/lib/ai/gemini-models";
import { summarizeProviderError } from "@/lib/ai/provider-error-summary";
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
  /** Onboarding uses this: the form will not submit until at least one enabled
   *  provider holds a working credential, and it verifies that credential on save.
   *  Settings leaves it off — an established user may be editing keys mid-rotation. */
  requireCredential?: boolean;
  /** Compact mode only. Called from the summary screen's Continue button, so the step
   *  advances on a deliberate press rather than the instant a key lands — otherwise
   *  the user is thrown into step 2 before they can add a fallback. */
  onComplete?: () => void;
};

const PROVIDER_META: Record<AIProviderName, { label: string; keyPlaceholder?: string }> = {
  anthropic: { label: "Claude (Anthropic)", keyPlaceholder: "sk-ant-…" },
  gemini: { label: "Gemini (Google)", keyPlaceholder: "AIza…" },
  openai: { label: "OpenAI", keyPlaceholder: "sk-…" },
  ollama: { label: "Ollama (Local)" }
};

const ALL_PROVIDERS: AIProviderName[] = ["anthropic", "gemini", "openai", "ollama"];

/** One line on what each provider costs and where it runs — the chooser is the first
 *  place a user meets these names, and "Ollama" means nothing without it. */
const PROVIDER_BLURB: Record<AIProviderName, string> = {
  anthropic: "Cloud · pay per use · Claude models",
  gemini: "Cloud · free tier available · Google models",
  openai: "Cloud · pay per use · GPT models",
  ollama: "Local · free · runs models on this machine"
};

/** Where each provider issues keys. Shown in onboarding, where "paste your API key" is
 *  the first thing the app ever asks for and the user may not have one yet. */
const KEY_SOURCES: Partial<Record<AIProviderName, string>> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys"
};

const CLOUD_MODEL_OPTIONS: Record<AIProviderName, string[]> = {
  anthropic: ANTHROPIC_MODEL_OPTIONS,
  gemini: GEMINI_MODEL_OPTIONS,
  openai: OPENAI_MODEL_OPTIONS,
  ollama: []
};

/** Providers whose model list can be fetched live, so a new release shows up in the
 *  dropdown — and is picked automatically by an auto option — without a code change.
 *  Each has a `/api/ai/<provider>-models` route. */
type LiveModelProvider = "anthropic" | "gemini" | "openai";

/** Every "keep me on the newest" option, per provider. OpenAI has one because it
 *  names its tier in a suffix; Claude and Gemini name theirs in the model id, so each
 *  tier gets its own — auto-selecting across tiers would silently change the price
 *  and capability of every run. */
const AUTO_SENTINELS: Record<LiveModelProvider, string[]> = {
  anthropic: Object.keys(ANTHROPIC_LATEST_SENTINELS),
  gemini: Object.keys(GEMINI_LATEST_SENTINELS),
  openai: [OPENAI_LATEST_SENTINEL]
};

const MODEL_LABELS: Record<string, string> = {
  // OpenAI ships one alias per generation (`gpt-5.6` → `gpt-5.6-sol`) plus named variants.
  [OPENAI_LATEST_SENTINEL]: "Latest (auto — always newest flagship)",
  "gpt-5.6": "gpt-5.6 (current flagship alias → sol)",
  "gpt-5.6-sol": "gpt-5.6-sol (highest capability)",
  "gpt-5.6-terra": "gpt-5.6-terra (balanced, lower price)",
  "gpt-5.6-luna": "gpt-5.6-luna (fast, high volume)",
  "latest-sonnet": "Latest Sonnet (auto — balanced, recommended)",
  "latest-opus": "Latest Opus (auto — highest capability)",
  "latest-haiku": "Latest Haiku (auto — fastest, lowest cost)",
  "latest-flash": "Latest Flash (auto — balanced, recommended)",
  "latest-pro": "Latest Pro (auto — highest capability)",
  "latest-flash-lite": "Latest Flash-Lite (auto — fastest, lowest cost)"
};

function isAutoModel(provider: AIProviderName, model: string): boolean {
  return (AUTO_SENTINELS as Record<string, string[]>)[provider]?.includes(model) ?? false;
}

/** Provider errors are written for the background case, where the user is somewhere
 *  else in the app and needs pointing at Settings. Inside this form they are already
 *  looking at the field, so drop that sentence and the trailing stop before the form
 *  adds its own instruction. */
function trimProviderErrorAdvice(error: string): string {
  return error
    .replace(/\s*(Go to|Add an API key in)\s*Settings\s*→[^.]*\.?\s*$/i, "")
    .replace(/\s*\.\s*$/, "")
    .trim();
}

/** The saved credential for a cloud provider. Keys reach this form masked, so this is
 *  only ever a presence check — never the value itself. */
function storedKeyFor(settings: AISettingsRecord, name: AIProviderName): string {
  if (name === "anthropic") return settings.anthropicApiKey;
  if (name === "gemini") return settings.geminiApiKey;
  if (name === "openai") return settings.openaiApiKey;
  return "";
}

/** A failed connection test, summarized. Providers return the whole HTTP failure
 *  body — Google's 429 is a paragraph of quota metrics plus JSON — so the panel
 *  shows the actionable line and keeps the rest one click away rather than
 *  discarding it. */
function ConnectionError({ error }: { error?: string }) {
  const { summary, detail } = summarizeProviderError(error);
  if (!summary) return null;
  return (
    <span className="min-w-0 text-xs text-[var(--color-danger)]">
      {summary}
      {detail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted hover:text-ink">Full error</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-2 text-[11px] text-muted">
            {detail}
          </pre>
        </details>
      )}
    </span>
  );
}

function SortableProviderRow({
  id,
  rank,
  enabled,
  status,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
}: {
  id: AIProviderName;
  rank: number;
  enabled: boolean;
  /** Short note on what this provider still needs, shown once it is enabled. */
  status?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : undefined, zIndex: isDragging ? 10 : undefined }}
      /* An unselected row is a live option, not a disabled control, so it keeps full
         text contrast — the checkbox and border carry the state instead. */
      className={`flex items-center gap-2 rounded-md border px-3 py-2 ${enabled ? "border-accent/50 bg-surface" : "border-border bg-panel"}`}
    >
      <button
        className="text-muted hover:text-ink cursor-grab active:cursor-grabbing shrink-0 touch-none"
        type="button"
        aria-label={`Drag to reorder ${PROVIDER_META[id].label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span aria-hidden="true" className="w-6 text-center text-xs font-mono text-muted shrink-0">
        {enabled && rank >= 0 ? `#${rank + 1}` : "—"}
      </span>
      {/* The label wraps both, so the provider name is the checkbox's accessible name
          and its click target. Previously each box announced only "on". */}
      <label className="flex flex-1 min-w-0 cursor-pointer items-center gap-2 py-0.5">
        <input
          checked={enabled}
          className="accent-[var(--color-accent)] shrink-0"
          onChange={onToggle}
          type="checkbox"
        />
        <span className={`text-sm ${enabled ? "text-ink font-medium" : "text-ink"}`}>
          {PROVIDER_META[id].label}
        </span>
        {enabled && rank >= 0 && (
          <span className="sr-only">priority {rank + 1}</span>
        )}
      </label>
      {status && <span className="shrink-0 text-xs text-muted">{status}</span>}
      {/* Priority was drag-only. dnd-kit's keyboard path existed but was announced
          nowhere visible, and a touch user had no path at all. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          aria-label={`Move ${PROVIDER_META[id].label} up`}
          className="rounded px-1.5 py-0.5 text-xs leading-none text-muted hover:bg-panel hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={`Move ${PROVIDER_META[id].label} down`}
          className="rounded px-1.5 py-0.5 text-xs leading-none text-muted hover:bg-panel hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          type="button"
        >
          ↓
        </button>
      </div>
    </div>
  );
}

export function AISettingsForm({
  compact = false,
  onSaved,
  settings,
  submitLabel = "Save settings",
  requireCredential = false,
  onComplete,
}: Props) {
  const router = useRouter();

  // Cloud provider keys
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicApiKey);
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey);
  const [openaiKey, setOpenaiKey] = useState(settings.openaiApiKey);

  // Cloud provider models
  const [anthropicModel, setAnthropicModel] = useState(settings.anthropicModel || "latest-sonnet");
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || "latest-flash");
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel || OPENAI_LATEST_SENTINEL);

  // Live model lists from each provider's own models endpoint, merged into the curated
  // dropdown so a new release shows up without a code change, plus what each auto
  // option resolves to right now.
  const [liveModels, setLiveModels] = useState<Partial<Record<LiveModelProvider, string[]>>>({});
  const [resolvedAuto, setResolvedAuto] = useState<Partial<Record<LiveModelProvider, Record<string, string>>>>({});

  // Ollama
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(settings.ollamaBaseUrl || "http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel || "llama3.1:8b");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaPickerOpen, setOllamaPickerOpen] = useState(false);
  const [ollamaPickerLoading, setOllamaPickerLoading] = useState(false);
  const [ollamaPickerError, setOllamaPickerError] = useState("");
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  /** Declared beside the state it reads, because `canSubmit` calls hasCredential
   *  during render — further down was inside its own temporal dead zone. */
  const ollamaModelInstalled = ollamaModels.length > 0 && ollamaModels.includes(ollamaModel);

  // Provider priority order — the full ordered list; only enabled ones are sent as the chain
  const initOrder = settings.providerOrderJson.length > 0 ? settings.providerOrderJson : ["openai", "anthropic", "gemini"] as AIProviderName[];
  // Ensure all 4 providers are present (append any missing ones at the end, disabled)
  const fullInitOrder: AIProviderName[] = [
    ...initOrder,
    ...ALL_PROVIDERS.filter((p) => !initOrder.includes(p))
  ];
  const [providerOrder, setProviderOrder] = useState<AIProviderName[]>(fullInitOrder);
  const storedEnabled = settings.providerEnabledJson;
  // A ticked provider claims "I have this one set up", so seed the ticks from what is
  // actually configured rather than from the order column — which ships defaulted to
  // three cloud providers and so used to greet every new install with three keyless
  // providers presented as ready. Ollama has no key to check: being in the saved order
  // is the only evidence the user chose it.
  const [enabledProviders, setEnabledProviders] = useState<Set<AIProviderName>>(
    new Set(
      (storedEnabled ?? settings.providerOrderJson).filter((name) =>
        name === "ollama" ? true : Boolean(storedKeyFor(settings, name))
      )
    )
  );

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function moveProvider(id: AIProviderName, direction: -1 | 1) {
    setProviderOrder((prev) => {
      const from = prev.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      return arrayMove(prev, from, to);
    });
  }

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
  // Settings shows the optional integration keys; onboarding has a step for them.
  const showAdvanced = !compact;
  // Why the form will not submit yet, or why the last attempt stopped.
  const [gateError, setGateError] = useState("");
  const [verifying, setVerifying] = useState(false);
  // Set once a verification fails, so the user can save an unverified key on purpose
  // (offline setup, a provider whose test endpoint is down) instead of being stuck.
  const [allowUnverified, setAllowUnverified] = useState(false);

  /* Compact mode is a drill-down rather than one long form: choose a provider, then
     that provider's key entry REPLACES the list in the same space. Revealing the key
     card under a four-row list pushed the field below the fold and grew the dialog on
     every selection, which is the thing this step could least afford. */
  const savedProviders = providerOrder.filter((p) => enabledProviders.has(p));
  const [phase, setPhase] = useState<"chooser" | "key" | "summary">(
    savedProviders.length > 0 ? "summary" : "chooser"
  );
  const [draftProvider, setDraftProvider] = useState<AIProviderName | null>(null);
  /** Whether saving this one would still leave a provider to add. */
  const canAddAnother = providerOrder.some((p) => p !== draftProvider && !enabledProviders.has(p));
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Land the caret in the field the user just drilled into.
  useEffect(() => {
    if (phase === "key" && draftProvider !== "ollama") keyInputRef.current?.focus();
  }, [phase, draftProvider]);

  function openProvider(id: AIProviderName) {
    setDraftProvider(id);
    setGateError("");
    setAllowUnverified(false);
    setPhase("key");
  }

  function leaveKeyEntry() {
    setDraftProvider(null);
    setGateError("");
    setAllowUnverified(false);
    setPhase(savedProviders.length > 0 ? "summary" : "chooser");
  }

  /** Writes the removal through immediately. Updating only local state left the removed
   *  provider enabled in the database — the summary's Continue calls onComplete without
   *  saving, so it kept taking fallback calls after the next refresh. */
  function removeProvider(id: AIProviderName) {
    const nextEnabled = new Set(enabledProviders);
    nextEnabled.delete(id);
    setEnabledProviders(nextEnabled);
    void persistChain(providerOrder, nextEnabled);
  }

  // Effective ordered chain (enabled providers in priority order)
  const effectiveChain = providerOrder.filter((p) => enabledProviders.has(p));
  const activeProvider: AIProviderName = effectiveChain[0] ?? "openai";
  // Onboarding shows a key card only for what the user picked; Settings shows all three
  // so an existing user can paste a key without first ticking the box.
  const cloudOrder = providerOrder.filter((p): p is LiveModelProvider => p !== "ollama");
  const cardProviders = compact ? cloudOrder.filter((p) => enabledProviders.has(p)) : cloudOrder;
  const canSubmit = !requireCredential
    ? true
    : compact && draftProvider
      ? hasCredential(draftProvider)
      : effectiveChain.some(hasCredential);

  // Check Ollama reachability on mount when it's in the chain
  /* Selecting Ollama fetches what is actually installed and moves the model setting onto
     one of them if the current value is not there. The default is `llama3.1:8b`, which
     most machines do not have, and the old flow let that sail through onboarding: the
     connection test reported the server's first model rather than the configured one, so
     the step went green and the failure surfaced two steps later as a bare 404 during
     profile extraction. */
  const checkOllamaReachability = useCallback(async (baseUrl?: string) => {
    try {
      const res = await fetch(`/api/ai/ollama-models?baseUrl=${encodeURIComponent(baseUrl ?? "")}`);
      const data = await res.json() as { models: string[]; error?: string };
      if (data.error) {
        setOllamaReachable(false);
        setOllamaModels([]);
        return;
      }
      setOllamaReachable(true);
      setOllamaModels(data.models);
      setOllamaModel((current) => (data.models.includes(current) ? current : data.models[0] ?? current));
    } catch {
      setOllamaReachable(false);
      setOllamaModels([]);
    }
  }, []);

  useEffect(() => {
    if (!enabledProviders.has("ollama") && draftProvider !== "ollama") return;
    // Debounced, because this also fires on every keystroke in the Base URL field.
    const timer = window.setTimeout(() => void checkOllamaReachability(ollamaBaseUrl), 500);
    return () => window.clearTimeout(timer);
  }, [enabledProviders, draftProvider, ollamaBaseUrl, checkOllamaReachability]);

  const refreshModels = useCallback(async (provider: LiveModelProvider) => {
    try {
      const res = await fetch(`/api/ai/${provider}-models`);
      const data = await res.json() as { models?: string[]; latest?: Record<string, string>; error?: string };
      setLiveModels((prev) => ({ ...prev, [provider]: data.models ?? [] }));
      setResolvedAuto((prev) => ({ ...prev, [provider]: data.latest ?? {} }));
    } catch {
      setLiveModels((prev) => ({ ...prev, [provider]: [] }));
      setResolvedAuto((prev) => ({ ...prev, [provider]: {} }));
    }
  }, []);

  // Only providers with a saved key are asked — the endpoints read the stored key, so
  // a key typed in but not yet saved would just produce an error.
  useEffect(() => {
    if (settings.anthropicApiKey) refreshModels("anthropic");
    if (settings.geminiApiKey) refreshModels("gemini");
    if (settings.openaiApiKey) refreshModels("openai");
  }, [settings.anthropicApiKey, settings.geminiApiKey, settings.openaiApiKey, refreshModels]);

  function keyFor(p: AIProviderName): string {
    if (p === "anthropic") return anthropicKey;
    if (p === "gemini") return geminiKey;
    if (p === "openai") return openaiKey;
    return ollamaBaseUrl;
  }

  /** Editing a key retires whatever the last attempt said about it — including the
   *  "save it as-is" escape, so a corrected key is verified again rather than waved
   *  through on the strength of the previous failure. */
  function updateKey(p: AIProviderName, value: string) {
    if (p === "anthropic") setAnthropicKey(value);
    else if (p === "gemini") setGeminiKey(value);
    else if (p === "openai") setOpenaiKey(value);
    setGateError("");
    setAllowUnverified(false);
    setTestStates((prev) => ({ ...prev, [p]: { status: "idle" } }));
  }

  function modelFor(p: AIProviderName): string {
    if (p === "anthropic") return anthropicModel;
    if (p === "gemini") return geminiModel;
    if (p === "openai") return openaiModel;
    return ollamaModel;
  }

  /** Curated options first, then anything else the key can reach, then the currently
   *  saved value so a model we do not know about still renders as selected. */
  function modelOptionsFor(provider: AIProviderName, current: string): string[] {
    const extras = liveModels[provider as LiveModelProvider] ?? [];
    return Array.from(new Set([...CLOUD_MODEL_OPTIONS[provider], ...extras, current].filter(Boolean)));
  }

  /** Whether this provider could actually run a request. A cloud provider needs a key;
   *  Ollama needs to be answering, since its "credential" is a base URL that always has
   *  a default and would otherwise mark the step done with nothing installed. */
  function hasCredential(p: AIProviderName): boolean {
    if (p === "ollama") return ollamaReachable === true && ollamaModelInstalled;
    return keyFor(p).trim().length > 0;
  }

  /** What this enabled provider is still missing, in the user's terms. */
  function providerStatus(p: AIProviderName): string | undefined {
    if (!enabledProviders.has(p)) return undefined;
    if (p === "ollama") {
      if (ollamaReachable === null) return "Checking…";
      if (!ollamaReachable) return "Not running";
      if (!ollamaModelInstalled) return "Model needed";
      return testStates.ollama.status === "ok" ? "Verified" : "Ready";
    }
    if (!hasCredential(p)) return "Key needed";
    if (testStates[p].status === "ok") return "Verified";
    if (testStates[p].status === "error") return "Not verified";
    return undefined;
  }

  /** Returns whether the provider answered, so save can gate on the same check the
   *  "Test connection" link runs. */
  async function testProvider(provider: AIProviderName): Promise<{ ok: boolean; error?: string }> {
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
      return { ok: data.ok, error: data.error };
    } catch {
      setTestStates((prev) => ({ ...prev, [provider]: { status: "error", error: "Request failed" } }));
      return { ok: false, error: "Request failed" };
    }
  }

  async function openOllamaPicker() {
    setOllamaPickerOpen(true);
    setOllamaPickerLoading(true);
    setOllamaPickerError("");
    try {
      const res = await fetch(`/api/ai/ollama-models?baseUrl=${encodeURIComponent(ollamaBaseUrl)}`);
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await persist("complete");
  }

  /**
   * Verify (when required), save, and say where the user lands afterwards.
   *
   * `complete` — Save and continue: the step is done, so hand back to the caller, which
   * moves the wizard on. `chooser` — Save and add another: stay on this step and go
   * back to the provider list to add a fallback.
   */
  async function persist(nextPhase: "complete" | "chooser") {
    setGateError("");

    // In the drill-down the provider being edited is not in the chain yet — it joins on
    // a successful save, so a half-finished detour does not leave a keyless provider
    // ticked behind the user.
    const nextEnabled = compact && draftProvider
      ? new Set<AIProviderName>([...enabledProviders, draftProvider])
      : enabledProviders;

    // A provider added as a fallback goes to the END of the chain. Filtering the fixed
    // order instead let a later pick outrank an earlier one: choosing Ollama and then
    // adding OpenAI as a fallback produced [openai, ollama], so every AI call went to
    // the paid cloud service rather than the local provider chosen first.
    const isNewlyAdded = Boolean(compact && draftProvider && !enabledProviders.has(draftProvider));
    const nextOrder: AIProviderName[] = isNewlyAdded && draftProvider
      ? [
          ...providerOrder.filter((p) => p !== draftProvider && enabledProviders.has(p)),
          draftProvider,
          ...providerOrder.filter((p) => p !== draftProvider && !enabledProviders.has(p)),
        ]
      : providerOrder;
    const chain = nextOrder.filter((p) => nextEnabled.has(p));

    // Onboarding will not let an empty or unusable chain past. Without this the button
    // saved nothing, reported "Saved", and left the user on a step that never unlocked.
    if (requireCredential) {
      if (chain.length === 0) {
        setGateError("Select a provider and add its API key to continue.");
        return;
      }
      const primary = compact && draftProvider ? draftProvider : chain.find(hasCredential);
      if (!primary || !hasCredential(primary)) {
        setGateError(
          primary === "ollama"
            ? ollamaReachable === false
              ? "Ollama is not answering at that address. Start it with `ollama serve`, or choose a cloud provider."
              : ollamaModels.length === 0
                ? "Ollama is running but has no models installed. Pull one first, for example: ollama pull llama3.1:8b"
                : `Choose an installed model. Ollama does not have "${ollamaModel}".`
            : !primary
              ? "Select a provider and add its API key to continue."
              : "Add an API key for the provider you selected to continue."
        );
        return;
      }
      if (!allowUnverified) {
        setVerifying(true);
        const result = await testProvider(primary);
        setVerifying(false);
        if (!result.ok) {
          setAllowUnverified(true);
          setGateError(
            `${PROVIDER_META[primary].label} did not answer: ` +
            `${trimProviderErrorAdvice(result.error ?? "connection failed")}. ` +
            "Correct the key and save again, or save it as-is and verify later."
          );
          return;
        }
      }
    }

    persistChain(nextOrder, nextEnabled, () => {
      if (compact) {
        setDraftProvider(null);
        // Either way the step now has a saved provider, so leave the summary behind for
        // a later visit; "complete" additionally advances the wizard.
        setPhase(nextPhase === "chooser" ? "chooser" : "summary");
        if (nextPhase === "complete") onComplete?.();
      }
    });
  }

  /** The single write path: persists an order plus the set enabled within it. */
  function persistChain(order: AIProviderName[], enabled: Set<AIProviderName>, after?: () => void) {
    const chain = order.filter((p) => enabled.has(p));
    const fd = new FormData();
    fd.set("activeProvider", chain[0] ?? activeProvider);
    fd.set("anthropicApiKey", anthropicKey);
    fd.set("geminiApiKey", geminiKey);
    fd.set("openaiApiKey", openaiKey);
    fd.set("anthropicModel", anthropicModel);
    fd.set("geminiModel", geminiModel);
    fd.set("openaiModel", openaiModel);
    fd.set("ollamaBaseUrl", ollamaBaseUrl);
    fd.set("ollamaModel", ollamaModel);
    fd.set("fallbackProvider", chain[1] ?? "");
    // The full ranked list, so a provider switched off keeps its place and comes back
    // where the user left it rather than at the bottom in constant order.
    fd.set("providerOrderJson", JSON.stringify(order));
    fd.set("providerEnabledJson", JSON.stringify(chain));
    fd.set("braveSearchApiKey", braveSearchApiKey);
    fd.set("adzunaAppId", adzunaAppId);
    fd.set("adzunaApiKey", adzunaApiKey);
    startTransition(async () => {
      await saveAISettingsAction(fd);
      setProviderOrder(order);
      setEnabledProviders(enabled);
      setSaved(true);
      router.refresh();
      onSaved?.();
      after?.();
      setTimeout(() => setSaved(false), 3000);
    });
  }

  const ollamaConfig = (
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
              <button className="ml-auto shrink-0 underline" onClick={() => void checkOllamaReachability(ollamaBaseUrl)} type="button">Retry</button>
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

          {/* A list of what is installed, not free text: the old input let a model Ollama
              does not have sit there looking configured. Free text stays available for a
              model that is being pulled right now, or a server the list call cannot reach. */}
          <div className="grid gap-2">
            <label className="text-xs text-muted" htmlFor="ollama-model">Model</label>
            {ollamaModels.length > 0 ? (
              <select
                className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                id="ollama-model"
                onChange={(e) => setOllamaModel(e.target.value)}
                value={ollamaModelInstalled ? ollamaModel : ""}
              >
                {!ollamaModelInstalled && <option value="">Choose an installed model…</option>}
                {ollamaModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  id="ollama-model"
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="llama3.1:8b"
                  type="text"
                  value={ollamaModel}
                />
                <button
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-surface disabled:opacity-50"
                  onClick={openOllamaPicker}
                  type="button"
                >
                  Choose…
                </button>
              </div>
            )}
            {ollamaReachable && ollamaModels.length === 0 && (
              <p className="text-xs text-[var(--color-danger)]">
                Ollama is running but has no models installed. Pull one first, for example{" "}
                <span className="font-mono">ollama pull llama3.1:8b</span>.
              </p>
            )}
            {ollamaModels.length > 0 && !ollamaModelInstalled && (
              <p className="text-xs text-[var(--color-danger)]">
                Ollama does not have <span className="font-mono">{ollamaModel}</span>. Pick one it does, or run{" "}
                <span className="font-mono">ollama pull {ollamaModel}</span> and reload.
              </p>
            )}
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
            {testStates.ollama.status === "error" && <ConnectionError error={testStates.ollama.error} />}
          </div>

          {/* Quality callout */}
          <div className="rounded-md bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20 px-3 py-2 text-xs text-muted grid gap-1">
            <span className="font-medium text-ink">Model quality guide</span>
            <span>≥64 GB RAM/VRAM: <span className="font-mono">qwen2.5:72b</span>, <span className="font-mono">llama3.1:70b</span> — near cloud quality</span>
            <span>≥12 GB: <span className="font-mono">qwen2.5:14b</span>, <span className="font-mono">mistral-nemo</span> — good for all features</span>
            <span>≥8 GB: <span className="font-mono">llama3.1:8b</span>, <span className="font-mono">qwen2.5:7b</span> — adequate for simple tasks</span>
          </div>
        </div>
  );

  /* ── Compact drill-down (onboarding) ────────────────────────
     Three screens in one fixed frame: pick a provider, enter its key, review what is
     configured. Each replaces the last, so the panel never grows and the key field is
     always the thing in front of the user. */
  function renderKeyEntry(id: AIProviderName) {
    const meta = PROVIDER_META[id];
    const ts = testStates[id];
    const visible = !!showKeys[id];
    const model = modelFor(id);
    const setModel = id === "anthropic" ? setAnthropicModel : id === "gemini" ? setGeminiModel : setOpenaiModel;
    return (
      <div className="grid gap-4">
        <button
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent underline hover:no-underline"
          onClick={leaveKeyEntry}
          type="button"
        >
          ← {savedProviders.length > 0 ? "Back to providers" : "Choose a different provider"}
        </button>

        <div>
          <p className="text-base font-semibold text-ink">{meta.label}</p>
          <p className="mt-0.5 text-xs text-muted">{PROVIDER_BLURB[id]}</p>
        </div>

        {id === "ollama" ? (
          ollamaConfig
        ) : (
          <>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-ink" htmlFor={`${id}-key`}>API key</label>
              <div className="flex gap-2">
                <input
                  autoComplete="off"
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono"
                  id={`${id}-key`}
                  onChange={(e) => updateKey(id, e.target.value)}
                  placeholder={meta.keyPlaceholder ?? ""}
                  ref={keyInputRef}
                  type={visible ? "text" : "password"}
                  value={keyFor(id)}
                />
                <button
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-ink"
                  onClick={() => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))}
                  type="button"
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
              {KEY_SOURCES[id] && (
                <p className="text-xs text-muted">
                  Don&apos;t have one? Create a key at{" "}
                  <a className="text-accent underline hover:no-underline" href={KEY_SOURCES[id]} rel="noopener noreferrer" target="_blank">
                    {KEY_SOURCES[id]!.replace(/^https:\/\//, "")}
                  </a>
                </p>
              )}
            </div>

            <details>
              <summary className="w-fit cursor-pointer text-xs font-medium text-accent underline hover:no-underline">
                Model options
              </summary>
              <div className="grid gap-2 pt-3">
                <label className="text-xs text-muted" htmlFor={`${id}-model`}>Model</label>
                <select
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  id={`${id}-model`}
                  onChange={(e) => setModel(e.target.value)}
                  value={model}
                >
                  {modelOptionsFor(id, model).map((m) => (
                    <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
                  ))}
                </select>
                <p className="text-xs text-muted">
                  {isAutoModel(id, model)
                    ? "Follows the provider's newest release automatically — no need to change this."
                    : "Pinned to a fixed model. Choose a Latest option to follow new releases automatically."}
                </p>
              </div>
            </details>

            <div className="flex items-start gap-3">
              <button
                className="shrink-0 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
                disabled={ts.status === "testing" || !keyFor(id)}
                onClick={() => void testProvider(id)}
                type="button"
              >
                {ts.status === "testing" ? "Testing…" : "Test connection"}
              </button>
              {ts.status === "ok" && (
                <span className="text-xs text-[var(--color-success)]">Connected · {ts.model} · {ts.latencyMs}ms</span>
              )}
              {ts.status === "error" && <ConnectionError error={ts.error} />}
            </div>
          </>
        )}
      </div>
    );
  }

  const [braveSearchApiKey, setBraveSearchApiKey] = useState(settings.braveSearchApiKey ?? "");
  const [adzunaAppId, setAdzunaAppId] = useState(settings.adzunaAppId ?? "");
  const [adzunaApiKey, setAdzunaApiKey] = useState(settings.adzunaApiKey ?? "");

  if (compact) {
    return (
      <form className="grid gap-5" onSubmit={handleSubmit}>
        {phase === "chooser" && (
          <div className="grid gap-3">
            <div>
              <span className="text-sm font-medium text-ink">Choose a provider</span>
              <p className="mt-0.5 text-xs text-muted">
                {savedProviders.length > 0
                  ? "Extra providers are tried in order when the one above them fails."
                  : "Pick one to start. You can add more afterwards as fallbacks."}
              </p>
            </div>
            <div className="grid gap-2">
              {providerOrder.map((id) => {
                const already = enabledProviders.has(id);
                return (
                  <button
                    className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-3 text-left transition-colors hover:border-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={already}
                    key={id}
                    onClick={() => openProvider(id)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{PROVIDER_META[id].label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{PROVIDER_BLURB[id]}</span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-sm text-muted">
                      {already ? "Added" : "→"}
                    </span>
                    {already && <span className="sr-only">already added</span>}
                  </button>
                );
              })}
            </div>
            {savedProviders.length > 0 && (
              <button
                className="w-fit text-xs font-medium text-accent underline hover:no-underline"
                onClick={() => setPhase("summary")}
                type="button"
              >
                ← Back to providers
              </button>
            )}
          </div>
        )}

        {phase === "key" && draftProvider && renderKeyEntry(draftProvider)}

        {phase === "summary" && (
          <div className="grid gap-3">
            <div>
              <span className="text-sm font-medium text-ink">
                {savedProviders.length === 1 ? "Your AI provider" : "Your AI providers"}
              </span>
              {savedProviders.length > 1 && (
                <p className="mt-0.5 text-xs text-muted">Tried top to bottom — the rest are used only when the one above fails.</p>
              )}
            </div>
            <div className="grid gap-2">
              {savedProviders.map((id) => (
                <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-3" key={id}>
                  <span aria-hidden="true" className="shrink-0 text-sm text-[var(--color-success)]">✓</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{PROVIDER_META[id].label}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {testStates[id].status === "ok"
                        ? `Verified · ${testStates[id].model} · ${testStates[id].latencyMs}ms`
                        : id === "ollama"
                          ? ollamaReachable === false ? "Not answering" : "Saved"
                          : "Saved"}
                    </span>
                  </span>
                  <button
                    className="shrink-0 text-xs font-medium text-muted underline hover:text-ink"
                    onClick={() => openProvider(id)}
                    type="button"
                  >
                    Edit
                  </button>
                  {savedProviders.length > 1 && (
                    <button
                      className="shrink-0 text-xs font-medium text-muted underline hover:text-[var(--color-danger)]"
                      onClick={() => removeProvider(id)}
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="w-fit text-xs font-medium text-accent underline hover:no-underline"
              onClick={() => setPhase("chooser")}
              type="button"
            >
              Add another provider as a fallback
            </button>
          </div>
        )}

        {gateError && (
          <p className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--color-danger)]" role="alert">
            {gateError}
          </p>
        )}

        {phase === "key" && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={isPending || verifying || !canSubmit} type="submit" variant="primary">
                {verifying ? "Verifying…" : isPending ? "Saving…" : allowUnverified ? "Save without verifying" : submitLabel}
              </Button>
              {/* Hidden once a verification has failed: that moment should be a single
                  decision about the key in front of the user, not a fork. */}
              {canAddAnother && !allowUnverified && (
                <Button
                  disabled={isPending || verifying || !canSubmit}
                  onClick={() => void persist("chooser")}
                  type="button"
                  variant="secondary"
                >
                  Save and add another
                </Button>
              )}
              {saved && <span className="text-xs text-[var(--color-success)]">Saved</span>}
            </div>
            {!canSubmit && (
              <p className="text-xs text-muted">
                {draftProvider === "ollama"
                  ? ollamaReachable === false
                    ? "Ollama must be running on this machine before it can be saved."
                    : "Choose a model Ollama has installed."
                  : "Paste this provider's API key to continue."}
              </p>
            )}
          </div>
        )}

        {phase === "summary" && onComplete && (
          <div>
            <Button onClick={onComplete} type="button" variant="primary">Continue</Button>
          </div>
        )}
      </form>
    );
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>

      {/* ── Priority list ─────────────────────────────────────── */}
      <div className="grid gap-3">
        <div>
          <span className="text-sm font-medium text-ink">{requireCredential ? "Choose a provider" : "Provider priority"}</span>
          <p className="text-xs text-muted mt-0.5">
            {requireCredential
              ? "Select one provider below and add its key. Add more later as fallbacks — the top one is used first, and the rest are tried only when it fails."
              : "Enable providers and drag them into priority order. The first enabled provider is used; others are fallbacks."}
          </p>
        </div>

        {/* An explicit `id` keeps dnd-kit from falling back to its module-global
            auto-incrementing counter, which numbers differently on the server than
            in the browser and produced a hydration mismatch on the drag handles'
            `aria-describedby` (see also the kanban board's DndContext). */}
        <DndContext id="ai-settings-provider-priority" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={providerOrder} strategy={verticalListSortingStrategy}>
            <div className="grid gap-2">
              {providerOrder.map((id, index) => (
                <SortableProviderRow
                  key={id}
                  id={id}
                  rank={effectiveChain.indexOf(id)}
                  enabled={enabledProviders.has(id)}
                  status={providerStatus(id)}
                  canMoveUp={index > 0}
                  canMoveDown={index < providerOrder.length - 1}
                  onToggle={() => toggleProvider(id)}
                  onMove={(direction) => moveProvider(id, direction)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Ollama config (shown when enabled) ───────────────── */}
      {enabledProviders.has("ollama") && ollamaConfig}

      {/* ── Cloud provider cards ──────────────────────────────────
          Ordered by the priority list above rather than a fixed list, so the #1
          provider's key field is the first one on screen. In onboarding only the
          selected providers get a card: the key is the step's whole purpose and does
          not belong behind a disclosure labelled "optional". */}
      {cardProviders.length > 0 && (
        <div className="grid gap-4">
          <span className="text-sm font-medium text-ink">{compact ? "API key" : "API keys & models"}</span>
          {cardProviders.map((id) => {
            const meta = PROVIDER_META[id];
            const key = keyFor(id);
            const model = modelFor(id);
            const setModel = id === "anthropic" ? setAnthropicModel : id === "gemini" ? setGeminiModel : setOpenaiModel;
            const ts = testStates[id];
            const visible = !!showKeys[id];
            const isActive = activeProvider === id;
            const modelBlock = (
              <div className="grid gap-2">
                <label className="text-xs text-muted" htmlFor={`${id}-model`}>{meta.label} model</label>
                <select
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  id={`${id}-model`}
                  onChange={(e) => setModel(e.target.value)}
                  value={model}
                >
                  {modelOptionsFor(id, model).map((m) => (
                    <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>
                    {isAutoModel(id, model)
                      ? resolvedAuto[id as LiveModelProvider]?.[model]
                        ? <>Resolves to <span className="font-mono">{resolvedAuto[id as LiveModelProvider]?.[model]}</span> — rechecked hourly, no need to update this setting.</>
                        : "Resolved from the provider's own model list at request time — no need to update this setting."
                      : "Pinned to a fixed model. Choose a Latest option to follow new releases automatically."}
                  </span>
                  <button
                    className="ml-auto shrink-0 underline hover:text-ink"
                    onClick={() => refreshModels(id as LiveModelProvider)}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            );
            return (
              <div key={id} className="grid gap-3 border border-border rounded-md p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{meta.label}</span>
                  {isActive && <span className="text-xs font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 rounded">Active</span>}
                </div>

                <div className="grid gap-2">
                  <label className="text-xs text-muted" htmlFor={`${id}-key`}>{meta.label} API key</label>
                  <div className="flex gap-2">
                    <input
                      autoComplete="off"
                      className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono"
                      id={`${id}-key`}
                      onChange={(e) => updateKey(id, e.target.value)}
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
                  {compact && KEY_SOURCES[id] && (
                    <p className="text-xs text-muted">
                      Get a key at{" "}
                      <a className="text-accent underline hover:no-underline" href={KEY_SOURCES[id]} rel="noopener noreferrer" target="_blank">
                        {KEY_SOURCES[id]!.replace(/^https:\/\//, "")}
                      </a>
                    </p>
                  )}
                </div>

                {compact ? (
                  <details className="grid gap-2">
                    <summary className="w-fit cursor-pointer text-xs font-medium text-accent underline hover:no-underline">
                      Model options
                    </summary>
                    <div className="pt-3">{modelBlock}</div>
                  </details>
                ) : (
                  modelBlock
                )}

                {/* items-start, because an expanded error grows downward and should not
                    drag the Test connection link to the middle of it. */}
                <div className="flex items-start gap-3">
                  <button
                    className="shrink-0 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50"
                    disabled={ts.status === "testing" || !key}
                    onClick={() => void testProvider(id)}
                    type="button"
                  >
                    {ts.status === "testing" ? "Testing…" : "Test connection"}
                  </button>
                  {ts.status === "ok" && (
                    <span className="text-xs text-[var(--color-success)]">
                      Connected · {ts.model} · {ts.latencyMs}ms
                    </span>
                  )}
                  {ts.status === "error" && <ConnectionError error={ts.error} />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Discovery & Aggregators ─────────────────────────────
          Settings only. Onboarding asks for these on its own Integrations step, and
          collecting them twice in one wizard was the reason step 1 had a disclosure. */}
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

      {gateError && (
        <p className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--color-danger)]" role="alert">
          {gateError}
        </p>
      )}

      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <Button disabled={isPending || verifying || !canSubmit} type="submit" variant="primary">
            {verifying ? "Verifying…" : isPending ? "Saving…" : allowUnverified ? "Save without verifying" : submitLabel}
          </Button>
          {saved && <span className="text-xs text-[var(--color-success)]">Saved</span>}
        </div>
        {/* The button used to sit enabled over an empty form, save nothing, and report
            "Saved". Say what is missing instead of leaving the user to guess. */}
        {requireCredential && !canSubmit && (
          <p className="text-xs text-muted">
            {effectiveChain.length === 0
              ? "Select a provider above to continue."
              : "Add an API key for the provider you selected to continue."}
          </p>
        )}
      </div>
    </form>
  );
}
