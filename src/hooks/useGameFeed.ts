// One game's feed for Preact: the summary and the scoreboard on one lifecycle (the engine and its rules are ./feed).
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getScoreboardForDay, getSummary, SNAPSHOT } from '../espn/api';
import { GameFeed, NO_FEED, type FeedState } from './feed';
import { browserDeps } from './usePoll';

export interface GameFeedState extends FeedState {
  /** The pill: fetch the summary and the scoreboard now. */
  refresh: () => void;
  /** The page's model can't read the newest summary since this time, or can again (null): ./feed `setUnreadable`. */
  setUnreadable: (since: number | null) => void;
}

export function useGameFeed(id: string): GameFeedState {
  const [state, setState] = useState<FeedState>(NO_FEED);
  const feed = useRef<GameFeed | null>(null);

  useEffect(() => {
    setState(NO_FEED);
    const f = new GameFeed(
      { id, getSummary: (gid, s) => getSummary(gid, s), getBoard: (kickoff, s) => getScoreboardForDay(kickoff, s), polls: !SNAPSHOT, onChange: setState },
      browserDeps,
    );
    feed.current = f;
    f.start();
    const onVis = () => f.visibilityChanged();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      f.stop();
      if (feed.current === f) feed.current = null;
    };
  }, [id]);

  const refresh = useCallback(() => feed.current?.refresh(), []);
  const setUnreadable = useCallback((since: number | null) => feed.current?.setUnreadable(since), []);
  return { ...state, refresh, setUnreadable };
}
