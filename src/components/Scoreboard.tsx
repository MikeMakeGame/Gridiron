// All games of a week, live ones first.
import { useState } from 'preact/hooks';
import { getScoreboard, SNAPSHOT, type WeekRef } from '../espn/api';
import type { EspnEvent, EspnScoreboard } from '../espn/types';
import { clockLabel, teamInfo, type TeamInfo } from '../espn/model';
import { kickoffText, smallLogo, teamVars } from '../format';
import { usePoll } from '../hooks/usePoll';
import { Fresh } from './Fresh';
import { linkTo } from '../route';

function nextIn(sb: EspnScoreboard): number | null {
  if (SNAPSHOT) return null;
  const states = sb.events.map((e) => e.status.type.state);
  if (states.includes('in')) return 15_000;
  const soon = sb.events.some((e) => e.status.type.state === 'pre' && new Date(e.date).getTime() - Date.now() < 30 * 60_000);
  return soon ? 60_000 : 300_000;
}

export function Scoreboard() {
  const [ref, setRef] = useState<WeekRef | undefined>(undefined);
  const key = ref ? `${ref.season}-${ref.seasonType}-${ref.week}` : 'current';
  const poll = usePoll(key, (s) => getScoreboard(ref, s), nextIn);
  const sb = poll.data;

  const week = sb?.week?.number;
  const season = sb?.season;
  const step = (d: number) => {
    if (!season || week == null) return;
    const w = week + d;
    if (w < 1 || w > 18) return;
    setRef({ season: season.year, seasonType: season.type, week: w });
  };

  const live = sb?.events.filter((e) => e.status.type.state === 'in') ?? [];
  const pre = sb?.events.filter((e) => e.status.type.state === 'pre').sort(byDate) ?? [];
  const post = sb?.events.filter((e) => e.status.type.state === 'post').sort(byDate).reverse() ?? [];

  return (
    <div class="app view-scoreboard">
      <header class="topbar">
        <span class="brand">Gridiron</span>
        <span class="week">
          {!SNAPSHOT && (
            <button class="week-step" onClick={() => step(-1)} aria-label="Previous week">
              ‹
            </button>
          )}
          {week != null ? `Week ${week}` : '…'}
          {!SNAPSHOT && (
            <button class="week-step" onClick={() => step(1)} aria-label="Next week">
              ›
            </button>
          )}
        </span>
        <Fresh live={live.length > 0} lastOk={poll.lastOk} polling={poll.polling} error={poll.error} onRefresh={poll.refresh} />
      </header>
      {poll.error && !sb && <p class="error">Couldn't reach ESPN: {poll.error}</p>}
      {!sb && !poll.error && <p class="empty">Loading the week…</p>}
      {sb && sb.events.length === 0 && <p class="empty">No games this week.</p>}
      <div class="sb-list">
        {live.length > 0 && <h2 class="sb-group">Live</h2>}
        {live.map((e) => (
          <GameCard key={e.id} e={e} />
        ))}
        {pre.length > 0 && <h2 class="sb-group">Upcoming</h2>}
        {pre.map((e) => (
          <GameCard key={e.id} e={e} />
        ))}
        {post.length > 0 && <h2 class="sb-group">Final</h2>}
        {post.map((e) => (
          <GameCard key={e.id} e={e} />
        ))}
      </div>
      <Footer />
    </div>
  );
}

const byDate = (a: EspnEvent, b: EspnEvent) => new Date(a.date).getTime() - new Date(b.date).getTime();

function GameCard({ e }: { e: EspnEvent }) {
  const c = e.competitions[0];
  const st = e.status.type.state;
  const away = teamInfo(c.competitors.find((x) => x.homeAway === 'away')!);
  const home = teamInfo(c.competitors.find((x) => x.homeAway === 'home')!);
  const sit = c.situation;
  const wp = sit?.lastPlay?.probability?.homeWinPercentage;
  const close = st === 'in' && (e.status.period ?? 0) >= 4 && Math.abs(home.score - away.score) <= 8;
  const status =
    st === 'pre' ? kickoffText(e.date) : clockLabel(e.status.type.name, e.status.period ?? 0, e.status.displayClock, e.status.type.shortDetail);
  const winner = st === 'post' ? (home.score > away.score ? home.id : away.score > home.score ? away.id : '') : '';
  const meta = [c.broadcasts?.[0]?.names?.join('/'), c.odds?.[0]?.details].filter(Boolean).join(' · ');

  return (
    <a class={`sb-game is-${st === 'in' ? 'live' : st === 'pre' ? 'pre' : 'final'}${close ? ' is-close' : ''}`} href={`#/g/${e.id}`} onClick={linkTo(e.id)}>
      <div class="sb-teams">
        <TeamRow t={away} st={st} poss={sit?.possession === away.id} winner={winner} />
        <TeamRow t={home} st={st} poss={sit?.possession === home.id} winner={winner} />
      </div>
      <div class="sb-side">
        <div class="sb-status">{status}</div>
        {st === 'in' && sit?.downDistanceText && <div class={`sb-sit${sit.isRedZone ? ' is-redzone' : ''}`}>{sit.downDistanceText}</div>}
        {st === 'pre' && meta && <div class="sb-meta">{meta}</div>}
      </div>
      {st === 'in' && wp != null && (
        <div class="sb-wp" aria-label={`${home.abbr} win probability ${Math.round(wp * 100)}%`}>
          <span class="sb-wp-away" style={{ ...teamVars(away), width: `${(1 - wp) * 100}%` }} />
          <span class="sb-wp-home" style={{ ...teamVars(home), width: `${wp * 100}%` }} />
        </div>
      )}
    </a>
  );
}

function TeamRow({ t, st, poss, winner }: { t: TeamInfo; st: string; poss: boolean; winner: string }) {
  const res = winner ? (winner === t.id ? ' is-winner' : ' is-loser') : '';
  return (
    <div class={`sb-team${res}`} style={teamVars(t)}>
      {t.logo && <img class="logo" src={smallLogo(t.logo)} alt="" width={28} height={28} loading="lazy" />}
      <span class="abbr">{t.abbr}</span>
      {poss && <span class="poss" aria-label="has the ball" />}
      <span class="rec">{t.record}</span>
      {st !== 'pre' && <span class="score">{t.score}</span>}
    </div>
  );
}

export function Footer() {
  return (
    <footer class="footer">
      Live data: ESPN (unofficial, personal use). Advanced stats: nflverse / nflfastR, CC-BY 4.0. No ads, no tracking.
    </footer>
  );
}
