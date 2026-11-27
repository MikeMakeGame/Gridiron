// Reading each new game summary into the model, and what the freshness pill may claim from it. A summary that passes
// the shape check (./api `checkSummary`) can still break the model (a play row with no text, a drive with no start).
// The game on screen then stays the last one the model accepted, and the pill's age counts from THAT summary, not
// from the latest fetch: a fetch that couldn't be read is not fresh data. Pure, so it is tested without a page.
import type { EspnSummary } from './types';

export interface ModelRead<G> {
  /** The game on screen: built from the last summary the model accepted. */
  game: G | null;
  /** The summary that game was built from. */
  data: EspnSummary | null;
  /** When that summary was fetched. The pill's age counts from here. */
  acceptedAt: number | null;
  /** Set while the newest summary breaks the model: the error, and when the first unreadable one came in. The next
   *  summary that reads clears it. */
  problem: { message: string; since: number } | null;
}

export const NO_READ: ModelRead<never> = { game: null, data: null, acceptedAt: null, problem: null };

/**
 * The model's read of the newest summary. `at` is when it was fetched. Builds again when only `build` changed (the EP
 * table or the timeouts arrived) and the data is the same. Logs once per distinct error, not once per poll: a feed
 * that stays unreadable all game logs one line, and a new kind of failure logs again.
 */
export function readSummary<G>(
  prev: ModelRead<G>,
  data: EspnSummary | null,
  at: number | null,
  build: (s: EspnSummary) => G,
  warn: (msg: string, e: unknown) => void = console.warn,
): ModelRead<G> {
  if (!data || at == null) return prev;
  try {
    return { game: build(data), data, acceptedAt: at, problem: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (prev.problem?.message !== message) {
      const kept = prev.acceptedAt != null ? `keeping the game as of ${new Date(prev.acceptedAt).toLocaleTimeString()}` : 'nothing to show yet';
      warn(`Gridiron: can't read ESPN's latest game update (${message}); ${kept}`, e);
    }
    return { ...prev, problem: { message, since: prev.problem?.since ?? at } };
  }
}

export interface ReplayRead<G> {
  /** The game at the replay's cut, or at the latest cut before it that could be built; null when none could. */
  game: G | null;
  /** The cut `game` stands at (equal to the asked cut unless it is stuck). */
  upto: number;
  /** Set when the asked cut couldn't be built: the replay can't go past the play it shows. */
  problem: string | null;
}

/** What a replay has learned about one summary: the lowest cut known to fail. The caller keeps one per summary and
 *  starts a fresh one when the summary changes. */
export interface ReplayKnown {
  lowestFail: number | null;
}

/**
 * A replay's game at play `upto`. When that cut breaks the model, it never falls back to the full game (that would
 * show the final score mid-replay): it holds at the latest earlier cut it finds that builds, and says the replay
 * can't go past it. Logged, once per cut asked for.
 *
 * The search bisects between the best cut known to build (`last`, when it is below) and the lowest cut known to fail
 * (`upto`, or `known.lowestFail` when that is lower), so a far scrub costs about log2(plays) builds (8 for a 150-play
 * game), not one per play. A cut replays every earlier row, so a broken row fails every cut past it and the search
 * finds the play just before it. A failure in what only one cut computes (its last play, its live drive) needn't
 * be monotonic; then the search still returns a cut that builds and lies before `upto`, maybe not the nearest one,
 * and its cost stays bounded the same way.
 */
export function replayAt<G>(
  upto: number,
  build: (upto: number) => G,
  last: { upto: number; game: G } | null,
  warn: (msg: string, e: unknown) => void = console.warn,
  known: ReplayKnown = { lowestFail: null },
): ReplayRead<G> {
  try {
    return { game: build(upto), upto, problem: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    warn(`Gridiron: the replay can't build play ${upto} (${message}); it holds at the last play it can show`, e);
    let hi = Math.min(upto, known.lowestFail ?? upto); // known to fail
    let lo = 0; // known to build (0: nothing known yet)
    let good: G | null = null;
    if (last && last.upto < hi) {
      lo = last.upto;
      good = last.game;
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      try {
        good = build(mid);
        lo = mid;
      } catch {
        hi = mid; // the warning above already names the failure
      }
    }
    known.lowestFail = Math.min(known.lowestFail ?? hi, hi);
    return lo >= 1 && good ? { game: good, upto: lo, problem: message } : { game: null, upto, problem: message };
  }
}
