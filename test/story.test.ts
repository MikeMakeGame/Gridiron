// The Story tab's events on ESPN's real play text (test/fixtures/espn-plays.json: rows copied from 2026 game summaries,
// trimmed to the fields Gridiron reads), the filter chips, the list's dividers, the chart's rail and the replay cutoff.
// The fixture is ESPN's text, so it stays out of git: `python -X utf8 -I scripts/make_fixtures.py` rebuilds it from the
// local cache, and without it those blocks skip with a console line (the saved-filters block still runs).
// When the local ESPN cache (.cache/espn, from the scripts) is present, the last block sweeps every cached game too.
import { describe, expect, it, vi } from 'vitest';
import { buildGame, type Game } from '../src/espn/model';
import {
  DEFAULT_GROUPS,
  dividers,
  groupCounts,
  injuriesIn,
  moments,
  parseFilters,
  RAIL_GAP,
  railMarks,
  serializeFilters,
  storyRows,
  visibleMoments,
  type Moment,
  type MomentGroup,
} from '../src/stats/moments';
import type { EspnPlay, EspnSummary } from '../src/espn/types';
interface FixtureGame {
  id: string;
  home: { id: string; abbr: string };
  away: { id: string; abbr: string };
  plays: EspnPlay[];
}
const FIXTURE = import.meta.glob('./fixtures/espn-plays.json', { eager: true, import: 'default' }) as Record<string, { games: FixtureGame[] }>;
const GAMES: FixtureGame[] = Object.values(FIXTURE)[0]?.games ?? [];
if (!GAMES.length) console.warn('Gridiron test: no test/fixtures/espn-plays.json (scripts/make_fixtures.py rebuilds it); the Story tests on ESPN play text skip');
/** A block that reads the fixture's rows. */
const onRows = describe.skipIf(GAMES.length === 0);

/** A final game made of one fixture game's rows, in their real order (one drive is enough for buildGame). */
function summaryOf(id: string, plays?: EspnPlay[]): EspnSummary {
  const fg = GAMES.find((x) => x.id === id)!;
  const rows = plays ?? fg.plays;
  return {
    header: {
      id,
      season: { year: 2026, type: 2 },
      competitions: [
        {
          id,
          date: '2026-10-01T17:00Z',
          status: { period: 4, type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { id: fg.home.id, homeAway: 'home', score: '0', team: { id: fg.home.id, abbreviation: fg.home.abbr, displayName: fg.home.abbr } },
            { id: fg.away.id, homeAway: 'away', score: '0', team: { id: fg.away.id, abbreviation: fg.away.abbr, displayName: fg.away.abbr } },
          ],
        },
      ],
    },
    drives: { previous: [{ id: 'd1', team: { id: rows[0].start.team?.id, abbreviation: '' }, start: { period: { number: rows[0].period.number }, yardLine: 25 }, plays: rows }] },
    winprobability: [],
  };
}

const gameOf = (id: string, upto?: number) => buildGame(summaryOf(id), { upto });
const teamId = (g: Game, abbr: string) => (g.home.abbr === abbr ? g.home.id : g.away.abbr === abbr ? g.away.id : `no team ${abbr}`);
const of = (ms: Moment[], playId: string) => ms.filter((m) => m.play.id === playId);
const kinds = (ms: Moment[], playId: string) => of(ms, playId).map((m) => m.kind);

onRows('injuries, from ESPN play text', () => {
  it('reads who was hurt, and every phrasing ESPN uses on the 2026 cache', () => {
    expect(injuriesIn('(Shotgun) S.Darnold sacked at SEA 49 for -5 yards (D.Jones). SEA-S.Darnold was injured during the play.')).toEqual([{ code: 'SEA', name: 'S.Darnold' }]);
    expect(injuriesIn("J.Allen pass short left to D.Knox to BUF 26 for 7 yards (K.Lassiter; H.To'oTo'o). HST-H.To'oTo'o was injured during the play.")).toEqual([{ code: 'HST', name: "H.To'oTo'o" }]);
  });

  it('never reads "TWO-POINT CONVERSION" as a team', () => {
    const t = '(Shotgun) B.Young pass short left to J.Metchie for 8 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. C.Hubbard rushes up the middle. ATTEMPT FAILS. CAR-D.Lewis was injured during the play.';
    expect(injuriesIn(t)).toEqual([{ code: 'CAR', name: 'D.Lewis' }]);
  });

  it("names the injured player's team and when he came back", () => {
    const g = gameOf('401872656');
    const ms = moments(g);
    const davis = of(ms, '401872656535').find((m) => m.kind === 'injury')!;
    expect(davis.teamId).toBe(teamId(g, 'NE'));
    expect(davis.detail).toBe('C.Davis · back Q1 1:22');
    // The play with the return note is not an event of its own.
    expect(kinds(ms, '401872656761')).toEqual([]);
  });

  it('says "did not return" only once the game is over', () => {
    const ms = moments(gameOf('401872656'));
    expect(of(ms, '401872656180').find((m) => m.kind === 'injury')!.detail).toBe('S.Darnold · did not return');
  });

  it("maps the play text's gamebook codes to ESPN's teams (HST is Houston)", () => {
    const g = gameOf('401872660');
    const inj = of(moments(g), '4018726602704').find((m) => m.kind === 'injury')!;
    expect(inj.teamId).toBe(teamId(g, 'HOU'));
    expect(inj.detail).toMatch(/^J\.Hummel · /);
  });
});

onRows('every kind of event, on real plays', () => {
  it('a sack, with the injury on the same play riding along', () => {
    const g = gameOf('401872656');
    const ms = of(moments(g), '401872656180');
    expect(ms.map((m) => m.kind)).toEqual(['sack', 'injury']);
    expect(ms[0].teamId).toBe(teamId(g, 'NE'));
    expect(ms[0].detail).toBe('-5 yds');
    expect(ms[0].primary).toBe(true);
    expect(ms[1].primary).toBe(false);
  });

  it('a big penalty that wiped out the play, named, with its yards and the side it helped', () => {
    const g = gameOf('401872656');
    const [m] = of(moments(g), '4018726561118');
    expect(m.kind).toBe('penalty');
    expect(m.label).toBe('Defensive Pass Interference');
    expect(m.teamId).toBe(teamId(g, 'NE'));
    expect(m.detail).toMatch(/^on J\.Jobe \(SEA\) · 34 yds/);
  });

  it('roughing the kicker (15 yards) counts; a 5-yard false start does not', () => {
    const ms = moments(gameOf('401872656'));
    expect(of(ms, '4018726562032').map((m) => m.label)).toEqual(['Roughing the Kicker']);
    expect(kinds(ms, '401872656111')).toEqual([]);
  });

  it('fourth downs: converted, and stopped (which is also a turnover)', () => {
    const conv = of(moments(gameOf('401872656')), '4018726563810');
    expect(conv.map((m) => m.kind)).toEqual(['fourth-go']);
    const stop = of(moments(gameOf('401872657')), '4018726573452')[0];
    expect(stop.kind).toBe('downs');
    expect(stop.groups).toEqual(expect.arrayContaining(['fourth', 'turnovers']));
  });

  it('a fourth-down sack is a stop on downs and still a sack', () => {
    const [m] = of(moments(gameOf('401872922')), '4018729223282');
    expect(m.kind).toBe('downs');
    expect(m.groups).toContain('sacks');
  });

  it('a missed field goal says how far and how it missed; a blocked one says blocked', () => {
    const [miss] = of(moments(gameOf('401872657')), '4018726573620');
    expect([miss.kind, miss.label, miss.detail]).toEqual(['miss', 'Missed field goal', '52 yds · hit right upright']);
    const [blk] = of(moments(gameOf('401872938')), '4018729381149');
    expect([blk.kind, blk.label, blk.detail]).toEqual(['miss', 'Blocked field goal', '49 yds']);
  });

  it('punts: how far and how it ended; blocked; muffed and lost', () => {
    const g = gameOf('401872660');
    const [punt] = of(moments(g), '4018726602704');
    expect([punt.kind, punt.teamId, punt.detail]).toEqual(['punt', teamId(g, 'HOU'), '44 yds · returned 10']);
    expect(kinds(moments(gameOf('401872926')), '4018729263223')).toEqual(['punt-block']);
    const muff = of(moments(gameOf('401872661')), '4018726611812')[0];
    expect(muff.kind).toBe('muff');
    expect(muff.groups).toEqual(['turnovers', 'punts']);
  });

  it('two-point tries ride with their touchdown, good or failed', () => {
    const good = of(moments(gameOf('401872927')), '4018729273630');
    expect(good.map((m) => [m.kind, m.label])).toEqual([
      ['td', 'Touchdown'],
      ['two-pt', 'Two-point try good'],
    ]);
    const failed = of(moments(gameOf('401872660')), '4018726604152');
    expect(failed.map((m) => m.label)).toEqual(['Touchdown', 'Two-point try failed']);
  });

  it('missed and blocked extra points, credited to the defense', () => {
    const g = gameOf('401872659');
    const [, xp] = of(moments(g), '401872659257');
    expect([xp.kind, xp.label]).toEqual(['xp-miss', 'Missed extra point']);
    expect(xp.teamId).toBe(teamId(g, 'BAL'));
    expect(of(moments(gameOf('401872661')), '4018726614523').map((m) => m.label)).toEqual(['Touchdown', 'Blocked extra point']);
  });

  it('a touchdown with a taunting flag and a missed extra point: three events, the touchdown first', () => {
    const g = gameOf('401872930');
    const ms = of(moments(g), '4018729303720');
    expect(ms.map((m) => m.kind)).toEqual(['td', 'xp-miss', 'penalty']);
    expect(ms[2].label).toBe('Taunting');
    expect(ms[2].teamId).toBe(teamId(g, 'NYG'));
  });

  it('a flag on a team with no player named, by its gamebook code (WAS is Washington)', () => {
    const g = gameOf('401872955');
    const flag = of(moments(g), '4018729554262').find((m) => m.kind === 'penalty')!;
    expect(flag.label).toBe('Unsportsmanlike Conduct');
    expect(flag.detail).toBe('on WSH · 15 yds');
  });
});

onRows('scoring plays the story used to lose', () => {
  it('a one-row score spike no longer hides the touchdowns after it (TEN @ IND, 2026-10-18)', () => {
    const g = gameOf('401873003');
    const ms = moments(g);
    expect(kinds(ms, '4018730033063')).toContain('td');
    expect(kinds(ms, '4018730033284')).toContain('td');
    expect(g.plays.find((p) => p.id === '4018730032893')!.awayScore).toBe(6);
  });

  it('keeps the field goal two minutes after a fumble on the rail, and the fumble too (MIN @ GB, 2026-11-15)', () => {
    const g = gameOf('401873060');
    const ms = moments(g);
    // On a 358px rail, 135 game seconds is under the marker gap: the old thinning dropped the field goal. Both
    // stay now, nudged apart.
    const rail = railMarks(ms, (m) => (m.play.gameSec / 3600) * 358, 358);
    expect(rail.map((k) => k.m.kind)).toEqual(['fumble', 'fg']);
    expect(rail[1].px - rail[0].px).toBeGreaterThanOrEqual(RAIL_GAP);
  });

  it('every flagged scoring play in every fixture game is a score event', () => {
    for (const fg of GAMES) {
      const g = gameOf(fg.id);
      const scored = new Set(moments(g).filter((m) => m.kind === 'td' || m.kind === 'fg' || m.kind === 'safety').map((m) => m.play.id));
      for (const p of fg.plays) if (p.scoringPlay) expect(scored.has(p.id), `${fg.id} ${p.id}`).toBe(true);
    }
  });
});

onRows('the replay cutoff', () => {
  it('shows nothing after the replay point: events, returns or dividers', () => {
    const at2 = gameOf('401872656', 2);
    const ms2 = moments(at2);
    expect(ms2.every((m) => m.play.idx < 2)).toBe(true);
    expect(of(ms2, '401872656535').find((m) => m.kind === 'injury')!.detail).toBe('C.Davis · not back yet');
    expect(at2.breaks).toEqual([]);

    const at3 = gameOf('401872656', 3);
    expect(of(moments(at3), '401872656535').find((m) => m.kind === 'injury')!.detail).toBe('C.Davis · back Q1 1:22');
    expect(at3.breaks).toEqual([]); // END QUARTER 1 comes after the third play

    const at4 = gameOf('401872656', 4);
    expect(at4.breaks.map((b) => b.kind)).toEqual(['end-quarter']);
    expect(at4.breaks.every((b) => b.afterIdx < 4)).toBe(true);
  });

  it('takes the two-minute warning and halftime from the feed', () => {
    expect(gameOf('401872656').breaks.map((b) => [b.kind, b.period])).toEqual([
      ['end-quarter', 1],
      ['two-minute', 2],
      ['half', 2],
    ]);
  });
});

onRows('filters', () => {
  // Built when a test runs, not while the block is collected (it's collected even when the fixture is missing).
  const ms = () => moments(gameOf('401872656'));

  it('hide punts and penalties by default and show the rest', () => {
    const vis = visibleMoments(ms(), new Set(DEFAULT_GROUPS));
    expect(vis.some((m) => m.kind === 'penalty')).toBe(false);
    expect(vis.some((m) => m.kind === 'injury')).toBe(true);
    expect(vis.some((m) => m.kind === 'sack')).toBe(true);
  });

  it('show an event when any of its chips is on', () => {
    const stop = moments(gameOf('401872657')).filter((m) => m.kind === 'downs');
    expect(visibleMoments(stop, new Set<MomentGroup>(['turnovers']))).toHaveLength(1);
    expect(visibleMoments(stop, new Set<MomentGroup>(['fourth']))).toHaveLength(1);
    expect(visibleMoments(stop, new Set<MomentGroup>(['scores']))).toHaveLength(0);
  });

  it('count events per chip', () => {
    const c = groupCounts(ms());
    expect(c.injuries).toBe(2);
    expect(c.penalties).toBe(2);
    expect(c.sacks).toBe(1);
    expect(c.fourth).toBe(1);
    expect(c.scores).toBe(0);
  });
});

describe('saved filters', () => {
  it('remember a choice, and fall back to the defaults on nothing or junk (with a warning)', () => {
    expect([...parseFilters(null)]).toEqual([...DEFAULT_GROUPS]);
    expect([...parseFilters(serializeFilters(new Set<MomentGroup>(['punts', 'scores'])))].sort()).toEqual(['punts', 'scores']);
    expect([...parseFilters('[]')]).toEqual([]); // every chip switched off is a choice too
    expect([...parseFilters('["scores","not-a-chip"]')]).toEqual(['scores']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect([...parseFilters('{oops')]).toEqual([...DEFAULT_GROUPS]);
    expect([...parseFilters('"scores"')]).toEqual([...DEFAULT_GROUPS]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

onRows('the list', () => {
  const at = () => {
    const g = gameOf('401872656');
    return { g, ms: moments(g) };
  };

  it('puts the end of a quarter between the events either side of it, with the score', () => {
    const { g, ms } = at();
    const rows = storyRows(ms, dividers(g), false);
    const labels = rows.map((r) => (r.type === 'divider' ? `| ${r.d.label}` : r.m.kind));
    expect(labels.slice(0, 5)).toEqual(['sack', 'injury', 'injury', '| End of Q1', 'penalty']);
    const q1 = rows.find((r) => r.type === 'divider');
    expect(q1?.type === 'divider' && q1.d.score).toBe('NE 0 – SEA 0');
  });

  it('newest first keeps a play’s own event above what rides with it', () => {
    const { g, ms } = at();
    const rows = storyRows(ms, dividers(g), true);
    const first = rows.filter((r) => r.type === 'event').slice(-2);
    expect(first.map((r) => r.type === 'event' && r.m.kind)).toEqual(['sack', 'injury']);
  });

  it('leaves out dividers before the first shown event', () => {
    const { g, ms } = at();
    const late = ms.filter((m) => m.kind === 'fourth-go');
    const rows = storyRows(late, dividers(g), false);
    expect(rows[0].type).toBe('event');
  });
});

// The whole local cache, when it's there (it isn't on CI; the fixture tests above carry the real-text proof there).
const CACHE = import.meta.glob('../.cache/espn/summary-*.json', { eager: true, import: 'default' }) as Record<string, EspnSummary>;
const cached = Object.entries(CACHE).filter(([, s]) => s.header?.competitions?.[0]?.status?.type?.state === 'post');

describe.skipIf(cached.length === 0)(`every cached game (${cached.length})`, () => {
  it('turns every scoring play into a score event and every injury line into an injury event, with no unknown team', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [file, s] of cached) {
      const g = buildGame(s);
      const ms = moments(g);
      const scored = new Set(ms.filter((m) => m.kind === 'td' || m.kind === 'fg' || m.kind === 'safety').map((m) => m.play.id));
      for (const sp of (s as { scoringPlays?: { id: string }[] }).scoringPlays ?? []) expect(scored.has(sp.id), `${file} ${sp.id}`).toBe(true);
      const hurt = g.plays.reduce((n, p) => n + (p.text.match(/was injured during the play/g)?.length ?? 0), 0);
      expect(ms.filter((m) => m.kind === 'injury').length, file).toBe(hurt);
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('play text names team'))).toEqual([]);
    warn.mockRestore();
  });

  it('keeps every score on the rail at phone width', () => {
    for (const [file, s] of cached) {
      const g = buildGame(s);
      const ms = visibleMoments(moments(g), new Set(DEFAULT_GROUPS));
      const rail = new Set(railMarks(ms, (m) => (m.play.gameSec / g.regulationSec) * 358, 358).map((k) => k.m.play.id));
      for (const m of ms) if (m.kind === 'td' || m.kind === 'fg' || m.kind === 'safety') expect(rail.has(m.play.id), `${file} ${m.play.id}`).toBe(true);
    }
  });

  it('never shows an event or a divider past a replay cut', () => {
    for (const [file, s] of cached.slice(0, 12)) {
      const n = buildGame(s).plays.length;
      for (const cut of [1, Math.floor(n / 3), Math.floor(n / 2), n - 1]) {
        const g = buildGame(s, { upto: cut });
        expect(moments(g).every((m) => m.play.idx < cut), `${file} @${cut}`).toBe(true);
        expect(g.breaks.every((b) => b.afterIdx < cut), `${file} @${cut}`).toBe(true);
      }
    }
  });
});
