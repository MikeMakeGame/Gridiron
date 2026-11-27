// A made-up game in ESPN's summary format, one row per kind of Story event, so CI runs the Story classifier tests
// without the gitignored real fixture (test/fixtures/espn-plays.json, ESPN's own text). Every team, player and line
// here is invented: the rows only follow the SHAPE of ESPN's play text (its gamebook codes, "PENALTY on X-Y.Name,
// Foul, N yards, enforced", "X-Y.Name was injured during the play", "Injury Update: ... has returned to the game").
// Home is HOM (id 1), away is AWY (id 2). Scores are cumulative, as ESPN sends them.
import type { EspnPlay, EspnSummary } from '../../src/espn/types';

export const HOME = { id: '1', abbr: 'HOM' };
export const AWAY = { id: '2', abbr: 'AWY' };

interface Spot {
  team: string; // team id
  down?: number;
  distance?: number;
  ytg?: number; // yards to the end zone, for that team
}

interface RowOpts {
  q: number;
  clock: string;
  away?: number;
  home?: number;
  start?: Spot;
  end?: Spot;
  yards?: number;
  scoring?: boolean;
  turnover?: boolean;
}

let score = { away: 0, home: 0 };

function row(id: string, type: string, text: string, o: RowOpts): EspnPlay {
  score = { away: o.away ?? score.away, home: o.home ?? score.home };
  const spot = (s: Spot | undefined) => ({ team: s ? { id: s.team } : undefined, down: s?.down ?? 0, distance: s?.distance ?? 0, yardsToEndzone: s?.ytg ?? 0 });
  return {
    id,
    type: { id: id.slice(-2), text: type },
    text,
    awayScore: score.away,
    homeScore: score.home,
    period: { number: o.q },
    clock: { displayValue: o.clock },
    scoringPlay: o.scoring ?? false,
    isTurnover: o.turnover ?? false,
    statYardage: o.yards ?? 0,
    start: spot(o.start),
    end: spot(o.end ?? o.start),
  };
}

const A = AWAY.id;
const H = HOME.id;

/** Row ids by the event each one is there to test. */
export const ROW = {
  sackAndInjury: '9001',
  injuryReturn: '9002',
  bigFlag: '9003',
  smallFlag: '9004',
  tdTwoPointGood: '9005',
  kickoffTeamFlag: '9006',
  endQ1: '9007',
  interception: '9008',
  fumble: '9009',
  fourthConverted: '9010',
  fgMissed: '9011',
  fourthStopped: '9012',
  punt: '9013',
  puntBlocked: '9014',
  fgGood: '9015',
  tdXpMissed: '9016',
  safety: '9017',
  muff: '9018',
  fgBlocked: '9019',
  tdXpBlocked: '9020',
  swing: '9021',
  clip: '9022',
  tdTwoPointFailed: '9023',
} as const;

export const ROWS: EspnPlay[] = [
  row(ROW.sackAndInjury, 'Sack', '(Shotgun) Q.Testman sacked at AWY 30 for -6 yards (D.Rusher). AWY-Q.Testman was injured during the play.', {
    q: 1, clock: '12:00', start: { team: A, down: 2, distance: 8, ytg: 64 }, end: { team: A, down: 3, distance: 14, ytg: 70 }, yards: -6,
  }),
  row(ROW.injuryReturn, 'Rush', 'R.Runner up the middle to AWY 40 for 4 yards (L.Backer). Injury Update: AWY-Q.Testman has returned to the game.', {
    q: 1, clock: '2:00', start: { team: A, down: 1, distance: 10, ytg: 64 }, end: { team: A, down: 2, distance: 6, ytg: 60 }, yards: 4,
  }),
  row(ROW.bigFlag, 'Penalty', '(Shotgun) Q.Testman pass deep right to W.Wideout to HOM 20 for 40 yards (C.Corner). PENALTY on HOM-C.Corner, Defensive Pass Interference, 34 yards, enforced at HOM 46 - No Play.', {
    q: 1, clock: '1:30', start: { team: A, down: 2, distance: 6, ytg: 60 }, end: { team: A, down: 1, distance: 10, ytg: 26 }, yards: 34,
  }),
  row(ROW.smallFlag, 'False Start', 'PENALTY on AWY-O.Lineman, False Start, 5 yards, enforced at HOM 26 - No Play.', {
    q: 1, clock: '1:10', start: { team: A, down: 1, distance: 10, ytg: 26 }, end: { team: A, down: 1, distance: 15, ytg: 31 }, yards: -5,
  }),
  row(ROW.tdTwoPointGood, 'Passing Touchdown', 'Q.Testman pass short left to T.Endman for 6 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. R.Runner rushes left end. ATTEMPT SUCCEEDS.', {
    q: 1, clock: '0:40', away: 8, start: { team: A, down: 1, distance: 6, ytg: 6 }, end: { team: A, ytg: 0 }, yards: 6, scoring: true,
  }),
  row(ROW.kickoffTeamFlag, 'Kickoff', 'A.Kicker kicks 65 yards from AWY 20 to HOM 15. R.Returner to HOM 40 for 25 yards (G.Gunner). PENALTY on AWY, Unsportsmanlike Conduct, 15 yards, enforced at HOM 40.', {
    q: 1, clock: '0:35', start: { team: A, ytg: 80 }, end: { team: H, down: 1, distance: 10, ytg: 45 },
  }),
  row(ROW.endQ1, 'End Period', 'END QUARTER 1', { q: 1, clock: '0:00' }),
  row(ROW.interception, 'Pass Interception Return', 'H.Passer pass deep middle intended for X.Receiver INTERCEPTED by S.Safety at AWY 30. S.Safety to AWY 45 for 15 yards.', {
    q: 2, clock: '14:00', start: { team: H, down: 2, distance: 10, ytg: 45 }, end: { team: A, down: 1, distance: 10, ytg: 55 }, turnover: true,
  }),
  row(ROW.fumble, 'Rush', 'R.Runner up the middle to HOM 40 for 3 yards (L.Backer). FUMBLES (L.Backer), RECOVERED by HOM-M.Linebacker at HOM 41.', {
    q: 2, clock: '12:00', start: { team: A, down: 1, distance: 10, ytg: 43 }, end: { team: H, down: 1, distance: 10, ytg: 59 }, yards: 3, turnover: true,
  }),
  row(ROW.fourthConverted, 'Rush', 'B.Back right tackle to AWY 48 for 3 yards (S.Safety).', {
    q: 2, clock: '10:00', start: { team: H, down: 4, distance: 2, ytg: 51 }, end: { team: H, down: 1, distance: 10, ytg: 48 }, yards: 3,
  }),
  row(ROW.fgMissed, 'Field Goal Missed', 'K.Booter 52 yard field goal is No Good, Wide Right, Center-L.Snapper, Holder-P.Holder.', {
    q: 2, clock: '8:00', start: { team: H, down: 4, distance: 6, ytg: 34 }, end: { team: A, down: 1, distance: 10, ytg: 58 },
  }),
  row(ROW.fourthStopped, 'Pass Incompletion', '(Shotgun) Q.Testman pass incomplete short right to W.Wideout (C.Corner).', {
    q: 2, clock: '6:00', start: { team: A, down: 4, distance: 5, ytg: 40 }, end: { team: H, down: 1, distance: 10, ytg: 60 },
  }),
  row(ROW.punt, 'Punt', 'P.Punter punts 44 yards to AWY 20, Center-L.Snapper. R.Returner to AWY 30 for 10 yards (G.Gunner).', {
    q: 2, clock: '5:00', start: { team: H, down: 4, distance: 9, ytg: 64 }, end: { team: A, down: 1, distance: 10, ytg: 70 },
  }),
  row(ROW.puntBlocked, 'Blocked Punt', 'P.Kicker punt is BLOCKED by B.Blocker, Center-L.Long, RECOVERED by HOM-B.Blocker at AWY 25.', {
    q: 2, clock: '4:00', start: { team: A, down: 4, distance: 7, ytg: 72 }, end: { team: H, down: 1, distance: 10, ytg: 25 }, turnover: true,
  }),
  row(ROW.fgGood, 'Field Goal Good', 'K.Booter 43 yard field goal is GOOD, Center-L.Snapper, Holder-P.Holder.', {
    q: 2, clock: '3:00', home: 3, start: { team: H, down: 4, distance: 8, ytg: 25 }, end: { team: H, ytg: 0 }, scoring: true,
  }),
  row(ROW.tdXpMissed, 'Rushing Touchdown', 'R.Runner left end for 2 yards, TOUCHDOWN. A.Kicker extra point is No Good, Wide Left, Center-L.Long, Holder-P.Kicker.', {
    q: 2, clock: '2:00', away: 14, start: { team: A, down: 1, distance: 2, ytg: 2 }, end: { team: A, ytg: 0 }, yards: 2, scoring: true,
  }),
  row(ROW.safety, 'Sack', 'H.Passer sacked in End Zone for -2 yards, SAFETY (D.Rusher).', {
    q: 2, clock: '1:00', away: 16, start: { team: H, down: 2, distance: 10, ytg: 98 }, end: { team: H, ytg: 100 }, yards: -2, scoring: true,
  }),
  row(ROW.muff, 'Punt', 'P.Kicker punts 40 yards to HOM 30, Center-L.Long. R.Fielder MUFFS catch, RECOVERED by AWY-G.Gunner at HOM 28.', {
    q: 3, clock: '10:00', start: { team: A, down: 4, distance: 10, ytg: 70 }, end: { team: A, down: 1, distance: 10, ytg: 28 }, turnover: true,
  }),
  row(ROW.fgBlocked, 'Blocked Field Goal', 'K.Booter 49 yard field goal is BLOCKED (B.Blocker), Center-L.Snapper, Holder-P.Holder, RECOVERED by AWY-B.Blocker at AWY 40.', {
    q: 3, clock: '8:00', start: { team: H, down: 4, distance: 3, ytg: 31 }, end: { team: A, down: 1, distance: 10, ytg: 60 }, turnover: true,
  }),
  row(ROW.tdXpBlocked, 'Passing Touchdown', 'H.Passer pass short right to X.Receiver for 9 yards, TOUCHDOWN. K.Booter extra point is BLOCKED (B.Blocker), Center-L.Snapper, Holder-P.Holder.', {
    q: 3, clock: '6:00', home: 9, start: { team: H, down: 2, distance: 9, ytg: 9 }, end: { team: H, ytg: 0 }, yards: 9, scoring: true,
  }),
  row(ROW.swing, 'Pass Reception', 'Q.Testman pass short middle to W.Wideout to HOM 30 for 12 yards (L.Backer).', {
    q: 3, clock: '4:00', start: { team: A, down: 3, distance: 9, ytg: 42 }, end: { team: A, down: 1, distance: 10, ytg: 30 }, yards: 12,
  }),
  row(ROW.clip, 'Rush', 'B.Back left guard to HOM 35 for 5 yards (D.Tackle).', {
    q: 4, clock: '10:00', start: { team: H, down: 1, distance: 10, ytg: 70 }, end: { team: H, down: 2, distance: 5, ytg: 65 }, yards: 5,
  }),
  row(ROW.tdTwoPointFailed, 'Rushing Touchdown', 'B.Back up the middle for 1 yard, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. H.Passer pass to X.Receiver is incomplete. ATTEMPT FAILS.', {
    q: 4, clock: '5:00', home: 15, start: { team: H, down: 1, distance: 1, ytg: 1 }, end: { team: H, ytg: 0 }, yards: 1, scoring: true,
  }),
];

/** The made-up game, final, as ESPN's summary: every row in one drive (enough for buildGame), and win probability on
 *  two rows only, so the swing row is the one big swing. */
export function madeUpSummary(rows: EspnPlay[] = ROWS): EspnSummary {
  const team = (t: { id: string; abbr: string }, color: string) => ({ id: t.id, abbreviation: t.abbr, displayName: `${t.abbr} Testers`, color, alternateColor: 'ffffff' });
  return {
    header: {
      id: '9000',
      season: { year: 2026, type: 2 },
      competitions: [
        {
          id: '9000',
          date: '2026-10-04T17:00Z',
          status: { period: 4, type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { id: HOME.id, homeAway: 'home', score: '15', team: team(HOME, '1d4f91') },
            { id: AWAY.id, homeAway: 'away', score: '16', team: team(AWAY, 'a71930') },
          ],
        },
      ],
    },
    drives: { previous: [{ id: 'd1', team: { id: A, abbreviation: AWAY.abbr }, start: { period: { number: 1 }, yardLine: 25 }, plays: rows }] },
    winprobability: [
      { playId: ROW.injuryReturn, homeWinPercentage: 0.6 },
      { playId: ROW.swing, homeWinPercentage: 0.45 },
    ],
  };
}
