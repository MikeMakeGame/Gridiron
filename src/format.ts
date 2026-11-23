import type { TeamInfo } from './espn/model';
import { shownColor as shown, type LineLift, type TeamFill } from './espn/colors';

export const pct = (x: number | null | undefined, digits = 0) => (x == null ? '–' : `${(x * 100).toFixed(digits)}%`);
export const num = (x: number | null | undefined, digits = 1) => (x == null ? '–' : x.toFixed(digits));
export const signed = (x: number | null | undefined, digits = 2) =>
  x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`;

/**
 * A team's colours as CSS custom properties: `--tc` / `--tc2` for accents (lifted per look in styles.css); when its
 * lines would read as the other team's, `--ta-ln` / `--ta-ld` (the lightness its lines take on night and day); and,
 * when ESPN gave the team a colour, its fill: `--fill`, `--on-fill` (text, picked by contrast) and `--fill2` (the
 * stripe). Every colour decision is in ./espn/colors (`pairHome`).
 */
export function teamVars(t: Pick<TeamInfo, 'color' | 'color2'> & { fill?: TeamFill | null; lift?: LineLift | null }): Record<string, string> {
  const v: Record<string, string> = { '--tc': shown(t), '--tc2': t.color2 };
  if (t.lift) {
    v['--ta-ln'] = t.lift.night.toFixed(3);
    v['--ta-ld'] = t.lift.day.toFixed(3);
  }
  if (t.fill) {
    v['--fill'] = t.fill.bg;
    v['--on-fill'] = t.fill.fg;
    v['--fill2'] = t.fill.accent;
  }
  return v;
}

/** ' has-fill' for an element that wears the team's fill (styles.css keys every fill rule on it), else ''. */
export const fillClass = (t: { fill?: TeamFill | null }): string => (t.fill ? ` has-fill${t.fill.divider ? ' is-split' : ''}` : '');

// ESPN's dark-background logo set (navy and black marks vanish on this page otherwise), resized by ESPN's image
// combiner instead of the 500px PNG; the snapshot bundles its own copies.
export function smallLogo(url: string, px = 64): string {
  const m = url.match(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500(?:-dark)?\/(?:scoreboard\/)?([a-z]+\.png)$/);
  if (!m) return url;
  if (import.meta.env.MODE === 'snapshot') return `./logos/${m[1]}`;
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/${m[1]}&w=${px}&h=${px}`;
}

export function yardText(pos: number): string {
  const p = Math.round(pos);
  if (p === 50) return 'the 50';
  return p < 50 ? `own ${p}` : `opp ${100 - p}`;
}

export function kickoffText(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

// Win probability for a team, never "100%" or "0%" while the game is still going.
export function wpText(x: number, final = false): string {
  if (!final) {
    if (x > 0.995) return '>99%';
    if (x < 0.005) return '<1%';
  }
  return `${Math.round(x * 100)}%`;
}

export function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}
