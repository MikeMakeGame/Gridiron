// The live numbers: everything here is computed from ESPN's play-by-play, no model except the EP table.
import type { Game, Play, TeamInfo } from '../espn/model';

export interface TeamNumbers {
  plays: number;
  successRate: number | null;
  epaPerPlay: number | null;
  epaPlays: number;
  yardsPerPlay: number | null;
  explosives: number;
  earlyDownPassRate: number | null;
  avgThirdDistance: number | null;
  thirdDowns: number;
  pointsPerDrive: number | null;
  drives: number;
  turnovers: number;
  turnoverWpCost: number; // win probability the team gave away on its turnovers, 0..1
  avgStart: number | null; // own-goal-relative yard line, 0..100
}

export function isScrimmage(p: Play): boolean {
  return (p.kind === 'pass' || p.kind === 'rush') && !p.noPlay && p.down > 0 && p.success != null;
}

// Neutral-ish early downs: 1st/2nd down, not inside the last two minutes of a half.
function isEarlyDownNeutral(p: Play): boolean {
  if (p.down > 2) return false;
  const lateHalf = (p.period === 2 || p.period >= 4) && clockLeft(p.clock) <= 120;
  return !lateHalf;
}

function clockLeft(c: string): number {
  const [m, s] = c.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function teamNumbers(g: Game, team: TeamInfo): TeamNumbers {
  const mine = g.plays.filter((p) => p.offenseId === team.id && isScrimmage(p));
  // EPA is set on every snap nflverse would count (including passes and runs a flag wiped out), so take them all.
  const epas = g.plays.filter((p) => p.offenseId === team.id && p.epa != null).map((p) => p.epa as number);
  const early = mine.filter(isEarlyDownNeutral);
  const thirds = mine.filter((p) => p.down === 3);
  const drives = g.drives.filter((d) => d.teamId === team.id && !d.isLive && !(d.cap === 'half' && d.offensivePlays <= 2 && d.points === 0));
  // A team's turnovers are its own snaps that gave the ball away; a muffed punt is the returner's, not the punter's.
  const turnovers = mine.filter((p) => p.turnover);
  const sign = team.side === 'home' ? 1 : -1;
  const startDrives = g.drives.filter((d) => d.teamId === team.id);
  return {
    plays: mine.length,
    successRate: mine.length ? mine.filter((p) => p.success).length / mine.length : null,
    epaPerPlay: mean(epas),
    epaPlays: epas.length,
    yardsPerPlay: mean(mine.map((p) => p.yards)),
    explosives: mine.filter((p) => p.explosive).length,
    earlyDownPassRate: early.length ? early.filter((p) => p.kind === 'pass').length / early.length : null,
    avgThirdDistance: mean(thirds.map((p) => p.distance)),
    thirdDowns: thirds.length,
    pointsPerDrive: drives.length ? drives.reduce((a, d) => a + d.points, 0) / drives.length : null,
    drives: drives.length,
    turnovers: turnovers.length,
    turnoverWpCost: Math.max(0, -turnovers.reduce((a, p) => a + sign * p.wpDelta, 0)),
    avgStart: mean(startDrives.map((d) => d.startPos)),
  };
}

// Late in the 4th: how many possessions are left, from this game's own average drive length.
export function possessionsLeft(g: Game): number | null {
  if (g.state !== 'in' || g.period !== 4 || !g.lastPlay) return null;
  const done = g.drives.filter((d) => !d.isLive && d.elapsed);
  if (done.length < 6) return null;
  const avg = done.reduce((a, d) => a + clockLeft(d.elapsed), 0) / done.length;
  const left = 3600 - g.lastPlay.gameSec;
  return avg > 0 ? left / avg : null;
}

// The plays that moved the game the most, by win-probability swing.
export function biggestPlays(g: Game, n: number): Play[] {
  return [...g.plays]
    .filter((p) => p.wpHome != null)
    .sort((a, b) => Math.abs(b.wpDelta) - Math.abs(a.wpDelta))
    .slice(0, n);
}
