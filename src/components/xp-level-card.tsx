import { Badge, Card, ProgressBar } from "@/components/ui";
import type { GamificationData } from "@/lib/db/types";

type Props = {
  data: GamificationData;
  userName?: string;
};

export function XpLevelCard({ data, userName }: Props) {
  const greeting = userName ? `Keep going, ${userName.split(" ")[0]}` : "Keep going";

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{greeting}</p>
          <p className="mt-0.5 text-3xl font-semibold text-ink">{data.xp} XP</p>
        </div>
        <Badge tone="neutral">
          Level {data.level} · {data.levelName}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <ProgressBar value={data.xpProgress} tone="accent" />
        <p className="text-xs text-muted">
          {data.xpToNextLevel === 0 ? "Max level reached" : `${data.xpToNextLevel} XP to ${nextLevelName(data.level)}`}
        </p>
      </div>

      {data.streak.current >= 1 && (
        <div className="flex items-center gap-2">
          <Badge tone="success">
            {data.streak.current}-week streak
          </Badge>
          <span className="text-xs text-muted">applications in a row</span>
        </div>
      )}
    </Card>
  );
}

function nextLevelName(currentLevel: number): string {
  const names = ["Scout", "Explorer", "Candidate", "Contender", "Finalist", "Operator"];
  return names[currentLevel] ?? "Operator";
}
