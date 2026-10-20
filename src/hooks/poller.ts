// The polling engine behind usePoll, free of Preact and the DOM so it can be tested with fake timers.
// Rules: one request at a time; every request times out; errors back off but never poll faster than the normal
// schedule; a server's Retry-After wins; hidden tabs don't poll; refresh() abandons a hung request.

export interface PollerDeps {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  hidden(): boolean;
  saveData(): boolean;
}

export interface PollerOptions<T> {
  fetcher(signal: AbortSignal): Promise<T>;
  /** ms until the next poll given fresh data; null = this data will never change (stop for good) */
  nextIn(data: T): number | null;
  onData(data: T, at: number): void;
  onError(message: string): void;
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
export const DEFAULT_TIMEOUT = 10_000;

export class Poller<T> {
  private timer: unknown = null;
  private inflight: AbortController | null = null;
  private fails = 0;
  private delay: number | null = null; // the current schedule's interval (null = stopped for good)
  private normal: number | null = null; // the last interval the data itself asked for
  private lastTry: number | null = null;
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

  /** Fetch now. A request that is still hanging is abandoned rather than waited on. */
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
    if (this.delay == null) return;
    const due = this.scaled(this.delay);
    const age = this.lastTry == null ? Infinity : this.d.now() - this.lastTry;
    if (age >= due) void this.run();
    else this.arm(due - age);
  }

  private scaled(ms: number): number {
    return ms * (this.d.saveData() ? 4 : 1);
  }

  private clear(): void {
    if (this.timer != null) this.d.clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(ms: number): void {
    this.clear();
    if (this.d.hidden()) {
      this.o.onPolling(false);
      return;
    }
    this.o.onPolling(true);
    this.timer = this.d.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private schedule(ms: number | null): void {
    this.delay = ms;
    if (ms == null) {
      this.clear();
      this.o.onPolling(false);
      return;
    }
    this.arm(this.scaled(ms));
  }

  private fail(e: unknown): void {
    this.o.onError(e instanceof Error ? e.message : String(e));
    // Never retry faster than the data's own schedule, and let the server's Retry-After win.
    const back = BACKOFF[Math.min(this.fails++, BACKOFF.length - 1)];
    const asked = e instanceof RetryAfterError ? e.retryAfterMs : 0;
    this.schedule(Math.max(back, this.normal ?? 0, asked));
  }

  private async run(): Promise<void> {
    if (this.stopped || this.inflight) return;
    const ac = new AbortController();
    this.inflight = ac;
    this.lastTry = this.d.now();
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
      this.normal = this.o.nextIn(data);
      this.o.onData(data, this.d.now());
      this.schedule(this.normal);
    } catch (e) {
      if (this.stopped || this.inflight !== ac) return;
      this.inflight = null;
      this.fail(e);
    } finally {
      this.d.clearTimeout(t);
    }
  }
}
