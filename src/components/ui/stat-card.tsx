import { Badge } from "./badge";
import { Card } from "./card";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export function StatCard({ label, value, detail, tone = "neutral" }: StatCardProps) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <Badge tone={tone}>{detail}</Badge>
      </div>
      <p className="text-3xl font-semibold text-ink">{value}</p>
    </Card>
  );
}
