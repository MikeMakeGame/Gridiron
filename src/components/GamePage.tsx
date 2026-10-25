// One game, in four tabs under a sticky score bar: Live (the field, the situation, the last play), Story (win
// probability with its key plays marked, then the drives), Stats (head to head) and Players (the box score).
// A bottom dock holds back and the game's one action.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getEpTable, getScoreboardForDay, getSummary, SNAPSHOT } from '../espn/api';
import { gameInterval } from '../espn/cadence';
import { matchClips } from '../espn/clips';
import { buildGame, firstSnap, periodLabel, type Game, type Play, type TeamInfo } from '../espn/model';
import { biggestPlays, possessionsLeft } from '../stats/live';
import { moments } from '../stats/moments';
import { compareRows, edge, type CompareRow } from '../stats/teamstats';
import type { EspnSummary } from '../espn/types';
import type { EpTable } from '../stats/ep';
import { agoText, smallLogo, teamVars, wpText } from '../format';
import { useNow, usePoll } from '../hooks/usePoll';
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
import { Compare, TeamStats } from './TeamStats';
import { ClipThumb, KeyPlays } from './KeyPlays';
import { Icon } from './Icons';
import { Footer } from './Scoreboard';

type Tab = 'now' | 'story' | 'stats' | 'players';
const TABS: Tab[] = ['now', 'story', 'stats', 'players'];

// The tab lives in the link (#/g/<id>/stats), so a reload or a shared link opens where it was.
function tabFromHash(): Tab | null {
  const m = location.hash.match(/^#\/g\/\d+\/(\w+)/);
  return m && (TABS as string[]).includes(m[1]) ? (m[1] as Tab) : null;
}

/** Poll only while the game is live (see ../espn/cadence); the offline snapshot never polls. */
function pollInterval(state: 'pre' | 'in' | 'post', statusName: string): number | null {
  return SNAPSHOT ? null : gameInterval(state, statusName);
}

function nextIn(s: EspnSummary): number | null {
  const c = s.header.competitions[0];
  return pollInterval(c.status.type.state, c.status.type.name);
}

export function GamePage({ id }: { id: string }) {
  const poll = usePoll(`g${id}`, (s) => getSummary(id, s), nextIn);
  // The scoreboard feed carries the timeouts, and it posts each new snap 10-20 s before the game summary
  // does (measured on MNF 10-19). It's the scoreboard for the game's own day, so it works for any week, and it
  // follows the game: polled only while the game is live.
  const kickoff = poll.data?.header.competitions[0].date ?? '';
  const sb = usePoll(
    `sb${id}-${kickoff}`,
    (s) => getScoreboardForDay(kickoff, s),
    (d) => {
      const e = d.events.find((x) => x.id === id);
      return e ? pollInterval(e.status.type.state, e.status.type.name) : null;
    },
    !!kickoff && !SNAPSHOT,
  );
  const sbSit = sb.data?.events.find((e) => e.id === id)?.competitions[0].situation;
  const timeouts = useMemo(
    () => (sbSit ? { home: sbSit.homeTimeouts ?? null, away: sbSit.awayTimeouts ?? null } : undefined),
    [sbSit?.homeTimeouts, sbSit?.awayTimeouts],
  );
  const [ep, setEp] = useState<EpTable | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [picked, setTab] = useState<Tab | null>(tabFromHash);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getEpTable().then(setEp);
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

  // A payload that passes the shape check but still breaks the model keeps the last good game on screen.
  const lastGood = useRef<{ data: EspnSummary; game: Game } | null>(null);
  const full = useMemo(() => {
    if (!poll.data) return null;
    try {
      const game = buildGame(poll.data, { ep, timeouts });
      lastGood.current = { data: poll.data, game };
      return game;
    } catch (e) {
      console.warn('Gridiron: could not read this update', e);
      return lastGood.current?.game ?? null;
    }
  }, [poll.data, ep, timeouts]);
  const unreadable = !!poll.data && lastGood.current?.data !== poll.data;
  const g = useMemo(() => {
    if (!poll.data || replay == null) return full;
    try {
      return buildGame(poll.data, { ep, upto: replay });
    } catch {
      return full;
    }
  }, [poll.data, ep, replay, full]);

  useEffect(() => {
    // A game opens at its top, not at wherever the scoreboard was scrolled to.
    window.scrollTo(0, 0);
  }, [id]);

  // A snap the scoreboard already has and the summary doesn't yet: shown on top, labelled, until the summary catches up.
  // Play ids match across the two feeds (checked on MNF 10-19). A snap the summary never posts (a reversed play)
  // stops showing after 90 s. Scores and kickoffs count too (the down is unset right after them).
  const aheadSince = useRef<{ id: string; at: number } | null>(null);
  const ahead = useMemo(() => {
    const lp = sbSit?.lastPlay;
    if (!g || replay != null || g.state !== 'in' || !sbSit || !lp?.id) return null;
    if (/timeout|end of|end period|two-minute|coin toss/i.test(`${lp.type?.text ?? ''} ${lp.text ?? ''}`)) return null;
    if (g.plays.some((p) => p.id === lp.id)) return null;
    if (aheadSince.current?.id !== lp.id) aheadSince.current = { id: lp.id, at: Date.now() };
    if (Date.now() - aheadSince.current.at > 90_000) return null;
    const ev = sb.data?.events.find((e) => e.id === id)?.competitions[0].competitors;
    const scoreOf = (side: 'home' | 'away') => Number(ev?.find((c) => c.homeAway === side)?.score ?? NaN);
    const hasSnap = (sbSit.down ?? 0) > 0;
    return {
      text: lp.text ?? '',
      // No down after a score or before a kickoff: no situation line rather than a stale one.
      situation: hasSnap ? [sbSit.shortDownDistanceText, sbSit.possessionText].filter(Boolean).join(' · ') : '',
      redZone: hasSnap && !!sbSit.isRedZone,
      possession: sbSit.possession ?? null,
      // The spot for the field. The scoreboard's yard line counts from the home goal line.
      spot:
        hasSnap && sbSit.possession && sbSit.yardLine != null
          ? {
              offenseId: sbSit.possession,
              ytg: sbSit.possession === g.home.id ? 100 - sbSit.yardLine : sbSit.yardLine,
              down: sbSit.down ?? 0,
              distance: sbSit.distance ?? 0,
            }
          : null,
      wpHome: lp.probability?.homeWinPercentage ?? null,
      // The score bar follows the newer feed too, so a just-in touchdown and the score agree.
      home: scoreOf('home'),
      away: scoreOf('away'),
    };
  }, [sbSit, g, replay, sb.data]);

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
    if (replay >= full.plays.length) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setReplay(replay + 1), 1200);
    return () => window.clearTimeout(t);
  }, [playing, replay, full]);

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
  const allClips = useMemo(() => matchClips(poll.data?.videos, full?.plays ?? []), [poll.data, full]);
  const clips = useMemo(() => {
    if (!g || g === full) return allClips;
    const reached = new Set(g.plays.map((p) => p.id));
    return { ...allClips, byPlay: new Map([...allClips.byPlay].filter(([id]) => reached.has(id))) };
  }, [allClips, g, full]);
  const clipIds = useMemo(() => new Set(clips.byPlay.keys()), [clips]);
  const marks = useMemo(() => (g ? moments(g, clipIds) : []), [g, clipIds]);

  // Live opens on the field; a final opens on its story. A dot on Story when a key play lands while it's out of view.
  // The opening tab is decided once, when the game first loads: a game going final, or a replay, never moves the reader.
  // Before kickoff only the first tab has anything behind it, whatever the link says.
  const opened = useRef<Tab | null>(null);
  if (g && !opened.current) opened.current = g.state === 'post' ? 'story' : 'now';
  const tab: Tab = g?.state === 'pre' ? 'now' : picked ?? opened.current ?? 'now';
  const seenMarks = useRef<number | null>(null);
  if (g && (seenMarks.current == null || tab === 'story')) seenMarks.current = marks.length;
  const storyNews = tab !== 'story' && seenMarks.current != null && marks.length > seenMarks.current;
  const pickTab = (t: Tab) => {
    setTab(t);
    try {
      history.replaceState(null, '', `#/g/${id}/${t}`);
    } catch {
      // The frame refused; the tab still changes.
    }
    window.scrollTo(0, 0);
  };

  if (!g) {
    return (
      <div class="app view-game">
        {poll.error ? <p class="error">Couldn't load the game: {poll.error}</p> : <p class="empty">Loading…</p>}
        <Dock />
      </div>
    );
  }

  const live = g.state === 'in';
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

  return (
    <div class="app view-game">
      <div class="game-head">
        <header class="scorebar">
          <TeamCell t={withScore(g.away, ahead?.away)} poss={poss === g.away.id} tos={sit?.awayTimeouts ?? null} giveaways={giveaways.away} pre={g.state === 'pre'} />
          <div class="sbar-mid">
            <div class="clock">
              {live && <Icon name="clock" size={14} />}
              {g.clockText}
            </div>
          </div>
          <TeamCell t={withScore(g.home, ahead?.home)} poss={poss === g.home.id} tos={sit?.homeTimeouts ?? null} giveaways={giveaways.home} pre={g.state === 'pre'} />
        </header>
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

      {tab === 'now' && (
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

      {tab === 'story' && (
        <section class="tabpane" role="tabpanel">
          {g.plays.length > 0 ? (
            <WpChart g={g} marks={marks} clipIds={clipIds} selected={selected} onSelect={setSelected} />
          ) : (
            <p class="empty">The story starts at kickoff.</p>
          )}
          <h3 class="sub-title">Key plays</h3>
          <KeyPlays g={g} marks={marks} clips={clips.byPlay} selected={selected} onSelect={setSelected} />
          {g.drives.length > 0 && (
            <>
              <h3 class="sub-title">Drives</h3>
              <Drives g={g} fresh={fresh} />
            </>
          )}
        </section>
      )}

      {tab === 'stats' && (
        <section class="tabpane" role="tabpanel">
          <TeamStats g={g} />
          {g.plays.length > 0 && (
            <>
              <h3 class="sub-title">How well they're playing</h3>
              <Numbers g={g} epReady={!!ep} />
            </>
          )}
          {g.state === 'post' && !g.truncated && <Advanced g={g} />}
        </section>
      )}

      {tab === 'players' && (
        <section class="tabpane" role="tabpanel">
          <Players g={g} />
        </section>
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
                aria-valuetext={`Play ${replay} of ${full.plays.length}`}
              />
              <span class="replay-pos">
                {replay}/{full.plays.length}
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
          <Fresh
            live={live}
            lastOk={poll.lastOk}
            polling={poll.polling}
            error={poll.error ?? (unreadable ? "Couldn't read ESPN's latest update" : null)}
            retryAt={poll.retryAt}
            onRefresh={poll.refresh}
          />
        ) : null}
      </Dock>
    </div>
  );
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
  return t === 'story' ? 'Story' : t === 'stats' ? 'Stats' : 'Players';
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

function TeamCell({ t, poss, tos, giveaways, pre }: { t: TeamInfo; poss: boolean; tos: number | null; giveaways: number; pre: boolean }) {
  return (
    <div class={`sbar-team ${t.side}`} style={teamVars(t)}>
      {t.logo && <Logo src={smallLogo(t.logo, 80)} abbr={t.abbr} size={32} />}
      <span class="abbr">{t.abbr}</span>
      {/* Before kickoff the record, not a 0 that reads like a score. */}
      <span class={`score${pre ? ' is-pre' : ''}`}>{pre ? t.record : t.score}</span>
      {poss && <span class="poss" aria-label="has the ball" />}
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


