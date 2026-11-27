// The tab-wide ESPN cooldown: once ESPN says "slow down", no poller asks again until the wait is over.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScoreboard } from '../src/espn/api';
import { Poller, RetryAfterError } from '../src/hooks/poller';

const fetchMock = vi.fn();
let day = 0;

beforeEach(() => {
  // The cooldown is module state, so each test starts a day after the last one, clear of any earlier wait.
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 20, 1, 0) + day++ * 86_400_000 });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ESPN cooldown', () => {
  it("holds every request until ESPN's Retry-After has passed", async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    await expect(getScoreboard(undefined)).rejects.toMatchObject({ retryAfterMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    const held = await getScoreboard(undefined).catch((e) => e);
    expect(held).toBeInstanceOf(RetryAfterError);
    expect(held.retryAfterMs).toBe(50_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no request went out

    vi.advanceTimersByTime(50_000);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ events: [] }), { status: 200 }));
    await expect(getScoreboard(undefined)).resolves.toEqual({ events: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps a huge Retry-After at an hour (timers wrap past ~24.8 days and would fire at once)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503, headers: { 'Retry-After': '9999999' } }));
    await expect(getScoreboard(undefined)).rejects.toMatchObject({ retryAfterMs: 3_600_000 });
  });

  it('a 429 without Retry-After still means five minutes, for every poller', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(getScoreboard(undefined)).rejects.toMatchObject({ retryAfterMs: 300_000 });
    vi.advanceTimersByTime(299_000);
    await expect(getScoreboard(undefined)).rejects.toBeInstanceOf(RetryAfterError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('"Retry-After: 0" is no wait, not five minutes', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }));
    await expect(getScoreboard(undefined)).rejects.toMatchObject({ retryAfterMs: 0 });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ events: [] }), { status: 200 }));
    await expect(getScoreboard(undefined)).resolves.toEqual({ events: [] }); // nothing held
  });

  it('a 503 with an explicit Retry-After holds every poller that long', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503, headers: { 'Retry-After': '120' } }));
    await expect(getScoreboard(undefined)).rejects.toMatchObject({ retryAfterMs: 120_000 });
    vi.advanceTimersByTime(60_000);
    await expect(getScoreboard(undefined)).rejects.toMatchObject({ retryAfterMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says what went wrong in words, not the browser's (no network; an answer that isn't JSON)", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getScoreboard(undefined)).rejects.toThrow("Couldn't reach ESPN (offline?)");
    fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 200 }));
    await expect(getScoreboard(undefined)).rejects.toThrow("ESPN sent a page we can't read");
    expect(warn).toHaveBeenCalledTimes(2); // the raw errors go to the console
    warn.mockRestore();
  });

  it('a 503 without Retry-After is no tab-wide freeze: the poller backs off 15, 30, 60 s', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 503 }));
    const err = await getScoreboard(undefined).catch((e) => e);
    expect(err).not.toBeInstanceOf(RetryAfterError);
    expect(err.message).toMatch(/busy/);
    fetchMock.mockClear();
    const t0 = Date.now();
    const calls: number[] = [];
    const p = new Poller(
      {
        fetcher: (s) => (calls.push(Date.now() - t0), getScoreboard(undefined, s)),
        nextIn: () => 15_000,
        onData: () => {},
        onError: () => {},
        onPolling: () => {},
      },
      { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>), hidden: () => false, saveData: () => false },
    );
    p.start();
    await vi.advanceTimersByTimeAsync(15_000 + 30_000 + 60_000);
    expect(calls).toEqual([0, 15_000, 45_000, 105_000]);
    expect(fetchMock).toHaveBeenCalledTimes(4); // each try went out
    p.stop();
  });
});
