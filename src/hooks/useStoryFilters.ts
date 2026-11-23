// The Story tab's filter chips, remembered per browser. Without storage (a private window, blocked site data) the
// defaults show and the chips still work for this visit.
import { useState } from 'preact/hooks';
import { FILTER_KEY, parseFilters, serializeFilters, type MomentGroup } from '../stats/moments';

let warned = false;
function warnOnce(what: string, e: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`Gridiron: story filters can't be ${what} on this device; they last for this visit only`, e);
}

function load(): Set<MomentGroup> {
  try {
    return parseFilters(localStorage.getItem(FILTER_KEY));
  } catch (e) {
    warnOnce('read', e);
    return parseFilters(null);
  }
}

export function useStoryFilters(): [Set<MomentGroup>, (g: MomentGroup) => void] {
  const [on, setOn] = useState<Set<MomentGroup>>(load);
  const toggle = (g: MomentGroup) => {
    const next = new Set(on);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setOn(next);
    try {
      localStorage.setItem(FILTER_KEY, serializeFilters(next));
    } catch (e) {
      warnOnce('saved', e);
    }
  };
  return [on, toggle];
}
