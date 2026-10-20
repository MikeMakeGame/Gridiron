// All games of a week, live ones first.
import { getScoreboard, SNAPSHOT, type WeekRef } from '../espn/api';
import { boardInterval } from '../espn/cadence';
import type { EspnEvent, EspnScoreboard } from '../espn/types';
import { clockLabel, teamInfo, type TeamInfo } from '../espn/model';
import { kickoffText, smallLogo, teamVars } from '../format';
import { usePoll } from '../hooks/usePoll';
import { Fresh } from './Fresh';
import { Logo } from './Logo';
import { linkTo, setBoardWeek, useBoardWeek } from '../route';
import { stepWeek, weekKey, weekLabel, weekStops } from '../weeks';

// Poll only while a listed game is live (see ../espn/cadence); otherwise one fetch, and the pill refetches on a tap.
const nextIn = (sb: EspnScoreboard): number | null => (SNAPSHOT ? null : boardInterval(sb));

export function Scoreboard() {
  // The browsed week lives in the route, so it survives opening a game and is in the link.
  const routed = useBoardWeek();
  const ref = SNAPSHOT ? undefined : routed;
  const key = ref ? weekKey(ref) : 'current';
  const poll = usePoll(key, (s) => getScoreboard(ref, s), nextIn);
  const sb = poll.data;

  const week = sb?.week?.number;
  const season = sb?.season;
  const stops = weekStops(sb);
  // ESPN answers a week it doesn't know with an empty board and no week: label it from the link instead of "…".
  const label =
    season && week != null ? weekLabel(stops, season.type, week) : ref && sb ? weekLabel(stops, ref.seasonType, ref.week) : null;
  const neighbour = (d: 1 | -1): WeekRef | null => {
    if (!season || week == null) return null;
    const s = stepWeek(stops, season.type, week, d);
    return s ? { season: season.year, seasonType: s.seasonType, week: s.week } : null;
  };
  const prev = neighbour(-1);
  const next = neighbour(1);
  const step = (d: 1 | -1) => {
    const to = neighbour(d);
    if (to) setBoardWeek(to);
  };

  const live = sb?.events.filter((e) => e.status.type.state === 'in') ?? [];
  const pre = sb?.events.filter((e) => e.status.type.state === 'pre').sort(byDate) ?? [];
  const ended = sb?.events.filter((e) => e.status.type.state === 'post').sort(byDate).reverse() ?? [];
  // ESPN marks postponed and canceled games 'post' too; they aren't finals.
  const post = ended.filter((e) => e.status.type.completed);
  const off = ended.filter((e) => !e.status.type.completed);

  return (
    <div class="app view-scoreboard">
      <header class="topbar">
        <span class="brand">Gridiron</span>
        <span class="week">
          {!SNAPSHOT && (
            <button class="week-step" onClick={() => step(-1)} disabled={!prev} aria-label="Previous week">
              ‹
            </button>
          )}
          {label ?? '…'}
          {!SNAPSHOT && (
            <button class="week-step" onClick={() => step(1)} disabled={!next} aria-label="Next week">
              ›
            </button>
          )}
        </span>
        <Fresh
          live={live.length > 0}
          lastOk={poll.lastOk}
          polling={poll.polling}
          error={poll.error}
          retryAt={poll.retryAt}
          onRefresh={poll.refresh}
        />
      </header>
      {poll.error && !sb && <p class="error">Couldn't reach ESPN: {poll.error}</p>}
      {!sb && !poll.error && <p class="empty">Loading the week…</p>}
      {sb && sb.events.length === 0 && <p class="empty">No games this week.</p>}
      {/* ESPN's week runs Wednesday to Tuesday, so Monday night still shows the week that just ended. */}
      {!SNAPSHOT && !ref && sb && sb.events.length > 0 && live.length === 0 && pre.length === 0 && label && next && (
        <button class="week-next" onClick={() => step(1)}>
          All of {label} is final. {weekLabel(stops, next.seasonType, next.week)} →
        </button>
      )}
      {ref && (
        <button class="week-next" onClick={() => setBoardWeek(undefined)}>
          ← Back to this week
        </button>
      )}
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
        {off.length > 0 && <h2 class="sb-group">Postponed or canceled</h2>}
        {off.map((e) => (
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
  const done = st === 'post' && e.status.type.completed;
  const winner = done ? (home.score > away.score ? home.id : away.score > home.score ? away.id : '') : '';
  const showScore = st === 'in' || done;
  // Broadcast only: no betting lines on this viewer.
  const meta = c.broadcasts?.[0]?.names?.join('/') ?? '';

  return (
    <a class={`sb-game is-${st === 'in' ? 'live' : st === 'pre' ? 'pre' : 'final'}${close ? ' is-close' : ''}`} href={`#/g/${e.id}`} onClick={linkTo(e.id)}>
      <div class="sb-teams">
        <TeamRow t={away} showScore={showScore} poss={sit?.possession === away.id} winner={winner} />
        <TeamRow t={home} showScore={showScore} poss={sit?.possession === home.id} winner={winner} />
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

function TeamRow({ t, showScore, poss, winner }: { t: TeamInfo; showScore: boolean; poss: boolean; winner: string }) {
  const res = winner ? (winner === t.id ? ' is-winner' : ' is-loser') : '';
  return (
    <div class={`sb-team${res}`} style={teamVars(t)}>
      {t.logo && <Logo src={smallLogo(t.logo)} abbr={t.abbr} size={28} />}
      <span class="abbr">{t.abbr}</span>
      {poss && <span class="poss" aria-label="has the ball" />}
      <span class="rec">{t.record}</span>
      {showScore && <span class="score">{t.score}</span>}
    </div>
  );
}

export function Footer() {
  return (
    <footer class="footer">
      Live data and logos: ESPN (unofficial, personal use), fetched by your browser straight from ESPN. Advanced stats:{' '}
      <a href="https://github.com/nflverse/nflverse-data">nflverse</a> play-by-play (nflfastR models), licensed{' '}
      <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Gridiron changes it: it sums the plays into
      per-game team and quarterback numbers, and builds the expected-points table behind the live EPA estimate from past
      seasons. No ads, no analytics. Not affiliated with ESPN, the NFL, nflverse or any team.
    </footer>
  );
}
