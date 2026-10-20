// A two-screen router: the scoreboard or one game. State lives here first and in the URL hash second,
// because some embedding hosts don't let a framed page drive its own hash reliably.
import { useEffect, useState } from 'preact/hooks';

function parse(hash: string): string | null {
  const m = hash.match(/^#\/g\/(\d+)/);
  return m ? m[1] : null;
}

let current: string | null = parse(location.hash);
const listeners = new Set<() => void>();

export function go(gameId: string | null): void {
  current = gameId;
  try {
    const want = gameId ? `#/g/${gameId}` : '#/';
    if (location.hash !== want) history.pushState(null, '', want);
  } catch {
    // The frame refused; the in-memory route still moves.
  }
  window.scrollTo(0, 0);
  listeners.forEach((f) => f());
}

const sync = () => {
  const next = parse(location.hash);
  if (next === current) return;
  current = next;
  listeners.forEach((f) => f());
};
window.addEventListener('popstate', sync);
window.addEventListener('hashchange', sync);

export function useRoute(): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return current;
}

/** onClick for an <a> that should route in-page. */
export function linkTo(gameId: string | null) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(gameId);
  };
}
