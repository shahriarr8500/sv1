/**
 * Level card — how far the student is into the current level and how much XP
 * is left. Every number comes from `GamificationProvider`, which only ever
 * pays out for real target completions and recorded study sessions.
 */

import { Flame, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useGamification } from "@/state/gamification";

export function LevelCard() {
  const { level, xp, streak } = useGamification();

  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Level {level.level}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Progress
            value={level.percent}
            aria-label={`${level.current} of ${level.needed} XP in level ${level.level}`}
          />
          <div className="flex items-baseline justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {level.current.toLocaleString()} / {level.needed.toLocaleString()} XP
            </span>
            <span className="font-medium text-foreground">
              {level.remaining.toLocaleString()} to level {level.level + 1}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Total XP</span>
          <span className="font-semibold tabular-nums">
            {xp.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Flame
              className={streak > 0 ? "size-4 text-orange-500" : "size-4"}
              aria-hidden
            />
            Streak
          </span>
          <span className="font-semibold tabular-nums">
            {streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "0 days"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
