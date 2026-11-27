// ESPN is polled only while a game is live, plus one fetch armed at a kickoff: a board or game with nothing live and
// nothing ahead is fetched once, and then only on a tap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BREAK_MS,
  boardInterval,
  DELAYED_MS,
  gameInterval,
  KICKOFF_GRACE_MS,
  KICKOFF_JITTER_MS,
  KICKOFF_LATE_MS,
  KICKOFF_WINDOW_MS,
  kickoffWait,
  LIVE_MS,
  PRE_MAX_WAIT_MS,
  untilKickoff,
} from '../src/espn/cadence';
import { Poller, type PollerDeps } from '../src/hooks/poller';
import type { EspnScoreboard } from '../src/espn/types';

let saveData = false;
const deps: PollerDeps = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  hidden: () => false,
  saveData: () => saveData,
};

const HOUR = 3_600_000;
const MIN = 60_000;
// Every pre game kicks off two hours after the fake clock's start unless a test says otherwise.
const board = (...states: ('pre' | 'in' | 'post')[]) =>
  ({
    events: states.map((state, i) => ({ id: String(i), date: new Date(2 * HOUR).toISOString(), status: { type: { state, name: '', completed: state === 'post' } }, competitions: [{}] })),
  }) as unknown as EspnScoreboard;

/** A poller on boards: each answer is a board, or an Error to throw. */
function run(answers: (EspnScoreboard | Error)[]) {
  const calls: number[] = [];
  let i = 0;
  const p = new Poller<EspnScoreboard>(
    {
      fetcher: async () => {
        calls.push(Date.now());
        const a = answers[Math.min(i++, answers.length - 1)];
        if (a instanceof Error) throw a;
        return a;
      },
      nextIn: (sb) => boardInterval(sb),
      onData: () => {},
      onError: () => {},
      onPolling: () => {},
    },
    deps,
  );
  return { p, calls };
}

beforeEach(() => {
  saveData = false;
  vi.useFakeTimers({ now: 0 });
  vi.spyOn(Math, 'random').mockReturnValue(0); // no kickoff jitter unless a test asks for it
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('poll only while live, and once more at a kickoff', () => {
  it('asks a game for updates while it is in progress, and once at its kickoff before it', () => {
    const kickoff = new Date(2 * HOUR).toISOString();
    expect(gameInterval('pre', 'STATUS_SCHEDULED', kickoff, 0)).toEqual({ clockMs: 2 * HOUR + KICKOFF_GRACE_MS });
    // A kickoff days away re-arms every 6 h rather than holding one long timer.
    expect(gameInterval('pre', 'STATUS_SCHEDULED', new Date(72 * HOUR).toISOString(), 0)).toEqual({ clockMs: PRE_MAX_WAIT_MS });
    expect(gameInterval('post', 'STATUS_FINAL')).toBeNull();
    expect(gameInterval('post', 'STATUS_POSTPONED')).toBeNull();
    expect(gameInterval('in', 'STATUS_IN_PROGRESS')).toBe(15_000);
    expect(gameInterval('in', 'STATUS_HALFTIME')).toBe(30_000);
  });

  it('spreads the kickoff fetch over 0-15 s so open pages don’t all ask at once', () => {
    const kickoff = new Date(HOUR).toISOString();
    expect(untilKickoff(kickoff, 0, true, KICKOFF_JITTER_MS)).toEqual({ clockMs: HOUR + KICKOFF_GRACE_MS + KICKOFF_JITTER_MS });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(untilKickoff(kickoff, 0)).toEqual({ clockMs: HOUR + KICKOFF_GRACE_MS + KICKOFF_JITTER_MS / 2 });
  });

  it('still "pre" past its kickoff: 15 s for 15 minutes, then every minute, then it stops at 4 hours and says so', () => {
    const kickoff = new Date(0).toISOString();
    const at = (t: number) => gameInterval('pre', 'STATUS_SCHEDULED', kickoff, t);
    expect(at(KICKOFF_GRACE_MS)).toBe(LIVE_MS);
    expect(at(KICKOFF_LATE_MS - 1)).toBe(LIVE_MS);
    expect(at(KICKOFF_LATE_MS)).toBe(DELAYED_MS);
    expect(at(KICKOFF_WINDOW_MS)).toBe(DELAYED_MS);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(at(KICKOFF_WINDOW_MS + 1)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    // The page's line follows the same clock.
    expect([kickoffWait(kickoff, -MIN), kickoffWait(kickoff, MIN), kickoffWait(kickoff, 20 * MIN), kickoffWait(kickoff, 5 * HOUR)]).toEqual(['ahead', 'due', 'delayed', 'gave-up']);
  });

  it('a kickoff with no time (unreadable, or marked not set by ESPN: a TBD game) checks back every 6 h, never stops', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(gameInterval('pre', 'STATUS_SCHEDULED', 'not a date', 0)).toEqual({ clockMs: PRE_MAX_WAIT_MS });
    expect(gameInterval('pre', 'STATUS_SCHEDULED', new Date(HOUR).toISOString(), 0, false)).toEqual({ clockMs: PRE_MAX_WAIT_MS });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(kickoffWait(new Date(HOUR).toISOString(), 0, false)).toBe('unknown');
    // A board of nothing but a TBD game keeps checking, so the kickoff ESPN sets later is picked up.
    const only = board('pre');
    (only.events[0].competitions[0] as { timeValid?: boolean }).timeValid = false;
    const { p, calls } = run([only]);
    p.start();
    await vi.advanceTimersByTimeAsync(2 * PRE_MAX_WAIT_MS);
    expect(calls).toEqual([0, PRE_MAX_WAIT_MS, 2 * PRE_MAX_WAIT_MS]);
    p.stop();
    const tbd = board('pre', 'pre');
    (tbd.events[0].competitions[0] as { timeValid?: boolean }).timeValid = false;
    tbd.events[0].date = new Date(MIN).toISOString(); // the placeholder time would arm a fetch a minute from now
    expect(boardInterval(tbd, 0)).toEqual({ clockMs: 2 * HOUR + KICKOFF_GRACE_MS }); // the other game's kickoff
  });

  it('asks a board for updates while one of its games is live, else at its next kickoff', () => {
    expect(boardInterval(board('pre', 'pre'), 0)).toEqual({ clockMs: 2 * HOUR + KICKOFF_GRACE_MS });
    expect(boardInterval(board('post', 'post'), 0)).toBeNull();
    expect(boardInterval(board(), 0)).toBeNull();
    expect(boardInterval(board('post', 'in', 'pre'), 0)).toBe(15_000);
  });

  // Changed on purpose (fix-1123): this test used to say a board with a game still to come is "fetched once, then only
  // when tapped", which left a board opened before kickoff frozen on "pre" all game. Now the one fetch is followed by
  // one more at the kickoff, then the live cadence takes over.
  it('fetches a board with nothing live once, again at its next kickoff, then live; a board of finals only when tapped', async () => {
    const waiting = run([board('pre', 'post'), board('in', 'post')]);
    waiting.p.start();
    await vi.advanceTimersByTimeAsync(2 * HOUR + KICKOFF_GRACE_MS + 30_000);
    expect(waiting.calls).toEqual([0, 2 * HOUR + KICKOFF_GRACE_MS, 2 * HOUR + KICKOFF_GRACE_MS + 15_000, 2 * HOUR + KICKOFF_GRACE_MS + 30_000]);
    waiting.p.stop();

    const done = run([board('post', 'post')]);
    const t0 = Date.now();
    done.p.start();
    await vi.advanceTimersByTimeAsync(HOUR); // an hour on screen
    expect(done.calls).toEqual([t0]);
    done.p.refresh(); // the freshness pill
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(done.calls).toEqual([t0, t0 + HOUR]);
    done.p.stop();
  });

  it('a board whose kickoff fetch fails retries on the backoff, not at the next re-arm hours later', async () => {
    const { p, calls } = run([board('pre', 'post'), new Error('ESPN answered 503'), board('in', 'post')]);
    p.start();
    await vi.advanceTimersByTimeAsync(2 * HOUR + KICKOFF_GRACE_MS + 15_000);
    expect(calls).toEqual([0, 2 * HOUR + KICKOFF_GRACE_MS, 2 * HOUR + KICKOFF_GRACE_MS + 15_000]);
    p.stop();
  });

  it('Data Saver stretches the live cadence (4x) but never a kickoff wait', async () => {
    saveData = true;
    const { p, calls } = run([board('pre', 'post'), board('in', 'post'), board('in', 'post')]);
    p.start();
    await vi.advanceTimersByTimeAsync(2 * HOUR + KICKOFF_GRACE_MS);
    expect(calls).toEqual([0, 2 * HOUR + KICKOFF_GRACE_MS]); // at the kickoff, not 8 hours later
    await vi.advanceTimersByTimeAsync(4 * LIVE_MS);
    expect(calls).toEqual([0, 2 * HOUR + KICKOFF_GRACE_MS, 2 * HOUR + KICKOFF_GRACE_MS + 4 * LIVE_MS]);
    p.stop();
  });

  it('polls while a game is live and stops when the last one ends', async () => {
    const { p, calls } = run([board('in', 'post'), board('in', 'post'), board('post', 'post')]);
    p.start();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(calls).toEqual([0, 15_000, 30_000]);
    p.stop();
  });

  it('BREAK_MS is the halftime cadence', () => {
    expect(gameInterval('in', 'STATUS_END_PERIOD')).toBe(BREAK_MS);
  });
});
