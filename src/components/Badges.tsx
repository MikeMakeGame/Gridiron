import type { Game, Play } from '../espn/model';
import { signed, teamVars } from '../format';

// "SF +4.1%": who gained win probability on this play, and how much.
export function WpDelta({ g, p, min = 0.005 }: { g: Game; p: Play; min?: number }) {
  if (p.wpHome == null || Math.abs(p.wpDelta) < min) return null;
  const t = p.wpDelta > 0 ? g.home : g.away;
  const big = Math.abs(p.wpDelta) >= 0.1;
  return (
    <span class={`wpd${big ? ' big' : ''}`} style={teamVars(t)} title="Win probability swing (ESPN)">
      {t.abbr} +{(Math.abs(p.wpDelta) * 100).toFixed(1)}%
    </span>
  );
}

// EPA is always the offense's, so the badge names the offense.
export function Epa({ v, team, est = true }: { v: number | null; team?: string; est?: boolean }) {
  if (v == null) return null;
  const cls = v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : '';
  return (
    <span class={`epa ${cls}${est ? ' est' : ''}`} title={est ? 'Expected points added for the offense, estimated live' : 'Expected points added (nflverse)'}>
      {team ? `${team} ` : ''}
      {signed(v, 1)} EPA
    </span>
  );
}

export function offenseAbbr(g: Game, p: Play): string {
  return p.offenseId === g.home.id ? g.home.abbr : g.away.abbr;
}
