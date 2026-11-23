// The visual pass's logic on hand-made data shaped like ESPN's (names invented): clips pinned to plays, the team-stat
// head to head, the plays that earn a timeline marker, and which way the field faces.
import { describe, expect, it } from 'vitest';
import { buildGame } from '../src/espn/model';
import { matchClips } from '../src/espn/clips';
import { compareRows, edge, tally } from '../src/stats/teamstats';
import { moments } from '../src/stats/moments';
import { spotX } from '../src/components/Field';
import type { EspnPlay, EspnSummary, EspnVideo } from '../src/espn/types';

const HOME = '1';
const AWAY = '2';

let seq = 0;
function play(p: { type: string; text: string; off: string; ytg: number; endOff?: string; endYtg?: number; down?: number; yards?: number; home?: number; away?: number; scoring?: boolean; turnover?: boolean; at?: string }): EspnPlay {
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
    wallclock: p.at,
    start: { down: p.down ?? 1, distance: 10, yardsToEndzone: p.ytg, team: { id: p.off } },
    end: { down: 1, distance: 10, yardsToEndzone: p.endYtg ?? p.ytg, team: { id: p.endOff ?? p.off } },
  };
}

function summary(plays: EspnPlay[], extra: Partial<EspnSummary> = {}): EspnSummary {
  return {
    header: {
      id: 'g',
      season: { year: 2026, type: 2 },
      competitions: [
        {
          id: 'g',
          date: '2026-10-25T17:00Z',
          status: { period: 4, type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { id: HOME, homeAway: 'home', score: '0', team: { id: HOME, abbreviation: 'HOM', displayName: 'Home' } },
            { id: AWAY, homeAway: 'away', score: '0', team: { id: AWAY, abbreviation: 'AWY', displayName: 'Away' } },
          ],
        },
      ],
    },
    drives: { previous: [{ id: 'd1', team: { id: AWAY, abbreviation: 'AWY' }, start: { period: { number: 2 }, yardLine: 25 }, plays }] },
    winprobability: [],
    ...extra,
  };
}

const clip = (id: number, headline: string, at: string, coverage = 'OnePlay'): EspnVideo => ({
  id,
  headline,
  originalPublishDate: at,
  links: { web: { href: `https://www.espn.com/video/clip/_/id/${id}` } },
  tracking: { coverageType: coverage },
});

describe('matchClips', () => {
  const plays = [
    play({ type: 'Pass Reception', text: '(Shotgun) J.Quarter pass deep middle to R.Catcher to HOM 33 for 49 yards (D.Back).', off: AWAY, ytg: 82, yards: 49, at: '2026-10-25T17:10:00Z' }),
    play({ type: 'Field Goal Good', text: 'K.Leg 38 yard field goal is GOOD, Center-L.Snap, Holder-H.Old.', off: AWAY, ytg: 20, at: '2026-10-25T17:14:00Z' }),
  ];
  const g = buildGame(summary(plays));

  it('pins a one-play clip to the play its headline describes', () => {
    const m = matchClips([clip(1, 'Joe Quarter airs out a 49-yard completion to Ray Catcher', '2026-10-25T17:19:00Z')], g.plays);
    expect(m.byPlay.get(g.plays[0].id)?.id).toBe(1);
  });

  it('never pins a clip to a play that happened after it was published', () => {
    const m = matchClips([clip(2, "Kenny Leg's FG puts Away on the board", '2026-10-25T17:12:00Z')], g.plays);
    expect(m.byPlay.get(g.plays[1].id)).toBeUndefined();
  });

  it('leaves a headline that names nobody in the play unpinned', () => {
    const m = matchClips([clip(3, 'Fans brave the rain in the city', '2026-10-25T17:30:00Z')], g.plays);
    expect(m.byPlay.size).toBe(0);
  });

  it('drops a clip whose link or thumbnail is not on an ESPN host', () => {
    const bad = { ...clip(5, 'Joe Quarter airs out a 49-yard completion to Ray Catcher', '2026-10-25T17:19:00Z'), links: { web: { href: 'javascript:alert(1)' } } };
    expect(matchClips([bad], g.plays).byPlay.size).toBe(0);
    const offsite = { ...clip(6, 'Joe Quarter airs out a 49-yard completion to Ray Catcher', '2026-10-25T17:19:00Z'), thumbnail: 'https://tracker.example/x.jpg' };
    expect(matchClips([offsite], g.plays).byPlay.get(g.plays[0].id)?.thumb).toBeNull();
  });

  it('keeps a full-game highlight as the game’s, not a play’s', () => {
    const m = matchClips([clip(4, 'Away vs. Home: Full Game Highlight', '2026-10-25T20:00:00Z', 'Highlights')], g.plays);
    expect(m.byPlay.size).toBe(0);
    expect(m.game.map((c) => c.id)).toEqual([4]);
  });
});

describe('team-stat head to head', () => {
  const stats = (o: Record<string, string>) => Object.entries(o).map(([name, displayValue]) => ({ name, displayValue }));
  const g = buildGame(
    summary([], {
      boxscore: {
        teams: [
          { team: { id: AWAY, abbreviation: 'AWY', displayName: 'Away' }, statistics: stats({ totalYards: '339', turnovers: '0', thirdDownEff: '5-13', possessionTime: '34:21', fourthDownEff: '0-0', redZoneAttempts: '0-0' }) },
          { team: { id: HOME, abbreviation: 'HOM', displayName: 'Home' }, statistics: stats({ totalYards: '237', turnovers: '2', thirdDownEff: '3-11', possessionTime: '25:39', fourthDownEff: '0-0', redZoneAttempts: '0-0' }) },
        ],
      },
    }),
  );
  const rows = compareRows(g);
  const row = (k: string) => rows.find((r) => r.key === k)!;

  it('credits fewer turnovers, not more', () => {
    expect(edge(row('turnovers'))).toBe('a');
  });

  it('reads 5-13 as five of thirteen, and compares the rates', () => {
    expect(row('thirdDownEff').away).toBe('5/13');
    expect(edge(row('thirdDownEff'))).toBe('a');
  });

  it('compares time of possession in seconds', () => {
    expect(row('possessionTime').av).toBe(34 * 60 + 21);
    expect(edge(row('possessionTime'))).toBe('a');
  });

  it('drops rows with nothing to compare yet (no 4th-down tries, no red-zone trips)', () => {
    expect(rows.some((r) => r.key === 'fourthDownEff' || r.key === 'redZoneAttempts')).toBe(false);
  });

  it('tallies who won more rows', () => {
    const t = tally(rows);
    expect(t.a).toBeGreaterThan(t.h);
  });
});

describe('timeline markers', () => {
  it('marks a touchdown for the scorer and an interception for the side that took the ball', () => {
    const g = buildGame(
      summary([
        play({ type: 'Passing Touchdown', text: 'J.Quarter pass short left to R.Catcher for 12 yards, TOUCHDOWN.', off: AWAY, ytg: 12, endYtg: 0, yards: 12, away: 6, scoring: true }),
        play({ type: 'Pass Interception Return', text: 'J.Quarter pass deep right INTERCEPTED by D.Back at HOM 10.', off: AWAY, ytg: 40, endOff: HOME, endYtg: 90, away: 6, turnover: true }),
      ]),
    );
    const m = moments(g);
    expect(m.map((x) => [x.kind, x.teamId])).toEqual([
      ['td', AWAY],
      ['int', HOME],
    ]);
    expect(m[0].score).toBe('AWY 6 – HOM 0');
  });

  it('marks a play with a clip even when nothing else about it would', () => {
    const g = buildGame(summary([play({ type: 'Rush', text: 'R.Runner up the middle to AWY 30 for 5 yards.', off: AWAY, ytg: 75, yards: 5 })]));
    expect(moments(g).length).toBe(0);
    expect(moments(g, new Set([g.plays[0].id])).map((x) => x.kind)).toEqual(['clip']);
  });
});

describe('a drive that has just started', () => {
  it('starts at the ball, not at the goal line ESPN reports before the first snap', () => {
    // ARI kicks to DEN (away), touchback at the DEN 15; ESPN's current drive has start.yardLine 0 and no snaps yet.
    const kick = play({ type: 'Kickoff', text: 'K.Kicker kicks 65 yards from HOM 35 to AWY 0. Touchback.', off: HOME, ytg: 65, endOff: AWAY, endYtg: 85 });
    const s = summary([]);
    s.header.competitions[0].status = { period: 2, displayClock: '14:16', type: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false } };
    s.drives = { current: { id: 'd2', team: { id: AWAY, abbreviation: 'AWY' }, start: { period: { number: 2 }, yardLine: 0 }, plays: [kick] } };
    const d = buildGame(s).drives.find((x) => x.isLive)!;
    expect(d.startPos).toBe(15);
    expect(d.endPos).toBe(15);
  });

  it('starts a home drive at its first snap, and the field puts it on the home side', () => {
    // Home ball at its own 30 after a return, then a 6-yard run; ESPN still says the drive began at yard line 0.
    const ret = play({ type: 'Kickoff', text: 'K.Kicker kicks 60 yards from AWY 35 to HOM 5. R.Returner to HOM 30 for 25 yards.', off: AWAY, ytg: 65, endOff: HOME, endYtg: 70 });
    const run = play({ type: 'Rush', text: 'R.Runner up the middle to HOM 36 for 6 yards.', off: HOME, ytg: 70, endYtg: 64, yards: 6 });
    const s = summary([]);
    s.header.competitions[0].status = { period: 1, displayClock: '9:00', type: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false } };
    s.drives = { current: { id: 'd3', team: { id: HOME, abbreviation: 'HOM' }, start: { period: { number: 1 }, yardLine: 0 }, plays: [ret, run] } };
    const g = buildGame(s);
    const d = g.drives.find((x) => x.isLive)!;
    expect(d.startPos).toBe(30);
    expect(d.endPos).toBe(36);
    // Home attacks leftward: its own 30 is 70 yards from the away goal line.
    expect(spotX(g, HOME, 70)).toBe(70);
  });
});

describe('the field', () => {
  const g = buildGame(summary([]));
  it('puts the away team attacking rightward, toward the home end zone', () => {
    // Away at its own 35: 65 yards to go, 35 yards from the away goal line on the left.
    expect(spotX(g, AWAY, 65)).toBe(35);
  });
  it('puts the home team attacking leftward', () => {
    // Home at its own 35: 65 yards to go, 65 yards from the away goal line.
    expect(spotX(g, HOME, 65)).toBe(65);
  });
});
