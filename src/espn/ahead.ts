// A snap the scoreboard already has and the game summary doesn't yet: shown on top of the game page, labelled "just in",
// until the summary catches up. The scoreboard posts each new snap 10-20 s before the summary (measured on MNF 10-19),
// and play ids match across the two feeds. A snap the summary never posts (a reversed play) stops showing 90 s after
// it was first seen. Scores and kickoffs count too (the down is unset right after them). Pure, so it is tested
// without a page (test/glue.test.ts).
import type { Game } from './model';
import type { EspnEvent } from './types';

/** How long a scoreboard snap the summary never posts keeps showing. */
export const AHEAD_MAX_MS = 90_000;

export interface Ahead {
  text: string;
  /** "3rd & 4 · SF 38", or '' after a score or before a kickoff (no situation rather than a stale one). */
  situation: string;
  redZone: boolean;
  possession: string | null;
  /** The spot for the field, the offense's yards to go (the shape components/Field's Spot takes). */
  spot: { offenseId: string; ytg: number; down: number; distance: number } | null;
  wpHome: number | null;
  /** The scoreboard's score, so a just-in touchdown and the score bar agree (NaN when it sent none). */
  home: number;
  away: number;
}

/** The scoreboard snap being shown and when it was first seen (the 90 s clock). */
export interface AheadSeen {
  id: string;
  at: number;
}

const NOT_A_SNAP = /timeout|end of|end period|two-minute|coin toss/i;

/**
 * The just-in snap for game `g` from its scoreboard event `ev`, at time `now`. `seen` is the previous call's, so the
 * 90 s clock runs from when a snap was first seen; pass back the returned one next time. Nothing during a replay, or
 * unless the game is live.
 */
export function mergeAhead(
  g: Game | null,
  ev: EspnEvent | undefined,
  now: number,
  seen: AheadSeen | null,
  replaying = false,
): { ahead: Ahead | null; seen: AheadSeen | null } {
  const c = ev?.competitions[0];
  const sit = c?.situation;
  const lp = sit?.lastPlay;
  if (!g || replaying || g.state !== 'in' || !sit || !lp?.id) return { ahead: null, seen };
  if (NOT_A_SNAP.test(`${lp.type?.text ?? ''} ${lp.text ?? ''}`)) return { ahead: null, seen };
  if (g.plays.some((p) => p.id === lp.id)) return { ahead: null, seen }; // the summary has caught up
  const first = seen?.id === lp.id ? seen : { id: lp.id, at: now };
  if (now - first.at > AHEAD_MAX_MS) return { ahead: null, seen: first };
  const scoreOf = (side: 'home' | 'away') => Number(c?.competitors.find((x) => x.homeAway === side)?.score ?? NaN);
  const hasSnap = (sit.down ?? 0) > 0;
  return {
    seen: first,
    ahead: {
      text: lp.text ?? '',
      situation: hasSnap ? [sit.shortDownDistanceText, sit.possessionText].filter(Boolean).join(' · ') : '',
      redZone: hasSnap && !!sit.isRedZone,
      possession: sit.possession ?? null,
      // The scoreboard's yard line counts from the home goal line.
      spot:
        hasSnap && sit.possession && sit.yardLine != null
          ? { offenseId: sit.possession, ytg: sit.possession === g.home.id ? 100 - sit.yardLine : sit.yardLine, down: sit.down ?? 0, distance: sit.distance ?? 0 }
          : null,
      wpHome: lp.probability?.homeWinPercentage ?? null,
      home: scoreOf('home'),
      away: scoreOf('away'),
    },
  };
}
