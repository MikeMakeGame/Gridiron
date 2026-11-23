// The player ledger read from ESPN's play text, the position groups, and the standouts score.
// - Hand-written plays in ESPN's format (made-up players) carry the scoring rules, so they run everywhere.
// - One whole real game (test/fixtures/espn-game-401872656.json, NE @ SEA 2026, trimmed) checks the ledger against
//   its box score. It is ESPN's text, so it stays out of git: `python -X utf8 -I scripts/make_fixtures.py` rebuilds
//   it from the local cache, and without it those blocks skip with a console line.
// EPA runs on a smooth stand-in EP table, since the real one is built data the repo doesn't store. With the local
// ESPN cache present, the last block checks every cached game's box score too.
import { describe, expect, it, vi } from 'vitest';
import { buildGame, type Game } from '../src/espn/model';
import type { EspnPlay, EspnSummary } from '../src/espn/types';
import type { EpTable } from '../src/stats/ep';
import {
  FALLBACK_WEIGHTS,
  groupOf,
  impactOf,
  namesIn,
  nonSackTfl,
  playBody,
  playerLines,
  standouts,
  STANDOUT_CARDS,
  STANDOUT_MIN,
  weightsFrom,
  whyLine,
  type PlayerLine,
} from '../src/stats/players';
import { pairsFor } from '../src/components/PositionCompare';

const FIXTURE = import.meta.glob('./fixtures/espn-game-401872656.json', { eager: true, import: 'default' }) as Record<string, EspnSummary>;
const REAL: EspnSummary | undefined = Object.values(FIXTURE)[0];
if (!REAL) console.warn('Gridiron test: no test/fixtures/espn-game-401872656.json (scripts/make_fixtures.py rebuilds it); the whole-game player tests skip');
/** A block that reads the whole real game. */
const onGame = describe.skipIf(!REAL);

const DIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 21];
/** A smooth EP surface: worth more nearer the goal, less on later downs and longer distances. */
const EP: EpTable = {
  version: 1,
  built: 'test',
  seasons: [],
  distBuckets: DIST,
  ep: [0, 1, 2, 3].map((d) => DIST.map((_, b) => Array.from({ length: 99 }, (_, y) => 6 - 0.075 * (y + 1) - 0.6 * d - 0.08 * b))),
};

const game = (upto?: number) => buildGame(REAL!, { ep: EP, upto });
const find = (ls: PlayerLine[], name: string) => ls.find((l) => l.name === name);

// ---- hand-written plays (made-up teams AAA, home, id 1; BBB, away, id 2) -------------------------------------------

let seq = 0;
function row(text: string, type: string, off: '1' | '2', down: number, ytg: number, endYtg: number, yards: number, extra: Partial<EspnPlay> = {}): EspnPlay {
  return {
    id: `t${++seq}`,
    type: { id: '0', text: type },
    text,
    awayScore: 0,
    homeScore: 0,
    period: { number: 1 },
    clock: { displayValue: `${14 - seq}:00` },
    statYardage: yards,
    start: { down, distance: 10, yardsToEndzone: ytg, team: { id: off } },
    end: { down: down < 4 ? down + 1 : 1, distance: 10 - yards, yardsToEndzone: endYtg, team: { id: off } },
    ...extra,
  };
}

const HAND: EspnPlay[] = [
  row('(Shotgun) Q.Away sacked at BBB 22 for -8 yards (D.Rush).', 'Sack', '2', 2, 70, 78, -8),
  row('Q.Away sacked at BBB 17 for -5 yards (sack split by D.Rush and E.Edge).', 'Sack', '2', 3, 78, 83, -5),
  row('R.Away left tackle to BBB 30 for -3 yards (D.Rush).', 'Rush', '2', 1, 67, 70, -3),
  row('Q.Away pass deep left intended for W.Away INTERCEPTED by C.Back at AAA 30. C.Back to AAA 35 for 5 yards (W.Away).', 'Pass Interception Return', '2', 2, 70, 65, 0, {
    isTurnover: true,
    end: { down: 1, distance: 10, yardsToEndzone: 65, team: { id: '1' } },
  }),
  row('K.Home 55 yard field goal is GOOD, Center-X.Snap, Holder-Y.Hold.', 'Field Goal Good', '1', 4, 37, 37, 0, { scoringPlay: true, homeScore: 3 }),
  row('K.Home 33 yard field goal is No Good, Wide Right, Center-X.Snap, Holder-Y.Hold.', 'Field Goal Missed', '1', 4, 15, 15, 0, { homeScore: 3 }),
];

function handGame(): Game {
  const s: EspnSummary = {
    header: {
      id: 'hand',
      season: { year: 2026, type: 2 },
      competitions: [
        {
          id: 'hand',
          date: '2026-10-01T17:00Z',
          status: { period: 4, type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { id: '1', homeAway: 'home', score: '3', team: { id: '1', abbreviation: 'AAA', displayName: 'AAA' } },
            { id: '2', homeAway: 'away', score: '0', team: { id: '2', abbreviation: 'BBB', displayName: 'BBB' } },
          ],
        },
      ],
    },
    drives: { previous: [{ id: 'd1', team: { id: '2', abbreviation: 'BBB' }, start: { period: { number: 1 }, yardLine: 30 }, plays: HAND }] },
    winprobability: [],
  };
  return buildGame(s, { ep: EP });
}

describe('reading players from play text', () => {
  it('takes the formation, eligibility notes and the try after a touchdown off the snap', () => {
    expect(playBody('(13:08) (Shotgun) J.Daniels pass incomplete short right.')).toBe('J.Daniels pass incomplete short right.');
    expect(playBody('E.Jones reported in as eligible.  D.Henry left tackle to BLT 45 for -4 yards (J.Barham).')).toBe(
      'D.Henry left tackle to BLT 45 for -4 yards (J.Barham).',
    );
    expect(playBody(' (Shotgun) D.Watson pass short left to D.Boston to JAX 33 for 13 yards (M.Brown).')).toMatch(/^D\.Watson/);
    const td = 'J.Allen pass deep middle to J.Palmer for 34 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. J.Allen pass to K.Coleman is incomplete. ATTEMPT FAILS.';
    expect(playBody(td)).not.toMatch(/incomplete/);
  });

  it('reads every way ESPN lists tacklers', () => {
    expect(namesIn('L.Gifford; K.White')).toEqual(['L.Gifford', 'K.White']);
    expect(namesIn('K.Hamilton, Z.Young')).toEqual(['K.Hamilton', 'Z.Young']);
    expect(namesIn('sack split by A.Key and L.Latu')).toEqual(['A.Key', 'L.Latu']);
    expect(namesIn("H.To'oTo'o")).toEqual(["H.To'oTo'o"]);
  });
});

describe('the ledger and the score on hand-written plays', () => {
  it('counts a sack once in the score, though the box score also counts it as a tackle for loss', () => {
    const lines = playerLines(handGame());
    const rush = find(lines, 'D.Rush')!;
    const edge = find(lines, 'E.Edge')!;
    // One sack, half a split sack, one run stopped behind the line.
    expect(rush.sacks).toBe(1.5);
    expect(rush.tfl).toBe(2.5);
    expect(nonSackTfl(rush)).toBe(1);
    expect(rush.tackles).toBe(3);
    expect([edge.sacks, edge.tfl, nonSackTfl(edge)]).toEqual([0.5, 0.5, 0]);
    const w = FALLBACK_WEIGHTS;
    expect(impactOf(rush, w).def).toBeCloseTo(1.5 * w.sack + 1 * w.tackleForLoss, 6);
    expect(impactOf(edge, w).def).toBeCloseTo(0.5 * w.sack, 6);
    expect(whyLine(rush, impactOf(rush, w))).toBe('1.5 sacks, a tackle for loss');
  });

  it('credits the interception to the defender and the passer, and not to the receiver', () => {
    const lines = playerLines(handGame());
    expect(find(lines, 'C.Back')!.defInts).toBe(1);
    expect(find(lines, 'Q.Away')!.ints).toBe(1);
    const wr = find(lines, 'W.Away')!;
    expect(wr.targets).toBe(1);
    expect(wr.recEpaN).toBe(0);
    expect(whyLine(find(lines, 'C.Back')!, impactOf(find(lines, 'C.Back')!, FALLBACK_WEIGHTS))).toBe('an interception');
  });

  it('scores a kicker against the league make rate from each distance', () => {
    const k = find(playerLines(handGame()), 'K.Home')!;
    expect(k.fgs).toEqual([
      { dist: 55, made: true },
      { dist: 33, made: false },
    ]);
    const imp = impactOf(k, FALLBACK_WEIGHTS);
    expect(imp.kick).toBeCloseTo(3 * (1 - 0.608) - 3 * 0.939, 6);
    expect(whyLine(k, imp)).toBe('1/2 field goals, long 55, missed from 33');
  });

  it('lets nflverse replace a quarterback’s estimate after the game', () => {
    const qb = find(playerLines(handGame()), 'Q.Away')!;
    const est = impactOf(qb, FALLBACK_WEIGHTS);
    const nv = impactOf(qb, FALLBACK_WEIGHTS, -20);
    expect(nv.pass).toBe(-20);
    expect(nv.nflverse).toBe(true);
    expect(est.nflverse).toBe(false);
  });

  it('works without the league averages file, and fills a missing weight from the one fallback, warning once', () => {
    expect(weightsFrom(null)).toBe(FALLBACK_WEIGHTS);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const partial = weightsFrom({ impact: { ...FALLBACK_WEIGHTS, sack: null, fgMake: [] } } as never);
    weightsFrom({ impact: { ...FALLBACK_WEIGHTS, sack: null } } as never);
    expect(partial.sack).toBe(FALLBACK_WEIGHTS.sack);
    expect(partial.fgMake).toBe(FALLBACK_WEIGHTS.fgMake);
    expect(partial.interception).toBe(FALLBACK_WEIGHTS.interception);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('"sack"'))).toHaveLength(1);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('"fgMake"'))).toHaveLength(1);
    const measured = weightsFrom({ impact: { ...FALLBACK_WEIGHTS, sack: 2 } } as never);
    expect(measured.sack).toBe(2);
    warn.mockRestore();
  });
});

onGame('the ledger against ESPN’s box score (one whole game)', () => {
  // Built when a test runs, not while the block is collected (it's collected even when the fixture is missing).
  const at = () => {
    const g = game();
    return { g, lines: playerLines(g), box: REAL!.boxscore!.players! };
  };
  const boxRow = (cat: string, name: string) => {
    for (const t of at().box) for (const c of t.statistics) if (c.name === cat) for (const a of c.athletes) if (a.athlete.displayName === name) return a.stats;
    throw new Error(`no ${cat} row for ${name}`);
  };

  it('counts each quarterback’s completions, attempts, yards, touchdowns and interceptions', () => {
    const { lines } = at();
    for (const [full, short] of [
      ['Drake Maye', 'D.Maye'],
      ['Sam Darnold', 'S.Darnold'],
    ] as const) {
      const st = boxRow('passing', full);
      const l = find(lines, short)!;
      expect(`${l.comp}/${l.att}`).toBe(st[0]);
      expect(Math.abs(l.passYds - Number(st[1]))).toBeLessThanOrEqual(2);
      expect([l.passTd, l.ints]).toEqual([Number(st[3]), Number(st[4])]);
    }
  });

  it('credits sacks, interceptions and kicks to the right players', () => {
    const { lines, box } = at();
    for (const t of box) {
      for (const c of t.statistics) {
        for (const a of c.athletes) {
          const parts = a.athlete.displayName.split(' ');
          const short = `${parts[0][0]}.${parts.slice(1).join(' ')}`.replace(/ (II|III|Jr\.)$/, '');
          const l = lines.find((x) => x.teamId === t.team.id && x.name === short);
          if (c.name === 'defensive') expect(l?.sacks ?? 0, `${a.athlete.displayName} sacks`).toBe(Number(a.stats[2]));
          if (c.name === 'interceptions') expect(l?.defInts ?? 0, `${a.athlete.displayName} INT`).toBe(Number(a.stats[0]));
          if (c.name === 'kicking') {
            const made = l?.fgs.filter((f) => f.made).length ?? 0;
            expect(`${made}/${l?.fgs.length ?? 0}`, `${a.athlete.displayName} FG`).toBe(a.stats[0]);
            expect(`${l?.xpMade ?? 0}/${l?.xpAtt ?? 0}`, `${a.athlete.displayName} XP`).toBe(a.stats[3]);
          }
        }
      }
    }
  });

  it('puts each player in the group where most of his touches were', () => {
    const { g, lines } = at();
    expect(groupOf(find(lines, 'D.Maye')!)).toBe('qb');
    const rb = lines.filter((l) => groupOf(l) === 'rb');
    const wr = lines.filter((l) => groupOf(l) === 'wr');
    expect(rb.length).toBeGreaterThan(0);
    expect(wr.length).toBeGreaterThan(2);
    for (const l of rb) expect(l.carries - l.scrambles).toBeGreaterThanOrEqual(l.targets);
    // QB vs QB pairs one quarterback a side, busiest first (Darnold was hurt; D.Lock took most of SEA's snaps).
    const pairs = pairsFor(g, lines, 'qb');
    expect(pairs[0][0]?.name).toBe('D.Maye');
    expect(pairs[0][1]?.name).toBe('D.Lock');
    expect(pairs[1][1]?.name).toBe('S.Darnold');
    expect(pairs[0][1]!.dropbacks).toBeGreaterThan(pairs[1][1]!.dropbacks);
  });

  it('stops where a replay stops', () => {
    const { lines } = at();
    const cut = game(60);
    const early = playerLines(cut);
    const full = find(lines, 'D.Maye')!;
    const part = find(early, 'D.Maye')!;
    expect(part.att).toBeLessThan(full.att);
    expect(early.every((l) => l.ints <= (find(lines, l.name)?.ints ?? 0))).toBe(true);
  });
});

onGame('the standouts on one whole game', () => {
  it('ranks the game: good and rough cards, best first, each past the threshold', () => {
    const so = standouts(game(), FALLBACK_WEIGHTS);
    expect(so.good.length).toBeGreaterThan(0);
    expect(so.good.length).toBeLessThanOrEqual(STANDOUT_CARDS);
    expect(so.rough.length).toBeLessThanOrEqual(STANDOUT_CARDS);
    for (const s of so.good) expect(s.impact.total).toBeGreaterThanOrEqual(STANDOUT_MIN);
    for (const s of so.rough) expect(s.impact.total).toBeLessThanOrEqual(-STANDOUT_MIN);
    for (let i = 1; i < so.good.length; i++) expect(so.good[i - 1].impact.total).toBeGreaterThanOrEqual(so.good[i].impact.total);
    for (let i = 1; i < so.rough.length; i++) expect(so.rough[i - 1].impact.total).toBeLessThanOrEqual(so.rough[i].impact.total);
    // Every card has a why; a quarterback's says what he did and his EPA on dropbacks.
    for (const s of [...so.good, ...so.rough]) expect(s.why.length).toBeGreaterThan(0);
    const maye = [...so.good, ...so.rough].find((s) => s.line.name === 'D.Maye');
    if (maye) expect(maye.why).toMatch(/^23\/33, 178 yds, 1 TD, 3 INT, sacked 3x, [+−]\d+\.\d EPA on dropbacks/);
  });

  // With nflverse's real EP table (built locally by `npm run nflverse`; CI tests before it builds). Checked by hand
  // 2026-11-22: Smith-Njigba (8 of 11, 122 yds) and Lock lead; Love's interception and two non-sack tackles for loss
  // put a defender on the good side; Stevenson's 18 carries for 51 yards are the roughest. Maye's three interceptions
  // (-3.9, -2.0, -4.6) are offset by his scrambles and third-down conversions, so he lands near zero, off both lists.
  const realEp = import.meta.glob('../public/data/ep_table.json', { eager: true, import: 'default' }) as Record<string, EpTable>;
  const real = Object.values(realEp)[0];
  it.skipIf(!real)('ranks it the way the game went, on the real EP table', () => {
    const so = standouts(buildGame(REAL!, { ep: real }), FALLBACK_WEIGHTS);
    const good = so.good.map((s) => s.line.name);
    expect(good.slice(0, 2).sort()).toEqual(['D.Lock', 'J.Smith-Njigba']);
    expect(good).toContain('J.Love');
    expect(so.good.find((s) => s.line.name === 'J.Love')!.why).toBe('an interception, 2 tackles for loss');
    expect(so.rough[0].line.name).toBe('R.Stevenson');
    expect(so.rough[0].why).toMatch(/^18 carries, 51 yds, −\d+\.\d EPA on runs/);
  });

  it('never scores a sack twice: every sacker’s defense score is his sacks plus his other plays', () => {
    const w = FALLBACK_WEIGHTS;
    for (const l of playerLines(game()).filter((x) => x.sacks > 0)) {
      const want = w.sack * l.sacks + w.interception * l.defInts + (w.fumbleLost / 2) * (l.forcedLost + l.recovered) + w.tackleForLoss * nonSackTfl(l) + w.passDefended * l.passesDefended;
      expect(impactOf(l, w).def, l.name).toBeCloseTo(want, 6);
      expect(nonSackTfl(l), l.name).toBeCloseTo(l.tfl - l.sacks, 6);
    }
  });
});

// The whole local cache, when it's there: the ledger agrees with ESPN's box score on nearly every player.
const CACHE = import.meta.glob('../.cache/espn/summary-*.json', { eager: true, import: 'default' }) as Record<string, EspnSummary>;
const cached = Object.entries(CACHE).filter(([, s]) => s.header?.competitions?.[0]?.status?.type?.state === 'post');

describe.skipIf(cached.length === 0)(`the ledger on every cached game (${cached.length})`, () => {
  it('matches the box score on sacks, interceptions, kicks, catches and carries', () => {
    const rate: Record<string, [number, number]> = {};
    const tick = (k: string, ok: boolean) => {
      rate[k] ??= [0, 0];
      rate[k][ok ? 0 : 1]++;
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [, s] of cached) {
      const g: Game = buildGame(s, { ep: EP });
      const lines = playerLines(g);
      for (const t of s.boxscore?.players ?? []) {
        for (const c of t.statistics) {
          for (const a of c.athletes) {
            const at = a.athlete as { firstName?: string; lastName?: string; displayName: string };
            const last = (at.lastName ?? at.displayName.split(' ').slice(-1)[0]).replace(/\s+(Jr\.|Sr\.|II|III|IV)$/, '');
            const mine = lines.filter((l) => l.teamId === t.team.id && l.name.endsWith(last) && l.name.startsWith(at.firstName?.[0] ?? ''));
            if (mine.length > 1) continue; // two "B.Robinson"s on one team: the text can't tell them apart
            const l = mine[0];
            const st = a.stats;
            if (c.name === 'passing') {
              const [cmp, att] = st[0].split('/').map(Number);
              tick('passing', !!l && Math.abs(l.comp - cmp) <= 1 && Math.abs(l.att - att) <= 1);
            }
            if (c.name === 'rushing') tick('carries', !!l && Math.abs(l.carries - Number(st[0])) <= 1);
            if (c.name === 'receiving') tick('catches', !!l && l.rec === Number(st[0]));
            if (c.name === 'defensive') tick('sacks', (l?.sacks ?? 0) === Number(st[2]));
            if (c.name === 'interceptions') tick('interceptions', (l?.defInts ?? 0) === Number(st[0]));
            if (c.name === 'kicking') tick('field goals', !!l && `${l.fgs.filter((f) => f.made).length}/${l.fgs.length}` === st[0]);
          }
        }
      }
    }
    vi.restoreAllMocks();
    const share = (k: string) => rate[k][0] / (rate[k][0] + rate[k][1]);
    // Measured 2026-11-22 on 97 games; the misses are laterals, spikes, plays missing from a cached feed.
    expect(share('sacks')).toBeGreaterThan(0.99);
    expect(share('interceptions')).toBeGreaterThan(0.95);
    expect(share('field goals')).toBeGreaterThan(0.98);
    expect(share('catches')).toBeGreaterThan(0.97);
    expect(share('carries')).toBeGreaterThan(0.97);
    expect(share('passing')).toBeGreaterThan(0.9);
  });
});
