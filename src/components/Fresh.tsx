// The freshness pill: how old the data on screen is, and a tap to refetch.
import { agoText } from '../format';
import { useNow } from '../hooks/usePoll';

interface Props {
  live: boolean; // the content can change right now (a game is in progress)
  lastOk: number | null;
  polling: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function Fresh({ live, lastOk, polling, error, onRefresh }: Props) {
  const now = useNow(1000);
  const age = lastOk ? now - lastOk : Infinity;
  let cls = 'is-idle';
  let text = lastOk ? agoText(age) : 'loading';
  if ((live && polling) || error) {
    if (age >= 120_000) {
      cls = 'is-dead';
      text = 'tap to refresh';
    } else if (age >= 45_000) cls = 'is-stale';
    else if (age < 30_000) cls = 'is-live';
  }
  return (
    <button class={`fresh ${cls}`} onClick={onRefresh} title={error ?? (lastOk ? new Date(lastOk).toLocaleTimeString() : '')}>
      {cls === 'is-live' && <span class="fresh-dot" aria-hidden="true" />}
      {text}
    </button>
  );
}
