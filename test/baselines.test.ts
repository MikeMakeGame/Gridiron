// League averages: which one is the default, what gets compared when, which way is better, the missing-file
// fallback, and the shape scripts/nflverse_build.py writes (run on a small made-up play-by-play).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  baselinesProblem,
  comparable,
  defaultBaseline,
  effectiveBaseline,
  MIN_SEASON_WEEKS,
  parseBaselinePick,
  STATS,
  vsAverage,
  type Baselines,
  type BaselineWindow,
  type StatKey,
} from '../src/stats/baselines';

// Node's own modules, loaded by name: the tsconfig is the browser's (no @types/node), and only a few tests need them.
const nodeMod = (name: string) => import(/* @vite-ignore */ name) as Promise<any>;
const { spawnSync } = await nodeMod('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync } = await nodeMod('node:fs');
const { tmpdir } = await nodeMod('node:os');
const { join } = await nodeMod('node:path');
const { fileURLToPath } = await nodeMod('node:url');
const ROOT: string = fileURLToPath(new URL('..', import.meta.url));

const win = (over: Partial<BaselineWindow>): BaselineWindow => ({
  label: 'This season',
  seasons: [2026],
  weeks: 6,
  games: 90,
  team: { rates: { successRate: 0.45, avgStart: 30.5, epaPerPlay: 0.01, earlyDownPassRate: 0.52 }, totals: { totalYards: 330, sacksTaken: 2.4 } },
  players: { qb: { rates: { sackRate: 0.065, compPct: 0.64 }, totals: { passYards: 225 } } },
  excluded: {},
  ...over,
});

const BASE: Baselines = {
  version: 1,
  built: 'test',
  season: 2026,
  windows: {
    season: win({}),
    last3: win({
      label: 'Last 3 seasons',
      seasons: [2023, 2024, 2025],
      weeks: 18,
      games: 816,
      team: { rates: { successRate: 0.47 }, totals: { totalYards: 333 } },
      excluded: { avgStart: 'kickoff rule' },
    }),
  },
  qualifiers: { qb: 'quarterbacks with 14+ dropbacks in a game' },
  impact: { sack: 1.8, interception: 4.4, fumbleLost: 5, tackleForLoss: 1.2, passDefended: 0.9, fgMake: [[0, 0.98]], xpMake: 0.96 },
};

afterEach(() => vi.restoreAllMocks());

describe('which average', () => {
  it(`is this season once it has ${MIN_SEASON_WEEKS} weeks in, the last 3 seasons before that`, () => {
    expect(MIN_SEASON_WEEKS).toBe(4);
    expect(defaultBaseline({ windows: { ...BASE.windows, season: win({ weeks: 3 }) } })).toBe('last3');
    expect(defaultBaseline({ windows: { ...BASE.windows, season: win({ weeks: 4 }) } })).toBe('season');
    expect(defaultBaseline({ windows: { last3: BASE.windows.last3 } as never })).toBe('last3');
  });

  it("honours the viewer's pick unless its window is empty", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const early = { windows: { ...BASE.windows, season: win({ weeks: 2 }) } };
    expect(effectiveBaseline(early, 'season')).toBe('season');
    expect(effectiveBaseline(early, null)).toBe('last3');
    expect(effectiveBaseline({ windows: { ...BASE.windows, season: win({ weeks: 0, games: 0 }) } }, 'season')).toBe('last3');
    expect(warn).toHaveBeenCalled();
  });

  it('reads a saved pick, and ignores (loudly) one it does not know', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseBaselinePick(null)).toBeNull();
    expect(parseBaselinePick('last3')).toBe('last3');
    expect(parseBaselinePick('alltime')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('rates against the average live, totals only after the final', () => {
  it('is one rule', () => {
    expect(comparable('successRate', false)).toBe(true);
    expect(comparable('compPct', false)).toBe(true);
    expect(comparable('totalYards', false)).toBe(false);
    expect(comparable('passYards', false)).toBe(false);
    expect(comparable('totalYards', true)).toBe(true);
    expect(vsAverage(BASE, 'season', 'team', 'totalYards', 400, false)).toBeNull();
    expect(vsAverage(BASE, 'season', 'team', 'totalYards', 400, true)?.text).toBe('+70');
  });

  it('knows which way is better for every stat', () => {
    const low: StatKey[] = ['avgThirdDistance', 'turnovers', 'sacksTaken', 'penaltyYards', 'sackRate', 'interceptions'];
    for (const k of Object.keys(STATS) as StatKey[]) {
      const want = low.includes(k) ? 'low' : k === 'earlyDownPassRate' ? 'none' : 'high';
      expect(STATS[k].better, k).toBe(want);
    }
    // A high sack rate reads as bad; a high success rate as good; a style stat as neither.
    expect(vsAverage(BASE, 'season', 'qb', 'sackRate', 0.12, false)?.verdict).toBe('bad');
    expect(vsAverage(BASE, 'season', 'team', 'successRate', 0.52, false)).toMatchObject({ verdict: 'good', text: '+7%' });
    expect(vsAverage(BASE, 'season', 'team', 'earlyDownPassRate', 0.7, false)?.verdict).toBe('neutral');
    expect(vsAverage(BASE, 'season', 'team', 'successRate', 0.452, false)).toMatchObject({ verdict: 'even', text: 'avg' });
    expect(vsAverage(BASE, 'season', 'team', 'epaPerPlay', -0.2, false)?.text).toBe('−0.21');
  });

  it('leaves out what a window excludes, and anything it has no number for', () => {
    expect(vsAverage(BASE, 'season', 'team', 'avgStart', 33, false)?.verdict).toBe('good');
    expect(vsAverage(BASE, 'last3', 'team', 'avgStart', 33, false)).toBeNull();
    expect(vsAverage(BASE, 'season', 'rb', 'yardsPerCarry', 5, false)).toBeNull();
    expect(vsAverage(BASE, 'season', 'team', 'successRate', null, false)).toBeNull();
  });
});

describe('without data/baselines.json', () => {
  it('shows no markers, and says why once in the console', async () => {
    expect(vsAverage(null, 'season', 'team', 'successRate', 0.5, false)).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const { getBaselines } = await import('../src/espn/api');
    expect(await getBaselines()).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('no league averages'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('refuses a file of another version or a partial one, whole, rather than crash a tab', async () => {
    expect(baselinesProblem(BASE)).toBeNull();
    expect(baselinesProblem({ ...BASE, version: 2 })).toMatch(/version 2/);
    expect(baselinesProblem({ ...BASE, windows: { season: BASE.windows.season } })).toMatch(/last3/);
    expect(baselinesProblem({ ...BASE, windows: { ...BASE.windows, last3: { ...BASE.windows.last3, seasons: [] } } })).toMatch(/no seasons/);
    expect(baselinesProblem({ ...BASE, impact: undefined })).toMatch(/impact/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...BASE, version: 2 }) })));
    const { getBaselines } = await import('../src/espn/api');
    expect(await getBaselines()).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('version 2'))).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => BASE })));
    expect(await getBaselines()).toEqual(BASE);
    vi.unstubAllGlobals();
  });
});

// ---- the build script -------------------------------------------------------------------------------------------

const COLS = [
  'season', 'season_type', 'week', 'game_id', 'home_team', 'away_team', 'posteam', 'defteam', 'play_type', 'pass', 'rush',
  'down', 'ydstogo', 'yardline_100', 'yards_gained', 'epa', 'qb_dropback', 'passer_id', 'pass_attempt', 'complete_pass',
  'incomplete_pass', 'passing_yards', 'sack', 'interception', 'fumble_lost', 'touchdown', 'td_team', 'pass_touchdown',
  'rush_touchdown', 'rusher_player_id', 'receiver_player_id', 'qtr', 'quarter_seconds_remaining', 'fixed_drive',
  'fixed_drive_result', 'posteam_score', 'posteam_score_post', 'first_down', 'field_goal_result', 'kick_distance',
];

/** One made-up game: AAA's quarterback throws 15 (8 complete for 10 yards) and takes a sack; BBB runs 8 times for 5. */
function gameRows(season: number, week: number): Record<string, string | number>[] {
  const id = `${season}_${week}_BBB_AAA`;
  const base = { season, season_type: 'REG', week, game_id: id, home_team: 'AAA', away_team: 'BBB', qtr: 1, quarter_seconds_remaining: 600, down: 1, ydstogo: 10, yardline_100: 60 };
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < 15; i++) {
    const done = i % 2 === 0;
    rows.push({
      ...base, posteam: 'AAA', defteam: 'BBB', play_type: 'pass', pass: 1, qb_dropback: 1, passer_id: 'Q1', pass_attempt: 1,
      complete_pass: done ? 1 : 0, incomplete_pass: done ? 0 : 1, passing_yards: done ? 10 : '', yards_gained: done ? 10 : 0,
      receiver_player_id: 'W1', epa: done ? 0.5 : -0.5, fixed_drive: 1, fixed_drive_result: 'Punt', posteam_score: 0, posteam_score_post: 0,
    });
  }
  rows.push({ ...base, posteam: 'AAA', defteam: 'BBB', play_type: 'pass', pass: 1, qb_dropback: 1, passer_id: 'Q1', pass_attempt: 1, sack: 1, yards_gained: -7, epa: -1.5, fixed_drive: 1, fixed_drive_result: 'Punt' });
  for (let i = 0; i < 8; i++) {
    rows.push({ ...base, posteam: 'BBB', defteam: 'AAA', play_type: 'run', rush: 1, rusher_player_id: 'R1', yards_gained: 5, epa: 0.1, fixed_drive: 2, fixed_drive_result: 'Punt' });
  }
  rows.push({ ...base, posteam: 'BBB', defteam: 'AAA', play_type: 'field_goal', field_goal_result: 'made', kick_distance: 44, down: 4, fixed_drive: 2 });
  return rows;
}

function python(): string | null {
  for (const exe of ['python', 'python3']) {
    const r = spawnSync(exe, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return exe;
  }
  console.warn('Gridiron test: no python on PATH; the build-script shape test is skipped');
  return null;
}
const PY = python();

describe.skipIf(!PY)('scripts/nflverse_build.py writes baselines.json', () => {
  it('with both windows, the qualifiers, the kickoff exclusion and the standouts weights', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gridiron-baselines-'));
    const rows = [...[1, 2, 3, 4].flatMap((w) => gameRows(2026, w)), ...gameRows(2023, 1), ...gameRows(2025, 9)];
    const csv = [COLS.join(','), ...rows.map((r) => COLS.map((c) => r[c] ?? '').join(','))].join('\n');
    writeFileSync(join(dir, 'pbp.csv'), csv);
    const run = spawnSync(PY!, ['-X', 'utf8', '-I', 'scripts/nflverse_build.py', '--season', '2026', '--baselines-from', join(dir, 'pbp.csv'), '--out', dir], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(run.status, run.stderr).toBe(0);
    const b = JSON.parse(readFileSync(join(dir, 'baselines.json'), 'utf8')) as Baselines;
    expect(b.version).toBe(1);
    expect(b.season).toBe(2026);
    expect(b.windows.season).toMatchObject({ label: 'This season', seasons: [2026], weeks: 4, games: 4 });
    expect(b.windows.last3).toMatchObject({ label: 'Last 3 seasons', seasons: [2023, 2024, 2025], games: 2 });
    // 2023 is before the 2024 kickoff rule: no drive-start average in that window, and the reason says so.
    expect(b.windows.last3.excluded.avgStart).toMatch(/kickoff/);
    expect(b.windows.last3.team.rates.avgStart).toBeUndefined();
    expect(b.windows.season.excluded).toEqual({});
    expect(b.windows.season.team.rates.avgStart).toBe(40);
    expect(b.qualifiers.qb).toMatch(/14\+ dropbacks/);
    // 8 of 15 complete for 10 yards each; one sack in 16 dropbacks; 8 carries of 5 yards.
    const qb = b.windows.season.players.qb!.rates;
    expect(qb.compPct).toBeCloseTo(8 / 15, 3);
    expect(qb.yardsPerAttempt).toBeCloseTo(80 / 15, 3);
    expect(qb.sackRate).toBeCloseTo(1 / 16, 3);
    expect(b.windows.season.players.rb!.rates.yardsPerCarry).toBe(5);
    expect(b.windows.season.team.totals.totalYards).toBeCloseTo((80 - 7 + 40) / 2, 2);
    expect(b.impact.sack).toBe(1.5);
    expect(b.impact.fgMake).toEqual([[40, 1]]);
    for (const k of Object.keys(b.windows.season.team.rates)) expect(STATS[k as StatKey], `${k} is a stat the page knows`).toBeDefined();
  });

  it('counts only weeks whose every scheduled game is in: one Thursday game doesn’t make week 4 count', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gridiron-weeks-'));
    const rows = [1, 2, 3, 4].flatMap((w) => gameRows(2026, w));
    writeFileSync(join(dir, 'pbp.csv'), [COLS.join(','), ...rows.map((r) => COLS.map((c) => r[c] ?? '').join(','))].join('\n'));
    // The schedule has a second week-4 game that hasn't been played.
    const sched = ['game_id,season,game_type,week', ...[1, 2, 3, 4].map((w) => `2026_${w}_BBB_AAA,2026,REG,${w}`), '2026_4_CCC_DDD,2026,REG,4'];
    writeFileSync(join(dir, 'games.csv'), sched.join('\n'));
    const run = spawnSync(PY!, ['-X', 'utf8', '-I', 'scripts/nflverse_build.py', '--season', '2026', '--baselines-from', join(dir, 'pbp.csv'), '--games-from', join(dir, 'games.csv'), '--out', dir], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(run.status, run.stderr).toBe(0);
    const b = JSON.parse(readFileSync(join(dir, 'baselines.json'), 'utf8')) as Baselines;
    expect(b.windows.season.weeks).toBe(3);
    expect(b.windows.season.games).toBe(4);
    expect(defaultBaseline(b)).toBe('last3');
  });
});
