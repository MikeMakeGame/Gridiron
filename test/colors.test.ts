// Team tiles in full team colours: the text colour on a fill (picked by contrast), one colour per team per view (the
// colour-distance rule that tells two teams apart as fills and as lines), the fallbacks when ESPN's colours are
// missing or malformed, the constants styles.css and the contrast script repeat, and every cached team.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BLACK,
  CLASH_DISTANCE,
  colorDistance,
  contrast,
  INK,
  isNeutral,
  LINE,
  lineLightness,
  linesClash,
  pairHome,
  shownColor,
  teamFill,
  TEXT_MIN,
  textOn,
  WHITE,
  type LineLift,
  type TeamFill,
} from '../src/espn/colors';
import { homeBeside, teamInfo } from '../src/espn/model';
import { fillClass, teamVars } from '../src/format';
import type { EspnCompetitor, EspnSummary } from '../src/espn/types';

// Node's fs, loaded by name as test/baselines.test.ts does (the tsconfig is the browser's); vitest serves CSS as empty.
const nodeMod = (name: string) => import(/* @vite-ignore */ name) as Promise<{ readFileSync: (p: URL, enc: string) => string }>;
const { readFileSync } = await nodeMod('node:fs');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const contrastScript = readFileSync(new URL('../scripts/team_contrast.py', import.meta.url), 'utf8');

const team = (color: string, color2: string) => ({ color, color2, fill: teamFill({ color, color2 }) as TeamFill | null, lift: null as LineLift | null });
const comp = (abbr: string, side: 'home' | 'away', color?: string, alternateColor?: string): EspnCompetitor =>
  ({ id: abbr, homeAway: side, team: { id: abbr, abbreviation: abbr, displayName: abbr, color, alternateColor } }) as EspnCompetitor;
/** The invariant behind one colour per team: two teams' lines read apart on both looks once the home lift applies. */
const linesApart = (away: { color: string; color2: string }, home: { color: string; color2: string; lift: LineLift | null }) =>
  !linesClash(shownColor(away), shownColor(home), home.lift);

describe('the text colour on a team fill', () => {
  it('is white on navy and ink on gold', () => {
    expect(textOn('#002a5c')).toBe(WHITE);
    expect(textOn('#ffb612')).toBe(INK);
  });

  it('clears 4.5:1 on every grey from black to white, and every corner of the colour cube', () => {
    const fills: string[] = [];
    for (let v = 0; v < 256; v++) fills.push(`#${v.toString(16).padStart(2, '0').repeat(3)}`);
    for (const r of [0, 0x80, 0xff]) for (const g of [0, 0x80, 0xff]) for (const b of [0, 0x80, 0xff]) fills.push(`#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`);
    for (const f of fills) expect(contrast(textOn(f), f), f).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('falls to pure black in the mid-tone band where ink is a touch short', () => {
    // #777777: ink reaches about 4.3:1, black about 4.7:1, white about 4.5 but less than black.
    expect(contrast(INK, '#777777')).toBeLessThan(TEXT_MIN);
    expect(textOn('#777777')).toBe(BLACK);
  });
});

describe('a team fill', () => {
  it('fills with the primary and stripes with the alternate', () => {
    const f = teamFill({ color: '#204e32', color2: '#ffb612' }); // GB
    expect(f).toMatchObject({ bg: '#204e32', fg: WHITE, accent: '#ffb612', logo: 'dark', divider: false });
  });

  it('fills with the alternate when the primary is black (gold for black-and-gold), and asks for the light logos', () => {
    const f = teamFill({ color: '#000000', color2: '#ffb612' }); // PIT
    expect(f).toMatchObject({ bg: '#ffb612', fg: INK, accent: '#000000', logo: 'light' });
  });

  it('stripes with the text colour when the other colour sits too close to the fill to show', () => {
    const f = teamFill({ color: '#002a5c', color2: '#0a2343' });
    expect(f.accent).toBe(WHITE);
  });
});

describe('one colour per team per view', () => {
  it('measures colour distance, not names: the same navy is 0, navy against green is far', () => {
    expect(colorDistance('#002a5c', '#002a5c')).toBe(0);
    expect(colorDistance('#00338d', '#003594')).toBeLessThan(CLASH_DISTANCE); // BUF, LAR
    expect(colorDistance('#002a5c', '#204e32')).toBeGreaterThan(CLASH_DISTANCE);
  });

  it('swaps the home side to its other colour, tile and lines alike, when that one stands apart (navy at navy: red)', () => {
    const away = team('#002a5c', '#b0b7bc'); // DAL
    const home = team('#002a5c', '#c60c30'); // NE
    const h = pairHome(away, home);
    expect(h.fill).toMatchObject({ bg: '#c60c30', accent: '#002a5c', fg: WHITE, divider: false });
    expect(shownColor(h)).toBe('#c60c30'); // the lines follow the tile
    expect(teamVars(h)['--tc']).toBe('#c60c30');
    expect(h.lift).toBeNull();
  });

  it('uses a divider, not a grey or black tile, when the other colour is neutral; its lines move in lightness', () => {
    const away = team('#002a5c', '#c60c30'); // NE
    const home = team('#002a5c', '#b0b7bc'); // DAL, silver alternate
    const h = pairHome(away, home);
    expect(h.fill).toMatchObject({ bg: '#002a5c', divider: true });
    expect(h.color).toBe('#002a5c'); // the accent stays the tile's colour
    expect(fillClass(h)).toBe(' has-fill is-split');
    expect(h.lift).not.toBeNull();
    expect(linesApart(away, h)).toBe(true);
    // lighter than the away line on night, darker on day, and inside each look's own contrast bound
    expect(h.lift!.night).toBeGreaterThan(lineLightness('#002a5c', 'night'));
    expect(h.lift!.night).toBeGreaterThanOrEqual(LINE.night.l);
    expect(h.lift!.day).toBeLessThan(lineLightness('#002a5c', 'day'));
    expect(teamVars(h)).toMatchObject({ '--ta-ln': h.lift!.night.toFixed(3), '--ta-ld': h.lift!.day.toFixed(3) });
  });

  it('uses a divider when the other colour clashes too', () => {
    const h = pairHome(team('#002a5c', '#b0b7bc'), team('#00285e', '#0a2343'));
    expect(h.fill).toMatchObject({ bg: '#00285e', divider: true });
  });

  it('moves the lines, not the tile, when two colours apart as fills meet as lines (a blue team at home to navy)', () => {
    const away = team('#002a5c', '#b0b7bc'); // DAL
    const home = team('#0080c6', '#ffc20e'); // LAC
    const h = pairHome(away, home);
    expect(h.fill?.bg).toBe('#0080c6');
    expect(h.color).toBe('#0080c6'); // no more gold lines beside a blue tile
    expect(linesApart(away, h)).toBe(true);
  });

  it('lifts a line darker when the away line is already light (gold away, tan home)', () => {
    const away = team('#000000', '#ffb612'); // PIT
    const home = homeBeside(teamInfo(comp('PIT', 'away', '000000', 'ffb612')), teamInfo(comp('NO', 'home', 'd3bc8d', '000000')));
    expect(home.color).toBe('#d3bc8d'); // its own tan, never plain ink
    expect(home.fill).toMatchObject({ bg: '#d3bc8d', fg: INK, accent: '#000000', logo: 'light', divider: false });
    expect(linesApart(away, home)).toBe(true);
  });

  it('leaves two teams that read apart as fills and as lines alone', () => {
    const home = team('#0076b6', '#b0b7bc');
    expect(pairHome(team('#204e32', '#ffb612'), home)).toBe(home);
  });
});

describe('ESPN colours missing or malformed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('no primary: no fill, one console line, and the plain dark tile (no fill variables, no fill class)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = comp('XNC', 'home');
    const t = teamInfo(c);
    teamInfo(c);
    expect(t.fill).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('XNC');
    expect(teamVars(t)['--fill']).toBeUndefined();
    expect(fillClass(t)).toBe('');
  });

  it('a missing or malformed alternate: one console line, a primary-only fill striped in its text colour, no invalid value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [abbr, alt] of [['XNA', undefined], ['XBA', 'zz12']] as const) {
      const t = teamInfo(comp(abbr, 'home', '0b1c3a', alt));
      teamInfo(comp(abbr, 'home', '0b1c3a', alt));
      expect(t.color2).toBe('#0b1c3a');
      expect(t.fill).toMatchObject({ bg: '#0b1c3a', fg: WHITE, accent: WHITE });
      for (const v of Object.values(teamVars(t))) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1][0])).toContain('"zz12"');
  });

  it('passes a fill to the page as variables when there is one', () => {
    const v = teamVars(team('#204e32', '#ffb612'));
    expect(v).toMatchObject({ '--fill': '#204e32', '--on-fill': WHITE, '--fill2': '#ffb612' });
  });
});

describe('the numbers styles.css and the contrast script repeat', () => {
  it('ink is the Day look’s text colour and the script’s INK', () => {
    const day = css.match(/:root\[data-theme="day"\]\s*\{[^}]*--tx:\s*(#[0-9a-f]{6})/i);
    expect(day?.[1].toLowerCase()).toBe(INK);
    expect(contrastScript).toContain(`INK, BLACK = "#ffffff", "${INK}", "#000000"`);
  });

  it('the line lift is the one styles.css draws, and the script uses the same rule numbers', () => {
    expect(css).toContain(`var(--ta-ln, max(l, ${String(LINE.night.l).replace(/^0/, '')})) calc(c * ${LINE.night.c})`);
    expect(css).toContain(`var(--ta-ld, min(l, ${String(LINE.day.l).replace(/^0/, '')})) calc(c * ${LINE.day.c})`);
    expect(contrastScript).toContain(`TEXT_MIN, CLASH = ${TEXT_MIN}, ${CLASH_DISTANCE}`);
  });
});

// Every team in the local ESPN cache (where present), loaded the way the page loads it. scripts/team_contrast.py
// prints the same tables.
const CACHE = import.meta.glob('../.cache/espn/summary-*.json', { eager: true, import: 'default' }) as Record<string, EspnSummary>;
const teams = new Map<string, ReturnType<typeof teamInfo>>();
for (const s of Object.values(CACHE)) {
  for (const c of s.header?.competitions?.[0]?.competitors ?? []) {
    const t = teamInfo(c);
    if (t.fill) teams.set(t.abbr, t);
  }
}
if (teams.size === 0) console.log('colors.test: no local ESPN cache (.cache/espn), so the every-team colour check is skipped');

describe.skipIf(teams.size === 0)(`every cached team's colours (${teams.size} teams)`, () => {
  it('reads its fill and its alternate as a fill at 4.5:1 or better', () => {
    for (const [abbr, t] of teams) {
      for (const bg of [t.color, t.color2]) expect(contrast(textOn(bg), bg), `${abbr} ${bg}`).toBeGreaterThanOrEqual(TEXT_MIN);
    }
  });

  it('pairs every two teams as two colours: a divider only where the other colour is grey, black or white', () => {
    let swaps = 0;
    let dividers = 0;
    for (const a of teams.values()) {
      for (const h0 of teams.values()) {
        if (a === h0) continue;
        const h = pairHome(a, h0);
        const f = h.fill!;
        const other = shownColor(h0) === h0.color ? h0.color2 : h0.color;
        const label = `${a.abbr} at ${h0.abbr}`;
        // On ESPN's 32 teams no swap ever lands on a second clashing colour: a divider means a neutral alternate.
        expect(!f.divider || isNeutral(other), label).toBe(true);
        if (!f.divider) expect(colorDistance(a.fill!.bg, f.bg), label).toBeGreaterThanOrEqual(CLASH_DISTANCE);
        expect(contrast(f.fg, f.bg), label).toBeGreaterThanOrEqual(TEXT_MIN); // the swapped fill's text too
        expect(linesApart(a, h), label).toBe(true); // and the chart lines read apart on both looks
        if (f.bg !== h0.fill!.bg) swaps++;
        if (f.divider) dividers++;
      }
    }
    console.log(`colors.test: ${swaps} swaps and ${dividers} dividers over ${teams.size * (teams.size - 1)} pairings`);
  });
});
