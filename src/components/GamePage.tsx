// One game, one scroll: score bar, now, drives, numbers, players, post-game model numbers.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getEpTable, getSummary, SNAPSHOT } from '../espn/api';
import { buildGame, periodLabel, type Game, type TeamInfo } from '../espn/model';
import { biggestPlays } from '../stats/live';
import type { EspnSummary } from '../espn/types';
import type { EpTable } from '../stats/ep';
import { smallLogo, teamVars } from '../format';
import { usePoll } from '../hooks/usePoll';
import { Fresh } from './Fresh';
import { WpChart } from './WpChart';
import { Drives } from './Drives';
import { Numbers } from './Numbers';
import { Players } from './Players';
import { Advanced } from './Advanced';
import { Epa, offenseAbbr, WpDelta } from './Badges';
import { Footer } from './Scoreboard';

function nextIn(s: EspnSummary): number | null {
  if (SNAPSHOT) return null;
  const st = s.header.competitions[0].status.type;
  if (st.state === 'post') return null;
  if (st.state === 'pre') return 60_000;
  if (st.name === 'STATUS_HALFTIME' || st.name === 'STATUS_END_PERIOD') return 30_000;
  return 15_000;
}

export function GamePage({ id }: { id: string }) {
  const poll = usePoll(`g${id}`, (s) => getSummary(id, s), nextIn);
  const [ep, setEp] = useState<EpTable | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    getEpTable().then(setEp);
  }, []);

  const full = useMemo(() => (poll.data ? buildGame(poll.data, { ep }) : null), [poll.data, ep]);
  const g = useMemo(() => (poll.data && replay != null ? buildGame(poll.data, { ep, upto: replay }) : full), [poll.data, ep, replay, full]);

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
          <a class="back" href="#/">
            ‹
          </a>
        </header>
        {poll.error ? <p class="error">Couldn't load the game: {poll.error}</p> : <p class="empty">Loading…</p>}
      </div>
    );
  }

  const live = g.state === 'in';
  const canReplay = full?.state === 'post' && full.plays.length > 0;
  const poss = g.situation?.possessionId;
  const lastSnap = [...g.plays].reverse().find((p) => p.kind !== 'kick' || g.plays.length < 3) ?? g.lastPlay;
  const pivot = g.state === 'post' && !g.truncated ? biggestPlays(g, 1)[0] ?? null : null;
  const headline = pivot ?? lastSnap;
  const curDrive = g.drives.find((d) => d.isLive) ?? null;

  return (
    <div class="app view-game">
      <header class="scorebar">
        <a class="back" href="#/" aria-label="All games">
          ‹
        </a>
        <TeamCell t={g.away} poss={poss === g.away.id} tos={g.situation?.awayTimeouts ?? null} />
        <div class="sbar-mid">
          <div class="clock">{g.clockText}</div>
          {replay != null ? (
            <button class="fresh is-idle" onClick={() => (setReplay(null), setPlaying(false))}>
              replay · exit
            </button>
          ) : (
            <Fresh live={live} lastOk={poll.lastOk} polling={poll.polling} error={poll.error} onRefresh={poll.refresh} />
          )}
        </div>
        <TeamCell t={g.home} poss={poss === g.home.id} tos={g.situation?.homeTimeouts ?? null} />
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
        {g.situation && g.situation.text && (
          <div class={`situation${g.situation.redZone ? ' is-redzone' : ''}`}>
            <span class="sit-text">{g.situation.text}</span>
            {g.situation.redZone && <span class="sit-extra">Red zone</span>}
          </div>
        )}
        {headline && (
          <div class="lastplay">
            <div class="lp-label">
              {pivot ? `Play of the game · ${periodLabel(pivot.period)} ${pivot.clock}` : live ? 'Last play' : 'Final play'}
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
      <JumpBar />
    </div>
  );
}

function TeamCell({ t, poss, tos }: { t: TeamInfo; poss: boolean; tos: number | null }) {
  return (
    <div class={`sbar-team ${t.side}`} style={teamVars(t)}>
      {t.logo && <img class="logo" src={smallLogo(t.logo, 80)} alt="" width={32} height={32} />}
      <span class="abbr">{t.abbr}</span>
      <span class="score">{t.score}</span>
      {poss && <span class="poss" aria-label="has the ball" />}
      {tos != null && (
        <span class="tos" aria-label={`${tos} timeouts left`}>
          {[0, 1, 2].map((i) => (
            <span class={`to${i >= tos ? ' used' : ''}`} />
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

function Pregame({ g }: { g: Game }) {
  return (
    <div class="lastplay">
      <div class="lp-label">Kickoff</div>
      <div class="lp-text">
        {g.clockText}
        {g.odds && ` · ${g.odds}`}
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

function JumpBar() {
  const [active, setActive] = useState('now');
  useEffect(() => {
    const els = JUMPS.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav class="jumpbar">
      {JUMPS.map(([id, label]) => (
        <button
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

