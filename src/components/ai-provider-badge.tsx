type AIProviderBadgeProps = {
  provider: string;
  model: string;
  generationMs?: number;
  tokensUsed?: number;
};

export function AIProviderBadge({ provider, model, generationMs, tokensUsed }: AIProviderBadgeProps) {
  if (!provider) return null;

  const parts = [`${provider} / ${model}`];
  if (tokensUsed && tokensUsed > 0) parts.push(`${(tokensUsed / 1000).toFixed(1)}k tokens`);
  if (generationMs && generationMs > 0) parts.push(`${(generationMs / 1000).toFixed(1)}s`);

  return (
    <p className="text-xs text-muted" aria-label={`Generated with ${parts.join(", ")}`}>
      Generated with {parts.join(" · ")}
    </p>
  );
}
