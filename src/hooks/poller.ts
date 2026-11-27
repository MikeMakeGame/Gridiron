// The polling engine behind usePoll, free of Preact and the DOM so it can be tested with fake timers.
// Rules: one request at a time; every request times out; errors back off but never poll faster than the normal
// schedule; a server's Retry-After is a deadline nothing beats, refresh() and a returning tab included; hidden tabs
// don't poll; refresh() abandons a hung request. Times are absolute, so a tab coming back resumes on schedule.

export interface PollerDeps {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  hidden(): boolean;
  saveData(): boolean;
}

/**
 * A wait pinned to a time on the clock (a kickoff), as opposed to a cadence. It is never stretched by Data Saver (a
 * kickoff two hours off must not fire at eight), and never becomes the floor for retrying an error (one failed fetch
 * at kickoff must not wait for the next re-arm, hours later).
 */
export interface ClockWait {
  clockMs: number;
}

/** When to poll next: a cadence in ms, a clock-pinned wait, or null for "this data will never change, stop". */
export type NextPoll = number | ClockWait | null;

export const clockWait = (ms: number): ClockWait => ({ clockMs: ms });

/** The ms a NextPoll waits, unscaled (null for stop). */
export const waitMs = (n: NextPoll): number | null => (n == null ? null : typeof n === 'number' ? n : n.clockMs);

export interface PollerOptions<T> {
  fetcher(signal: AbortSignal): Promise<T>;
  /** when to poll next given fresh data (see NextPoll) */
  nextIn(data: T): NextPoll;
  onData(data: T, at: number): void;
  /** retryAt: when ESPN said we may ask again (null when it didn't), so the page can show the wait. */
  onError(message: string, retryAt: number | null): void;
  onPolling(polling: boolean): void;
  timeoutMs?: number;
}

/** An error a fetcher can throw to ask for a specific wait (HTTP 429 / Retry-After). */
export class RetryAfterError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
  }
}

export const BACKOFF = [15_000, 30_000, 60_000, 120_000, 300_000];
/** Data Saver stretches every cadence and every retry (live, a delayed kickoff, the error backoff, an unreadable
 *  summary's retries) by this much; never a clock-pinned wait (a kickoff). */
export const DATA_SAVER_FACTOR = 4;
export const DEFAULT_TIMEOUT = 10_000;
/** The longest wait we honor. Retry-After is untrusted, and timers wrap past ~24.8 days into firing at once. */
export const MAX_WAIT = 3_600_000;

/** An explicit Retry-After (seconds, or an HTTP date) in ms, between 0 and MAX_WAIT; null when it's missing or
 *  unreadable. "Retry-After: 0" (or a date already past) is 0: ask again on the normal schedule, not after a wait. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (header == null) return null;
  const h = header.trim();
  const secs = /^\d+$/.test(h) ? Number(h) : (Date.parse(h) - now) / 1000;
  if (!Number.isFinite(secs)) return null;
  return Math.min(Math.max(secs * 1000, 0), MAX_WAIT);
}

/** The wait a 429 without a readable Retry-After gets: a 429 always means "slow down". */
export const SLOW_DOWN_MS = 300_000;

/** Retry-After in ms, as `retryAfterMs`; SLOW_DOWN_MS when it's missing or unreadable. */
export function parseRetryAfter(header: string | null, now: number): number {
  return retryAfterMs(header, now) ?? SLOW_DOWN_MS;
}

export class Poller<T> {
  private timer: unknown = null;
  private inflight: AbortController | null = null;
  private fails = 0;
  private delay: number | null = null; // the current schedule's interval (null = stopped for good)
  private normal: number | null = null; // the last interval the data itself asked for
  private nextAt: number | null = null; // when the next poll is due
  private notBefore = 0; // no request before this time: the server's Retry-After
  private stopped = false;

  constructor(
    private readonly o: PollerOptions<T>,
    private readonly d: PollerDeps,
  ) {}

  start(): void {
    this.stopped = false;
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.clear();
    this.inflight?.abort();
    this.inflight = null;
  }

  /** Fetch now (or at the Retry-After deadline, if one is pending). A hanging request is abandoned, not waited on. */
  refresh(): void {
    if (this.stopped) return;
    this.inflight?.abort();
    this.inflight = null;
    this.clear();
    void this.run();
  }

  /** Call on visibilitychange. */
  visibilityChanged(): void {
    if (this.stopped) return;
    if (this.d.hidden()) {
      this.clear();
      this.o.onPolling(false);
      return;
    }
    if (this.delay == null || this.nextAt == null || this.inflight) return;
    const wait = Math.max(this.nextAt, this.notBefore) - this.d.now();
    if (wait <= 0) void this.run();
    else this.arm(wait);
  }

  /** When the next fetch is due, while one is armed (null while stopped, hidden or a request is out). */
  get due(): number | null {
    return this.timer != null ? this.nextAt : null;
  }

  private scaled(ms: number): number {
    return ms * (this.d.saveData() ? DATA_SAVER_FACTOR : 1);
  }

  private clear(): void {
    if (this.timer != null) this.d.clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(ms: number): void {
    this.nextAt = this.d.now() + ms;
    this.clear();
    if (this.d.hidden()) {
      this.o.onPolling(false);
      return;
    }
    this.timer = this.d.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
    this.o.onPolling(true); // after the timer is set, so `due` reads it
  }

  // A cadence is stretched by Data Saver; a clock-pinned wait is not.
  private schedule(next: NextPoll): void {
    this.delay = waitMs(next);
    if (next == null) {
      this.clear();
      this.o.onPolling(false);
      return;
    }
    this.arm(typeof next === 'number' ? this.scaled(next) : next.clockMs);
  }

  /**
   * Make sure a fetch comes within `ms` (Retry-After still holds), even when the data said to stop or to wait longer.
   * For a caller that knows more than the data: the game feed, when the newest summary couldn't be read.
   */
  soon(ms: number): void {
    if (this.stopped || this.inflight) return;
    const now = this.d.now();
    if (this.delay != null && this.nextAt != null && this.nextAt <= now + ms) return;
    this.delay = ms;
    this.arm(Math.max(this.scaled(ms), this.notBefore - now));
  }

  /** Replace the pending schedule with `next`, counted from now (the counterpart of `soon`, for when the reason for
   *  polling sooner has gone). No effect while a request is out: its answer sets the schedule. */
  replan(next: NextPoll): void {
    if (this.stopped || this.inflight) return;
    this.schedule(next);
  }

  private fail(e: unknown): void {
    // Never retry faster than the data's own cadence, and let the server's Retry-After win. A clock-pinned wait (a
    // kickoff) is no cadence: `normal` is null then, so a failure at kickoff retries on the backoff.
    const back = BACKOFF[Math.min(this.fails++, BACKOFF.length - 1)];
    const asked = e instanceof RetryAfterError ? Math.min(e.retryAfterMs, MAX_WAIT) : 0;
    const now = this.d.now();
    this.notBefore = Math.max(this.notBefore, now + asked);
    this.o.onError(e instanceof Error ? e.message : String(e), this.notBefore > now ? this.notBefore : null);
    this.schedule(Math.max(back, this.normal ?? 0, asked));
  }

  private async run(): Promise<void> {
    if (this.stopped || this.inflight) return;
    // Every path into a request (timer, refresh, a returning tab) passes here, so the deadline holds for all of them.
    const early = this.notBefore - this.d.now();
    if (early > 0) return this.arm(early);
    const ac = new AbortController();
    this.inflight = ac;
    // The timeout abandons the request itself, so even a fetch that never settles can't stall the schedule.
    const t = this.d.setTimeout(() => {
      if (this.inflight !== ac) return;
      this.inflight = null;
      ac.abort();
      if (!this.stopped) this.fail(new Error('ESPN took too long to answer'));
    }, this.o.timeoutMs ?? DEFAULT_TIMEOUT);
    try {
      const data = await this.o.fetcher(ac.signal);
      if (this.stopped || this.inflight !== ac) return; // timed out, refreshed or stopped meanwhile
      this.inflight = null;
      this.fails = 0;
      const next = this.o.nextIn(data);
      this.normal = typeof next === 'number' ? next : null;
      this.o.onData(data, this.d.now());
      this.schedule(next);
    } catch (e) {
      if (this.stopped || this.inflight !== ac) return;
      this.inflight = null;
      this.fail(e);
    } finally {
      this.d.clearTimeout(t);
    }
  }
}
