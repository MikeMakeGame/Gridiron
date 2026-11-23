// Comparing a game to the league average. `scripts/nflverse_build.py` bakes public/data/baselines.json with two
// windows: this season so far, and the three completed seasons before it. There is no all-time window: the passing
// era, rule changes and the 2024 kickoff rule make old numbers a different sport.
//
// One rule decides what is compared (`comparable`): a rate (per play, per attempt, per drive) is compared live and
// final; a total (yards, sacks, turnovers) only on a final, because a live game's totals are partial.
import type { Better } from './teamstats';

/** The two averages the viewer can switch between. */
export type BaselineId = 'season' | 'last3';
export const BASELINE_IDS: readonly BaselineId[] = ['season', 'last3'];

/** Who an average describes: a team per game, or one position group's qualifying player-games. */
export type BaselineScope = 'team' | 'qb' | 'rb' | 'wr' | 'k';

export type StatKey =
  // team rates
  | 'successRate'
  | 'epaPerPlay'
  | 'yardsPerPlay'
  | 'thirdDownRate'
  | 'redZoneTdRate'
  | 'pointsPerDrive'
  | 'earlyDownPassRate'
  | 'avgThirdDistance'
  | 'avgStart'
  // team totals
  | 'totalYards'
  | 'netPassingYards'
  | 'rushingYards'
  | 'firstDowns'
  | 'turnovers'
  | 'sacksTaken'
  | 'penaltyYards'
  | 'explosives'
  // quarterbacks
  | 'compPct'
  | 'yardsPerAttempt'
  | 'sackRate'
  | 'epaPerDropback'
  | 'passYards'
  | 'passTd'
  | 'interceptions'
  // runners
  | 'yardsPerCarry'
  | 'epaPerCarry'
  | 'rushYards'
  | 'rushTd'
  // receivers
  | 'catchRate'
  | 'yardsPerTarget'
  | 'epaPerTarget'
  | 'recYards'
  | 'recTd'
  // kickers and punters
  | 'fgPct'
  | 'xpPct'
  | 'puntAvg';

export type StatUnit = 'pct' | 'n1' | 'n2' | 'n0';

export interface StatDef {
  kind: 'rate' | 'total';
  /** Which way is better, so a high sack rate reads as bad. 'none' marks a style stat (early-down pass rate). */
  better: Better;
  unit: StatUnit;
}

/** The better-direction table: one row per comparable stat. */
export const STATS: Record<StatKey, StatDef> = {
  successRate: { kind: 'rate', better: 'high', unit: 'pct' },
  epaPerPlay: { kind: 'rate', better: 'high', unit: 'n2' },
  yardsPerPlay: { kind: 'rate', better: 'high', unit: 'n1' },
  thirdDownRate: { kind: 'rate', better: 'high', unit: 'pct' },
  redZoneTdRate: { kind: 'rate', better: 'high', unit: 'pct' },
  pointsPerDrive: { kind: 'rate', better: 'high', unit: 'n2' },
  earlyDownPassRate: { kind: 'rate', better: 'none', unit: 'pct' },
  avgThirdDistance: { kind: 'rate', better: 'low', unit: 'n1' },
  avgStart: { kind: 'rate', better: 'high', unit: 'n1' },
  totalYards: { kind: 'total', better: 'high', unit: 'n0' },
  netPassingYards: { kind: 'total', better: 'high', unit: 'n0' },
  rushingYards: { kind: 'total', better: 'high', unit: 'n0' },
  firstDowns: { kind: 'total', better: 'high', unit: 'n0' },
  turnovers: { kind: 'total', better: 'low', unit: 'n1' },
  sacksTaken: { kind: 'total', better: 'low', unit: 'n1' },
  penaltyYards: { kind: 'total', better: 'low', unit: 'n0' },
  explosives: { kind: 'total', better: 'high', unit: 'n1' },
  compPct: { kind: 'rate', better: 'high', unit: 'pct' },
  yardsPerAttempt: { kind: 'rate', better: 'high', unit: 'n1' },
  sackRate: { kind: 'rate', better: 'low', unit: 'pct' },
  epaPerDropback: { kind: 'rate', better: 'high', unit: 'n2' },
  passYards: { kind: 'total', better: 'high', unit: 'n0' },
  passTd: { kind: 'total', better: 'high', unit: 'n1' },
  interceptions: { kind: 'total', better: 'low', unit: 'n1' },
  yardsPerCarry: { kind: 'rate', better: 'high', unit: 'n1' },
  epaPerCarry: { kind: 'rate', better: 'high', unit: 'n2' },
  rushYards: { kind: 'total', better: 'high', unit: 'n0' },
  rushTd: { kind: 'total', better: 'high', unit: 'n1' },
  catchRate: { kind: 'rate', better: 'high', unit: 'pct' },
  yardsPerTarget: { kind: 'rate', better: 'high', unit: 'n1' },
  epaPerTarget: { kind: 'rate', better: 'high', unit: 'n2' },
  recYards: { kind: 'total', better: 'high', unit: 'n0' },
  recTd: { kind: 'total', better: 'high', unit: 'n1' },
  fgPct: { kind: 'rate', better: 'high', unit: 'pct' },
  xpPct: { kind: 'rate', better: 'high', unit: 'pct' },
  puntAvg: { kind: 'rate', better: 'high', unit: 'n1' },
};

export interface BaselineBlock {
  rates: Partial<Record<StatKey, number>>;
  totals: Partial<Record<StatKey, number>>;
}

export interface BaselineWindow {
  label: string;
  seasons: number[];
  /** Regular-season weeks in the window's data. */
  weeks: number;
  games: number;
  team: BaselineBlock;
  players: Partial<Record<Exclude<BaselineScope, 'team'>, BaselineBlock>>;
  /** Stats left out of this window, with the reason (the 2024 kickoff rule moved drive starts). */
  excluded: Partial<Record<StatKey, string>>;
}

export interface ImpactWeights {
  sack: number | null;
  interception: number | null;
  fumbleLost: number | null;
  tackleForLoss: number | null;
  passDefended: number | null;
  /** [lowest distance in the band, make rate], bands ascending. */
  fgMake: [number, number][];
  xpMake: number | null;
}

export interface Baselines {
  version: number;
  built: string;
  season: number;
  windows: Record<BaselineId, BaselineWindow>;
  /** The volume a player-game needs to count toward its group's average, in words. */
  qualifiers: Partial<Record<Exclude<BaselineScope, 'team'>, string>>;
  impact: ImpactWeights;
}

/** The baselines.json version this page reads. */
export const BASELINES_VERSION = 1;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function windowProblem(w: unknown): string | null {
  if (!isObj(w)) return 'missing';
  if (typeof w.label !== 'string' || !w.label) return 'no label';
  if (!Array.isArray(w.seasons) || !w.seasons.length || !w.seasons.every((s) => Number.isInteger(s))) return 'no seasons';
  if (typeof w.weeks !== 'number' || typeof w.games !== 'number') return 'no week or game count';
  if (!isObj(w.team) || !isObj(w.team.rates) || !isObj(w.team.totals)) return 'no team block';
  if (!isObj(w.players)) return 'no players block';
  if (!isObj(w.excluded)) return 'no excluded block';
  return null;
}

/** What's wrong with a loaded baselines.json, or null when the page can read it: the version it knows, both windows
 *  whole, qualifiers and impact objects. A partial file is refused whole rather than crashing a tab. */
export function baselinesProblem(x: unknown): string | null {
  if (!isObj(x)) return 'not an object';
  if (x.version !== BASELINES_VERSION) return `version ${String(x.version)}, this page reads ${BASELINES_VERSION}`;
  if (!isObj(x.windows)) return 'no windows';
  for (const id of BASELINE_IDS) {
    const p = windowProblem(x.windows[id]);
    if (p) return `window "${id}": ${p}`;
  }
  if (!isObj(x.qualifiers)) return 'no qualifiers';
  if (!isObj(x.impact)) return 'no impact weights';
  return null;
}

/** Weeks of this season before its average is steady enough to be the default; until then, the last 3 seasons. */
export const MIN_SEASON_WEEKS = 4;

/** The average the page opens on: this season once it has MIN_SEASON_WEEKS weeks in, else the last 3 seasons. */
export function defaultBaseline(b: Pick<Baselines, 'windows'>): BaselineId {
  return (b.windows.season?.weeks ?? 0) >= MIN_SEASON_WEEKS ? 'season' : 'last3';
}

/** The viewer's pick when it can be honoured (its window has games), else the default. */
let warnedEmpty = false;
export function effectiveBaseline(b: Pick<Baselines, 'windows'>, picked: BaselineId | null): BaselineId {
  if (picked && (b.windows[picked]?.games ?? 0) > 0) return picked;
  if (picked && !warnedEmpty) {
    warnedEmpty = true;
    console.warn(`Gridiron: the "${picked}" average has no games yet; showing the default`);
  }
  return defaultBaseline(b);
}

export const BASELINE_KEY = 'gridiron:baseline';

/** A saved pick, or null when nothing (or nothing readable) is saved. */
export function parseBaselinePick(raw: string | null): BaselineId | null {
  if (raw == null) return null;
  if ((BASELINE_IDS as readonly string[]).includes(raw)) return raw as BaselineId;
  console.warn(`Gridiron: saved average "${raw}" is not one this page knows; using the default`);
  return null;
}

/** The comparison rule: rates always, totals only once the game is over (a live total is partial). */
export function comparable(key: StatKey, final: boolean): boolean {
  return STATS[key].kind === 'rate' || final;
}

export type AvgVerdict = 'good' | 'bad' | 'even' | 'neutral';

export interface AvgMark {
  avg: number;
  /** value - average */
  delta: number;
  verdict: AvgVerdict;
  /** "+6%", "−0.4": the short delta the page prints. */
  text: string;
  /** One sentence for a screen reader or a hover. */
  title: string;
}

const EVEN: Record<StatUnit, number> = { pct: 0.005, n0: 0.5, n1: 0.05, n2: 0.005 };

export function fmtUnit(x: number, unit: StatUnit): string {
  return unit === 'pct' ? `${Math.round(x * 100)}%` : x.toFixed(unit === 'n0' ? 0 : unit === 'n1' ? 1 : 2);
}

function fmtDelta(d: number, unit: StatUnit): string {
  const body = unit === 'pct' ? `${Math.abs(Math.round(d * 100))}%` : Math.abs(d).toFixed(unit === 'n0' ? 0 : unit === 'n1' ? 1 : 2);
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${body}`;
}

/** How a value sits against the chosen average, or null when there is nothing honest to compare (no file, a total
 *  mid-game, a stat the window leaves out, no value). */
export function vsAverage(
  b: Baselines | null,
  id: BaselineId,
  scope: BaselineScope,
  key: StatKey,
  value: number | null | undefined,
  final: boolean,
): AvgMark | null {
  if (!b || value == null || !Number.isFinite(value) || !comparable(key, final)) return null;
  const w = b.windows[id];
  if (!w || w.excluded?.[key]) return null;
  const block = scope === 'team' ? w.team : w.players[scope];
  const def = STATS[key];
  const avg = (def.kind === 'rate' ? block?.rates : block?.totals)?.[key];
  if (avg == null) return null;
  const delta = value - avg;
  const even = Math.abs(delta) < EVEN[def.unit];
  const verdict: AvgVerdict = def.better === 'none' ? 'neutral' : even ? 'even' : (def.better === 'high') === delta > 0 ? 'good' : 'bad';
  const text = even ? 'avg' : fmtDelta(delta, def.unit);
  const how = even ? 'about the same as' : `${fmtDelta(delta, def.unit)} against`;
  const title = `${fmtUnit(value, def.unit)}: ${how} the league average of ${fmtUnit(avg, def.unit)} (${w.label.toLowerCase()})${
    verdict === 'good' ? ', better' : verdict === 'bad' ? ', worse' : ''
  }.`;
  return { avg, delta, verdict, text, title };
}

/** Why a stat has no average in this window, if the window says. */
export function excludedWhy(b: Baselines | null, id: BaselineId, key: StatKey): string | null {
  return b?.windows[id]?.excluded?.[key] ?? null;
}
