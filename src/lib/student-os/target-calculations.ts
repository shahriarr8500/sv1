/**
 * Target calculations. Pure helpers only. No UI, no storage, no rendering.
 *
 * All success rate / growth logic is sourced from TARGETS, never from
 * syllabus completion. Syllabus completion is reflected only via the
 * target-store integration path, which never lets a target mark override an
 * already-complete syllabus item.
 */

import type { Target } from "./target-model";
import type { CalendarWindow } from "./target-calendar";
import { isWithinInterval, parseISO } from "date-fns";
import { isSameDay, isSameMonth, isSameYear, isSameWeek } from "./target-calendar";

export function completedTargetsInWindow(targets: readonly Target[], window: CalendarWindow): readonly Target[] {
  if (window.kind === "daily") {
    return targets.filter((t) => t.period === "daily" && isSameDay(t.targetDate ?? "", window.key));
  }
  if (window.kind === "weekly") {
    return targets.filter(
      (t) =>
        (t.period === "weekly" && isSameWeek(t.weekStart ?? "", window.key)) ||
        (t.period === "daily" && t.targetDate && isWithinWindow(t.targetDate, window)),
    );
  }
  if (window.kind === "monthly") {
    return targets.filter(
      (t) =>
        (t.period === "daily" && t.targetDate && isSameMonth(t.targetDate, window.key)) ||
        (t.period === "weekly" && t.weekStart && isSameMonth(t.weekStart, window.key)),
    );
  }
  if (window.kind === "yearly") {
    return targets.filter(
      (t) =>
        (t.period === "daily" && t.targetDate && isSameYear(t.targetDate, window.key)) ||
        (t.period === "weekly" && t.weekStart && isSameYear(t.weekStart, window.key)),
    );
  }
  return [];
}

export function successRate(targets: readonly Target[]): number | null {
  const planned = targets.length;
  if (planned === 0) return null;
  const completed = targets.filter((t) => t.completed).length;
  return Math.round((completed / planned) * 100);
}

export function growthPoints(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

export function compareWindows(
  state: readonly Target[],
  current: CalendarWindow,
  previous: CalendarWindow,
): { currentRate: number | null; previousRate: number | null; growth: string | null } {
  const currentRate = successRate(completedTargetsInWindow(state, current));
  const previousRate = successRate(completedTargetsInWindow(state, previous));
  const points = growthPoints(currentRate, previousRate);
  if (points === null) return { currentRate, previousRate, growth: "Not enough data for comparison" };
  const sign = points > 0 ? "+" : "";
  return { currentRate, previousRate, growth: `${sign}${points} pts` };
}

function isWithinWindow(targetDate: string, window: CalendarWindow): boolean {
  const start = parseISO(window.start.toISOString().slice(0, 10) + "T00:00:00");
  const end = parseISO(window.end.toISOString().slice(0, 10) + "T23:59:59");
  const target = parseISO(targetDate + "T00:00:00");
  return isWithinInterval(target, { start, end });
}
