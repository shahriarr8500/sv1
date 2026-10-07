/**
 * Calendar windows for target calculations.
 *
 * Dates are stored as "YYYY-MM-DD" local-date strings; all comparison
 * helpers operate on those strings so they stay immune to the usual
 * "date-fns converts to UTC" surprises.
 */

import { parseISO, isWithinInterval, startOfDay, endOfDay, startOfWeek } from "date-fns";

export { isWithinInterval };


export type CalendarWindowKind = "daily" | "weekly" | "monthly" | "yearly";

export interface CalendarWindow {
  kind: CalendarWindowKind;
  /** "YYYY-MM-DD" for the unit being measured (the date / week start / month start / year start). */
  readonly key: string;
  /** Inclusive start of the actual span in local millis. */
  readonly start: Date;
  /** Inclusive end of the actual span in local millis. */
  readonly end: Date;
}

export function dailyWindowFor(date: Date): CalendarWindow {
  return {
    kind: "daily",
    key: formatLocalDate(date),
    start: startOfDay(date),
    end: endOfDay(date),
  };
}

export function weeklyWindowFor(date: Date): CalendarWindow {
  const start = startOfWeekLocal(date);
  return weeklyWindowFromStart(start);
}

export function weekEndKey(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return formatLocalDate(end);
}

export function weeklyWindowFromStart(start: Date): CalendarWindow {
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return {
    kind: "weekly",
    key: formatLocalDate(start),
    start,
    end: endOfDay(end),
  };
}

export function monthWindowFor(date: Date): CalendarWindow {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    kind: "monthly",
    key: formatLocalDate(start),
    start: startOfDay(start),
    end: endOfDay(end),
  };
}

export function yearWindowFor(date: Date): CalendarWindow {
  const start = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
  return {
    kind: "yearly",
    key: String(date.getFullYear()),
    start: startOfDay(start),
    end: endOfDay(end),
  };
}

export function isSameDay(a: string, b: string): boolean {
  return a === b;
}

export function isSameWeek(left: string, right: string): boolean {
  return left === right;
}

export function isSameMonth(dateA: string, monthKey: string): boolean {
  return dateA.startsWith(monthKey);
}

export function isSameYear(dateA: string, yearKey: string): boolean {
  return dateA.startsWith(yearKey);
}

export function isSameMonthForDate(dateA: Date, monthKey: string): boolean {
  return isSameMonth(formatLocalDate(dateA), monthKey);
}

export function isSameYearForDate(dateA: Date, yearKey: string): boolean {
  return isSameYear(formatLocalDate(dateA), yearKey);
}

export function localDayOfWeek(date: Date): number {
  return startOfWeekLocal(date).getDay() === 1 ? 0 : 1;
}

export function startOfWeekLocal(date: Date): Date {
  const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(dt);
  monday.setDate(diff);
  return monday;
}

export function todayKey(): string {
  return formatLocalDate(new Date());
}

export function weekStartKey(date: Date): string {
  return formatLocalDate(startOfWeekLocal(date));
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function localMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function localYearKey(date: Date): string {
  return String(date.getFullYear());
}

export function parseLocalDate(dateString: string): Date {
  return parseISO(dateString + "T00:00:00");
}

export function isDateInWindow(date: string, window: CalendarWindow): boolean {
  const d = parseLocalDate(date);
  return isWithinInterval(d, { start: window.start, end: window.end });
}

export function parseLocalMonth(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

export function parseLocalYear(yearKey: string): Date {
  return new Date(Number(yearKey), 0, 1, 0, 0, 0, 0);
}

export function previousDailyWindow(date: Date): CalendarWindow {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  return dailyWindowFor(prev);
}

export function previousWeeklyWindow(weekStart: string): CalendarWindow {
  const start = parseLocalDate(weekStart);
  const prev = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  return weeklyWindowFromStart(prev);
}

export function previousMonthlyWindow(monthKey: string): CalendarWindow {
  const start = parseLocalMonth(monthKey);
  const prev = new Date(start.getFullYear(), start.getMonth() - 1, 1, 0, 0, 0, 0);
  return monthWindowFor(prev);
}

export function previousYearlyWindow(yearKey: string): CalendarWindow {
  const year = Number(yearKey);
  const prev = new Date(year - 1, 0, 1, 0, 0, 0, 0);
  return yearWindowFor(prev);
}

export function windowsForDay(dayKey: string): { label: string; sub: string } {
  const d = parseLocalDate(dayKey);
  return {
    label: formatLocalDate(d).slice(8),
    sub: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
  };
}
