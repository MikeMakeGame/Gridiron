// The tab-wide ESPN cooldown: once ESPN says "slow down", no poller asks again until the wait is over.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScoreboard } from '../src/espn/api';
import { RetryAfterError } from '../src/hooks/poller';

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
});
