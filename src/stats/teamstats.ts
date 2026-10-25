// ESPN's team box score, read as a head-to-head: each row says which side did better and by how much.
import type { Game } from '../espn/model';

export type Better = 'high' | 'low' | 'none';
export type StatIcon = 'clock' | 'turnover' | 'flag' | 'sack' | null;

export interface CompareRow {
  key: string;
  label: string;
  group: 'Moving the ball' | 'Finishing' | 'Mistakes' | 'Clock';
  away: string;
  home: string;
  /** The numbers the bar and the verdict use (a rate for "5-13", seconds for "34:21"). */
  av: number;
  hv: number;
  better: Better;
  icon: StatIcon;
}

type Stats = Map<string, string>;

const n = (s: string | undefined) => (s == null || s === '' ? NaN : Number(s));
const made = (s: string | undefined) => n(s?.split(/[-/]/)[0]);
const att = (s: string | undefined) => n(s?.split(/[-/]/)[1]);
const rate = (s: string | undefined) => (att(s) > 0 ? made(s) / att(s) : 0);
const mmss = (s: string | undefined) => {
  const [m, sec] = (s ?? '').split(':').map(Number);
  return (m || 0) * 60 + (sec || 0);
};

interface Def {
  key: string;
  label: string;
  group: CompareRow['group'];
  better: Better;
  icon?: StatIcon;
  show: (s: Stats) => string;
  val: (s: Stats) => number;
  /** Rows that say nothing until something happens (no 4th-down tries yet). */
  skip?: (a: Stats, h: Stats) => boolean;
}

const DEFS: Def[] = [
  { key: 'totalYards', label: 'Total yards', group: 'Moving the ball', better: 'high', show: (s) => s.get('totalYards') ?? '0', val: (s) => n(s.get('totalYards')) },
  { key: 'netPassingYards', label: 'Passing yards', group: 'Moving the ball', better: 'high', show: (s) => s.get('netPassingYards') ?? '0', val: (s) => n(s.get('netPassingYards')) },
  { key: 'rushingYards', label: 'Rushing yards', group: 'Moving the ball', better: 'high', show: (s) => s.get('rushingYards') ?? '0', val: (s) => n(s.get('rushingYards')) },
  { key: 'yardsPerPlay', label: 'Yards per play', group: 'Moving the ball', better: 'high', show: (s) => s.get('yardsPerPlay') ?? '–', val: (s) => n(s.get('yardsPerPlay')) },
  { key: 'firstDowns', label: 'First downs', group: 'Moving the ball', better: 'high', show: (s) => s.get('firstDowns') ?? '0', val: (s) => n(s.get('firstDowns')) },
  { key: 'thirdDownEff', label: '3rd downs', group: 'Finishing', better: 'high', show: (s) => conv(s.get('thirdDownEff')), val: (s) => rate(s.get('thirdDownEff')) },
  {
    key: 'fourthDownEff', label: '4th downs', group: 'Finishing', better: 'high', show: (s) => conv(s.get('fourthDownEff')), val: (s) => rate(s.get('fourthDownEff')),
    skip: (a, h) => !(att(a.get('fourthDownEff')) > 0) && !(att(h.get('fourthDownEff')) > 0),
  },
  {
    key: 'redZoneAttempts', label: 'Red zone TDs', group: 'Finishing', better: 'high', show: (s) => conv(s.get('redZoneAttempts')), val: (s) => rate(s.get('redZoneAttempts')),
    skip: (a, h) => !(att(a.get('redZoneAttempts')) > 0) && !(att(h.get('redZoneAttempts')) > 0),
  },
  { key: 'turnovers', label: 'Turnovers', group: 'Mistakes', better: 'low', icon: 'turnover', show: (s) => s.get('turnovers') ?? '0', val: (s) => n(s.get('turnovers')) },
  { key: 'sacks', label: 'Sacks taken', group: 'Mistakes', better: 'low', icon: 'sack', show: (s) => String(made(s.get('sacksYardsLost')) || 0), val: (s) => made(s.get('sacksYardsLost')) || 0 },
  {
    key: 'penalties', label: 'Penalty yards', group: 'Mistakes', better: 'low', icon: 'flag',
    show: (s) => { const p = s.get('totalPenaltiesYards'); return p ? `${att(p) || 0}` : '0'; },
    val: (s) => att(s.get('totalPenaltiesYards')) || 0,
  },
  { key: 'possessionTime', label: 'Time of possession', group: 'Clock', better: 'high', icon: 'clock', show: (s) => s.get('possessionTime') ?? '0:00', val: (s) => mmss(s.get('possessionTime')) },
  { key: 'totalOffensivePlays', label: 'Plays', group: 'Clock', better: 'none', show: (s) => s.get('totalOffensivePlays') ?? '0', val: (s) => n(s.get('totalOffensivePlays')) },
];

// "5-13" reads as a subtraction; "5/13" reads as five of thirteen.
function conv(s: string | undefined): string {
  return s ? s.replace('-', '/') : '0/0';
}

function statsOf(g: Game, teamId: string): Stats | null {
  const t = g.box?.teams?.find((x) => x.team.id === teamId);
  return t ? new Map(t.statistics.map((s) => [s.name, s.displayValue])) : null;
}

export function compareRows(g: Game): CompareRow[] {
  const a = statsOf(g, g.away.id);
  const h = statsOf(g, g.home.id);
  if (!a || !h) return [];
  return DEFS.filter((d) => !d.skip?.(a, h)).map((d) => ({
    key: d.key,
    label: d.label,
    group: d.group,
    away: d.show(a),
    home: d.show(h),
    av: Number.isFinite(d.val(a)) ? d.val(a) : 0,
    hv: Number.isFinite(d.val(h)) ? d.val(h) : 0,
    better: d.better,
    icon: d.icon ?? null,
  }));
}

/** 'a' or 'h' for the side that did better on this row, null for a tie or a row with no better side. */
export function edge(r: CompareRow): 'a' | 'h' | null {
  if (r.better === 'none' || r.av === r.hv) return null;
  return (r.better === 'high') === r.av > r.hv ? 'a' : 'h';
}

/** How many rows each side won: the one-line answer to "who's playing better". */
export function tally(rows: CompareRow[]): { a: number; h: number } {
  let a = 0;
  let h = 0;
  for (const r of rows) {
    const e = edge(r);
    if (e === 'a') a++;
    else if (e === 'h') h++;
  }
  return { a, h };
}
