// The game page's glue, without a page: the feed, the model's read of it and the pill together under fake timers; the
// scoreboard's "just in" snap (lag and the 90 s expiry); a replay cut that breaks the model; the pin on a short screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameFeed } from '../src/hooks/feed';
import type { PollerDeps } from '../src/hooks/poller';
import { NO_READ, readSummary, replayAt, type ModelRead, type ReplayKnown } from '../src/espn/read';
import { AHEAD_MAX_MS, mergeAhead, type AheadSeen } from '../src/espn/ahead';
import { buildGame, type Game } from '../src/espn/model';
import { freshLook } from '../src/fresh';
import { isShortScreen, pinFits } from '../src/hooks/usePoll';
import type { EspnEvent, EspnPlay, EspnScoreboard, EspnSummary } from '../src/espn/types';

const deps: PollerDeps = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  hidden: () => false,
  saveData: () => false,
};

const play = (id: string, text: string): EspnPlay => ({
  id,
  type: { id: '24', text: 'Pass Reception' },
  text,
  awayScore: 0,
  homeScore: 0,
  period: { number: 1 },
  clock: { displayValue: '10:00' },
  statYardage: 5,
  start: { team: { id: 'h' }, down: 1, distance: 10, yardsToEndzone: 75 },
  end: { team: { id: 'h' }, down: 2, distance: 5, yardsToEndzone: 70 },
});

/** A live game whose drive holds these plays. `broken` leaves the drive without its start, which breaks the model. */
function liveSummary(plays: EspnPlay[], broken = false): EspnSummary {
  const team = (id: string, abbr: string, color: string) => ({ id, abbreviation: abbr, displayName: abbr, color, alternateColor: 'ffffff' });
  return {
    header: {
      id: '9',
      competitions: [
        {
          id: '9',
          date: '2026-10-19T00:15Z',
          status: { period: 1, displayClock: '10:00', type: { state: 'in', name: 'STATUS_IN_PROGRESS', completed: false } },
          competitors: [
            { id: 'h', homeAway: 'home', score: '0', team: team('h', 'HOM', '1d4f91') },
            { id: 'a', homeAway: 'away', score: '0', team: team('a', 'AWY', 'a71930') },
          ],
        },
      ],
    },
    drives: { previous: [{ id: 'd1', team: { id: 'h', abbreviation: 'HOM' }, ...(broken ? {} : { start: { period: { number: 1 }, yardLine: 25 } }), plays } as never] },
  };
}

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => vi.useRealTimers());

describe('a feed that keeps answering with an update the model cannot read', () => {
  it('keeps the last good game, turns the pill amber (never green) with the game’s age, and logs once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let broken = false;
    let read: ModelRead<Game> = NO_READ;
    const feed = new GameFeed(
      {
        id: '9',
        getSummary: async () => liveSummary([play('p1', 'H.Passer pass short left to X.Receiver to HOM 30 for 5 yards (S.Safety).')], broken),
        getBoard: async () => ({ events: [] }) as EspnScoreboard,
        polls: true,
        onChange: (s) => (read = readSummary(read, s.summary.data, s.summary.lastOk, (d) => buildGame(d))),
      },
      deps,
    );
    feed.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(read.game?.plays).toHaveLength(1);
    const pill = () => freshLook({ live: true, lastOk: read.acceptedAt, polling: feed.current.summary.polling, error: feed.current.summary.error, unreadable: !!read.problem }, Date.now());
    expect(pill().cls).toBe('is-live');

    broken = true; // from the next poll on, ESPN's answer passes the shape check but breaks the model
    for (let t = 15_000; t <= 300_000; t += 15_000) {
      await vi.advanceTimersByTimeAsync(15_000);
      expect(feed.current.summary.lastOk).toBe(t); // the fetches themselves keep succeeding...
      expect(read.acceptedAt).toBe(0); // ...but the game on screen is still the one from 0 s
      expect(pill().cls).toBe('is-stale'); // so the pill is amber, never green
    }
    expect(pill().text).toBe("can't read ESPN · 5m");
    expect(read.game?.plays).toHaveLength(1);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("can't read ESPN's latest game update"))).toHaveLength(1);

    broken = false; // ESPN fixes it: the next poll reads, and the pill is green again
    await vi.advanceTimersByTimeAsync(15_000);
    expect(read.problem).toBeNull();
    expect(pill().cls).toBe('is-live');
    feed.stop();
    warn.mockRestore();
  });
});

describe('the scoreboard’s "just in" snap', () => {
  const g = buildGame(liveSummary([play('p1', 'H.Passer pass short left to X.Receiver to HOM 30 for 5 yards (S.Safety).')]));
  const event = (lastId: string, text: string, extra: Record<string, unknown> = {}) =>
    ({
      id: '9',
      competitions: [
        {
          competitors: [
            { homeAway: 'home', score: '7' },
            { homeAway: 'away', score: '0' },
          ],
          situation: { down: 1, distance: 10, yardLine: 40, possession: 'h', shortDownDistanceText: '1st & 10', possessionText: 'HOM 40', lastPlay: { id: lastId, text }, ...extra },
        },
      ],
    }) as unknown as EspnEvent;

  it('shows a snap the summary lacks, with the scoreboard’s score and spot, until the summary catches up', () => {
    const r = mergeAhead(g, event('p2', 'B.Back up the middle for 9 yards.'), 1_000, null);
    expect(r.ahead).toMatchObject({ text: 'B.Back up the middle for 9 yards.', situation: '1st & 10 · HOM 40', home: 7, away: 0 });
    expect(r.ahead?.spot).toEqual({ offenseId: 'h', ytg: 60, down: 1, distance: 10 });
    expect(r.seen).toEqual({ id: 'p2', at: 1_000 });
    // The summary posts p2: nothing to show ahead of it.
    const caught = buildGame(liveSummary([play('p1', 'x'), play('p2', 'B.Back up the middle for 9 yards.')]));
    expect(mergeAhead(caught, event('p2', 'B.Back up the middle for 9 yards.'), 16_000, r.seen).ahead).toBeNull();
  });

  it('stops showing a snap the summary never posts 90 s after it was first seen; a new snap starts its own clock', () => {
    let seen: AheadSeen | null = null;
    const ev = event('p2', 'B.Back up the middle for 9 yards.');
    for (const t of [0, 15_000, 45_000, AHEAD_MAX_MS]) {
      const r = mergeAhead(g, ev, t, seen);
      expect(r.ahead, `${t}`).not.toBeNull();
      seen = r.seen;
    }
    expect(mergeAhead(g, ev, AHEAD_MAX_MS + 1, seen).ahead).toBeNull();
    const next = mergeAhead(g, event('p3', 'H.Passer pass incomplete.'), AHEAD_MAX_MS + 1, seen);
    expect(next.ahead?.text).toBe('H.Passer pass incomplete.');
    expect(next.seen).toEqual({ id: 'p3', at: AHEAD_MAX_MS + 1 });
  });

  it('shows nothing during a replay, for a timeout row, or with no snap', () => {
    expect(mergeAhead(g, event('p2', 'x'), 0, null, true).ahead).toBeNull();
    expect(mergeAhead(g, event('p2', 'Timeout #1 by HOM at 10:00.'), 0, null).ahead).toBeNull();
    expect(mergeAhead(g, undefined, 0, null).ahead).toBeNull();
  });

  it('after a score there is no down: no situation and no spot, rather than stale ones', () => {
    const r = mergeAhead(g, event('p2', 'B.Back up the middle for 1 yard, TOUCHDOWN.', { down: 0 }), 0, null);
    expect(r.ahead?.situation).toBe('');
    expect(r.ahead?.spot).toBeNull();
  });
});

describe('a replay cut that breaks the model', () => {
  const build = (bad: number[]) => (k: number) => {
    if (bad.includes(k)) throw new Error(`play ${k} has no text`);
    return { upto: k };
  };

  it('holds at the last cut it showed, says so, and logs; it never returns the full game', () => {
    const warn = vi.fn();
    const r = replayAt(5, build([5]), { upto: 4, game: { upto: 4 } }, warn);
    expect(r).toEqual({ game: { upto: 4 }, upto: 4, problem: 'play 5 has no text' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('scrubbed far ahead onto a broken cut, it holds at the nearest play before it, not back where it was', () => {
    const r = replayAt(80, build([80]), { upto: 10, game: { upto: 10 } }, () => {});
    expect(r).toEqual({ game: { upto: 79 }, upto: 79, problem: 'play 80 has no text' });
  });

  it('a far scrub costs about log2(plays) builds, and what it learned makes the next step cheap', () => {
    // A broken row at index 49: every cut past 49 plays fails (a cut replays every earlier row), cut 49 builds.
    let builds = 0;
    const b = (k: number) => {
      builds++;
      if (k >= 50) throw new Error('row 49 has no text');
      return { upto: k };
    };
    const known: ReplayKnown = { lowestFail: null };
    const r = replayAt(140, b, { upto: 10, game: { upto: 10 } }, () => {}, known);
    expect(r.upto).toBe(49);
    expect(builds).toBeLessThanOrEqual(9); // the asked cut, then ~7 halvings of 10..140
    expect(known.lowestFail).toBe(50);
    builds = 0;
    const next = replayAt(141, b, { upto: 49, game: { upto: 49 } }, () => {}, known);
    expect(next.upto).toBe(49);
    expect(builds).toBe(1); // only the asked cut: 49 builds and 50 fails are already known
  });

  it('scrubbed back onto a broken cut, it looks back for one that builds rather than show a later play', () => {
    const r = replayAt(5, build([5, 4]), { upto: 9, game: { upto: 9 } }, () => {});
    expect(r).toEqual({ game: { upto: 3 }, upto: 3, problem: 'play 5 has no text' });
  });

  it('with nothing it can build, it has no game to show (the page says the replay can’t start)', () => {
    const r = replayAt(2, build([1, 2]), null, () => {});
    expect(r.game).toBeNull();
    expect(r.problem).toMatch(/no text/);
  });

  it('on a real game: a cut past a broken row holds before it', () => {
    const rows = [play('p1', 'a'), play('p2', 'b'), { ...play('p3', 'c'), text: undefined as unknown as string }, play('p4', 'd')];
    const s = liveSummary(rows);
    const first = replayAt(2, (k) => buildGame(s, { upto: k }), null, () => {});
    expect(first.problem).toBeNull();
    const stuck = replayAt(3, (k) => buildGame(s, { upto: k }), first.game ? { upto: 2, game: first.game } : null, () => {});
    expect(stuck.problem).not.toBeNull();
    expect(stuck.game?.plays.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('the pinned chart on a short screen', () => {
  // Heights measured on the built page's Story tab (see PIN_MAX_SHARE).
  it('pins on portrait phones, short ones included, and unpins a phone in landscape', () => {
    expect(pinFits(139, 248, 844)).toBe(true); // portrait 390x844: 46%
    expect(pinFits(139, 187, 640)).toBe(true); // short portrait 375x640: 51%
    expect(pinFits(139, 187, 553)).toBe(true); // iPhone SE under Safari's bars: 59%
    expect(pinFits(139, 290, 768)).toBe(true); // 1024x768: 56%
    expect(pinFits(139, 229, 390)).toBe(false); // landscape 844x390: 94%
    expect(pinFits(118, 230, 0)).toBe(true); // no height known yet: keep the designed layout
    expect(isShortScreen(700)).toBe(true);
    expect(isShortScreen(701)).toBe(false);
    expect(isShortScreen(0)).toBe(false);
  });
});
