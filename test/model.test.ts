// buildGame on hand-made plays shaped like ESPN's (names invented): the plays that are easy to count wrong.
import { describe, expect, it } from 'vitest';
import { buildGame } from '../src/espn/model';
import { teamNumbers } from '../src/stats/live';
import { epOf, type EpTable } from '../src/stats/ep';
import type { EspnPlay, EspnSummary } from '../src/espn/types';

const HOME = '1';
const AWAY = '2';

// A simple, monotone EP table: closer to the goal and earlier downs are worth more.
const BUCKETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 21];
const EP: EpTable = {
  version: 1,
  built: 'test',
  seasons: [],
  distBuckets: BUCKETS,
  ep: [0, 1, 2, 3].map((d) => BUCKETS.map(() => Array.from({ length: 99 }, (_, y) => (100 - (y + 1)) / 20 - d * 0.5))),
};

let seq = 0;
function play(p: {
  type: string;
  text: string;
  off: string;
  down: number;
  dist: number;
  ytg: number;
  endOff?: string;
  endDown?: number;
  endDist?: number;
  endYtg?: number;
  yards?: number;
  home?: number;
  away?: number;
  scoring?: boolean;
  turnover?: boolean;
}): EspnPlay {
  seq++;
  return {
    id: `p${seq}`,
    type: { id: '0', text: p.type },
    text: p.text,
    homeScore: p.home ?? 0,
    awayScore: p.away ?? 0,
    period: { number: 2 },
    clock: { displayValue: `${10 - (seq % 10)}:00` },
    scoringPlay: p.scoring ?? false,
    isTurnover: p.turnover ?? false,
    statYardage: p.yards ?? 0,
    start: { down: p.down, distance: p.dist, yardsToEndzone: p.ytg, team: { id: p.off } },
    end: {
      down: p.endDown ?? p.down,
      distance: p.endDist ?? p.dist,
      yardsToEndzone: p.endYtg ?? p.ytg,
      team: { id: p.endOff ?? p.off },
    },
  };
}

function summary(plays: EspnPlay[], offense = HOME): EspnSummary {
  return {
    header: {
      id: 'g',
      season: { year: 2026, type: 2 },
      competitions: [
        {
          id: 'g',
          date: '2026-10-20T00:15Z',
          status: { period: 4, type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { id: HOME, homeAway: 'home', score: '0', team: { id: HOME, abbreviation: 'HOM', displayName: 'Home' } },
            { id: AWAY, homeAway: 'away', score: '0', team: { id: AWAY, abbreviation: 'AWY', displayName: 'Away' } },
          ],
        },
      ],
    },
    drives: {
      previous: [{ id: 'd1', team: { id: offense, abbreviation: offense === HOME ? 'HOM' : 'AWY' }, start: { period: { number: 2 }, yardLine: 25 }, plays }],
    },
    winprobability: [],
  };
}

describe('buildGame play classification', () => {
  it('leaves kneel-downs out of EPA and success, as nflverse does', () => {
    const g = buildGame(
      summary([play({ type: 'Rush', text: 'Q.Back kneels to HOM 40 for -1 yards.', off: HOME, down: 1, dist: 10, ytg: 60, endDown: 2, endDist: 11, endYtg: 61, yards: -1 })]),
      { ep: EP },
    );
    const p = g.plays[0];
    expect(p.epa).toBeNull();
    expect(p.success).toBeNull();
    expect(teamNumbers(g, g.home).epaPlays).toBe(0);
  });

  it('leaves spikes out of EPA and success', () => {
    const g = buildGame(
      summary([play({ type: 'Pass Incompletion', text: 'Q.Back spiked the ball to stop the clock.', off: HOME, down: 1, dist: 10, ytg: 40, endDown: 2 })]),
      { ep: EP },
    );
    expect(g.plays[0].epa).toBeNull();
    expect(g.plays[0].success).toBeNull();
  });

  it('counts a pass wiped out by defensive pass interference for EPA, but not for success', () => {
    const g = buildGame(
      summary([
        play({
          type: 'Penalty',
          text: '(Shotgun) Q.Back pass deep left intended for W.Out. PENALTY on AWY-C.Back, Defensive Pass Interference, 25 yards, enforced at HOM 45 - No Play.',
          off: HOME,
          down: 2,
          dist: 8,
          ytg: 55,
          endDown: 1,
          endDist: 10,
          endYtg: 30,
        }),
      ]),
      { ep: EP },
    );
    const p = g.plays[0];
    expect(p.kind).toBe('pass');
    expect(p.noPlay).toBe(true);
    expect(p.success).toBeNull();
    expect(p.epa).toBeCloseTo(epOf(EP, 1, 10, 30) - epOf(EP, 2, 8, 55), 6);
    expect(teamNumbers(g, g.home).epaPlays).toBe(1);
    expect(teamNumbers(g, g.home).plays).toBe(0); // not a snap that stood
  });

  it("doesn't charge a muffed punt to the punting team as its turnover", () => {
    const g = buildGame(
      summary([
        play({
          type: 'Punt',
          text: 'P.Unter punts 45 yards to AWY 20, R.Eturner MUFFS catch, RECOVERED by HOM-G.Unner at AWY 22.',
          off: HOME,
          down: 4,
          dist: 6,
          ytg: 65,
          endOff: HOME,
          endDown: 1,
          endDist: 10,
          endYtg: 22,
          turnover: true,
        }),
      ]),
      { ep: EP },
    );
    expect(teamNumbers(g, g.home).turnovers).toBe(0);
    expect(teamNumbers(g, g.away).turnovers).toBe(0);
  });

  it('scores a safety as -2 points for the offense', () => {
    const g = buildGame(
      summary([
        play({
          type: 'Safety',
          text: 'Q.Back sacked in end zone for -3 yards, SAFETY (D.End).',
          off: HOME,
          down: 3,
          dist: 9,
          ytg: 98,
          yards: -3,
          away: 2,
          scoring: true,
        }),
      ]),
      { ep: EP },
    );
    const p = g.plays[0];
    expect(p.kind).toBe('pass');
    expect(p.scoring).toBe(true);
    expect(p.epa).toBeCloseTo(-2 - epOf(EP, 3, 9, 98), 6);
  });

  it('ignores a score that dips for one row and comes back', () => {
    const g = buildGame(
      summary([
        play({ type: 'Rush', text: 'R.Unner up the middle to HOM 30 for 5 yards.', off: HOME, down: 1, dist: 10, ytg: 75, endDown: 2, endDist: 5, endYtg: 70, yards: 5, home: 7 }),
        play({ type: 'Rush', text: 'R.Unner up the middle to HOM 32 for 2 yards.', off: HOME, down: 2, dist: 5, ytg: 70, endDown: 3, endDist: 3, endYtg: 68, yards: 2, home: 0 }),
        play({ type: 'Pass Reception', text: 'Q.Back pass short right to W.Out to HOM 38 for 6 yards.', off: HOME, down: 3, dist: 3, ytg: 68, endDown: 1, endDist: 10, endYtg: 62, yards: 6, home: 7 }),
      ]),
      { ep: EP },
    );
    expect(g.plays.map((p) => p.homeScore)).toEqual([7, 7, 7]);
    expect(g.plays.some((p) => p.scoring)).toBe(false);
    expect(g.plays.every((p) => p.epa == null || Math.abs(p.epa) < 3)).toBe(true);
  });
});
