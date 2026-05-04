/**
 * Maps role archetype text (from AI or heuristics) to an existing resume lane name.
 * Lane names are user-defined; matching is substring + token overlap, not exact taxonomy.
 */

export function pickResumeBase(archetype: string, resumeNames: string[]): string {
  if (resumeNames.length === 0) {
    return "To be selected";
  }
  const lower = archetype.toLowerCase();
  const find = (substr: string) => resumeNames.find((n) => n.toLowerCase().includes(substr));
  if (
    lower.includes("leadership") ||
    lower.includes("management") ||
    lower.includes("director") ||
    lower.includes("chief") ||
    lower.includes("vp")
  ) {
    return find("leadership") ?? find("principal") ?? resumeNames[0] ?? "To be selected";
  }
  if (lower.includes("operations")) {
    return find("operations") ?? resumeNames[0] ?? "To be selected";
  }
  if (lower.includes("accessibility") || lower.includes("a11y")) {
    return find("a11y") ?? find("accessibility") ?? resumeNames[0] ?? "To be selected";
  }
  if (lower.includes("education") || lower.includes("teach")) {
    return find("teach") ?? find("education") ?? resumeNames[0] ?? "To be selected";
  }
  return find("principal") ?? find("leadership") ?? resumeNames[0] ?? "To be selected";
}

function bestLaneByTokenOverlap(hints: string[], resumeNames: string[]): string {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  const tokens = text.split(/[^a-z0-9]+/i).filter((t) => t.length > 3);
  if (tokens.length === 0) {
    return resumeNames[0]!;
  }
  let best = resumeNames[0]!;
  let bestScore = -1;
  for (const name of resumeNames) {
    const nl = name.toLowerCase();
    const score = tokens.reduce((acc, t) => acc + (nl.includes(t) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

/**
 * Always returns a real lane name from `resumeNames` when the list is non-empty,
 * so DB/UI never reference template labels like "Leadership" or a mismatched AI string.
 */
export function coerceResumeBaseToLane(
  stored: string,
  roleArchetype: string,
  resumeNames: string[]
): string {
  if (resumeNames.length === 0) {
    return "To be selected";
  }
  if (resumeNames.includes(stored)) {
    return stored;
  }
  const ci = resumeNames.find((n) => n.toLowerCase() === stored.trim().toLowerCase());
  if (ci) {
    return ci;
  }
  const fromStored = pickResumeBase(stored, resumeNames);
  if (resumeNames.includes(fromStored)) {
    return fromStored;
  }
  const fromArchetype = pickResumeBase(roleArchetype, resumeNames);
  if (resumeNames.includes(fromArchetype)) {
    return fromArchetype;
  }
  return bestLaneByTokenOverlap([stored, roleArchetype], resumeNames);
}
