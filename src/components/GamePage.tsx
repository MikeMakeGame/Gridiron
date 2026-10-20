// One game, one scroll: score bar, now, drives, numbers, players, post-game model numbers.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getEpTable, getScoreboardForDay, getSummary, SNAPSHOT } from '../espn/api';
import { buildGame, periodLabel, type Game, type TeamInfo } from '../espn/model';
import { biggestPlays, possessionsLeft } from '../stats/live';
import type { EspnSummary } from '../espn/types';
import type { EpTable } from '../stats/ep';
import { agoText, smallLogo, teamVars } from '../format';
import { useNow, usePoll } from '../hooks/usePoll';
import { Fresh } from './Fresh';
import { Logo } from './Logo';
import { linkTo } from '../route';
import { WpChart } from './WpChart';
import { Drives } from './Drives';
import { Numbers } from './Numbers';
import { Players } from './Players';
import { Advanced } from './Advanced';
import { Epa, offenseAbbr, WpDelta } from './Badges';
import { Footer } from './Scoreboard';

/** How often to check a game in this state: often while live, slowly before kickoff, never once it's final. */
export function pollInterval(state: 'pre' | 'in' | 'post', statusName: string, kickoffIso: string, now = Date.now()): number | null {
  if (SNAPSHOT || state === 'post') return null;
  if (state === 'pre') return new Date(kickoffIso).getTime() - now < 30 * 60_000 ? 60_000 : 300_000;
  if (statusName === 'STATUS_HALFTIME' || statusName === 'STATUS_END_PERIOD') return 30_000;
  return 15_000;
}

function nextIn(s: EspnSummary): number | null {
  const c = s.header.competitions[0];
  return pollInterval(c.status.type.state, c.status.type.name, c.date);
}

export function GamePage({ id }: { id: string }) {
  const poll = usePoll(`g${id}`, (s) => getSummary(id, s), nextIn);
  // The scoreboard feed carries the timeouts, and it posts each new snap 10-20 s before the game summary
  // does (measured on MNF 10-19). It's the scoreboard for the game's own day, so it works for any week, and it
  // follows the game: slow before kickoff, every 15 s live, off at the final.
  const kickoff = poll.data?.header.competitions[0].date ?? '';
  const sb = usePoll(
    `sb${id}-${kickoff}`,
    (s) => getScoreboardForDay(kickoff, s),
    (d) => {
      const e = d.events.find((x) => x.id === id);
      return e ? pollInterval(e.status.type.state, e.status.type.name, e.date) : null;
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

  if (!g) {
    return (
      <div class="app view-game">
        <header class="scorebar">
          <a class="back" href="#/" onClick={linkTo(null)}>
            ‹
          </a>
        </header>
        {poll.error ? <p class="error">Couldn't load the game: {poll.error}</p> : <p class="empty">Loading…</p>}
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
        <a class="back" href="#/" onClick={linkTo(null)} aria-label="All games">
          ‹
        </a>
        <TeamCell t={withScore(g.away, ahead?.away)} poss={poss === g.away.id} tos={g.situation?.awayTimeouts ?? null} />
        <div class="sbar-mid">
          <div class="clock">{g.clockText}</div>
          {replay != null ? (
            <button class="fresh is-idle" onClick={() => (setReplay(null), setPlaying(false))}>
              replay · exit
            </button>
          ) : g.state === 'post' ? null : (
            // A final game has nothing left to refresh, so no "7s ago" on it.
            <Fresh
              live={live}
              lastOk={poll.lastOk}
              polling={poll.polling}
              error={poll.error ?? (unreadable ? "Couldn't read ESPN's latest update" : null)}
              onRefresh={poll.refresh}
            />
          )}
        </div>
        <TeamCell t={withScore(g.home, ahead?.home)} poss={poss === g.home.id} tos={g.situation?.homeTimeouts ?? null} />
      </header>

      {canReplay && (
        <div class="replay">
          {replay == null ? (
            <button class="replay-start" onClick={() => (setReplay(1), setPlaying(true))}>
              ▶ Replay this game as if live
            </button>
          ) : (
            <>
              <button class="replay-toggle" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? '❚❚' : '▶'}
              </button>
              <input
                class="replay-scrub"
                type="range"
                min={1}
                max={full!.plays.length}
                value={replay}
                onInput={(e) => (setPlaying(false), setReplay(Number((e.target as HTMLInputElement).value)))}
                aria-label="Replay position"
              />
              <span class="replay-pos">
                {replay}/{full!.plays.length}
              </span>
            </>
          )}
        </div>
      )}

      <section class="section" id="now">
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
            <div class="play-badges">
              <WpDelta g={g} p={headline} />
              <Epa v={headline.epa} team={offenseAbbr(g, headline)} />
            </div>
          </div>
        )}
        {g.plays.length > 0 && <WpChart g={g} />}
        {curDrive && <CurrentDrive g={g} />}
      </section>

      {g.plays.length > 0 && (
        <section class="section" id="numbers">
          <h2 class="section-title">How they're playing</h2>
          <Numbers g={g} epReady={!!ep} />
          {g.state === 'post' && !g.truncated && <Advanced g={g} />}
        </section>
      )}

      <section class="section" id="drives">
        <h2 class="section-title">Drives</h2>
        <Drives g={g} fresh={fresh} />
      </section>

      <section class="section" id="players">
        <h2 class="section-title">Players</h2>
        <Players g={g} />
      </section>

      <Footer />
      <JumpBar ids={['now', ...(g.plays.length ? ['numbers'] : []), 'drives', 'players']} />
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

function TeamCell({ t, poss, tos }: { t: TeamInfo; poss: boolean; tos: number | null }) {
  return (
    <div class={`sbar-team ${t.side}`} style={teamVars(t)}>
      {t.logo && <Logo src={smallLogo(t.logo, 80)} abbr={t.abbr} size={32} />}
      <span class="abbr">{t.abbr}</span>
      <span class="score">{t.score}</span>
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

const JUMPS: [string, string][] = [
  ['now', 'Now'],
  ['numbers', 'Numbers'],
  ['drives', 'Drives'],
  ['players', 'Players'],
];

function JumpBar({ ids }: { ids: string[] }) {
  const [active, setActive] = useState('now');
  const jumps = JUMPS.filter(([id]) => ids.includes(id));
  useEffect(() => {
    const els = jumps.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids.join()]);
  return (
    <nav class="jumpbar">
      {jumps.map(([id, label]) => (
        <button
          key={id}
          class={`jump${active === id ? ' is-active' : ''}`}
          onClick={() => {
            setActive(id);
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

