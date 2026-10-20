// Turns ESPN's summary JSON into the one Game shape every component reads.
import type { EspnCompetitor, EspnDrive, EspnPlay, EspnSituation, EspnSummary, EspnTeam } from './types';
import { estimateEpa, type EpTable } from '../stats/ep';

export type PlayKind = 'pass' | 'rush' | 'kick' | 'punt' | 'fg' | 'xp' | 'penalty' | 'other';

export interface TeamInfo {
  id: string;
  abbr: string;
  name: string;
  short: string;
  color: string; // '#rrggbb'
  color2: string;
  logo: string;
  side: 'home' | 'away';
  score: number;
  record: string;
  linescores: number[];
}

export interface Play {
  id: string;
  idx: number; // order in the game, 0-based, admin rows excluded
  driveIdx: number;
  period: number;
  clock: string;
  gameSec: number;
  text: string;
  typeText: string;
  kind: PlayKind;
  offenseId: string; // team with the ball at the snap
  defenseId: string;
  down: number;
  distance: number;
  ytg: number; // yards to the end zone at the snap, offense-relative
  endTeamId: string;
  endYtg: number;
  endDown: number;
  endDistance: number;
  yards: number;
  scoring: boolean;
  turnover: boolean;
  penalty: boolean;
  noPlay: boolean; // a penalty that wiped the play
  homeScore: number;
  awayScore: number;
  wpHome: number | null; // home win probability after the play
  wpDelta: number; // change in home WP caused by this play
  epa: number | null; // estimated live EPA for the offense, scrimmage plays only
  wallclock: string | null; // when ESPN says the play happened
  success: boolean | null; // 40/60/100 rule, scrimmage plays only
  explosive: boolean;
  ddText: string; // "2nd & 7 · SF 41"
}

export type DriveCap = 'td' | 'fg' | 'miss' | 'punt' | 'to' | 'downs' | 'half' | 'live' | 'other';

export interface Drive {
  id: string;
  idx: number;
  teamId: string;
  abbr: string;
  period: number;
  startClock: string;
  startPos: number; // 0 = own goal line, 100 = opponent's goal line
  endPos: number;
  result: string;
  resultCode: string;
  cap: DriveCap;
  plays: Play[];
  yards: number;
  offensivePlays: number;
  elapsed: string;
  isLive: boolean;
  points: number;
  scoreBefore: { home: number; away: number };
}

export interface Situation {
  text: string; // "3rd & 4 · SF 38"
  possessionId: string;
  redZone: boolean;
  homeTimeouts: number | null;
  awayTimeouts: number | null;
}

export interface Game {
  id: string;
  state: 'pre' | 'in' | 'post';
  statusName: string;
  period: number;
  clockText: string; // "Q2 2:14" | "Half" | "Final" ...
  home: TeamInfo;
  away: TeamInfo;
  plays: Play[];
  drives: Drive[];
  wpPoints: { gameSec: number; home: number }[];
  regulationSec: number;
  otLen: number;
  situation: Situation | null;
  lastPlay: Play | null;
  box: EspnSummary['boxscore'];
  truncated: boolean; // a replay cut; the box score is still the final one
  seasonType: number;
  kickoff: string; // ISO date
}

const ADMIN = /^(official timeout|timeout|two-minute warning|end period|end of half|end of game|end of regulation|coin toss)$/i;

function hex(c: string | undefined, fallback: string): string {
  if (!c) return fallback;
  return c.startsWith('#') ? c : `#${c}`;
}

function logoOf(t: EspnTeam): string {
  return t.logo ?? t.logos?.[0]?.href ?? '';
}

function recordOf(c: EspnCompetitor): string {
  const r = c.records ?? c.record;
  return r?.find((x) => !x.type || x.type === 'total')?.summary ?? r?.[0]?.summary ?? '';
}

export function teamInfo(c: EspnCompetitor): TeamInfo {
  return {
    id: c.team.id,
    abbr: c.team.abbreviation,
    name: c.team.displayName,
    short: c.team.shortDisplayName ?? c.team.name ?? c.team.abbreviation,
    color: hex(c.team.color, '#666666'),
    color2: hex(c.team.alternateColor, '#999999'),
    logo: logoOf(c.team),
    side: c.homeAway,
    score: Number(c.score ?? 0) || 0,
    record: recordOf(c),
    linescores: (c.linescores ?? []).map((l) => Number(l.value ?? l.displayValue ?? 0) || 0),
  };
}

export function clockSeconds(display: string | undefined): number {
  if (!display) return 0;
  const [m, s] = display.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

export function gameSeconds(period: number, clock: string | undefined, otLen: number): number {
  const left = clockSeconds(clock);
  if (period <= 4) return (period - 1) * 900 + (900 - left);
  return 3600 + (period - 5) * otLen + (otLen - left);
}

export function ordinal(n: number): string {
  return ['', '1st', '2nd', '3rd', '4th'][n] ?? `${n}th`;
}

// "SF 38" from the offense's yards-to-go, the way a broadcast says it.
export function fieldText(ytg: number, off: string, def: string): string {
  if (ytg === 50) return '50';
  return ytg > 50 ? `${off} ${100 - ytg}` : `${def} ${ytg}`;
}

export function downDistance(down: number, distance: number, ytg: number): string {
  if (!down) return '';
  const togo = distance >= ytg && ytg <= 10 ? 'Goal' : String(distance);
  return `${ordinal(down)} & ${togo}`;
}

function classify(p: EspnPlay): PlayKind {
  const t = (p.type?.text ?? '').toLowerCase();
  const x = p.text.toLowerCase();
  if (t.includes('kickoff')) return 'kick';
  if (t.includes('punt')) return 'punt';
  if (t.includes('field goal')) return 'fg';
  if (t.includes('two point') || t.includes('two-point') || t.includes('extra point')) return 'xp';
  if (t.includes('pass') || t.includes('sack') || t.includes('interception')) return 'pass';
  if (t === 'rush' || t.includes('rushing')) return x.includes('scrambles') ? 'pass' : 'rush';
  if (t.includes('fumble') || t.includes('safety')) {
    if (/\bpunts?\b|kicks? \d|field goal/.test(x)) return 'other';
    if (/\bpass\b|sacked|scrambles/.test(x)) return 'pass';
    return 'rush';
  }
  if (t === 'penalty') {
    // A flag that wiped out a real snap still describes the snap: nflverse counts it as that pass or run.
    const before = x.split('penalty on')[0];
    if (/\bpass\b|sacked|scrambles/.test(before)) return 'pass';
    if (/\b(left|right) (end|tackle|guard)\b|up the middle|\brush(es)?\b/.test(before)) return 'rush';
    return 'penalty';
  }
  return 'other';
}

function isNoPlay(p: EspnPlay): boolean {
  return /no play/i.test(p.text);
}

/** Kneel-downs and spikes are clock plays, not football; nflverse leaves them out of EPA and success. */
function isClockPlay(p: EspnPlay): boolean {
  return /\bkneels\b|\bspiked?\b/i.test(p.text);
}

// The 40/60/100 rule: 1st down needs 40% of the distance, 2nd 60%, 3rd/4th all of it.
export function isSuccess(down: number, distance: number, yards: number, td: boolean, turnover: boolean): boolean {
  if (turnover) return false;
  if (td) return true;
  const need = down === 1 ? 0.4 : down === 2 ? 0.6 : 1;
  return yards >= need * distance;
}

function capOf(result: string): DriveCap {
  const r = result.toUpperCase();
  if (r.includes('TD') || r === 'TOUCHDOWN') return r.includes('INT') || r.includes('FUMB') ? 'to' : 'td';
  if (r === 'FG' || r === 'FIELD GOAL') return 'fg';
  if (r.includes('MISSED') || r.includes('BLOCKED FG') || r === 'FG MISSED') return 'miss';
  if (r.includes('PUNT')) return 'punt';
  if (r.includes('INT') || r.includes('FUMBLE') || r === 'SF' || r.includes('SAFETY')) return 'to';
  if (r.includes('DOWNS')) return 'downs';
  if (r.includes('HALF') || r.includes('GAME') || r.includes('END')) return 'half';
  return 'other';
}

function shortResult(d: EspnDrive): string {
  const r = (d.result ?? d.shortDisplayResult ?? '').toUpperCase();
  const map: Record<string, string> = {
    'END OF HALF': 'HALF',
    'END OF GAME': 'END',
    'MISSED FG': 'MISS',
    'BLOCKED FG': 'BLK',
    'FUMBLE': 'FUM',
    'DOWNS': 'DOWNS',
  };
  return map[r] ?? (r.length > 6 ? (d.shortDisplayResult ?? r).toUpperCase().slice(0, 6) : r);
}

export interface BuildOptions {
  upto?: number; // replay: keep only the first N plays
  ep?: EpTable | null;
  // ESPN's summary carries no situation block during a live game (seen on MNF 10-19); the scoreboard does,
  // so the page passes the scoreboard's timeouts in. Down and distance still come from the fresher summary.
  timeouts?: { home: number | null; away: number | null };
}

export function buildGame(s: EspnSummary, opts: BuildOptions = {}): Game {
  const comp = s.header.competitions[0];
  const homeC = comp.competitors.find((c) => c.homeAway === 'home')!;
  const awayC = comp.competitors.find((c) => c.homeAway === 'away')!;
  const home = teamInfo(homeC);
  const away = teamInfo(awayC);
  const seasonType = s.header.season?.type ?? 2;
  const otLen = seasonType === 3 ? 900 : 600;
  const abbrOf = (id: string) => (id === home.id ? home.abbr : id === away.id ? away.abbr : '');
  const otherOf = (id: string) => (id === home.id ? away.id : home.id);

  const wpById = new Map<string, number>();
  for (const w of s.winprobability ?? []) wpById.set(w.playId, w.homeWinPercentage);

  // The in-progress drive is the freshest copy; if ESPN also lists it under previous, the current one wins.
  const cur = s.drives?.current;
  const rawDrives: (EspnDrive & { live?: boolean })[] = (s.drives?.previous ?? []).filter((d) => d.id !== cur?.id);
  // At halftime ESPN can still list the half's last drive as current; it isn't happening now, so it isn't live.
  const driving = comp.status.type.state === 'in' && comp.status.type.name !== 'STATUS_HALFTIME';
  if (cur && driving) rawDrives.push({ ...cur, live: true });
  else if (cur) rawDrives.push(cur);

  const plays: Play[] = [];
  const drives: Drive[] = [];
  let prevWp: number | null = null;
  let prevHome = 0;
  let prevAway = 0;
  const limit = opts.upto ?? Infinity;

  for (const rd of rawDrives) {
    if (plays.length >= limit) break;
    const teamId = rd.team.id ?? (rd.team.abbreviation === home.abbr ? home.id : away.id);
    const isHome = teamId === home.id;
    const norm = (yl: number | undefined) => (yl == null ? null : isHome ? yl : 100 - yl);
    const scoreBefore = { home: prevHome, away: prevAway };
    const drive: Drive = {
      id: rd.id,
      idx: drives.length,
      teamId,
      abbr: abbrOf(teamId) || rd.team.abbreviation,
      period: rd.start.period.number,
      startClock: rd.start.clock?.displayValue ?? '',
      startPos: norm(rd.start.yardLine) ?? 25,
      endPos: norm(rd.end?.yardLine) ?? norm(rd.start.yardLine) ?? 25,
      result: rd.displayResult ?? rd.result ?? '',
      resultCode: shortResult(rd),
      cap: rd.live ? 'live' : capOf(rd.result ?? ''),
      plays: [],
      yards: rd.yards ?? 0,
      offensivePlays: rd.offensivePlays ?? 0,
      elapsed: rd.timeElapsed?.displayValue ?? '',
      isLive: !!rd.live,
      points: 0,
      scoreBefore,
    };

    for (const p of rd.plays ?? []) {
      if (plays.length >= limit) break;
      if (ADMIN.test(p.type?.text ?? '')) continue;
      const kind = classify(p);
      const offenseId = p.start.team?.id ?? teamId;
      const defenseId = otherOf(offenseId);
      const down = p.start.down ?? 0;
      const distance = p.start.distance ?? 0;
      const ytg = p.start.yardsToEndzone ?? 0;
      const endTeamId = p.end.team?.id ?? offenseId;
      const yards = p.statYardage ?? 0;
      const noPlay = isNoPlay(p);
      // ESPN sometimes dips a score for one row and restores it on the next. Scores never go down in a game,
      // and only a flagged scoring play earns the points, so a dip can't fake a defensive touchdown.
      const homeScore = Math.max(prevHome, p.homeScore ?? prevHome);
      const awayScore = Math.max(prevAway, p.awayScore ?? prevAway);
      const flagged = !!p.scoringPlay;
      const offPts = flagged ? (offenseId === home.id ? homeScore - prevHome : awayScore - prevAway) : 0;
      const defPts = flagged ? (offenseId === home.id ? awayScore - prevAway : homeScore - prevHome) : 0;
      // A snap that counts for EPA (as nflverse counts it: real passes and runs, including ones a flag wiped out),
      // and the narrower set that counts for success, explosives and turnovers (the play stood).
      const attempt = (kind === 'pass' || kind === 'rush') && down > 0 && !isClockPlay(p);
      const scrimmage = attempt && !noPlay;
      // ESPN's flag misses some fumbles; a 4th-down possession change is a turnover on downs, not a giveaway.
      const turnover = !!p.isTurnover || (scrimmage && down !== 4 && endTeamId !== offenseId && offPts <= 0);
      const td = scrimmage && offPts >= 6;
      const wp = wpById.get(p.id) ?? null;
      const wpDelta = wp != null && prevWp != null ? wp - prevWp : 0;
      const off = abbrOf(offenseId);
      const def = abbrOf(defenseId);
      const dd = downDistance(down, distance, ytg);
      const play: Play = {
        id: p.id,
        idx: plays.length,
        driveIdx: drive.idx,
        period: p.period.number,
        clock: p.clock.displayValue,
        gameSec: gameSeconds(p.period.number, p.clock.displayValue, otLen),
        text: p.text,
        typeText: p.type?.text ?? '',
        kind,
        offenseId,
        defenseId,
        down,
        distance,
        ytg,
        endTeamId,
        endYtg: p.end.yardsToEndzone ?? ytg,
        endDown: p.end.down ?? 0,
        endDistance: p.end.distance ?? 0,
        yards,
        scoring: flagged,
        turnover,
        penalty: !!p.isPenalty || kind === 'penalty',
        noPlay,
        homeScore,
        awayScore,
        wpHome: wp,
        wpDelta,
        epa: null,
        wallclock: p.wallclock ?? null,
        success: scrimmage ? isSuccess(down, distance, yards, td, turnover) : null,
        explosive: scrimmage && !turnover && ((kind === 'rush' && yards >= 10) || (kind === 'pass' && yards >= 20)),
        ddText: dd ? `${dd} · ${fieldText(ytg, off, def)}` : kind === 'kick' ? 'Kickoff' : p.type?.text ?? '',
      };
      if (opts.ep && attempt) play.epa = estimateEpa(opts.ep, play, offPts, defPts);
      if (wp != null) prevWp = wp;
      prevHome = homeScore;
      prevAway = awayScore;
      plays.push(play);
      drive.plays.push(play);
    }

    const after = drive.plays.length ? drive.plays[drive.plays.length - 1] : null;
    if (after) {
      drive.points = isHome ? after.homeScore - scoreBefore.home : after.awayScore - scoreBefore.away;
      // ESPN's current drive often has no end spot yet; the last snap's result is the truth.
      if (drive.isLive) drive.endPos = after.endTeamId === teamId ? 100 - after.endYtg : 100 - after.ytg;
      // A drive that just scored is over, even while ESPN still calls it current (until the kickoff).
      if (drive.isLive && after.scoring && drive.points > 0) {
        drive.isLive = false;
        drive.cap = drive.points >= 6 ? 'td' : drive.points >= 3 ? 'fg' : 'other';
        drive.resultCode = drive.points >= 6 ? 'TD' : drive.points >= 3 ? 'FG' : drive.resultCode;
        drive.endPos = drive.points >= 6 ? 100 : drive.endPos;
      }
    }
    drives.push(drive);
  }

  const truncated = opts.upto != null && opts.upto < countPlays(rawDrives);
  const lastPlay = plays.length ? plays[plays.length - 1] : null;

  // In a replay the cut point is "now": the drive holding it is live, scores come from that play.
  if (truncated && lastPlay) {
    home.score = lastPlay.homeScore;
    away.score = lastPlay.awayScore;
    const d = drives[drives.length - 1];
    d.isLive = true;
    d.cap = 'live';
    const s0 = d.plays[d.plays.length - 1];
    d.endPos = 100 - s0.endYtg;
    if (s0.endTeamId !== d.teamId) d.endPos = 100 - s0.ytg;
  }

  const status = comp.status;
  let state = status.type.state;
  let period = status.period ?? lastPlay?.period ?? 0;
  let clockText =
    status.type.state === 'pre'
      ? new Date(comp.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : clockLabel(status.type.name, period, status.displayClock, status.type.shortDetail);
  if (truncated && lastPlay) {
    state = 'in';
    period = lastPlay.period;
    clockText = `${periodLabel(period)} ${lastPlay.clock}`;
  }

  const wpPoints = plays.filter((p) => p.wpHome != null).map((p) => ({ gameSec: p.gameSec, home: p.wpHome! }));
  const regulationSec = Math.max(3600, lastPlay?.gameSec ?? 0, period > 4 ? 3600 + (period - 4) * otLen : 0);

  return {
    id: s.header.id,
    state,
    statusName: status.type.name,
    period,
    clockText,
    home,
    away,
    plays,
    drives,
    wpPoints,
    regulationSec,
    otLen,
    situation:
      state === 'in' && status.type.name !== 'STATUS_HALFTIME'
        ? situationOf(truncated ? undefined : s.situation, lastPlay, home, away, truncated ? undefined : opts.timeouts)
        : null,
    lastPlay,
    box: s.boxscore,
    truncated,
    seasonType,
    kickoff: comp.date,
  };
}

function countPlays(ds: EspnDrive[]): number {
  let n = 0;
  for (const d of ds) for (const p of d.plays ?? []) if (!ADMIN.test(p.type?.text ?? '')) n++;
  return n;
}

export function periodLabel(period: number): string {
  return period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `${period - 4}OT`;
}

export function clockLabel(name: string, period: number, clock: string | undefined, shortDetail: string | undefined): string {
  switch (name) {
    case 'STATUS_FINAL':
      return period > 4 ? 'Final/OT' : 'Final';
    case 'STATUS_HALFTIME':
      return 'Half';
    case 'STATUS_END_PERIOD':
      return `End ${periodLabel(period)}`;
    case 'STATUS_IN_PROGRESS':
      return `${periodLabel(period)} ${clock ?? ''}`.trim();
    default:
      return shortDetail ?? '';
  }
}

function situationOf(
  sit: EspnSituation | undefined,
  last: Play | null,
  home: TeamInfo,
  away: TeamInfo,
  timeouts?: { home: number | null; away: number | null },
): Situation | null {
  const abbr = (id: string) => (id === home.id ? home.abbr : away.abbr);
  const other = (id: string) => (id === home.id ? away.id : home.id);
  if (sit && sit.possession) {
    const ytg = sit.yardLine != null ? (sit.possession === home.id ? 100 - sit.yardLine : sit.yardLine) : null;
    const dd = sit.down ? downDistance(sit.down, sit.distance ?? 0, ytg ?? 99) : '';
    const spot = sit.possessionText ?? (ytg != null ? fieldText(ytg, abbr(sit.possession), abbr(other(sit.possession))) : '');
    return {
      text: [dd, spot].filter(Boolean).join(' · ') || sit.downDistanceText || '',
      possessionId: sit.possession,
      redZone: !!sit.isRedZone,
      homeTimeouts: sit.homeTimeouts ?? null,
      awayTimeouts: sit.awayTimeouts ?? null,
    };
  }
  // Without ESPN's situation block: after a score or a kickoff-less end of drive there is no snap to describe.
  if (!last || last.scoring) return null;
  const pos = last.endTeamId;
  const dd = downDistance(last.endDown, last.endDistance, last.endYtg);
  return {
    text: [dd, fieldText(last.endYtg, abbr(pos), abbr(other(pos)))].filter(Boolean).join(' · '),
    possessionId: pos,
    redZone: last.endYtg <= 20 && last.endDown > 0,
    homeTimeouts: timeouts?.home ?? null,
    awayTimeouts: timeouts?.away ?? null,
  };
}
