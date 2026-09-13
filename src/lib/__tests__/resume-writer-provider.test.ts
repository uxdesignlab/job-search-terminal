import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWritingCandidates } from "@/lib/ai/factory";
import { anthropicAcceptsEffort, anthropicAcceptsSampling } from "@/lib/ai/anthropic-models";
import { isOpenAIReasoningModel } from "@/lib/ai/openai";
import type { AISettingsRecord } from "@/lib/db/types";

const BASE: AISettingsRecord = {
  id: "singleton",
  activeProvider: "ollama",
  anthropicApiKey: "",
  geminiApiKey: "",
  openaiApiKey: "",
  anthropicModel: "latest-sonnet",
  geminiModel: "latest-flash",
  openaiModel: "latest",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "gemma4:12b-mlx",
  fallbackProvider: "",
  providerOrderJson: ["ollama", "openai", "gemini", "anthropic"],
  providerEnabledJson: ["ollama"],
  onboardingDismissed: true,
  onboardingPreferencesConfirmed: true,
  braveSearchApiKey: "",
  adzunaAppId: "",
  adzunaApiKey: "",
  resumeWriterProvider: "",
  updatedAt: "2026-09-13T00:00:00.000Z",
};

describe("the resume writer chain", () => {
  it("follows the main chain until a writer is chosen", () => {
    expect(resolveWritingCandidates(BASE)).toEqual(["ollama"]);
  });

  it("puts the writer first and keeps the rest as fallbacks", () => {
    const settings = { ...BASE, providerEnabledJson: ["ollama", "gemini"] as AISettingsRecord["providerEnabledJson"], geminiApiKey: "g", openaiApiKey: "o", resumeWriterProvider: "openai" as const };
    expect(resolveWritingCandidates(settings)).toEqual(["openai", "ollama", "gemini"]);
  });

  it("accepts a writer the main chain leaves out, because keeping scans local is the point", () => {
    const settings = { ...BASE, openaiApiKey: "o", resumeWriterProvider: "openai" as const };
    expect(resolveWritingCandidates(settings)).toEqual(["openai", "ollama"]);
  });

  it("ignores a writer that has no credential", () => {
    expect(resolveWritingCandidates({ ...BASE, resumeWriterProvider: "anthropic" })).toEqual(["ollama"]);
  });
});

describe("per-model request tuning", () => {
  it("sends temperature to Claude only where sampling still exists", () => {
    // A current Claude model rejects temperature with a 400 rather than ignoring it.
    expect(anthropicAcceptsSampling("claude-sonnet-5")).toBe(false);
    expect(anthropicAcceptsSampling("claude-opus-5")).toBe(false);
    expect(anthropicAcceptsSampling("claude-opus-4-8")).toBe(false);
    expect(anthropicAcceptsSampling("claude-sonnet-4-6")).toBe(true);
    expect(anthropicAcceptsSampling("claude-haiku-4-5")).toBe(true);
  });

  it("asks Claude for low effort only where effort is accepted", () => {
    expect(anthropicAcceptsEffort("claude-sonnet-5")).toBe(true);
    expect(anthropicAcceptsEffort("claude-opus-5")).toBe(true);
    expect(anthropicAcceptsEffort("claude-haiku-4-5")).toBe(false);
    expect(anthropicAcceptsEffort("claude-sonnet-4-5")).toBe(false);
  });

  it("treats GPT-5 and the o-series as reasoning models", () => {
    expect(isOpenAIReasoningModel("gpt-5.6-sol")).toBe(true);
    expect(isOpenAIReasoningModel("o4-mini")).toBe(true);
    expect(isOpenAIReasoningModel("gpt-4.1")).toBe(false);
  });
});

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-writer-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  client.getDatabase();
  return { client, queries };
}

beforeEach(() => {
  delete process.env.JST_DATABASE_PATH;
});

afterEach(async () => {
  const client = await import("@/lib/db/client").catch(() => null);
  client?.closeDatabase();
  delete process.env.JST_DATABASE_PATH;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("stored writer and credit state", () => {
  it("saves the writer and keeps it when a form without the field saves", async () => {
    const { queries } = await loadFreshDb();
    queries.saveAISettings({ resumeWriterProvider: "openai", openaiApiKey: "o" });
    expect(queries.getAISettings().resumeWriterProvider).toBe("openai");

    queries.saveAISettings({ ollamaModel: "gemma4:12b-mlx" });
    expect(queries.getAISettings().resumeWriterProvider).toBe("openai");
  });

  it("forgets that a provider was out of credits once its key changes", async () => {
    const { queries } = await loadFreshDb();
    queries.saveAISettings({ openaiApiKey: "old-key" });
    queries.markAIProviderCreditsExhausted("openai", "OpenAI is out of credits.");
    expect(queries.getAIProviderStatuses().map((status) => status.provider)).toEqual(["openai"]);

    // Saving the same key again is not a new account.
    queries.saveAISettings({ openaiApiKey: "old-key" });
    expect(queries.getAIProviderStatuses()).toHaveLength(1);

    queries.saveAISettings({ openaiApiKey: "new-key" });
    expect(queries.getAIProviderStatuses()).toEqual([]);
  });

  it("records timing and provenance on a generated document", async () => {
    const { client, queries } = await loadFreshDb();
    client.getDatabase().prepare(
      `insert into jobs (
        id, company, title, url, source, location, remote_type, first_seen_date,
        freshness_label, raw_description, parsed_description, status, fit_score,
        role_archetype, recommendation, summary, why_it_matches, main_concern,
        recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
        gaps_json, red_flags_json
      ) values (
        'job-a', 'Acme', 'Design Director', 'https://example.com/a', 'manual', 'Remote',
        'remote', '2026-07-01', 'fresh', '', '', 'Found', 80, '', '', '', '', '', '', '',
        '[]', '[]', '[]', '[]'
      )`
    ).run();
    const job = { id: "job-a" };
    queries.saveGeneratedDocument({
      id: `document-${job.id}`,
      jobId: job.id,
      documentType: "resume",
      title: "t",
      content: "",
      pdfUrl: "",
      htmlUrl: "",
      baseResume: "Lane",
      generatedDate: "2026-09-13",
      status: "Draft",
      tailoringSummary: "",
      keywordCoverage: 0,
      tailoringPlan: [],
      draftJson: "{}",
      generationMs: 61234,
      providerUsed: "openai",
      modelUsed: "gpt-5.6-sol",
      generationStages: [{ stage: "preparing", ms: 1200, detail: "reused" }, { stage: "writing", ms: 58000, provider: "openai", model: "gpt-5.6-sol" }],
    });
    const saved = queries.getGeneratedDocumentById(`document-${job.id}`);
    expect(saved?.generationMs).toBe(61234);
    expect(saved?.providerUsed).toBe("openai");
    expect(saved?.generationStages[1]).toMatchObject({ stage: "writing", model: "gpt-5.6-sol" });
  });
});
