// Every network read in one place. Live mode reads ESPN directly (CORS is open);
// snapshot mode (the Claude artifact build) reads JSON bundled next to the page.
import type { EspnScoreboard, EspnSummary } from './types';
import type { EpTable } from '../stats/ep';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
export const SNAPSHOT = import.meta.env.MODE === 'snapshot';

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return (await r.json()) as T;
}

async function getOptional<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export interface WeekRef {
  season: number;
  seasonType: number;
  week: number;
}

export function scoreboardUrl(ref?: WeekRef): string {
  if (SNAPSHOT) return './snap/scoreboard.json';
  if (!ref) return `${ESPN}/scoreboard`;
  return `${ESPN}/scoreboard?dates=${ref.season}&seasontype=${ref.seasonType}&week=${ref.week}`;
}

export function getScoreboard(ref: WeekRef | undefined, signal?: AbortSignal): Promise<EspnScoreboard> {
  return getJson<EspnScoreboard>(scoreboardUrl(ref), signal);
}

export function getSummary(id: string, signal?: AbortSignal): Promise<EspnSummary> {
  const url = SNAPSHOT ? `./snap/summary-${id}.json` : `${ESPN}/summary?event=${encodeURIComponent(id)}`;
  return getJson<EspnSummary>(url, signal);
}

// Cached once it loads; a miss is retried on the next call, so a late-arriving table still gets picked up.
let epPromise: Promise<EpTable | null> | null = null;
export function getEpTable(): Promise<EpTable | null> {
  epPromise ??= getOptional<EpTable>('./data/ep_table.json').then((t) => {
    if (!t) epPromise = null;
    return t;
  });
  return epPromise;
}

export interface AdvancedTeam {
  abbr: string;
  plays: number;
  dropbacks: number;
  rushes: number;
  epa_play: number;
  pass_epa: number;
  rush_epa: number;
  success: number;
  pass_success: number;
  rush_success: number;
  early_epa: number;
  proe: number | null;
  explosive_rate: number;
}

export interface AdvancedQb {
  side: 'home' | 'away';
  name: string;
  dropbacks: number;
  epa_db: number;
  cpoe: number | null;
  adot: number | null;
  yac_share: number | null;
}

export interface AdvancedPlay {
  side: 'home' | 'away';
  qtr: number;
  clock: string;
  down: number | null;
  ydstogo: number | null;
  desc: string;
  epa: number;
  wpa: number | null;
}

export interface AdvancedGame {
  game_id: string;
  espn: string;
  built: string;
  source: string;
  home: AdvancedTeam;
  away: AdvancedTeam;
  qbs: AdvancedQb[];
  top_epa: AdvancedPlay[];
  top_wpa: AdvancedPlay[];
}

export interface Calibration {
  built: string;
  games: number;
  teamGames: number;
  mae: number;
  bias: number;
  p90: number;
  max: number;
}

let calPromise: Promise<Calibration | null> | null = null;
export function getCalibration(): Promise<Calibration | null> {
  calPromise ??= getOptional<Calibration>('./data/calibration.json').then((c) => {
    if (!c) calPromise = null;
    return c;
  });
  return calPromise;
}

export function getAdvanced(espnId: string): Promise<AdvancedGame | null> {
  return getOptional<AdvancedGame>(`./data/games/${encodeURIComponent(espnId)}.json`);
}
