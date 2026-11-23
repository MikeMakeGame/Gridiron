// Which league average the viewer compares against, remembered per browser. Without storage (a private window,
// blocked site data) the default shows and the switch still works for this visit.
import { useState } from 'preact/hooks';
import { BASELINE_KEY, effectiveBaseline, parseBaselinePick, type BaselineId, type Baselines } from '../stats/baselines';

let warned = false;
function warnOnce(what: string, e: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`Gridiron: the average switch can't be ${what} on this device; it lasts for this visit only`, e);
}

function load(): BaselineId | null {
  try {
    return parseBaselinePick(localStorage.getItem(BASELINE_KEY));
  } catch (e) {
    warnOnce('read', e);
    return null;
  }
}

/** The average in use (the pick, or the computed default) and a setter that remembers the pick. */
export function useBaseline(base: Baselines | null): [BaselineId, (id: BaselineId) => void] {
  const [picked, setPicked] = useState<BaselineId | null>(load);
  const id = base ? effectiveBaseline(base, picked) : (picked ?? 'last3');
  const pick = (next: BaselineId) => {
    setPicked(next);
    try {
      localStorage.setItem(BASELINE_KEY, next);
    } catch (e) {
      warnOnce('saved', e);
    }
  };
  return [id, pick];
}
