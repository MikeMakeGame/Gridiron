// When to ask ESPN again. ESPN's API is unofficial, so the rule is: poll only while a game is live.
// Anything else (before kickoff, final, postponed, a week with nothing on) is fetched once and then left alone;
// the freshness pill fetches again on a tap. Returning null stops the poller.
import type { EspnScoreboard } from './types';

export const LIVE_MS = 15_000;
export const BREAK_MS = 30_000; // halftime and between quarters: nothing new for a while

export function gameInterval(state: 'pre' | 'in' | 'post', statusName: string): number | null {
  if (state !== 'in') return null;
  return statusName === 'STATUS_HALFTIME' || statusName === 'STATUS_END_PERIOD' ? BREAK_MS : LIVE_MS;
}

/** A board polls while at least one of its games is live. */
export function boardInterval(sb: EspnScoreboard): number | null {
  return sb.events.some((e) => e.status.type.state === 'in') ? LIVE_MS : null;
}
