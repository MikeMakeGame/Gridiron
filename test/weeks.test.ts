// Week stepping follows ESPN's calendar from the regular season into the playoffs, and week links round-trip.
import { describe, expect, it } from 'vitest';
import { parseWeekKey, stepWeek, weekKey, weekLabel, weekStops } from '../src/weeks';
import type { EspnScoreboard } from '../src/espn/types';

// The 2026 calendar as ESPN's scoreboard carries it (trimmed to the parts that matter).
const sb: EspnScoreboard = {
  events: [],
  leagues: [
    {
      calendar: [
        { value: '1', label: 'Preseason', entries: [{ value: '1', label: 'Hall of Fame Weekend' }] },
        { value: '2', label: 'Regular Season', entries: Array.from({ length: 18 }, (_, i) => ({ value: String(i + 1), label: `Week ${i + 1}` })) },
        {
          value: '3',
          label: 'Postseason',
          entries: [
            { value: '1', label: 'Wild Card' },
            { value: '2', label: 'Divisional Round' },
            { value: '3', label: 'Conference Championship' },
            { value: '4', label: 'Super Bowl' },
          ],
        },
        { value: '4', label: 'Off Season', entries: [] },
      ],
    },
  ],
};

describe('weeks', () => {
  const stops = weekStops(sb);

  it('steps from week 18 into the Wild Card round and back', () => {
    expect(stepWeek(stops, 2, 18, 1)).toEqual({ seasonType: 3, week: 1, label: 'Wild Card' });
    expect(stepWeek(stops, 3, 1, -1)).toEqual({ seasonType: 2, week: 18, label: 'Week 18' });
  });

  it('stops at week 1 and at the Super Bowl, and skips the preseason', () => {
    expect(stepWeek(stops, 2, 1, -1)).toBeNull();
    expect(stepWeek(stops, 3, 4, 1)).toBeNull();
    expect(stops.some((s) => s.seasonType === 1)).toBe(false);
  });

  it('keeps playoff labels short enough for the top bar', () => {
    expect(weekLabel(stops, 3, 2)).toBe('Divisional');
    expect(weekLabel(stops, 3, 3)).toBe('Conference');
    expect(weekLabel(stops, 3, 4)).toBe('Super Bowl');
  });

  it('falls back to weeks 1-18 when ESPN sends no calendar', () => {
    const plain = weekStops({ events: [] });
    expect(plain).toHaveLength(18);
    expect(stepWeek(plain, 2, 18, 1)).toBeNull();
    expect(weekLabel(plain, 2, 7)).toBe('Week 7');
  });

  it('round-trips a week through the link, and rejects junk', () => {
    const ref = { season: 2026, seasonType: 3, week: 1 };
    expect(parseWeekKey(weekKey(ref))).toEqual(ref);
    expect(parseWeekKey('2026-9-1')).toBeUndefined();
    expect(parseWeekKey('../../x')).toBeUndefined();
  });
});
