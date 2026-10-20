// One game. The surface answers "who's winning and what just happened"; win probability, the numbers, drives and
// players are closed rows underneath, each with a one-line answer. A bottom dock holds back and the game's one action.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getEpTable, getScoreboardForDay, getSummary, SNAPSHOT } from '../espn/api';
import { gameInterval } from '../espn/cadence';
import { buildGame, periodLabel, type Game, type TeamInfo } from '../espn/model';
import { biggestPlays, possessionsLeft, teamNumbers } from '../stats/live';
import type { EspnSummary } from '../espn/types';
import type { EpTable } from '../stats/ep';
import { agoText, pct, signed, smallLogo, teamVars, wpText } from '../format';
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
import { Fold } from './Fold';
import { Footer } from './Scoreboard';

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

  useEffect(() => {
    getEpTable().then(setEp);
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
  const curDrive = g.drives.find((d) => d.isLive) ?? null;
  const possLeft = possessionsLeft(g);

  return (
    <div class="app view-game">
      <header class="scorebar">
        <TeamCell t={withScore(g.away, ahead?.away)} poss={poss === g.away.id} tos={g.situation?.awayTimeouts ?? null} pre={g.state === 'pre'} />
        <div class="sbar-mid">
          <div class="clock">{g.clockText}</div>
        </div>
        <TeamCell t={withScore(g.home, ahead?.home)} poss={poss === g.home.id} tos={g.situation?.homeTimeouts ?? null} pre={g.state === 'pre'} />
      </header>

      <section class="surface" id="now">
        {g.state === 'pre' && <Pregame g={g} />}
        {(ahead ? ahead.situation : g.situation?.text) && (
          <div class={`situation${(ahead ? ahead.redZone : g.situation?.redZone) ? ' is-redzone' : ''}`}>
            <span class="sit-text">{ahead ? ahead.situation : g.situation?.text}</span>
            {(ahead ? ahead.redZone : g.situation?.redZone) && <span class="sit-extra">Red zone</span>}
            {possLeft != null && possLeft < 6 && <span class="sit-extra">{possessionsText(possLeft)}</span>}
          </div>
        )}
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
            {/* One badge on the surface: who the play swung toward. Its EPA is one tap down, in Drives. */}
            <div class="play-badges">
              <WpDelta g={g} p={headline} />
            </div>
          </div>
        )}
      </section>

      {/* Everything else one tap down, each closed row carrying its own one-line answer. */}
      <div class="secs">
        {g.plays.length > 0 && (
          <Fold id="wp" label="Win probability" headline={wpHeadline(g)}>
            <WpChart g={g} />
          </Fold>
        )}
        {g.plays.length > 0 && (
          <Fold id="numbers" label="Numbers" headline={numbersHeadline(g, !!ep)}>
            <Numbers g={g} epReady={!!ep} />
            {g.state === 'post' && !g.truncated && <Advanced g={g} />}
          </Fold>
        )}
        {/* Before kickoff these would be empty rows, so they appear with the first drive and the first box score. */}
        {g.drives.length > 0 && (
          <Fold id="drives" label="Drives" headline={drivesHeadline(g)}>
            {curDrive && <CurrentDrive g={g} />}
            <Drives g={g} fresh={fresh} />
          </Fold>
        )}
        {!!g.box?.players?.length && (
          <Fold id="players" label="Players" headline={playersHeadline(g)}>
            <Players g={g} />
          </Fold>
        )}
      </div>

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

// The closed row shows the game's shape (a sparkline) and one fact the card above doesn't: live, who's favoured now;
// final, how long the winner was favoured.
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
      <WpSpark g={g} />
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

function numbersHeadline(g: Game, epReady: boolean): string {
  const A = teamNumbers(g, g.away);
  const H = teamNumbers(g, g.home);
  if (epReady && A.epaPerPlay != null && H.epaPerPlay != null)
    return `EPA est. ${g.away.abbr} ${signed(A.epaPerPlay, 2)} · ${g.home.abbr} ${signed(H.epaPerPlay, 2)}`;
  // A team without a snap yet says so in words; a bare dash beside a name reads like a minus sign.
  const side = (abbr: string, v: number | null) => (v == null ? `${abbr} no snaps yet` : `${abbr} ${pct(v)}`);
  return `Success ${side(g.away.abbr, A.successRate)} · ${side(g.home.abbr, H.successRate)}`;
}

function drivesHeadline(g: Game): string | null {
  const now = g.drives.find((d) => d.isLive);
  if (now) {
    const snaps = now.plays.filter((p) => p.kind === 'pass' || p.kind === 'rush').length;
    return `${now.abbr} driving · ${snaps} plays, ${Math.round(now.endPos - now.startPos)} yds`;
  }
  if (!g.drives.length) return null;
  const scores = g.drives.filter((d) => d.cap === 'td' || d.cap === 'fg').length;
  return `${g.drives.length} drives · ${scores} scores`;
}

// "Daniels 289 · Purdy 241 yds": each side's leading passer, away first. In a replay the box score is the final one,
// so the row says so instead of giving the ending away.
function playersHeadline(g: Game): string | null {
  if (g.truncated) return 'Final box score';
  const leaders = [g.away, g.home].map((t) => {
    const cat = g.box?.players?.find((p) => p.team.id === t.id)?.statistics.find((s) => s.name === 'passing');
    const a = cat?.athletes[0];
    const yds = cat ? a?.stats[cat.labels.indexOf('YDS')] : undefined;
    const name = (a?.athlete.shortName ?? a?.athlete.displayName ?? '').split(' ').slice(-1)[0];
    return a && yds ? `${name} ${yds}` : null;
  });
  return leaders.every(Boolean) ? `${leaders.join(' · ')} yds` : null;
}

function possessionsText(n: number): string {
  const k = Math.max(1, Math.round(n));
  return `≈${k} possession${k === 1 ? '' : 's'} left, both teams`;
}

// The newer feed's score wins while it's ahead; never lower than what the play-by-play already shows.
function withScore(t: TeamInfo, s: number | undefined): TeamInfo {
  return s != null && Number.isFinite(s) && s > t.score ? { ...t, score: s } : t;
}

function TeamCell({ t, poss, tos, pre }: { t: TeamInfo; poss: boolean; tos: number | null; pre: boolean }) {
  return (
    <div class={`sbar-team ${t.side}`} style={teamVars(t)}>
      {t.logo && <Logo src={smallLogo(t.logo, 80)} abbr={t.abbr} size={32} />}
      <span class="abbr">{t.abbr}</span>
      {/* Before kickoff the record, not a 0 that reads like a score. */}
      <span class={`score${pre ? ' is-pre' : ''}`}>{pre ? t.record : t.score}</span>
      {poss && <span class="poss" aria-label="has the ball" />}
      {tos != null && (
        <span class="tos" aria-label={`${tos} timeouts left`}>
          {[0, 1, 2].map((i) => (
            <span key={i} class={`to${i >= tos ? ' used' : ''}`} />
          ))}
        </span>
      )}
    </div>
  );
}

function CurrentDrive({ g }: { g: Game }) {
  const d = g.drives.find((x) => x.isLive)!;
  const t = d.teamId === g.home.id ? g.home : g.away;
  const snaps = d.plays.filter((p) => p.kind === 'pass' || p.kind === 'rush');
  const lo = Math.min(d.startPos, d.endPos);
  const hi = Math.max(d.startPos, d.endPos);
  const yards = Math.round(d.endPos - d.startPos);
  return (
    <div class="curdrive" style={teamVars(t)}>
      <div class="cd-track">
        <span class="cd-bar" style={{ left: `${lo}%`, width: `${Math.max(0.8, hi - lo)}%` }} />
        {snaps.map((p) => (
          <span class="cd-tick" key={p.id} style={{ left: `${100 - p.ytg}%` }} />
        ))}
      </div>
      <div class="cd-meta">
        {t.abbr} drive · {snaps.length} plays · {yards} yds
      </div>
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


