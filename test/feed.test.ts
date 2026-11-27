// One game's feed under fake timers: the summary and the scoreboard start, refresh, wake and stop together, and a game
// opened before kickoff goes live at its kickoff (it used to stay "pre" all game).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameFeed, UNREADABLE_RETRY_MS, type FeedState } from '../src/hooks/feed';
import type { PollerDeps } from '../src/hooks/poller';
import { BREAK_MS, KICKOFF_GRACE_MS } from '../src/espn/cadence';
import type { EspnScoreboard, EspnSummary } from '../src/espn/types';

const HOUR = 3_600_000;
const KICK = 2 * HOUR;
const AT = KICK + KICKOFF_GRACE_MS; // when the kickoff fetch goes out

let hidden = false;
const deps: PollerDeps = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  hidden: () => hidden,
  saveData: () => false,
};

type State = 'pre' | 'in' | 'post';
const summaryAt = (state: State, name = state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED') =>
  ({
    header: {
      id: '9',
      competitions: [
        {
          id: '9',
          date: new Date(KICK).toISOString(),
          status: { type: { state, name, completed: state === 'post' } },
          competitors: [
            { id: 'h', homeAway: 'home', team: { id: 'h', abbreviation: 'HOM', displayName: 'Home' } },
            { id: 'a', homeAway: 'away', team: { id: 'a', abbreviation: 'AWY', displayName: 'Away' } },
          ],
        },
      ],
    },
  }) as unknown as EspnSummary;

/** A feed whose game state is whatever `stateAt` says for the fake clock's time. `summaryFails(n)`: the nth summary
 *  fetch (0-based) is rejected. */
function setup(stateAt: (t: number) => State, opts: { boardFails?: boolean; summaryFails?: (n: number) => boolean } = {}) {
  const calls = { summary: [] as number[], board: [] as number[] };
  const states: FeedState[] = [];
  const feed = new GameFeed(
    {
      id: '9',
      getSummary: async () => {
        calls.summary.push(Date.now());
        if (opts.summaryFails?.(calls.summary.length - 1)) throw new Error('ESPN took too long to answer');
        return summaryAt(stateAt(Date.now()));
      },
      getBoard: async () => {
        calls.board.push(Date.now());
        if (opts.boardFails) throw new Error('ESPN answered 500');
        return { events: [] } as EspnScoreboard;
      },
      polls: true,
      onChange: (s) => states.push(s),
    },
    deps,
  );
  return { feed, calls, states };
}

beforeEach(() => {
  hidden = false;
  vi.useFakeTimers({ now: 0 });
  vi.spyOn(Math, 'random').mockReturnValue(0); // no kickoff jitter
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('one feed per game', () => {
  it('a game opened before kickoff fetches once, again at kickoff, then live; the scoreboard joins when it goes live', async () => {
    const { feed, calls } = setup((t) => (t >= KICK ? 'in' : 'pre'));
    feed.start();
    await vi.advanceTimersByTimeAsync(KICK); // two hours before kickoff, on screen
    expect(calls.summary).toEqual([0]);
    expect(calls.board).toEqual([]);
    await vi.advanceTimersByTimeAsync(KICKOFF_GRACE_MS + 30_000);
    expect(calls.summary).toEqual([0, AT, AT + 15_000, AT + 30_000]);
    expect(calls.board).toEqual([AT, AT + 15_000, AT + 30_000]);
    feed.stop();
  });

  it('says when its next fetch is due, so the page can tell "still trying" from a kickoff hours away', async () => {
    const { feed } = setup((t) => (t >= KICK ? 'in' : 'pre'));
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.current.summary.due).toBe(AT);
    await vi.advanceTimersByTimeAsync(AT);
    expect(feed.current.summary.due).toBe(AT + 15_000);
    feed.stop();
  });

  it('a kickoff fetch that still says "pre" keeps checking at the live cadence until the game is on', async () => {
    const { feed, calls } = setup((t) => (t >= AT + 20_000 ? 'in' : 'pre'));
    feed.start();
    await vi.advanceTimersByTimeAsync(AT + 30_000);
    expect(calls.summary).toEqual([0, AT, AT + 15_000, AT + 30_000]);
    expect(calls.board).toEqual([AT + 30_000]); // from the first update that says the game is on
    feed.stop();
  });

  it('one tap refreshes both', async () => {
    const { feed, calls } = setup(() => 'in');
    feed.start();
    await vi.advanceTimersByTimeAsync(5_000);
    feed.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.summary).toEqual([0, 5_000]);
    expect(calls.board).toEqual([0, 5_000]);
    feed.stop();
  });

  it('both stop on the final', async () => {
    const { feed, calls } = setup((t) => (t >= 30_000 ? 'post' : 'in'));
    feed.start();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(calls.summary).toEqual([0, 15_000, 30_000]);
    expect(calls.board).toEqual([0, 15_000]); // stopped by the update that said final
    feed.stop();
  });

  it('a tab hidden through kickoff re-checks when it returns, and the scoreboard wakes with it', async () => {
    const { feed, calls } = setup((t) => (t >= KICK ? 'in' : 'pre'));
    feed.start();
    await vi.advanceTimersByTimeAsync(1_000);
    hidden = true;
    feed.visibilityChanged();
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(calls.summary).toEqual([0]);
    hidden = false;
    feed.visibilityChanged(); // the kickoff fetch is overdue: it goes now
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.summary).toEqual([0, 3 * HOUR + 1_000]);
    expect(calls.board).toEqual([3 * HOUR + 1_000]);
    // Hidden again mid-game: neither polls; back: both catch up.
    hidden = true;
    feed.visibilityChanged();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.board).toHaveLength(1);
    hidden = false;
    feed.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.summary).toHaveLength(3);
    expect(calls.board).toHaveLength(2);
    feed.stop();
  });

  it('one failed fetch at kickoff retries within 15 s, not at the next re-arm hours later', async () => {
    // Kickoff three hours out: the first fetch reads "pre"; the kickoff fetch fails once, the retry reads "in".
    const kick = 3 * HOUR;
    const local = new GameFeed(
      {
        id: '9',
        getSummary: async () => {
          calls.push(Date.now());
          if (calls.length === 2) throw new Error('ESPN is busy right now (503)');
          const s = summaryAt(Date.now() >= kick ? 'in' : 'pre');
          s.header.competitions[0].date = new Date(kick).toISOString();
          return s;
        },
        getBoard: async () => ({ events: [] }) as EspnScoreboard,
        polls: true,
        onChange: () => {},
      },
      deps,
    );
    const calls: number[] = [];
    local.start();
    await vi.advanceTimersByTimeAsync(kick + KICKOFF_GRACE_MS + 15_000);
    expect(calls).toEqual([0, kick + KICKOFF_GRACE_MS, kick + KICKOFF_GRACE_MS + 15_000]);
    local.stop();
  });

  it('an unreadable summary keeps it fetching every 30 s for 20 minutes, even when that summary says final', async () => {
    const { feed, calls } = setup(() => 'post');
    feed.start();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(calls.summary).toEqual([0]); // a final: fetched once
    feed.setUnreadable(HOUR); // the page couldn't read it
    expect(feed.retrying()).toBe(true);
    await vi.advanceTimersByTimeAsync(UNREADABLE_RETRY_MS + 5 * 60_000);
    expect(calls.summary.length).toBe(1 + UNREADABLE_RETRY_MS / BREAK_MS);
    expect(calls.summary[1] - HOUR).toBe(BREAK_MS);
    expect(feed.retrying()).toBe(false); // the window is over: the data's schedule (stop) rules again
    expect(feed.current.summary.polling).toBe(false);
    feed.stop();
  });

  it('a readable summary again ends the retrying', async () => {
    const { feed, calls } = setup(() => 'post');
    feed.start();
    await vi.advanceTimersByTimeAsync(1_000);
    feed.setUnreadable(1_000);
    await vi.advanceTimersByTimeAsync(BREAK_MS);
    feed.setUnreadable(null);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(calls.summary).toEqual([0, 1_000 + BREAK_MS]);
    feed.stop();
  });

  it('nothing fetches after stop', async () => {
    const { feed, calls } = setup(() => 'in');
    feed.start();
    await vi.advanceTimersByTimeAsync(1_000);
    feed.stop();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(calls.summary).toEqual([0]);
    expect(calls.board).toEqual([0]);
  });

  it("logs the scoreboard's failures once each, since nothing on the page shows them", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { feed, calls } = setup(() => 'in', { boardFails: true });
    feed.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls.board.length).toBeGreaterThan(2);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('scoreboard feed'))).toHaveLength(1);
    feed.stop();
    warn.mockRestore();
  });
});
