// One game's feed: the game summary and the scoreboard for its day, on one lifecycle. Free of Preact and the DOM so it
// is tested with fake timers (test/feed.test.ts); ./useGameFeed is the Preact side.
//
// The summary leads. Its own data sets its schedule (../espn/cadence): before kickoff, one fetch armed at the kickoff
// time, then the live cadence; nothing after the final. The scoreboard carries what the summary lacks while a game is
// on (timeouts, and each new snap 10-20 s early), so it runs exactly while the summary says the game is live: it starts
// on the update that says the game is on, polls at the summary's cadence, and stops on the update that says it isn't.
// One refresh (the pill) refreshes both; a returning tab wakes both; stop() stops both.
import { Poller, waitMs, type NextPoll, type PollerDeps } from './poller';
import { BREAK_MS, gameInterval } from '../espn/cadence';
import type { EspnScoreboard, EspnSummary } from '../espn/types';

/** How long an unreadable summary keeps the feed retrying at BREAK_MS on its own before the data's schedule rules. */
export const UNREADABLE_RETRY_MS = 20 * 60_000;

/** `next`, or `ms` when that comes sooner (or `next` would stop). */
const soonerThan = (next: NextPoll, ms: number): NextPoll => {
  const w = waitMs(next);
  return w == null || w > ms ? ms : next;
};

export interface FeedSide<T> {
  data: T | null;
  error: string | null;
  lastOk: number | null; // when the data was fetched
  retryAt: number | null; // ESPN asked us to wait until then
  polling: boolean; // a next fetch is scheduled
  due: number | null; // when that next fetch is due (a kickoff fetch can be hours away)
}

export interface FeedState {
  summary: FeedSide<EspnSummary>;
  board: FeedSide<EspnScoreboard>;
}

const emptySide = <T,>(): FeedSide<T> => ({ data: null, error: null, lastOk: null, retryAt: null, polling: false, due: null });
export const NO_FEED: FeedState = { summary: emptySide(), board: emptySide() };

export interface GameFeedOptions {
  id: string;
  getSummary(id: string, signal: AbortSignal): Promise<EspnSummary>;
  /** The scoreboard for the calendar day of this kickoff. */
  getBoard(kickoff: string, signal: AbortSignal): Promise<EspnScoreboard>;
  /** false for the offline snapshot: one fetch of the summary, no schedule, no scoreboard. */
  polls: boolean;
  onChange(state: FeedState): void;
}

export class GameFeed {
  private state: FeedState = NO_FEED;
  private readonly summary: Poller<EspnSummary>;
  private board: Poller<EspnScoreboard> | null = null;
  private boardKickoff: string | null = null;
  /** The summary's live cadence, which the scoreboard follows; null while the game isn't on. */
  private liveMs: number | null = null;
  private stopped = false;
  private boardWarned: string | null = null;
  private unreadableSince: number | null = null;

  constructor(
    private readonly o: GameFeedOptions,
    private readonly d: PollerDeps,
  ) {
    this.summary = new Poller<EspnSummary>(
      {
        fetcher: (s) => o.getSummary(o.id, s),
        nextIn: (s) => {
          const next = this.plan(s);
          return this.retrying() ? soonerThan(next, BREAK_MS) : next;
        },
        onData: (s, at) => {
          this.patch('summary', { data: s, error: null, retryAt: null, lastOk: at });
          this.follow(s);
        },
        onError: (error, retryAt) => this.patch('summary', { error, retryAt }),
        onPolling: (polling) => this.patch('summary', { polling, due: polling ? this.summary.due : null }),
      },
      d,
    );
  }

  get current(): FeedState {
    return this.state;
  }

  start(): void {
    this.stopped = false;
    this.summary.start();
  }

  stop(): void {
    this.stopped = true;
    this.summary.stop();
    this.stopBoard();
  }

  /** The pill: fetch both now (each still honours ESPN's Retry-After). */
  refresh(): void {
    this.summary.refresh();
    this.board?.refresh();
  }

  /** Call on visibilitychange: a returning tab re-checks both on their schedule (at once, if a fetch fell due). */
  visibilityChanged(): void {
    this.summary.visibilityChanged();
    this.board?.visibilityChanged();
  }

  /**
   * The page's model couldn't read the newest summary (since `since`), or can again (null). While it can't, the summary
   * is fetched at least every BREAK_MS for UNREADABLE_RETRY_MS, even when the unreadable answer says the game is over
   * (or hasn't started): the data that says so is the data that can't be trusted. Then the schedule is the data's again.
   */
  setUnreadable(since: number | null): void {
    const was = this.unreadableSince;
    this.unreadableSince = since;
    if (!this.o.polls) return;
    if (this.retrying()) {
      this.summary.soon(BREAK_MS);
      return;
    }
    // Readable again: the schedule the retrying set (if it was the sooner one) goes back to what the data asks for.
    const data = this.state.summary.data;
    if (was != null && since == null && data) {
      const next = this.plan(data);
      const w = waitMs(next);
      if (w == null || w > BREAK_MS) this.summary.replan(next);
    }
  }

  /** The summary's own schedule (../espn/cadence), before any retrying. */
  private plan(s: EspnSummary): NextPoll {
    if (!this.o.polls) return null;
    const c = s.header.competitions[0];
    return gameInterval(c.status.type.state, c.status.type.name, c.date, this.d.now(), s.header.timeValid !== false && c.timeValid !== false);
  }

  /** Whether an unreadable summary still has the feed retrying on its own (the page says "still trying" only then). */
  retrying(): boolean {
    return this.unreadableSince != null && this.d.now() - this.unreadableSince < UNREADABLE_RETRY_MS;
  }

  // The scoreboard runs while the summary says the game is live, at the summary's cadence.
  private follow(s: EspnSummary): void {
    const c = s.header.competitions[0];
    const on = c.status.type.state === 'in';
    const ms = on && this.o.polls ? gameInterval('in', c.status.type.name) : null;
    this.liveMs = typeof ms === 'number' ? ms : null;
    if (this.liveMs != null) this.startBoard(c.date);
    else this.stopBoard();
  }

  private startBoard(kickoff: string): void {
    if (this.stopped || (this.board && this.boardKickoff === kickoff)) return;
    this.stopBoard();
    this.boardKickoff = kickoff;
    this.board = new Poller<EspnScoreboard>(
      {
        fetcher: (s) => this.o.getBoard(kickoff, s),
        nextIn: () => this.liveMs,
        onData: (b, at) => {
          this.boardWarned = null;
          this.patch('board', { data: b, error: null, retryAt: null, lastOk: at });
        },
        onError: (error, retryAt) => {
          // The summary's errors are on the pill; the scoreboard's would be invisible, so they're logged (once each).
          if (this.boardWarned !== error) console.warn(`Gridiron: the scoreboard feed for this game failed (${error}); timeouts and "just in" plays wait for it`);
          this.boardWarned = error;
          this.patch('board', { error, retryAt });
        },
        onPolling: (polling) => this.patch('board', { polling }),
      },
      this.d,
    );
    this.board.start();
  }

  private stopBoard(): void {
    if (!this.board) return;
    this.board.stop();
    this.board = null;
    this.boardKickoff = null;
    this.patch('board', { polling: false });
  }

  private patch<K extends keyof FeedState>(side: K, p: Partial<FeedState[K]>): void {
    this.state = { ...this.state, [side]: { ...this.state[side], ...p } };
    if (!this.stopped) this.o.onChange(this.state);
  }
}
