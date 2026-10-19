// Polite polling: one request at a time, paused while the tab is hidden, backs off on errors.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export interface PollState<T> {
  data: T | null;
  error: string | null;
  lastOk: number | null; // ms timestamp of the last good response
  polling: boolean; // a next fetch is scheduled
  refresh: () => void;
}

const BACKOFF = [15_000, 30_000, 60_000];

function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}

/**
 * @param key      refetches from scratch when it changes
 * @param fetcher  the request
 * @param nextIn   ms until the next poll given the latest data; null stops polling
 */
export function usePoll<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  nextIn: (data: T) => number | null,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const inflight = useRef<AbortController | null>(null);
  const fails = useRef(0);
  const delay = useRef<number | null>(null);
  const lastOkRef = useRef<number | null>(null);
  const lastTry = useRef<number | null>(null);
  const run = useRef<() => void>(() => {});

  // Fresh refs every render so the scheduler always calls the current fetcher.
  const fetcherRef = useRef(fetcher);
  const nextInRef = useRef(nextIn);
  fetcherRef.current = fetcher;
  nextInRef.current = nextIn;

  const schedule = (ms: number | null) => {
    window.clearTimeout(timer.current);
    delay.current = ms;
    if (ms == null || document.visibilityState === 'hidden') {
      setPolling(false);
      return;
    }
    setPolling(true);
    timer.current = window.setTimeout(() => run.current(), ms * (saveData() ? 4 : 1));
  };

  run.current = async () => {
    if (inflight.current) return;
    lastTry.current = Date.now();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const d = await fetcherRef.current(ac.signal);
      if (ac.signal.aborted) return;
      fails.current = 0;
      const now = Date.now();
      lastOkRef.current = now;
      setData(d);
      setError(null);
      setLastOk(now);
      schedule(nextInRef.current(d));
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      schedule(BACKOFF[Math.min(fails.current++, BACKOFF.length - 1)]);
    } finally {
      if (inflight.current === ac) inflight.current = null;
    }
  };

  useEffect(() => {
    setData(null);
    setError(null);
    setLastOk(null);
    lastOkRef.current = null;
    lastTry.current = null;
    fails.current = 0;
    run.current();
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(timer.current);
        setPolling(false);
        return;
      }
      // Back from the background: fetch now if a poll was due, else resume the schedule.
      // Measured from the last attempt, so a run of errors keeps its backoff across tab switches.
      const due = delay.current == null ? null : delay.current * (saveData() ? 4 : 1);
      const age = lastTry.current ? Date.now() - lastTry.current : Infinity;
      if (due != null && age >= due) run.current();
      else if (due != null) schedule((due - age) / (saveData() ? 4 : 1));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearTimeout(timer.current);
      inflight.current?.abort();
      inflight.current = null;
    };
  }, [key]);

  const refresh = useCallback(() => {
    window.clearTimeout(timer.current);
    run.current();
  }, []);

  return { data, error, lastOk, polling, refresh };
}

/** A clock that ticks every `ms` while mounted, for "7s ago" labels. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Element width, kept current, for charts drawn in real pixels. */
export function useWidth<E extends HTMLElement>(): [(el: E | null) => void, number] {
  const [w, setW] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: E | null) => {
    obs.current?.disconnect();
    if (!el) return;
    setW(el.clientWidth);
    obs.current = new ResizeObserver((es) => setW(Math.round(es[0].contentRect.width)));
    obs.current.observe(el);
  }, []);
  return [ref, w];
}
