// A two-screen router: the scoreboard (this week, or a browsed one) or one game. State lives here first and in the
// URL hash second, because some embedding hosts don't let a framed page drive its own hash reliably.
// Hashes: "#/" this week, "#/w/2026-3-1" a browsed week, "#/g/401772876" a game.
import { useEffect, useState } from 'preact/hooks';
import type { WeekRef } from './espn/api';
import { parseWeekKey, weekKey } from './weeks';

function parse(hash: string): string | null {
  const m = hash.match(/^#\/g\/(\d+)/);
  return m ? m[1] : null;
}

function parseWeek(hash: string): WeekRef | undefined {
  const m = hash.match(/^#\/w\/([\d-]+)$/);
  return m ? parseWeekKey(m[1]) : undefined;
}

const boardHash = (w: WeekRef | undefined) => (w ? `#/w/${weekKey(w)}` : '#/');

let current: string | null = parse(location.hash);
let board: WeekRef | undefined = parseWeek(location.hash); // the week the scoreboard shows; kept while a game is open
const listeners = new Set<() => void>();

function setHash(want: string, replace: boolean): void {
  try {
    if (location.hash !== want) history[replace ? 'replaceState' : 'pushState'](null, '', want);
  } catch {
    // The frame refused; the in-memory route still moves.
  }
}

/** Open a game, or go back to the scoreboard (at the week it was showing). */
export function go(gameId: string | null): void {
  current = gameId;
  setHash(gameId ? `#/g/${gameId}` : boardHash(board), false);
  window.scrollTo(0, 0);
  listeners.forEach((f) => f());
}

/** The link back to the scoreboard, at the week it was showing. */
export function boardHref(): string {
  return boardHash(board);
}

/** The scoreboard moved to another week (undefined = this week): the link follows, without a history entry per tap. */
export function setBoardWeek(w: WeekRef | undefined): void {
  board = w;
  if (current == null) setHash(boardHash(w), true);
  listeners.forEach((f) => f());
}

const sync = () => {
  const next = parse(location.hash);
  const week = next == null ? parseWeek(location.hash) : board;
  if (next === current && boardHash(week) === boardHash(board)) return;
  current = next;
  board = week;
  listeners.forEach((f) => f());
};
window.addEventListener('popstate', sync);
window.addEventListener('hashchange', sync);

function useRouteTick(): void {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
}

/** The open game, or null for the scoreboard. */
export function useRoute(): string | null {
  useRouteTick();
  return current;
}

/** The week the scoreboard shows (undefined = this week). */
export function useBoardWeek(): WeekRef | undefined {
  useRouteTick();
  return board;
}

/** onClick for an <a> that should route in-page. */
export function linkTo(gameId: string | null) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(gameId);
  };
}
