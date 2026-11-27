// One game, in five tabs under a sticky score bar: Live (the field, the situation, the last play), Story (win
// probability with its key plays marked, then the drives), Standouts (the best and roughest players), Stats (head
// to head, against the league average) and Players (the position compare, then the box score).
// A bottom dock holds back and the game's one action.
import type { ComponentChildren } from 'preact';
import { useEffect, useErrorBoundary, useMemo, useRef, useState } from 'preact/hooks';
import { getBaselines, getEpTable } from '../espn/api';
import { matchClips } from '../espn/clips';
import { buildGame, firstSnap, periodLabel, type Game, type Play, type TeamInfo } from '../espn/model';
import { NO_READ, readSummary, replayAt, type ModelRead, type ReplayKnown } from '../espn/read';
import type { EspnSummary } from '../espn/types';
import { mergeAhead, type AheadSeen } from '../espn/ahead';
import { DELAYED_MS, kickoffWait, KICKOFF_WINDOW_MS, PRE_MAX_WAIT_MS } from '../espn/cadence';
import { DATA_SAVER_FACTOR } from '../hooks/poller';
import { nextCheckText } from '../fresh';
import { biggestPlays, possessionsLeft } from '../stats/live';
import { dividers, groupCounts, moments, storyRows, visibleMoments, type Moment, type StoryRow } from '../stats/moments';
import { useStoryFilters } from '../hooks/useStoryFilters';
import { useBaseline } from '../hooks/useBaseline';
import type { Baselines } from '../stats/baselines';
import { BaselineSwitch } from './Baseline';
import { Standouts } from './Standouts';
import { Fold } from './Fold';
import { compareRows, edge, type CompareRow } from '../stats/teamstats';
import type { EpTable } from '../stats/ep';
import { agoText, fillClass, smallLogo, teamVars, wpText } from '../format';
import { browserDeps, isShortScreen, pinFits, useHeight, useNow, useScreenHeight } from '../hooks/usePoll';
import { useGameFeed } from '../hooks/useGameFeed';
import { Fresh } from './Fresh';
import { Logo } from './Logo';
import { boardHref, go, linkTo, useBoardWeek } from '../route';
import { useKeys } from '../hooks/useKeys';
import { weekLabel, weekStops } from '../weeks';
import { WpChart } from './WpChart';
import { Drives } from './Drives';
import { Numbers } from './Numbers';
import { Players } from './Players';
import { Advanced } from './Advanced';
import { WpDelta } from './Badges';
import { Field, type Spot } from './Field';
import { Compare, TeamStats, type AvgCtx } from './TeamStats';
import { ClipThumb, KeyPlays, StoryFilters } from './KeyPlays';
import { Icon } from './Icons';
import { Footer } from './Scoreboard';

type Tab = 'now' | 'story' | 'standouts' | 'stats' | 'players';
const TABS: Tab[] = ['now', 'story', 'standouts', 'stats', 'players'];

const loggedFailures = new Set<string>();

/** Logs a failure once per thing and message (a feed that keeps sending the same broken data logs one line), and
 *  returns the message. */
function logOnce(what: string, e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const k = `${what}\n${message}`;
  if (!loggedFailures.has(k)) {
    loggedFailures.add(k);
    console.error(`Gridiron: couldn't ${what} (${message}); it is left out until the data reads`, e);
  }
  return message;
}

/** `fn()`, or `empty` (logged once) when it throws: for a derived part of the page that must not take the page down. */
function attempt<T>(what: string, fn: () => T, empty: T): T {
  try {
    return fn();
  } catch (e) {
    logOnce(what, e);
    return empty;
  }
}

// The tab lives in the link (#/g/<id>/stats), so a reload or a shared link opens where it was.
function tabFromHash(): Tab | null {
  const m = location.hash.match(/^#\/g\/\d+\/(\w+)/);
  return m && (TABS as string[]).includes(m[1]) ? (m[1] as Tab) : null;
}

export function GamePage({ id }: { id: string }) {
  // The game summary and the scoreboard for its day, on one lifecycle (../hooks/feed): the scoreboard carries the
  // timeouts and posts each new snap 10-20 s before the summary does (measured on MNF 10-19), so it runs while the
  // game is live; before kickoff one fetch is armed at the kickoff time; one pill tap refreshes both.
  const feed = useGameFeed(id);
  const poll = feed.summary;
  const sb = feed.board;
  const sbEvent = sb.data?.events.find((e) => e.id === id);
  const sbSit = sbEvent?.competitions[0].situation;
  const timeouts = useMemo(
    () => (sbSit ? { home: sbSit.homeTimeouts ?? null, away: sbSit.awayTimeouts ?? null } : undefined),
    [sbSit?.homeTimeouts, sbSit?.awayTimeouts],
  );
  const [ep, setEp] = useState<EpTable | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [picked, setTab] = useState<Tab | null>(tabFromHash);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, toggleFilter] = useStoryFilters();
  // The score bar's height, so the Story tab's chart pins just under it.
  const [headRef, headH] = useHeight<HTMLDivElement>();
  // A short screen shrinks the pinned chart; a screen where the score bar plus the pin would take too much of
  // the height (a phone turned to landscape) unpins it. Both re-decided on a rotation, never mid-scroll.
  const screenH = useScreenHeight();
  const short = isShortScreen(screenH);
  const [pinRef, pinH] = useHeight<HTMLDivElement>();
  const pinned = pinFits(headH, pinH, screenH);
  // League averages for the Stats and Players tabs, and the standouts' weights; optional like the EP table.
  const [base, setBase] = useState<Baselines | null>(null);
  const [baseId, pickBase] = useBaseline(base);

  useEffect(() => {
    getEpTable().then(setEp);
    getBaselines().then(setBase);
  }, []);

  // A link to another tab of this same game (typed, or pasted) switches the tab.
  useEffect(() => {
    const f = () => {
      const t = tabFromHash();
      if (t) setTab(t);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  // A payload that passes the shape check but still breaks the model keeps the last good game on screen, and the pill
  // counts its age from that game's fetch (../espn/read).
  const readRef = useRef<ModelRead<Game>>(NO_READ);
  const read = useMemo(
    () => (readRef.current = readSummary(readRef.current, poll.data, poll.lastOk, (d) => buildGame(d, { ep, timeouts }))),
    [poll.data, poll.lastOk, ep, timeouts],
  );
  const full = read.game;
  // While the newest summary can't be read, the feed keeps fetching it for a while whatever it says (../hooks/feed).
  const unreadableSince = read.problem?.since ?? null;
  useEffect(() => feed.setUnreadable(unreadableSince), [unreadableSince]);
  // A replay's cut that breaks the model holds at the last play it can show, says so, and never shows the full game
  // (../espn/read `replayAt`).
  const lastReplay = useRef<{ upto: number; game: Game } | null>(null);
  // The lowest cut known to fail, for the summary and EP table it was learned on.
  const replayKnown = useRef<{ data: EspnSummary | null; ep: EpTable | null; known: ReplayKnown }>({ data: null, ep: null, known: { lowestFail: null } });
  const rp = useMemo(() => {
    const data = read.data;
    if (!data || replay == null) {
      lastReplay.current = null;
      return null;
    }
    if (replayKnown.current.data !== data || replayKnown.current.ep !== ep) {
      replayKnown.current = { data, ep, known: { lowestFail: null } };
      lastReplay.current = null;
    }
    const r = replayAt(replay, (k) => buildGame(data, { ep, upto: k }), lastReplay.current, undefined, replayKnown.current.known);
    if (r.game) lastReplay.current = { upto: r.upto, game: r.game };
    return r;
  }, [read.data, ep, replay]);
  const g = rp ? rp.game : full;
  const replayStuck = !!rp?.problem;
  const shownCut = rp?.upto ?? replay;

  useEffect(() => {
    // A game opens at its top, not at wherever the scoreboard was scrolled to.
    window.scrollTo(0, 0);
  }, [id]);

  // A snap the scoreboard already has and the summary doesn't yet, shown on top as "just in" (../espn/ahead).
  const aheadSeen = useRef<AheadSeen | null>(null);
  const ahead = useMemo(() => {
    const r = attempt("read the scoreboard's just-in play", () => mergeAhead(g, sbEvent, Date.now(), aheadSeen.current, replay != null), {
      ahead: null,
      seen: aheadSeen.current,
    });
    aheadSeen.current = r.seen;
    return r.ahead;
  }, [sbEvent, g, replay]);

  // Plays that arrived since the last poll get a one-shot highlight (never on first load or in replay scrubbing).
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const out = new Set<string>();
    if (!g) return out;
    if (seen.current && replay == null) for (const p of g.plays) if (!seen.current.has(p.id)) out.add(p.id);
    if (replay == null) seen.current = new Set(g.plays.map((p) => p.id));
    return out;
  }, [g, replay]);

  // Keys: Esc goes back to the games; in a replay the arrows step one play.
  const stepReplay = (d: number) => {
    if (replay == null || !full) return;
    setPlaying(false);
    setReplay(Math.min(full.plays.length, Math.max(1, replay + d)));
  };
  useKeys({
    Escape: () => (replay != null ? (setReplay(null), setPlaying(false)) : go(null)),
    ArrowLeft: () => stepReplay(-1),
    ArrowRight: () => stepReplay(1),
  });

  // Replay auto-advance: one play every 1.2s.
  useEffect(() => {
    if (!playing || replay == null || !full) return;
    // A cut that can't be built stops the playback there; the arrows and the slider can still step past it.
    if (replay >= full.plays.length || replayStuck) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setReplay(replay + 1), 1200);
    return () => window.clearTimeout(t);
  }, [playing, replay, full, replayStuck]);

  useEffect(() => {
    if (g) document.title = `${g.away.abbr} ${g.away.score} – ${g.home.abbr} ${g.home.score} · Gridiron`;
  }, [g?.away.score, g?.home.score, g?.id]);
  // Leaving the game puts the plain title back, so the scoreboard's tab doesn't show a stale score.
  useEffect(
    () => () => {
      document.title = 'Gridiron';
    },
    [],
  );

  // Highlight clips pinned to their plays, and the plays that earn a marker. In a replay, only what has happened.
  // Matched against the whole game, so a replay's cut can't hand a later clip to an earlier play; then only the
  // plays the replay has reached keep theirs.
  const allClips = useMemo(
    () => attempt("pin ESPN's clips to their plays", () => matchClips(read.data?.videos, full?.plays ?? []), { byPlay: new Map(), game: [] }),
    [read.data, full],
  );
  const clips = useMemo(() => {
    if (!g || g === full) return allClips;
    const reached = new Set(g.plays.map((p) => p.id));
    return { ...allClips, byPlay: new Map([...allClips.byPlay].filter(([id]) => reached.has(id))) };
  }, [allClips, g, full]);
  const clipIds = useMemo(() => new Set(clips.byPlay.keys()), [clips]);
  // Every event in the story, then the ones the chips leave on (the chart's rail and the list both show those).
  // The story is read here, outside the Story tab (the tab's dot needs it too), so a play text that breaks it is caught
  // here: logged, and said in the Story tab, while every other tab carries on.
  // The chips, the dividers and the list are read in the same guard.
  const { events, marks, counts, rows, storyProblem } = useMemo(() => {
    const none = { events: [] as Moment[], marks: [] as Moment[], counts: groupCounts([]), rows: [] as StoryRow[], storyProblem: null as string | null };
    if (!g) return none;
    try {
      const events = moments(g, clipIds);
      const marks = visibleMoments(events, filters);
      return { events, marks, counts: groupCounts(events), rows: storyRows(marks, dividers(g), g.state !== 'post'), storyProblem: null };
    } catch (e) {
      return { ...none, storyProblem: logOnce("read the game's story from ESPN's play text", e) };
    }
  }, [g, clipIds, filters]);

  // Live opens on the field; a final opens on its story. A dot on Story when a key play lands while it's out of view.
  // The opening tab is decided once, when the game first loads: a game going final, or a replay, never moves the reader.
  // Before kickoff only the first tab has anything behind it, whatever the link says.
  const opened = useRef<Tab | null>(null);
  if (g && !opened.current) opened.current = g.state === 'post' ? 'story' : 'now';
  const tab: Tab = g?.state === 'pre' ? 'now' : picked ?? opened.current ?? 'now';
  const seenMarks = useRef<number | null>(null);
  if (g && (seenMarks.current == null || tab === 'story')) seenMarks.current = marks.length;
  // No dot during a replay: every step there "lands" a play, and the reader is driving it.
  const storyNews = replay == null && tab !== 'story' && seenMarks.current != null && marks.length > seenMarks.current;
  const pickTab = (t: Tab) => {
    setTab(t);
    try {
      history.replaceState(null, '', `#/g/${id}/${t}`);
    } catch {
      // The frame refused; the tab still changes.
    }
    window.scrollTo(0, 0);
  };

  const live = g?.state === 'in';
  const pill = (
    <Fresh
      live={live}
      lastOk={read.acceptedAt}
      polling={poll.polling}
      error={poll.error}
      unreadable={!!read.problem}
      retryAt={poll.retryAt}
      onRefresh={feed.refresh}
    />
  );

  if (!g) {
    if (replay != null) {
      // Not even the replay's first play could be built: say so, with the way out where the replay's bar was.
      return (
        <div class="app view-game">
          <p class="error">The replay can't start: ESPN's data for this game's first plays doesn't read.</p>
          <Dock
            replay={
              <div class="replay">
                <button class="replay-exit" onClick={() => (setReplay(null), setPlaying(false))}>
                  Exit
                </button>
              </div>
            }
          />
        </div>
      );
    }
    return (
      <div class="app view-game">
        {read.problem ? (
          <p class="error">
            ESPN sent this game in a shape Gridiron can't read yet. <NextCheck due={poll.polling ? poll.due : null} />
          </p>
        ) : poll.error ? (
          <p class="error">Couldn't load the game: {poll.error}</p>
        ) : (
          <p class="empty">Loading…</p>
        )}
        <Dock>{pill}</Dock>
      </div>
    );
  }

  // Everything below reads the game, so it is built inside the page's own boundary: a throw there shows a way out and
  // the pill instead of unmounting the page, and the feed above keeps polling.
  const view: Game = g;
  return (
    <Guard
      name="game page"
      retryKey={read.acceptedAt}
      polling={poll.polling}
      fallback={(retry, willRetry) => (
        <div class="app view-game">
          <p class="error">Something in ESPN's data broke this game's page.{willRetry ? ' It tries once more when a newer update reads.' : ''}</p>
          <p class="empty">
            <button class="week-next" onClick={retry}>
              Try again
            </button>
          </p>
          <Dock>{pill}</Dock>
        </div>
      )}
    >
      {() => {
        const g = view;
        const canReplay = full?.state === 'post' && full.plays.length > 0;
        const poss = ahead?.possession ?? g.situation?.possessionId;
        const lastSnap = [...g.plays].reverse().find((p) => p.kind !== 'kick' || g.plays.length < 3) ?? g.lastPlay;
        const pivot = g.state === 'post' && !g.truncated ? biggestPlays(g, 1)[0] ?? null : null;
        const headline = pivot ?? lastSnap;
        const headClip = headline && !ahead ? clips.byPlay.get(headline.id) : undefined;
        const possLeft = possessionsLeft(g);
        const sit = g.situation;
        const spot: Spot | null = ahead
          ? ahead.spot
          : sit && sit.ytg != null && sit.down > 0
            ? { offenseId: sit.possessionId, ytg: sit.ytg, down: sit.down, distance: sit.distance }
            : null;
        const sitText = ahead ? ahead.situation : sit?.text;
        const redZone = ahead ? ahead.redZone : !!sit?.redZone;
        const giveaways = turnoverCounts(g);
        const won = results(g);
        // Totals are compared with the average only once the game is over (a replay's cut is mid-game).
        const avg: AvgCtx = { base, id: baseId, final: g.state === 'post' && !g.truncated };

        return (
          <div class={`app view-game${short ? ' is-short' : ''}${pinned ? '' : ' is-unpinned'}`} style={headH ? { '--head-h': `${headH}px` } : undefined}>
            <div class="game-head" ref={headRef}>
              <header class="scorebar">
                <TeamCell t={withScore(g.away, ahead?.away)} poss={poss === g.away.id} tos={sit?.awayTimeouts ?? null} giveaways={giveaways.away} pre={g.state === 'pre'} result={won.away} />
                <div class="sbar-mid">
                  <div class="clock">
                    {live && <Icon name="clock" size={14} />}
                    {g.clockText}
                  </div>
                </div>
                <TeamCell t={withScore(g.home, ahead?.home)} poss={poss === g.home.id} tos={sit?.homeTimeouts ?? null} giveaways={giveaways.home} pre={g.state === 'pre'} result={won.home} />
              </header>
              {/* A screen reader hears a score change as it lands; never in a replay, where every step would speak. */}
              <p class="sr" aria-live="polite">
                {g.state !== 'pre' && replay == null ? scoreLine(withScore(g.away, ahead?.away), withScore(g.home, ahead?.home), g.state === 'post') : ''}
              </p>
              <nav class="tabs" role="tablist" aria-label="Game">
                {TABS.map((t) => (
                  <button
                    key={t}
                    role="tab"
                    class={`tab${tab === t ? ' is-on' : ''}`}
                    aria-selected={tab === t}
                    // Before kickoff there's nothing behind the other three.
                    disabled={g.state === 'pre' && t !== 'now'}
                    onClick={() => pickTab(t)}
                  >
                    {tabLabel(t, g)}
                    {t === 'story' && storyNews && <span class="tab-dot" aria-label="new key play" />}
                  </button>
                ))}
              </nav>
            </div>
            {read.problem && replay == null && <StuckNote at={read.acceptedAt} due={poll.polling ? poll.due : null} />}
            {g.state === 'pre' && <KickoffNote kickoff={g.kickoff} timeValid={read.data?.header.timeValid !== false && read.data?.header.competitions[0].timeValid !== false} />}

            {replayStuck && <p class="feed-note" role="status">The replay can't go past this play: ESPN's data for the next one doesn't read.</p>}

            {tab === 'now' && (
              <TabGuard key="now" name={tabLabel('now', g)} retryKey={read.acceptedAt} polling={poll.polling}>
                {() => (
                  <section class="surface" role="tabpanel">
                    {g.state === 'pre' && <Pregame g={g} />}
                    {sitText && (
                      <div class={`situation${redZone ? ' is-redzone' : ''}`}>
                        <span class="sit-text">{sitText}</span>
                        {redZone && (
                          <span class="sit-extra">
                            <Icon name="zone" size={12} />
                            Red zone
                          </span>
                        )}
                        {possLeft != null && possLeft < 6 && (
                          <span class="sit-extra">
                            <Icon name="clock" size={12} />
                            {possessionsText(possLeft)}
                          </span>
                        )}
                      </div>
                    )}
                    {live && <Field g={g} spot={spot} note={fieldNote(g)} />}
                    {live && spot && <DriveLine g={g} spot={spot} />}
                    {ahead ? (
                      <div class="lastplay">
                        <div class="lp-label">
                          Last play<span class="lp-age"> · just in, details to follow</span>
                        </div>
                        {/* No swing badge here: the summary may be several plays behind, so a difference would span them all. */}
                        <div class="lp-text">{ahead.text}</div>
                      </div>
                    ) : headline && (
                      <div class="lastplay">
                        <div class="lp-label">
                          {pivot ? `Play of the game · ${periodLabel(pivot.period)} ${pivot.clock}` : live ? 'Last play' : 'Final play'}
                          {live && replay == null && headline.wallclock && <PlayAge at={headline.wallclock} />}
                        </div>
                        <div class="lp-text">{headline.text}</div>
                        {/* One badge on the surface: who the play swung toward. Its EPA is in Story, under Drives. */}
                        <div class="play-badges">
                          <WpDelta g={g} p={headline} />
                        </div>
                        {headClip && <ClipThumb clip={headClip} />}
                      </div>
                    )}
                    {g.plays.length > 0 && (
                      <button class="jump-row" onClick={() => pickTab('story')}>
                        <span class="sec-label">Win probability</span>
                        <span class="sec-head">{wpHeadline(g)}</span>
                        <span class="chev" aria-hidden="true" />
                      </button>
                    )}
                    {g.state !== 'pre' && <Glance g={g} onMore={() => pickTab('stats')} />}
                    {g.state === 'post' && clips.game.length > 0 && (
                      <div class="game-clips">
                        <h3 class="sub-title">Highlights</h3>
                        {clips.game.map((c) => (
                          <div class="game-clip" key={c.id}>
                            <ClipThumb clip={c} />
                            <span>{c.headline}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </TabGuard>
            )}

            {tab === 'story' && (
              <TabGuard key="story" name="Story" retryKey={read.acceptedAt} polling={poll.polling}>
                {() => (
                  <section class="tabpane is-story" role="tabpanel">
                    {/* The chart, its rail and the chips stay pinned under the score bar while the list scrolls beneath them. */}
                    <div class="story">
                      <div class="story-pin" ref={pinRef}>
                        {g.plays.length > 0 ? (
                          <WpChart g={g} marks={marks} clipIds={clipIds} selected={selected} onSelect={setSelected} short={short} />
                        ) : (
                          <p class="empty">The story starts at kickoff.</p>
                        )}
                        <StoryFilters on={filters} counts={counts} onToggle={toggleFilter} />
                      </div>
                      {storyProblem ? (
                        <p class="error">The story couldn't be read from ESPN's data.</p>
                      ) : (
                        <KeyPlays g={g} rows={rows} total={events.length} clips={clips.byPlay} selected={selected} onSelect={setSelected} />
                      )}
                    </div>
                    {/* The drives sit past the list, one tap away, so the pinned chart never rides over them. */}
                    {g.drives.length > 0 && (
                      <Fold id="story-drives" label="Drives" headline={`${g.drives.length} drive${g.drives.length === 1 ? '' : 's'}`}>
                        <Drives g={g} fresh={fresh} />
                      </Fold>
                    )}
                  </section>
                )}
              </TabGuard>
            )}

            {tab === 'standouts' && (
              <TabGuard key="standouts" name="Standouts" retryKey={read.acceptedAt} polling={poll.polling}>
                {() => (
                  <section class="tabpane" role="tabpanel">
                    <Standouts g={g} base={base} epReady={!!ep} />
                  </section>
                )}
              </TabGuard>
            )}

            {tab === 'stats' && (
              <TabGuard key="stats" name="Stats" retryKey={read.acceptedAt} polling={poll.polling}>
                {() => (
                  <section class="tabpane" role="tabpanel">
                    <BaselineSwitch base={base} id={baseId} onPick={pickBase} />
                    <TeamStats g={g} avg={avg} />
                    {g.plays.length > 0 && (
                      <>
                        <h3 class="sub-title">How well they're playing</h3>
                        <Numbers g={g} epReady={!!ep} avg={avg} />
                      </>
                    )}
                    {g.state === 'post' && !g.truncated && <Advanced g={g} />}
                  </section>
                )}
              </TabGuard>
            )}

            {tab === 'players' && (
              <TabGuard key="players" name="Players" retryKey={read.acceptedAt} polling={poll.polling}>
                {() => (
                  <section class="tabpane" role="tabpanel">
                    <Players g={g} avg={avg} onPick={pickBase} />
                  </section>
                )}
              </TabGuard>
            )}

            <Footer />
            <Dock
              replay={
                replay != null && full ? (
                  // Replay runs from the same bottom bar that started it.
                  <div class="replay">
                    <button class="replay-toggle" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
                      {playing ? '❚❚' : '▶'}
                    </button>
                    <input
                      class="replay-scrub"
                      type="range"
                      min={1}
                      max={full.plays.length}
                      value={replay}
                      onInput={(e) => (setPlaying(false), setReplay(Number((e.target as HTMLInputElement).value)))}
                      aria-label="Replay position"
                      aria-valuetext={`Play ${shownCut} of ${full.plays.length}`}
                    />
                    {/* The play the page is showing: when a cut can't be built, the one it holds at, not the one asked for. */}
                    <span class={`replay-pos${replayStuck ? ' is-held' : ''}`} title={replayStuck ? `Held at play ${shownCut}: play ${replay} doesn't read` : undefined}>
                      {shownCut}/{full.plays.length}
                    </span>
                    <button class="replay-exit" onClick={() => (setReplay(null), setPlaying(false))}>
                      Exit
                    </button>
                  </div>
                ) : undefined
              }
            >
              {canReplay && replay == null ? (
                <button class="dock-btn" onClick={() => (setReplay(1), setPlaying(true))} title="Replay this game play by play, as if live">
                  ▶ Replay
                </button>
              ) : g.state !== 'post' && replay == null ? (
                pill
              ) : null}
            </Dock>
          </div>
        );
      }}
    </Guard>
  );
}

/**
 * An error boundary that keeps the game page alive. A crash inside it shows `fallback` (with a retry) in its place;
 * the feed, and whatever sits outside it, carry on. Once per crash, when a newer accepted game arrives (`retryKey`
 * changes), it tries once more on its own, logged; if that crashes too, only the retry button tries again. A render
 * that gets through ends the crash, so a later one gets its own automatic retry. `willRetry` tells the fallback
 * whether that automatic retry is still to come (it is only while the feed is polling and it hasn't been spent). The
 * content is a function so that it is built inside the boundary (by TabBody), not in GamePage's own render, which no
 * boundary can catch.
 */
function Guard({
  name,
  retryKey,
  polling,
  children,
  fallback,
}: {
  name: string;
  retryKey: unknown;
  /** The feed will fetch again on its own, so a newer game can arrive. */
  polling: boolean;
  children: () => ComponentChildren;
  fallback: (retry: () => void, willRetry: boolean) => ComponentChildren;
}) {
  const keyNow = useRef(retryKey);
  keyNow.current = retryKey;
  const crashedAt = useRef<unknown>(undefined);
  const autoRetried = useRef(false);
  const [error, reset] = useErrorBoundary((e) => {
    crashedAt.current = keyNow.current;
    console.error(`Gridiron: the ${name} crashed`, e);
  });
  useEffect(() => {
    if (!error || autoRetried.current || retryKey === crashedAt.current) return;
    autoRetried.current = true;
    console.warn(`Gridiron: a newer update arrived; trying the ${name} once more (if it crashes again, only "Try again" retries it)`);
    reset();
  }, [error, retryKey]);
  if (!error) {
    return (
      <TabBody
        render={children}
        onRendered={() => {
          autoRetried.current = false;
        }}
      />
    );
  }
  return (
    <>
      {fallback(() => {
        autoRetried.current = false;
        reset();
      }, polling && !autoRetried.current)}
    </>
  );
}

/** One tab's boundary: a crash shows "Try again" in the tab's place and resets only that tab; the score bar, the pill
 *  and the polling carry on. */
function TabGuard({ name, retryKey, polling, children }: { name: string; retryKey: unknown; polling: boolean; children: () => ComponentChildren }) {
  return (
    <Guard
      name={`${name} tab`}
      retryKey={retryKey}
      polling={polling}
      fallback={(retry, willRetry) => (
        <section class="tabpane tab-crash" role="tabpanel">
          <p class="error">
            Something in ESPN's data broke the {name} tab.{willRetry ? ' It tries once more when a newer update reads.' : ''}
          </p>
          <p class="empty">
            <button class="week-next" onClick={retry}>
              Try again
            </button>
          </p>
        </section>
      )}
    >
      {children}
    </Guard>
  );
}

/** Builds a guarded view. `onRendered` runs after a render that got through (a render that throws runs no effects),
 *  which is how its Guard knows a crash is over. */
function TabBody({ render, onRendered }: { render: () => ComponentChildren; onRendered: () => void }) {
  useEffect(onRendered);
  return <>{render()}</>;
}

/** The bottom bar, where a thumb already is: back to the games on the left, this game's one action on the right. */
function Dock({ children, replay }: { children?: ComponentChildren; replay?: ComponentChildren }) {
  const week = useBoardWeek();
  if (replay) return <nav class="dock is-replay" aria-label="Replay">{replay}</nav>;
  return (
    <nav class="dock" aria-label="Game">
      <a class="dock-back" href={boardHref()} onClick={linkTo(null)}>
        {week ? weekLabel(weekStops(null), week.seasonType, week.week) : 'This week'}
      </a>
      <span class="dock-right">{children}</span>
    </nav>
  );
}

const sideWp = (g: Game, wpHome: number) => (wpHome >= 0.5 ? `${g.home.abbr} ${wpText(wpHome)}` : `${g.away.abbr} ${wpText(1 - wpHome)}`);

// The row that opens Story shows the game's shape (a sparkline) and one fact: live, who's favoured now; final, how
// long the winner was favoured.
function wpHeadline(g: Game): ComponentChildren {
  const pts = g.plays.filter((p) => p.wpHome != null);
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const homeAhead = last.wpHome! >= 0.5;
  const lead = homeAhead ? g.home : g.away;
  let text = sideWp(g, last.wpHome!);
  let long = `Win probability now: ${text}`;
  if (g.state === 'post') {
    // The game's story in a few words: who was favoured, for how much of it, and whether it took a comeback.
    let favoured = 0;
    let low = 1;
    for (let i = 1; i < pts.length; i++) {
      const wp = homeAhead ? pts[i - 1].wpHome! : 1 - pts[i - 1].wpHome!;
      if (wp > 0.5) favoured += pts[i].gameSec - pts[i - 1].gameSec;
      low = Math.min(low, wp);
    }
    const share = favoured / Math.max(1, pts[pts.length - 1].gameSec - pts[0].gameSec);
    text =
      low < 0.25
        ? `Comeback from ${Math.round(low * 100)}%`
        : share >= 0.85
          ? `${lead.abbr} all the way`
          : share >= 0.6
            ? `${lead.abbr} most of it`
            : 'Back and forth';
    long = `${lead.abbr} was favoured for ${Math.round(share * 100)}% of the game; its lowest win chance was ${Math.round(low * 100)}%.`;
  }
  return (
    <span title={long}>
      {/* Under eight points the sparkline is a flat stub that reads as broken. */}
      {pts.length >= 8 && <WpSpark g={g} />}
      {text}
    </span>
  );
}

function WpSpark({ g }: { g: Game }) {
  const pts = g.plays.filter((p) => p.wpHome != null);
  const span = Math.max(g.regulationSec, pts[pts.length - 1]?.gameSec ?? 1);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((p.gameSec / span) * 72).toFixed(1)},${(2 + (1 - p.wpHome!) * 18).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg class="spark" width="72" height="22" viewBox="0 0 72 22" aria-hidden="true" style={teamVars(last && last.wpHome! >= 0.5 ? g.home : g.away)}>
      <line class="spark-mid" x1="0" x2="72" y1="11" y2="11" />
      <path class="spark-line" d={d} />
    </svg>
  );
}

function tabLabel(t: Tab, g: Game): string {
  if (t === 'now') return g.state === 'pre' ? 'Preview' : g.state === 'post' ? 'Final' : 'Live';
  return t === 'story' ? 'Story' : t === 'standouts' ? 'Standouts' : t === 'stats' ? 'Stats' : 'Players';
}

// What the field says when there's no ball on it.
function fieldNote(g: Game): string | undefined {
  if (g.statusName === 'STATUS_HALFTIME') return 'HALFTIME';
  if (g.statusName === 'STATUS_END_PERIOD') return g.period >= 4 ? 'OVERTIME NEXT' : `END OF ${periodLabel(g.period)}`;
  return g.lastPlay?.scoring ? 'KICKOFF NEXT' : undefined;
}

// Giveaways so far. ESPN's box score is the truth, but in a replay it's the final one, so count the plays instead.
function turnoverCounts(g: Game): { away: number; home: number } {
  const fromBox = (id: string) => Number(g.box?.teams?.find((t) => t.team.id === id)?.statistics.find((s) => s.name === 'turnovers')?.displayValue);
  const a = fromBox(g.away.id);
  const h = fromBox(g.home.id);
  if (!g.truncated && Number.isFinite(a) && Number.isFinite(h)) return { away: a, home: h };
  const lost = (p: Play) => (p.endTeamId === p.offenseId ? p.defenseId : p.offenseId); // a muffed punt is the returner's
  const tos = g.plays.filter((p) => p.turnover);
  return { away: tos.filter((p) => lost(p) === g.away.id).length, home: tos.filter((p) => lost(p) === g.home.id).length };
}

// Two rows from the Stats tab, the ones a glance wants: who's moving the ball, who's had it. (Turnovers are already
// under each score.)
const GLANCE = ['totalYards', 'possessionTime'];

function Glance({ g, onMore }: { g: Game; onMore: () => void }) {
  if (g.truncated) return null; // a replay's box score is the final one
  const rows = compareRows(g).filter((r) => GLANCE.includes(r.key));
  if (!rows.length) return null;
  return (
    <div class="glance">
      <Compare
        g={g}
        lines={GLANCE.map((k) => rows.find((r) => r.key === k))
          .filter((r): r is CompareRow => !!r)
          .map((r) => ({ key: r.key, label: r.label, away: r.away, home: r.home, av: r.av, hv: r.hv, win: edge(r), icon: r.icon, bar: true }))}
      />
      <button class="jump-row is-small" onClick={onMore}>
        <span class="sec-label">All team stats</span>
        <span class="chev" aria-hidden="true" />
      </button>
    </div>
  );
}

function possessionsText(n: number): string {
  const k = Math.max(1, Math.round(n));
  return `≈${k} possession${k === 1 ? '' : 's'} left, both teams`;
}

// The newer feed's score wins while it's ahead; never lower than what the play-by-play already shows.
function withScore(t: TeamInfo, s: number | undefined): TeamInfo {
  return s != null && Number.isFinite(s) && s > t.score ? { ...t, score: s } : t;
}

const scoreLine = (away: TeamInfo, home: TeamInfo, final: boolean) => `${final ? 'Final: ' : ''}${away.abbr} ${away.score}, ${home.abbr} ${home.score}`;

type Result = 'winner' | 'loser' | null;

/** A final's winner and loser (a tie, a live game and a replay's cut have neither). */
function results(g: Game): { away: Result; home: Result } {
  if (g.state !== 'post' || g.truncated || g.away.score === g.home.score) return { away: null, home: null };
  const awayWon = g.away.score > g.home.score;
  return { away: awayWon ? 'winner' : 'loser', home: awayWon ? 'loser' : 'winner' };
}

function TeamCell({ t, poss, tos, giveaways, pre, result }: { t: TeamInfo; poss: boolean; tos: number | null; giveaways: number; pre: boolean; result: Result }) {
  return (
    <div class={`sbar-team ${t.side}${fillClass(t)}${result ? ` is-${result}` : ''}`} style={teamVars(t)}>
      {t.logo && <Logo src={smallLogo(t.logo, 80)} abbr={t.abbr} size={32} on={t.fill?.logo} />}
      <span class="abbr">{t.abbr}</span>
      {/* Before kickoff the record, not a 0 that reads like a score. */}
      <span class={`score${pre ? ' is-pre' : ''}`}>{pre ? t.record : t.score}</span>
      {poss && <span class="poss" aria-label="has the ball" />}
      {/* the winner: a mark pointing at the score (and a lighter, smaller score for the loser), not colour alone */}
      {result === 'winner' && (
        <>
          <span class="win-mark" aria-hidden="true" />
          <span class="sr">winner</span>
        </>
      )}
      {!pre && (
        <span class="sbar-glyphs">
          {tos != null && (
            <span class="tos" aria-label={`${tos} timeouts left`} title={`${tos} timeouts left`}>
              {[0, 1, 2].map((i) => (
                <span key={i} class={`to${i >= tos ? ' used' : ''}`} />
              ))}
            </span>
          )}
          {giveaways > 0 && (
            <span class="giveaways" aria-label={`${giveaways} turnover${giveaways === 1 ? '' : 's'}`} title={`${giveaways} turnover${giveaways === 1 ? '' : 's'}`}>
              <Icon name="turnover" size={12} />
              {giveaways}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// Under the field: the drive in words, since the field shows it in yards.
// Yards count from the drive's first snap to the ball now, the same span the field draws.
function DriveLine({ g, spot }: { g: Game; spot: Spot }) {
  const d = g.drives.find((x) => x.isLive && x.teamId === spot.offenseId);
  if (!d) return null;
  const t = d.teamId === g.home.id ? g.home : g.away;
  const first = firstSnap(d);
  const snaps = d.plays.filter((p) => (p.kind === 'pass' || p.kind === 'rush') && p.down > 0 && !p.noPlay);
  return (
    <div class="driveline" style={teamVars(t)}>
      <Icon name="ball" size={14} />
      <b>{t.abbr} drive</b>
      {first ? (
        <>
          <span>
            {snaps.length} play{snaps.length === 1 ? '' : 's'}
          </span>
          <span>{Math.round(first.ytg - spot.ytg)} yds</span>
        </>
      ) : (
        <span>first snap next</span>
      )}
    </div>
  );
}

// The newest update couldn't be read: said on the page, not only on the pill, with how old the game shown is, and
// whether anything is still fetching (the feed retries for a while, ../hooks/feed UNREADABLE_RETRY_MS).
function StuckNote({ at, due }: { at: number | null; due: number | null }) {
  const now = useNow(5000);
  return (
    <p class="feed-note" role="status">
      Can't read ESPN's latest update{at ? `; showing the game as of ${agoText(now - at)}` : ''}. {nextCheckText(due, now)}
    </p>
  );
}

function NextCheck({ due }: { due: number | null }) {
  const now = useNow(5000);
  return <>{nextCheckText(due, now)}</>;
}

// A game still "pre" well past its kickoff time, or with no kickoff time at all: the page says what the schedule is
// doing (../espn/cadence), Data Saver's stretch included.
function KickoffNote({ kickoff, timeValid }: { kickoff: string; timeValid: boolean }) {
  const now = useNow(30_000);
  const wait = kickoffWait(kickoff, now, timeValid);
  if (wait === 'ahead' || wait === 'due') return null;
  const stretch = browserDeps.saveData() ? DATA_SAVER_FACTOR : 1;
  const at = new Date(kickoff).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const text =
    wait === 'unknown'
      ? `Kickoff time not set yet; checking every ${PRE_MAX_WAIT_MS / 3_600_000} h.`
      : wait === 'delayed'
        ? `Kickoff delayed? It was due at ${at} and ESPN hasn't started the game. Checking every ${Math.round((DELAYED_MS * stretch) / 60_000)} min.`
        : `Stopped waiting for kickoff: ESPN still hasn't started the game ${Math.round(KICKOFF_WINDOW_MS / 3_600_000)} hours after it was due. Tap the pill to check.`;
  return (
    <p class="feed-note" role="status">
      {text}
    </p>
  );
}

// How long ago ESPN says the play happened: the data's age, as opposed to the pill's "when we last checked".
function PlayAge({ at }: { at: string }) {
  const now = useNow(5000);
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return null;
  return <span class="lp-age"> · {agoText(now - t)}</span>;
}

function Pregame({ g }: { g: Game }) {
  return (
    <div class="lastplay">
      <div class="lp-label">Kickoff</div>
      <div class="lp-text">
        {g.clockText} · {g.away.abbr} {g.away.record} at {g.home.abbr} {g.home.record}
      </div>
    </div>
  );
}


