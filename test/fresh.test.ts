// The freshness pill tells the truth: its age is the age of the game on screen, and an update that couldn't be read
// turns it amber, never green, however recently the fetch itself came back.
import { describe, expect, it, vi } from 'vitest';
import { freshLook, nextCheckText, SOON_MS } from '../src/fresh';
import { NO_READ, readSummary, type ModelRead } from '../src/espn/read';
import type { EspnSummary } from '../src/espn/types';

const summary = (n: number) => ({ header: { id: String(n) } }) as unknown as EspnSummary;
const build = (s: EspnSummary) => {
  if (s.header.id.startsWith('bad')) throw new Error(`no text on play ${s.header.id}`);
  return { id: s.header.id };
};

describe('reading each update into the model', () => {
  it('keeps the last readable game, its fetch time, and says since when the feed went unreadable', () => {
    const warn = vi.fn();
    let r: ModelRead<{ id: string }> = NO_READ;
    r = readSummary(r, summary(1), 1_000, build, warn);
    expect(r.game).toEqual({ id: '1' });
    expect(r.acceptedAt).toBe(1_000);
    const bad = { header: { id: 'bad-1' } } as unknown as EspnSummary;
    r = readSummary(r, bad, 16_000, build, warn);
    expect(r.game).toEqual({ id: '1' });
    expect(r.acceptedAt).toBe(1_000);
    expect(r.problem).toEqual({ message: 'no text on play bad-1', since: 16_000 });
    // The next good one clears it.
    r = readSummary(r, summary(2), 31_000, build, warn);
    expect(r.problem).toBeNull();
    expect(r.acceptedAt).toBe(31_000);
  });

  it('logs once per distinct error, not once per poll', () => {
    const warn = vi.fn();
    let r: ModelRead<{ id: string }> = readSummary(NO_READ, summary(1), 0, build, warn);
    const same = () => ({ header: { id: 'bad-1' } }) as unknown as EspnSummary; // a new object each poll, same failure
    for (let t = 15_000; t <= 300_000; t += 15_000) r = readSummary(r, same(), t, build, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(r.problem?.since).toBe(15_000);
    r = readSummary(r, { header: { id: 'bad-2' } } as unknown as EspnSummary, 315_000, build, warn);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(r.problem?.since).toBe(15_000); // still unreadable since the first bad one
  });

  it('a first update that cannot be read leaves no game, and says so', () => {
    const r = readSummary(NO_READ, { header: { id: 'bad-0' } } as unknown as EspnSummary, 0, build, () => {});
    expect(r.game).toBeNull();
    expect(r.problem?.message).toMatch(/no text/);
  });
});

describe('the pill', () => {
  const base = { live: true, polling: true, error: null, retryAt: null };

  it('is green just after a readable update', () => {
    expect(freshLook({ ...base, lastOk: 0 }, 4_000)).toMatchObject({ cls: 'is-live', text: '4s ago' });
  });

  it('turns amber with the game’s age when the newest update cannot be read, even right after a fetch', () => {
    const at = { ...base, lastOk: 0, unreadable: true };
    expect(freshLook(at, 4_000)).toMatchObject({ cls: 'is-stale', text: "can't read ESPN · 4s" });
    expect(freshLook(at, 180_000)).toMatchObject({ cls: 'is-stale', text: "can't read ESPN · 3m" });
  });

  it('says "still trying" only when a fetch is near, names a far one (a kickoff hours away) by its time', () => {
    expect(nextCheckText(30_000, 0)).toBe('Still trying.');
    expect(nextCheckText(SOON_MS, 0)).toBe('Still trying.');
    expect(nextCheckText(3 * 3_600_000, 0)).toMatch(/^Next check at .+; tap the pill to try now\.$/);
    expect(nextCheckText(null, 0)).toBe('Not checking again on its own; tap the pill to try.');
  });

  it('counts down when ESPN asked for a wait', () => {
    expect(freshLook({ ...base, lastOk: 0, retryAt: 90_000 }, 30_000).text).toBe('ESPN says wait 1:00');
  });
});
