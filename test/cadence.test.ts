// ESPN is polled only while a game is live: a board or game with nothing live is fetched once, and then only on a tap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardInterval, gameInterval } from '../src/espn/cadence';
import { Poller, type PollerDeps } from '../src/hooks/poller';
import type { EspnScoreboard } from '../src/espn/types';

const deps: PollerDeps = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  hidden: () => false,
  saveData: () => false,
};

const board = (...states: ('pre' | 'in' | 'post')[]) =>
  ({ events: states.map((state, i) => ({ id: String(i), status: { type: { state, name: '', completed: state === 'post' } } })) }) as unknown as EspnScoreboard;

function run(boards: EspnScoreboard[]) {
  const calls: number[] = [];
  let i = 0;
  const p = new Poller<EspnScoreboard>(
    {
      fetcher: async () => {
        calls.push(Date.now());
        return boards[Math.min(i++, boards.length - 1)];
      },
      nextIn: boardInterval,
      onData: () => {},
      onError: () => {},
      onPolling: () => {},
    },
    deps,
  );
  return { p, calls };
}

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => vi.useRealTimers());

describe('poll only while live', () => {
  it('asks a game for updates only while it is in progress', () => {
    expect(gameInterval('pre', 'STATUS_SCHEDULED')).toBeNull();
    expect(gameInterval('post', 'STATUS_FINAL')).toBeNull();
    expect(gameInterval('post', 'STATUS_POSTPONED')).toBeNull();
    expect(gameInterval('in', 'STATUS_IN_PROGRESS')).toBe(15_000);
    expect(gameInterval('in', 'STATUS_HALFTIME')).toBe(30_000);
  });

  it('asks a board for updates only while one of its games is live', () => {
    expect(boardInterval(board('pre', 'pre'))).toBeNull();
    expect(boardInterval(board('post', 'post'))).toBeNull();
    expect(boardInterval(board())).toBeNull();
    expect(boardInterval(board('post', 'in', 'pre'))).toBe(15_000);
  });

  it('fetches a board with nothing live once, then only when tapped', async () => {
    const { p, calls } = run([board('pre', 'post')]);
    p.start();
    await vi.advanceTimersByTimeAsync(3_600_000); // an hour on screen
    expect(calls).toEqual([0]);
    p.refresh(); // the freshness pill
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toEqual([0, 3_600_000]);
    p.stop();
  });

  it('polls while a game is live and stops when the last one ends', async () => {
    const { p, calls } = run([board('in', 'post'), board('in', 'post'), board('post', 'post')]);
    p.start();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(calls).toEqual([0, 15_000, 30_000]);
    p.stop();
  });
});
