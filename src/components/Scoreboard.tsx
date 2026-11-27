// All games of a week, live ones first.
import { getScoreboard, SNAPSHOT, type WeekRef } from '../espn/api';
import { boardInterval } from '../espn/cadence';
import type { EspnEvent, EspnScoreboard } from '../espn/types';
import { clockLabel, homeBeside, teamInfo, type TeamInfo } from '../espn/model';
import { fillClass, kickoffText, smallLogo, teamVars } from '../format';
import { usePoll } from '../hooks/usePoll';
import type { NextPoll } from '../hooks/poller';
import { Fresh } from './Fresh';
import { Logo } from './Logo';
import { linkTo, setBoardWeek, useBoardWeek } from '../route';
import { stepWeek, weekKey, weekLabel, weekStops } from '../weeks';
import { setTheme, useTheme, type Theme } from '../theme';
import { Fold } from './Fold';
import { Icon } from './Icons';
import { useKeys } from '../hooks/useKeys';

// Poll only while a listed game is live (see ../espn/cadence); otherwise one fetch, and the pill refetches on a tap.
const nextIn = (sb: EspnScoreboard): NextPoll => (SNAPSHOT ? null : boardInterval(sb));

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
  useKeys(SNAPSHOT ? {} : { ArrowLeft: () => step(-1), ArrowRight: () => step(1) });

  const live = sb?.events.filter((e) => e.status.type.state === 'in') ?? [];
  const pre = sb?.events.filter((e) => e.status.type.state === 'pre').sort(byDate) ?? [];
  const ended = sb?.events.filter((e) => e.status.type.state === 'post').sort(byDate).reverse() ?? [];
  // ESPN marks postponed and canceled games 'post' too; they aren't finals.
  const post = ended.filter((e) => e.status.type.completed);
  const off = ended.filter((e) => !e.status.type.completed);
  // ESPN's week runs Wednesday to Tuesday, so Monday night still shows the week that just ended: the › then names
  // the next week, which is the one thing to do here.
  const allFinal = !ref && !!sb && sb.events.length > 0 && live.length === 0 && pre.length === 0;
  const nextLabel = next ? weekLabel(stops, next.seasonType, next.week) : null;
  const prevLabel = prev ? weekLabel(stops, prev.seasonType, prev.week) : null;

  // On phones the bottom bar names both neighbours ("‹ Week 5 · WEEK 6 · Week 7 ›"); the top bar on wide screens
  // keeps bare arrows and names the next week only when it's the thing to do.
  const nav = (where: 'top' | 'bottom') =>
    SNAPSHOT ? (
      where === 'top' ? <span class="week">{label ?? '…'}</span> : null
    ) : (
      <nav class={where === 'top' ? 'week' : 'weekbar'} aria-label="Week">
        <button class="week-step prev" onClick={() => step(-1)} disabled={!prev} aria-label={prevLabel ? `Back to ${prevLabel}` : 'Previous week'} title={prevLabel ?? 'Previous week'}>
          {where === 'bottom' && prevLabel ? `‹ ${prevLabel}` : '‹'}
        </button>
        <span class="week-label">{label ?? '…'}</span>
        <button
          class={`week-step next${allFinal && next ? ' is-next' : ''}`}
          onClick={() => step(1)}
          disabled={!next}
          aria-label={nextLabel ? `On to ${nextLabel}` : 'Next week'}
          title={nextLabel ?? 'Next week'}
        >
          {nextLabel && (where === 'bottom' || allFinal) ? `${nextLabel} ›` : '›'}
        </button>
      </nav>
    );

  return (
    <div class="app view-scoreboard">
      <header class="topbar">
        <span class="brand">Gridiron</span>
        {nav('top')}
        <ThemeSwitch />
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
      {ref && (
        <button class="week-next" onClick={() => setBoardWeek(undefined)}>
          ← Back to this week
        </button>
      )}
      <div class="sb-list">
        <Group title="Live" games={live} />
        <Group title="Upcoming" games={pre} />
        <Group title="Final" games={post} />
        <Group title="Postponed or canceled" games={off} />
      </div>
      <Footer />
      {nav('bottom')}
    </div>
  );
}

function Group({ title, games }: { title: string; games: EspnEvent[] }) {
  if (!games.length) return null;
  return (
    <>
      <h2 class="sb-group">{title}</h2>
      {games.map((e) => (
        <GameCard key={e.id} e={e} />
      ))}
    </>
  );
}

/** Night (the default) or day (high contrast for sunlight); remembered on this device. */
function ThemeSwitch() {
  const theme = useTheme();
  const to = theme === 'day' ? 'night' : 'day';
  return (
    <button class="theme-switch" onClick={() => setTheme(to)} aria-label={`Switch to the ${to} look`} title={`${to === 'day' ? 'Day: high contrast for sunlight' : 'Night: dark, the default'}`}>
      {/* names the look it switches to: a sun to go to day, a moon to go back to night */}
      <span class="theme-glyph" aria-hidden="true">
        {to === 'day' ? '☀' : '☾'}
      </span>
      {to === 'day' ? 'Day' : 'Night'}
    </button>
  );
}

const byDate = (a: EspnEvent, b: EspnEvent) => new Date(a.date).getTime() - new Date(b.date).getTime();

function GameCard({ e }: { e: EspnEvent }) {
  const c = e.competitions[0];
  const st = e.status.type.state;
  const away = teamInfo(c.competitors.find((x) => x.homeAway === 'away')!);
  const home = homeBeside(away, teamInfo(c.competitors.find((x) => x.homeAway === 'home')!));
  const sit = c.situation;
  const wp = sit?.lastPlay?.probability?.homeWinPercentage;
  const close = st === 'in' && (e.status.period ?? 0) >= 4 && Math.abs(home.score - away.score) <= 8;
  const done = st === 'post' && e.status.type.completed;
  // A final sits under the "Final" heading, so it says nothing unless it went to overtime.
  const status = done
    ? (e.status.period ?? 0) > 4
      ? 'OT'
      : ''
    : st === 'pre'
      ? kickoffText(e.date)
      : clockLabel(e.status.type.name, e.status.period ?? 0, e.status.displayClock, e.status.type.shortDetail);
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
      {done ? (
        status && <span class="sb-ot" title="Decided in overtime">{status}</span>
      ) : (
        <div class="sb-side">
          <div class="sb-status">
            {st === 'in' && <Icon name="clock" size={14} />}
            {status}
          </div>
          {st === 'in' && sit?.downDistanceText && (
            <div class={`sb-sit${sit.isRedZone ? ' is-redzone' : ''}`}>
              {sit.isRedZone && <Icon name="zone" size={12} label="Red zone" />}
              {sit.downDistanceText}
            </div>
          )}
          {st === 'pre' && meta && <div class="sb-meta">{meta}</div>}
        </div>
      )}
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
    <div class={`sb-team${res}${fillClass(t)}`} style={teamVars(t)}>
      {t.logo && <Logo src={smallLogo(t.logo)} abbr={t.abbr} size={28} on={t.fill?.logo} />}
      <span class="abbr">{t.abbr}</span>
      {poss && <span class="poss" aria-label="has the ball" />}
      <span class="rec">{t.record}</span>
      {showScore && <span class="score">{t.score}</span>}
      {res === ' is-winner' && <span class="sr">winner</span>}
    </div>
  );
}

// One visible credit line (the licence wants the source and the licence linked), the rest folded with the look switch.
export function Footer() {
  return (
    <footer class="footer">
      <p class="footer-line">
        Data: ESPN (unofficial) · <a href="https://github.com/nflverse/nflverse-data">nflverse</a>,{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · no ads
      </p>
      <Fold id="about" label="Look, data and credits">
        <ThemeChoice />
        <p class="sec-note">
          Live data and logos come from ESPN (unofficial, personal use), fetched by your browser straight from ESPN. Advanced
          stats come from nflverse play-by-play (nflfastR models); Gridiron sums the plays into per-game team and
          quarterback numbers, and builds the expected-points table behind the live EPA estimate from past seasons. No
          analytics. Not affiliated with ESPN, the NFL, nflverse or any team.
        </p>
        <p class="sec-note keys">
          Keys: <kbd>←</kbd> <kbd>→</kbd> change week · <kbd>Esc</kbd> back to the games · <kbd>←</kbd> <kbd>→</kbd> step a replay
        </p>
      </Fold>
    </footer>
  );
}

const LOOKS: [Theme, string, string][] = [
  ['night', 'Night', 'dark, the default'],
  ['day', 'Day', 'high contrast for sunlight'],
];

function ThemeChoice() {
  const theme = useTheme();
  return (
    <div class="looks" role="group" aria-label="Look">
      {LOOKS.map(([t, name, what]) => (
        <button key={t} class="look" aria-pressed={theme === t} onClick={() => setTheme(t)}>
          <b>{name}</b> {what}
        </button>
      ))}
    </div>
  );
}
