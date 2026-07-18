// Shared keyword normalization used by both keyword extraction
// (`src/lib/evaluation/keyword-signals.ts`) and keyword coverage
// (`src/lib/documents/keyword-coverage.ts`). Matching between the extracted
// signals and the resume haystack depends on both sides tokenizing text the
// exact same way, so the pipeline lives here once instead of being duplicated.
export function normalizeKeywordText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
