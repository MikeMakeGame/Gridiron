import type { TeamInfo } from './espn/model';

export const pct = (x: number | null | undefined, digits = 0) => (x == null ? '–' : `${(x * 100).toFixed(digits)}%`);
export const num = (x: number | null | undefined, digits = 1) => (x == null ? '–' : x.toFixed(digits));
export const signed = (x: number | null | undefined, digits = 2) =>
  x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`;

export function teamVars(t: Pick<TeamInfo, 'color' | 'color2'>): Record<string, string> {
  return { '--tc': isNeutral(t.color) ? t.color2 : t.color, '--tc2': t.color2 };
}

// Black, white and greys carry no team identity on a dark page.
function isNeutral(hex: string): boolean {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
}

function hue(hex: string): number | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const shown = (t: Pick<TeamInfo, 'color' | 'color2'>) => (isNeutral(t.color) ? t.color2 : t.color);

function clash(a: string, b: string): boolean {
  const ha = hue(a);
  const hb = hue(b);
  if (ha == null || hb == null || isNeutral(a) || isNeutral(b)) return false;
  const d = Math.abs(ha - hb);
  return Math.min(d, 360 - d) < 35;
}

/** Two teams whose colours read as one (PIT gold and NO tan): the home side takes its other colour, or plain ink. */
export function apart<T extends Pick<TeamInfo, 'color' | 'color2'>>(away: T, home: T): T {
  const a = shown(away);
  if (!clash(a, shown(home))) return home;
  const other = isNeutral(home.color) ? home.color : home.color2;
  const pick = !isNeutral(other) && !clash(a, other) ? other : '#f4f6f8';
  return { ...home, color: pick, color2: pick };
}

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
