// When to ask ESPN again. ESPN's API is unofficial, so the rule is: poll only while a game is live, and before a game
// ask once more at its kickoff. A game (or a board) waiting on a kickoff arms one fetch at the kickoff time from ESPN's
// `date`, plus a little grace (ESPN flips the state a moment after the kick) and a random 0-15 s so every open page
// doesn't ask in the same second. If it still says "pre" past the kickoff, it checks every 15 s for 15 minutes, then
// every minute, and stops 4 hours after the kickoff time. Finals, postponed games and a week with nothing ahead are
// fetched once and then left alone; the freshness pill fetches again on a tap. Null stops the poller.
import type { EspnScoreboard } from './types';
import { clockWait, type NextPoll } from '../hooks/poller';

export const LIVE_MS = 15_000;
export const BREAK_MS = 30_000; // halftime and between quarters: nothing new for a while
/** The fetch armed for a kickoff goes out this long after the kickoff time... */
export const KICKOFF_GRACE_MS = 30_000;
/** ...plus up to this much more, at random, so the pages open on one game don't all ask at once. */
export const KICKOFF_JITTER_MS = 15_000;
/** A kickoff further off than this re-arms after this long instead (one fetch every 6 h), so a timer set days ahead
 *  never drifts across a sleep or past what a browser timer can hold, and a moved kickoff is picked up. */
export const PRE_MAX_WAIT_MS = 6 * 3_600_000;
/** Still "pre" past the kickoff: the live cadence for this long (ESPN is usually a minute or two late flipping)... */
export const KICKOFF_LATE_MS = 15 * 60_000;
/** ...then this, while the kickoff looks delayed... */
export const DELAYED_MS = 60_000;
/** ...until this long after the kickoff time, when it has stopped being a kickoff to wait for (ESPN marks postponed
 *  games "post"; this is the guard if it doesn't): stop polling, and say so on the page. */
export const KICKOFF_WINDOW_MS = 4 * 3_600_000;

/** Where a game that still says "pre" stands against its kickoff time, for the schedule and for the page's line. */
export type KickoffWait = 'ahead' | 'due' | 'delayed' | 'gave-up' | 'unknown';

export function kickoffWait(iso: string | undefined, now: number, timeValid = true): KickoffWait {
  const at = Date.parse(iso ?? '');
  if (!timeValid || !Number.isFinite(at)) return 'unknown';
  const past = now - at;
  if (past < KICKOFF_GRACE_MS) return 'ahead';
  if (past < KICKOFF_LATE_MS) return 'due';
  return past <= KICKOFF_WINDOW_MS ? 'delayed' : 'gave-up';
}

/**
 * The next poll for a game that says "pre". `timeValid`: false when ESPN marks the kickoff time as not set yet (a
 * TBD game): with no time to arm a fetch for, it checks back every PRE_MAX_WAIT_MS. `jitter` is the random part,
 * passed in by tests.
 */
export function untilKickoff(iso: string | undefined, now: number, timeValid = true, jitter = Math.random() * KICKOFF_JITTER_MS): NextPoll {
  const wait = kickoffWait(iso, now, timeValid);
  if (wait === 'unknown') {
    // No time to arm a fetch for, but the game is still coming: check back every 6 h, so a kickoff ESPN sets later is
    // picked up (a stop here would never refetch, a returning tab included).
    console.warn(`Gridiron: a game before kickoff has no kickoff time yet (${timeValid ? JSON.stringify(iso ?? null) : 'ESPN marks it not set'}); checking again in ${PRE_MAX_WAIT_MS / 3_600_000} h`);
    return clockWait(PRE_MAX_WAIT_MS);
  }
  if (wait === 'ahead') return clockWait(Math.min(Date.parse(iso!) + KICKOFF_GRACE_MS + jitter - now, PRE_MAX_WAIT_MS));
  if (wait === 'due') return LIVE_MS;
  if (wait === 'delayed') return DELAYED_MS;
  console.warn(`Gridiron: a game is still "pre" ${Math.round((now - Date.parse(iso!)) / 60_000)} min after its kickoff time; stopped waiting for it`);
  return null;
}

/** A game's next poll: live cadence while it's on, one fetch at kickoff before it, nothing after it. */
export function gameInterval(state: 'pre' | 'in' | 'post', statusName: string, kickoff?: string, now = Date.now(), timeValid = true): NextPoll {
  if (state === 'pre') return untilKickoff(kickoff, now, timeValid);
  if (state !== 'in') return null;
  return statusName === 'STATUS_HALFTIME' || statusName === 'STATUS_END_PERIOD' ? BREAK_MS : LIVE_MS;
}

const sooner = (a: NextPoll, b: NextPoll): NextPoll => {
  if (a == null) return b;
  if (b == null) return a;
  const ma = typeof a === 'number' ? a : a.clockMs;
  const mb = typeof b === 'number' ? b : b.clockMs;
  return mb < ma ? b : a;
};

/** A board polls while at least one of its games is live; with none live, it arms one fetch at its next kickoff. */
export function boardInterval(sb: EspnScoreboard, now = Date.now()): NextPoll {
  if (sb.events.some((e) => e.status.type.state === 'in')) return LIVE_MS;
  let next: NextPoll = null;
  for (const e of sb.events) {
    if (e.status.type.state !== 'pre') continue;
    next = sooner(next, untilKickoff(e.date, now, e.competitions?.[0]?.timeValid !== false));
  }
  return next;
}
