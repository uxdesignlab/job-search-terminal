import { getActiveProvider } from "@/lib/ai/factory";
import type { AIMessage } from "@/lib/ai/provider";
import type { ConsolidationCluster, ConsolidationPayload, EvaluationSuggestionDigest } from "@/lib/db/types";

const CLUSTER_BATCH = 35;
const SYNTH_BATCH = 5;

const CLUSTER_SYSTEM = `You group interview STAR stories by the underlying real experience they describe.
Many stories are lightly reworded copies of the SAME real project/accomplishment, generated for different job applications. Assign each story to a canonical experience label. Stories about the same underlying project, achievement, or story arc (same company/team/outcome) share a label. Create a new label only when a story is genuinely a different experience. Keep labels short and human ("Design system rollout at Acme", "Turning around the onboarding funnel").`;

const SYNTH_SYSTEM = `You synthesize one clean, reusable STAR+Reflection interview story from several near-duplicate versions of the same underlying experience.
Merge the strongest, most specific details (numbers, scope, outcomes) from the members into a single authentic story. Do not invent facts not present in the members. Also produce 3-6 capability tags: real skill/method/domain phrases the story demonstrates (e.g. "design systems", "stakeholder alignment", "user research") — not job titles, seniorities, or company names.`;

type ClusterAssignment = { id: string; label: string };

async function assignBatch(
  provider: ReturnType<typeof getActiveProvider>,
  batch: EvaluationSuggestionDigest[],
  knownLabels: string[]
): Promise<ClusterAssignment[]> {
  const stories = batch
    .map(
      (d) =>
        `- id: ${d.id}\n  title: ${d.title}\n  situation: ${d.situation.slice(0, 160)}\n  action: ${d.action.slice(0, 200)}\n  result: ${d.result.slice(0, 160)}`
    )
    .join("\n");
  const labelList = knownLabels.length > 0 ? knownLabels.map((l) => `- ${l}`).join("\n") : "(none yet)";
  const messages: AIMessage[] = [
    { role: "system", content: CLUSTER_SYSTEM },
    {
      role: "user",
      content: `Existing experience labels so far:\n${labelList}\n\nAssign each of these stories to an existing label or a new one. Return JSON: { "assignments": [{ "id": "<story id>", "label": "<experience label>" }] }\n\nStories:\n${stories}`
    }
  ];
  const result = await provider.generateJSON<{ assignments: ClusterAssignment[] }>(messages, '{"assignments":[]}');
  return Array.isArray(result.assignments) ? result.assignments : [];
}

async function synthesizeClusters(
  provider: ReturnType<typeof getActiveProvider>,
  groups: Array<{ label: string; members: EvaluationSuggestionDigest[] }>
): Promise<Map<string, ConsolidationCluster["canonical"]>> {
  const out = new Map<string, ConsolidationCluster["canonical"]>();
  for (let i = 0; i < groups.length; i += SYNTH_BATCH) {
    const slice = groups.slice(i, i + SYNTH_BATCH);
    const payload = slice
      .map((g, idx) => {
        const members = g.members
          .map(
            (m) =>
              `    - title: ${m.title}\n      situation: ${m.situation.slice(0, 220)}\n      action: ${m.action.slice(0, 280)}\n      result: ${m.result.slice(0, 220)}`
          )
          .join("\n");
        return `cluster ${idx} (label: ${g.label}):\n${members}`;
      })
      .join("\n\n");
    const messages: AIMessage[] = [
      { role: "system", content: SYNTH_SYSTEM },
      {
        role: "user",
        content: `Synthesize one canonical STAR+Reflection story per cluster below. Return JSON: { "clusters": [{ "index": <cluster number>, "title": "5-8 word memorable name", "situation": "", "task": "", "action": "", "result": "", "reflection": "", "tags": ["", ""] }] }\n\n${payload}`
      }
    ];
    const result = await provider.generateJSON<{
      clusters: Array<{ index: number; title: string; situation: string; task: string; action: string; result: string; reflection: string; tags: string[] }>;
    }>(messages, '{"clusters":[]}');
    for (const c of result.clusters ?? []) {
      const group = slice[c.index];
      if (!group) continue;
      out.set(group.label, {
        title: c.title || group.label,
        situation: c.situation || "",
        task: c.task || "",
        action: c.action || "",
        result: c.result || "",
        reflection: c.reflection || "",
        tags: Array.isArray(c.tags) ? c.tags.filter(Boolean).slice(0, 6) : []
      });
    }
  }
  return out;
}

/**
 * Clusters the legacy evaluation-suggestion stories into canonical core stories via the
 * active LLM provider, then synthesizes one clean STAR story per cluster. Returns a
 * review payload; nothing is written to the database here.
 */
export async function buildConsolidationPayload(digests: EvaluationSuggestionDigest[]): Promise<ConsolidationPayload> {
  const provider = getActiveProvider();
  const byId = new Map(digests.map((d) => [d.id, d]));

  // 1) Cluster in batches, carrying discovered labels forward.
  const assignments = new Map<string, string>();
  const knownLabels: string[] = [];
  for (let i = 0; i < digests.length; i += CLUSTER_BATCH) {
    const batch = digests.slice(i, i + CLUSTER_BATCH);
    const batchAssignments = await assignBatch(provider, batch, knownLabels);
    for (const a of batchAssignments) {
      if (!byId.has(a.id) || !a.label?.trim()) continue;
      const label = a.label.trim();
      assignments.set(a.id, label);
      if (!knownLabels.includes(label)) knownLabels.push(label);
    }
    // Fallback: anything the model skipped in this batch becomes its own label.
    for (const d of batch) {
      if (!assignments.has(d.id)) {
        const label = d.title.slice(0, 60) || d.id;
        assignments.set(d.id, label);
        if (!knownLabels.includes(label)) knownLabels.push(label);
      }
    }
  }

  // 2) Group by label.
  const groupsByLabel = new Map<string, EvaluationSuggestionDigest[]>();
  for (const [id, label] of assignments) {
    const digest = byId.get(id);
    if (!digest) continue;
    const list = groupsByLabel.get(label) ?? [];
    list.push(digest);
    groupsByLabel.set(label, list);
  }
  const groups = Array.from(groupsByLabel.entries())
    .map(([label, members]) => ({ label, members }))
    .sort((a, b) => b.members.length - a.members.length);

  // 3) Synthesize a canonical story per group.
  const canonicalByLabel = await synthesizeClusters(provider, groups);

  const clusters: ConsolidationCluster[] = groups.map((g, index) => ({
    key: `cluster-${index}`,
    canonical:
      canonicalByLabel.get(g.label) ?? {
        title: g.label,
        situation: g.members[0]?.situation ?? "",
        task: "",
        action: g.members[0]?.action ?? "",
        result: g.members[0]?.result ?? "",
        reflection: "",
        tags: Array.from(new Set(g.members.flatMap((m) => m.tags))).slice(0, 6)
      },
    members: g.members.map((m) => ({
      id: m.id,
      title: m.title,
      sourceJobId: m.sourceJobId,
      sourceJobTitle: m.sourceJobTitle
    }))
  }));

  return { totalSuggestions: digests.length, clusters };
}
