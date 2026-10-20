// The freshness pill: how old the data on screen is, and a tap to refetch.
import { agoText } from '../format';
import { useNow } from '../hooks/usePoll';
import { SNAPSHOT } from '../espn/api';

const SNAP_TIME = new Date(__BUILD_TIME__).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

interface Props {
  live: boolean; // the content can change right now (a game is in progress)
  lastOk: number | null;
  polling: boolean;
  error: string | null;
  retryAt?: number | null; // ESPN asked us to wait until then: count down instead of offering a tap that can't help
  onRefresh: () => void;
}

export function Fresh(props: Props) {
  // The offline snapshot never refetches; say when it was frozen instead of counting up.
  if (SNAPSHOT) return <span class="fresh is-idle" title="A frozen copy; the live version polls ESPN">snapshot · {SNAP_TIME}</span>;
  return <LiveFresh {...props} />;
}

function LiveFresh({ live, lastOk, polling, error, retryAt, onRefresh }: Props) {
  const now = useNow(1000);
  const age = lastOk ? now - lastOk : Infinity;
  let cls = 'is-idle';
  let text = lastOk ? agoText(age) : 'loading';
  const wait = retryAt ? retryAt - now : 0;
  if (wait > 0) {
    const s = Math.ceil(wait / 1000);
    cls = 'is-stale';
    text = `ESPN says wait ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  } else if ((live && polling) || error) {
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
