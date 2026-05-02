import { Card } from "@/components/ui";
import type { Achievement } from "@/lib/db/types";

type Props = {
  achievements: Achievement[];
};

const ACHIEVEMENT_ICONS: Record<string, string> = {
  first_shot: "🎯",
  triple_threat: "🔥",
  high_roller: "⭐",
  resume_crafter: "📄",
  keyword_ace: "🏆",
  story_teller: "📖",
  story_vault: "🗃️",
  recruiter_magnet: "📬",
  interviewer: "🎤",
  offer_on_table: "🎉",
  hot_streak: "⚡",
  analyst: "🔬",
};

export function AchievementShelf({ achievements }: Props) {
  const sorted = [...achievements].sort((a, b) => {
    if (a.unlocked === b.unlocked) return 0;
    return a.unlocked ? -1 : 1;
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  return (
    <section aria-label="Achievements">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-ink">Achievements</h2>
        <span className="text-xs text-muted">
          {achievements.filter((a) => a.unlocked).length} / {achievements.length} unlocked
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {sorted.map((achievement) => {
          const isRecent = achievement.unlocked && achievement.unlockedAt && achievement.unlockedAt >= sevenDaysAgo;
          return (
            <Card
              key={achievement.id}
              className={[
                "flex w-28 flex-none flex-col items-center gap-1.5 px-3 py-4 text-center",
                !achievement.unlocked ? "opacity-40 grayscale" : "",
                isRecent ? "border-success/35 bg-success/5" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={achievement.description}
            >
              <span className="text-2xl leading-none">{ACHIEVEMENT_ICONS[achievement.id] ?? "🏅"}</span>
              <p className="text-xs font-medium leading-tight text-ink">{achievement.name}</p>
              {achievement.unlocked && achievement.unlockedAt && (
                <p className="text-[10px] text-muted">{formatDate(achievement.unlockedAt)}</p>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
