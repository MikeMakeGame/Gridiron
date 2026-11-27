// The freshness pill: how old the data on screen is, and a tap to refetch. What it says is ../fresh (`freshLook`).
import { useNow } from '../hooks/usePoll';
import { SNAPSHOT } from '../espn/api';
import { freshLook, type FreshInput } from '../fresh';

const SNAP_TIME = new Date(__BUILD_TIME__).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

interface Props extends FreshInput {
  onRefresh: () => void;
}

export function Fresh(props: Props) {
  // The offline snapshot never refetches; say when it was frozen instead of counting up.
  if (SNAPSHOT) return <span class="fresh is-idle" title="A frozen copy; the live version polls ESPN">snapshot · {SNAP_TIME}</span>;
  return <LiveFresh {...props} />;
}

function LiveFresh({ onRefresh, ...input }: Props) {
  const now = useNow(1000);
  const { cls, text, label } = freshLook(input, now);
  return (
    <button
      class={`fresh ${cls}`}
      onClick={onRefresh}
      title={input.unreadable ? "ESPN's latest update couldn't be read; the game shown is the last one that could. Tap to fetch again." : input.error ?? 'Tap to fetch again'}
      aria-label={label}
    >
      {cls === 'is-live' && <span class="fresh-dot" aria-hidden="true" />}
      {text}
    </button>
  );
}
