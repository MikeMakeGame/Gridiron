// The weeks the scoreboard steps through: the regular season, then the playoffs, from ESPN's own calendar
// (it ships with every scoreboard). Without one, it falls back to regular-season weeks 1-18.
import type { EspnScoreboard } from './espn/types';
import type { WeekRef } from './espn/api';

export interface WeekStop {
  seasonType: number;
  week: number;
  label: string;
}

const REGULAR = 2;
const POSTSEASON = 3;

// Short enough for the top bar at phone width.
const short = (label: string) => label.replace(/ Championship$/, '').replace(/ Round$/, '');

export function weekStops(sb: EspnScoreboard | null): WeekStop[] {
  const stops: WeekStop[] = [];
  for (const part of sb?.leagues?.[0]?.calendar ?? []) {
    const seasonType = Number(part.value);
    if (seasonType !== REGULAR && seasonType !== POSTSEASON) continue;
    for (const e of part.entries ?? []) {
      const week = Number(e.value);
      if (Number.isInteger(week) && week > 0) stops.push({ seasonType, week, label: short(e.label || `Week ${week}`) });
    }
  }
  if (stops.length) return stops;
  return Array.from({ length: 18 }, (_, i) => ({ seasonType: REGULAR, week: i + 1, label: `Week ${i + 1}` }));
}

const at = (stops: WeekStop[], seasonType: number, week: number) =>
  stops.findIndex((s) => s.seasonType === seasonType && s.week === week);

/** The week before or after, or null at either end of the season (or off the calendar). */
export function stepWeek(stops: WeekStop[], seasonType: number, week: number, d: 1 | -1): WeekStop | null {
  const i = at(stops, seasonType, week);
  return i < 0 ? null : (stops[i + d] ?? null);
}

export function weekLabel(stops: WeekStop[], seasonType: number, week: number): string {
  const i = at(stops, seasonType, week);
  return i < 0 ? (seasonType === 1 ? `Preseason ${week}` : `Week ${week}`) : stops[i].label;
}

/** The hash form of a browsed week, e.g. "2026-3-1" for the 2026 Wild Card round. */
export function weekKey(ref: WeekRef): string {
  return `${ref.season}-${ref.seasonType}-${ref.week}`;
}

export function parseWeekKey(key: string): WeekRef | undefined {
  const m = key.match(/^(\d{4})-([1-4])-(\d{1,2})$/);
  return m ? { season: Number(m[1]), seasonType: Number(m[2]), week: Number(m[3]) } : undefined;
}
