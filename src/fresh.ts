// What the freshness pill says and which state it wears, as a pure function of the feed (components/Fresh.tsx draws
// it). The age is the age of the data on screen: on a game page, from the last summary the model accepted.
import { ageText, agoText } from './format';

export type FreshClass = 'is-live' | 'is-stale' | 'is-dead' | 'is-idle';

export interface FreshInput {
  live: boolean; // the content can change right now (a game is in progress)
  lastOk: number | null; // when the data on screen was fetched
  polling: boolean;
  error: string | null;
  /** The newest data came in but couldn't be read: the pill says so in amber, and is never green. */
  unreadable?: boolean;
  retryAt?: number | null; // ESPN asked us to wait until then: count down instead of offering a tap that can't help
}

export interface FreshLook {
  cls: FreshClass;
  text: string;
  label: string; // the button's accessible name
}

/** A pending fetch this close counts as "still trying"; one further off (a kickoff hours away) is named by its time. */
export const SOON_MS = 10 * 60_000;

/** What the feed will do next, truthfully: fetch soon, fetch at a later time, or nothing until a tap. `due` is when the
 *  next fetch is armed for (null: none). */
export function nextCheckText(due: number | null, now: number): string {
  if (due == null) return 'Not checking again on its own; tap the pill to try.';
  if (due - now <= SOON_MS) return 'Still trying.';
  return `Next check at ${clock(due)}; tap the pill to try now.`;
}

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function freshLook({ live, lastOk, polling, error, unreadable, retryAt }: FreshInput, now: number): FreshLook {
  const has = lastOk != null;
  const age = has ? now - lastOk : Infinity;
  const label = `${unreadable ? "Can't read ESPN's latest update" : error ?? (has ? `Updated ${new Date(lastOk).toLocaleTimeString()}` : 'Loading')}. Fetch again.`;
  const wait = retryAt ? retryAt - now : 0;
  if (wait > 0) {
    const s = Math.ceil(wait / 1000);
    return { cls: 'is-stale', text: `ESPN says wait ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, label };
  }
  // A feed that answers but can't be read: amber, with how old the game on screen is.
  if (unreadable) return { cls: 'is-stale', text: has ? `can't read ESPN · ${ageText(age)}` : "can't read ESPN", label };
  // Unless a game is live, a ticking counter would be noise (before kickoff the next fetch is the one armed for the
  // kickoff; after the final there is none): say when it was fetched, and that a tap fetches again.
  let text = has ? `↻ ${clock(lastOk)}` : 'loading';
  if (live && polling) text = has ? agoText(age) : 'loading';
  let cls: FreshClass = 'is-idle';
  if ((live && polling) || error) {
    if (age >= 120_000) {
      cls = 'is-dead';
      text = 'tap to refresh';
    } else if (age >= 45_000) cls = 'is-stale';
    else if (age < 30_000) cls = 'is-live';
  }
  return { cls, text, label };
}
