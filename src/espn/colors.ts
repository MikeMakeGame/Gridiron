// Team colours as fills: every tile that shows a team wears the team's own colour, the way a broadcast score bug
// does. ESPN gives each team a colour and an alternate; this module turns them into a fill, the text that reads on
// it (picked by computed contrast, never a hand list), an accent stripe, and which of ESPN's logo sets reads on it.
// Two teams whose fills would read as one (two navy teams) are told apart by colour distance, not by name.
// scripts/team_contrast.py mirrors these rules to check every team's colours as fills.

export type LogoSet = 'dark' | 'light'; // ESPN's dark-background logos, or its light-background ones

export interface TeamFill {
  bg: string; // the fill, '#rrggbb'
  fg: string; // text on the fill: white, ink or black, whichever has the contrast
  accent: string; // the stripe: the team's other colour, or the text colour when the other colour sits too close
  logo: LogoSet;
  /** Set on the home side when no colour of its own stands apart from the away fill: draw a divider instead. */
  divider: boolean;
}

export const WHITE = '#ffffff';
/** The page's own near-black: the Day look's `--tx` in styles.css, and INK in scripts/team_contrast.py (a test checks all three match). */
export const INK = '#0b0d10';
export const BLACK = '#000000';
/** WCAG AA for body text; every team text colour on its fill clears it. */
export const TEXT_MIN = 4.5;
/**
 * Two colours closer than this in OKLab read as one at a glance. Navy against navy (DAL / NE / SEA share #002a5c;
 * BUF #00338d against LAR #003594 is 0.013) sits far under it; the nearest pairs that read apart (navy against a
 * brighter navy, NYG #003c7f against DAL, 0.078; brown against maroon, CLE against WSH, 0.067) sit just around it,
 * so the line falls at 0.08. Measured over all 32 teams' ESPN colours by scripts/team_contrast.py.
 */
export const CLASH_DISTANCE = 0.08;

export function rgbOf(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

// Black, white and greys carry no team identity.
export function isNeutral(hex: string): boolean {
  const c = rgbOf(hex);
  if (!c) return false;
  return Math.max(...c) - Math.min(...c) < 24;
}

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const c = rgbOf(hex);
  if (!c) return 0;
  const [r, g, b] = c.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function oklab(hex: string): [number, number, number] {
  const c = rgbOf(hex) ?? [0, 0, 0];
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How far apart two colours look: Euclidean distance in OKLab (0 = the same colour, about 1 = black to white). */
export function colorDistance(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * The text colour for a fill: white or ink, whichever contrasts more. In the narrow band of mid-tone fills where
 * ink falls under 4.5:1 (it is a touch lighter than black), pure black; white against black always clears 4.58:1
 * at worst, so whatever this returns clears TEXT_MIN on any fill.
 */
export function textOn(fill: string): string {
  if (contrast(WHITE, fill) >= contrast(BLACK, fill)) return WHITE;
  return contrast(INK, fill) >= TEXT_MIN ? INK : BLACK;
}

/** A fill from one colour, with the team's other colour as its stripe. */
export function paint(bg: string, other: string): TeamFill {
  const fg = textOn(bg);
  return {
    bg,
    fg,
    accent: colorDistance(other, bg) >= CLASH_DISTANCE ? other : fg,
    logo: fg === WHITE ? 'dark' : 'light',
    divider: false,
  };
}

/** The colour a team is shown in: its primary, or its alternate when the primary is black, white or grey. */
export function shownColor(t: { color: string; color2: string }): string {
  return isNeutral(t.color) ? t.color2 : t.color;
}

/** A team's own fill: the shown colour as the fill, the other colour as the stripe. */
export function teamFill(t: { color: string; color2: string }): TeamFill {
  const bg = shownColor(t);
  return paint(bg, bg === t.color ? t.color2 : t.color);
}

// --- lines: a team colour as styles.css draws it in lines, bars and chart labels --------------------------------
// styles.css lifts the shown colour to a shared OKLCH lightness per look (navy, maroon and black all read on ink):
//   night: oklch(from tc max(l, .64) calc(c * 1.35) h)    day: oklch(from tc min(l, .46) calc(c * 1.1) h)
// That flattens lightness, so two colours apart as fills can meet as lines (navy and a brighter blue both land on
// l .64). LINE holds those numbers; styles.css spells the same ones and a test checks they match.
export type Look = 'night' | 'day';
export const LINE: Record<Look, { l: number; c: number }> = { night: { l: 0.64, c: 1.35 }, day: { l: 0.46, c: 1.1 } };

/** The lightness a team's lines take on each look, set when they would otherwise read as the other team's. */
export interface LineLift {
  night: number;
  day: number;
}

function lineLab(hex: string, look: Look, l?: number): [number, number, number] {
  const [L, a, b] = oklab(hex);
  const C = Math.hypot(a, b) * LINE[look].c;
  const h = Math.atan2(b, a);
  const L2 = l ?? (look === 'night' ? Math.max(L, LINE.night.l) : Math.min(L, LINE.day.l));
  return [L2, C * Math.cos(h), C * Math.sin(h)];
}

/** The lightness a colour's lines take on a look (before any lift). */
export const lineLightness = (hex: string, look: Look): number => lineLab(hex, look)[0];

/** Whether two teams' lines would read as one on either look (OKLab distance after the lift, gamut clipping aside). */
export function linesClash(a: string, b: string, liftB: LineLift | null = null): boolean {
  return (['night', 'day'] as Look[]).some((look) => {
    const x = lineLab(a, look);
    const y = lineLab(b, look, liftB?.[look]);
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < CLASH_DISTANCE;
  });
}

/**
 * The home side's line lightness when its lines would meet the away side's: 0.18 lighter than the away line on
 * night (0.16 darker when the away line is already light), 0.16 darker on day (lighter when the away line is already
 * dark). Lightness, never hue, so the team keeps its one colour; every target stays inside the look's own
 * contrast bound (night at or over .64, day at or under .46), and a lightness gap of .16 alone clears CLASH_DISTANCE.
 */
export function liftFor(away: string): LineLift {
  const n = lineLightness(away, 'night');
  const d = lineLightness(away, 'day');
  return { night: n < 0.8 ? n + 0.18 : n - 0.16, day: d >= 0.26 ? d - 0.16 : d + 0.16 };
}

/**
 * The home team beside the away team: one colour per team per view. When the two fills would read as one, the home
 * side swaps to its other colour, fill and lines alike; when that colour is grey, black or white, or clashes too, it
 * keeps its fill and asks for a divider. Then, if the two teams' lines would still read as one once styles.css lifts
 * them, the home lines move in lightness (`lift`). Run it on ESPN's own colours.
 */
export function pairHome<T extends { color: string; color2: string; fill: TeamFill | null; lift: LineLift | null }>(away: T, home: T): T {
  let h = home;
  if (away.fill && home.fill && colorDistance(away.fill.bg, home.fill.bg) < CLASH_DISTANCE) {
    const own = shownColor(home);
    const other = own === home.color ? home.color2 : home.color;
    h =
      !isNeutral(other) && colorDistance(away.fill.bg, other) >= CLASH_DISTANCE
        ? { ...home, color: other, color2: own, fill: paint(other, own) }
        : { ...home, fill: { ...home.fill, divider: true } };
  }
  const a = shownColor(away);
  return linesClash(a, shownColor(h)) ? { ...h, lift: liftFor(a) } : h;
}
