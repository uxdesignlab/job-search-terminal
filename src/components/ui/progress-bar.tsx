type ProgressBarProps = {
  value: number;
  tone?: "success" | "warning" | "accent";
  className?: string;
};

const colorMap: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  success: "bg-success",
  warning: "bg-warning",
  accent: "bg-accent",
};

export function ProgressBar({ value, tone = "accent", className = "" }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-surface ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorMap[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
