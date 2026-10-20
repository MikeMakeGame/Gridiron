// The polling engine under fake timers: every path that could leave a live game page stuck or hammering ESPN.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Poller, RetryAfterError, type PollerDeps } from '../src/hooks/poller';
import { checkSummary } from '../src/espn/api';

let hidden = false;
const deps: PollerDeps = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  hidden: () => hidden,
  saveData: () => false,
};

interface Rec {
  data: unknown[];
  errors: string[];
  calls: number[]; // fake-clock time of each fetch
}

function setup<T>(answers: (() => Promise<T>)[], nextIn: (d: T) => number | null) {
  const rec: Rec = { data: [], errors: [], calls: [] };
  let i = 0;
  const p = new Poller<T>(
    {
      fetcher: () => {
        rec.calls.push(Date.now());
        const a = answers[Math.min(i++, answers.length - 1)];
        return a();
      },
      nextIn,
      onData: (d) => rec.data.push(d),
      onError: (m) => rec.errors.push(m),
      onPolling: () => {},
      timeoutMs: 10_000,
    },
    deps,
  );
  return { p, rec };
}

const never = () => new Promise<never>(() => {});
const ok = <T,>(v: T) => () => Promise.resolve(v);
const fail = (e: Error) => () => Promise.reject(e);

beforeEach(() => {
  hidden = false;
  vi.useFakeTimers({ now: 0 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Poller', () => {
  it('recovers from a request that never answers', async () => {
    const { p, rec } = setup([never, ok('live')], () => 15_000);
    p.start();
    await vi.advanceTimersByTimeAsync(10_000); // the timeout fires
    expect(rec.errors[0]).toMatch(/too long/);
    await vi.advanceTimersByTimeAsync(15_000); // first backoff step
    expect(rec.calls).toEqual([0, 25_000]);
    expect(rec.data).toEqual(['live']);
    p.stop();
  });

  it('refresh abandons a hung request instead of waiting on it', async () => {
    const { p, rec } = setup([never, ok('fresh')], () => 15_000);
    p.start();
    await vi.advanceTimersByTimeAsync(2_000);
    p.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(rec.calls).toEqual([0, 2_000]);
    expect(rec.data).toEqual(['fresh']);
    // The abandoned request's timeout must not report an error later.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(rec.errors).toEqual([]);
    p.stop();
  });

  it('never retries an error faster than the normal schedule', async () => {
    // Idle cadence is 5 minutes; a failure must not turn that into 15-second retries.
    const { p, rec } = setup([ok('pre'), fail(new Error('500')), ok('pre')], () => 300_000);
    p.start();
    await vi.advanceTimersByTimeAsync(300_000); // second call fails
    await vi.advanceTimersByTimeAsync(299_000);
    expect(rec.calls).toEqual([0, 300_000]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rec.calls).toEqual([0, 300_000, 600_000]);
    p.stop();
  });

  it('backs off further on repeated errors', async () => {
    const { p, rec } = setup([fail(new Error('bad')), fail(new Error('bad')), fail(new Error('bad')), ok('x')], () => 15_000);
    p.start();
    await vi.advanceTimersByTimeAsync(15_000 + 30_000 + 60_000);
    expect(rec.calls).toEqual([0, 15_000, 45_000, 105_000]);
    p.stop();
  });

  it("waits as long as the server's Retry-After asks", async () => {
    const { p, rec } = setup([fail(new RetryAfterError('slow down', 120_000)), ok('x')], () => 15_000);
    p.start();
    await vi.advanceTimersByTimeAsync(119_000);
    expect(rec.calls).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rec.calls).toEqual([0, 120_000]);
    p.stop();
  });

  it('follows a game from before kickoff into the live game, and stops at the final', async () => {
    const states = ['pre', 'pre', 'in', 'in', 'post'];
    const { p, rec } = setup(
      states.map((s) => ok(s)),
      (s) => (s === 'pre' ? 60_000 : s === 'in' ? 15_000 : null),
    );
    p.start();
    await vi.advanceTimersByTimeAsync(60_000 + 60_000 + 15_000 + 15_000 + 600_000);
    expect(rec.data).toEqual(states);
    expect(rec.calls).toEqual([0, 60_000, 120_000, 135_000, 150_000]); // nothing after the final
    p.stop();
  });

  it('keeps the last good data when an answer comes back malformed', async () => {
    const good = {
      header: {
        id: '1',
        competitions: [
          {
            id: '1',
            date: '2026-10-20T00:15Z',
            status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false } },
            competitors: [
              { id: 'h', homeAway: 'home', team: { id: 'h', abbreviation: 'HOM', displayName: 'Home' } },
              { id: 'a', homeAway: 'away', team: { id: 'a', abbreviation: 'AWY', displayName: 'Away' } },
            ],
          },
        ],
      },
    };
    const bad = { header: { competitions: [] } };
    const { p, rec } = setup([async () => checkSummary(good), async () => checkSummary(bad)], () => 15_000);
    p.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(rec.data).toHaveLength(1); // the malformed answer never reached onData
    expect(rec.errors[0]).toMatch(/can't read/);
    p.stop();
  });

  it("doesn't poll while the tab is hidden, and catches up when it's back", async () => {
    const { p, rec } = setup([ok('a'), ok('b')], () => 15_000);
    p.start();
    await vi.advanceTimersByTimeAsync(1_000);
    hidden = true;
    p.visibilityChanged();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rec.calls).toEqual([0]);
    hidden = false;
    p.visibilityChanged(); // overdue, so it fetches right away
    await vi.advanceTimersByTimeAsync(0);
    expect(rec.calls).toEqual([0, 61_000]);
    p.stop();
  });
});
