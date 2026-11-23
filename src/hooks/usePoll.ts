// Polite polling for Preact: one request at a time, a timeout on every request, paused while the tab is hidden,
// backs off on errors without ever beating the normal schedule. The engine is ./poller (tested on its own).
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Poller, type PollerDeps } from './poller';

export interface PollState<T> {
  data: T | null;
  error: string | null;
  lastOk: number | null; // ms timestamp of the last good response
  retryAt: number | null; // ESPN asked us to wait until then
  polling: boolean; // a next fetch is scheduled
  refresh: () => void;
}

const browserDeps: PollerDeps = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id as number),
  hidden: () => document.visibilityState === 'hidden',
  saveData: () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
};

/**
 * @param key      refetches from scratch when it changes
 * @param fetcher  the request; throw to report bad data (the last good data stays on screen)
 * @param nextIn   ms until the next poll given the latest data; null = it will never change, stop
 * @param enabled  false = don't poll yet (e.g. waiting on another request)
 */
export function usePoll<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  nextIn: (data: T) => number | null,
  enabled = true,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const poller = useRef<Poller<T> | null>(null);

  // Fresh refs every render so the poller always calls the current fetcher.
  const fetcherRef = useRef(fetcher);
  const nextInRef = useRef(nextIn);
  fetcherRef.current = fetcher;
  nextInRef.current = nextIn;

  useEffect(() => {
    setData(null);
    setError(null);
    setLastOk(null);
    setRetryAt(null);
    if (!enabled) return;
    const p = new Poller<T>(
      {
        fetcher: (s) => fetcherRef.current(s),
        nextIn: (d) => nextInRef.current(d),
        onData: (d, at) => {
          setData(d);
          setError(null);
          setRetryAt(null);
          setLastOk(at);
        },
        onError: (message, at) => {
          setError(message);
          setRetryAt(at);
        },
        onPolling: setPolling,
      },
      browserDeps,
    );
    poller.current = p;
    p.start();
    const onVis = () => p.visibilityChanged();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      p.stop();
      if (poller.current === p) poller.current = null;
    };
  }, [key, enabled]);

  const refresh = useCallback(() => poller.current?.refresh(), []);

  return { data, error, lastOk, retryAt, polling, refresh };
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

/** An element's border-box height, kept current (the sticky score bar's, so the Story tab's chart can pin under it).
 *  The rendered box, fractions included, so the pin sits flush under it. */
export function useHeight<E extends HTMLElement>(): [(el: E | null) => void, number] {
  const [h, setH] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: E | null) => {
    obs.current?.disconnect();
    if (!el) return;
    setH(el.getBoundingClientRect().height);
    obs.current = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    obs.current.observe(el);
  }, []);
  return [ref, h];
}

/** A short phone screen (700 px tall or less), decided once when the page loads. Not a live media query: on iOS the
 *  toolbar collapsing mid-scroll changes the height, which would flip the pinned chart's size under the reader. */
export const SHORT_SCREEN: boolean = typeof window !== 'undefined' && window.innerHeight > 0 && window.innerHeight <= 700;

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
