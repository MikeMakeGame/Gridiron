// Every network read in one place. Live mode reads ESPN directly (CORS is open);
// snapshot mode (the offline build) reads JSON bundled next to the page.
import type { EspnScoreboard, EspnSummary } from './types';
import type { EpTable } from '../stats/ep';
import { RetryAfterError } from '../hooks/poller';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
export const SNAPSHOT = import.meta.env.MODE === 'snapshot';

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (r.status === 429 || r.status === 503) {
    // Slow down when asked: Retry-After in seconds (or an HTTP date), else five minutes.
    const ra = r.headers.get('Retry-After');
    const secs = ra == null ? NaN : /^\d+$/.test(ra) ? Number(ra) : (Date.parse(ra) - Date.now()) / 1000;
    throw new RetryAfterError(`ESPN asked us to slow down (${r.status})`, Number.isFinite(secs) && secs > 0 ? secs * 1000 : 300_000);
  }
  if (!r.ok) throw new Error(`ESPN answered ${r.status}`);
  return (await r.json()) as T;
}

/** A 200 with the wrong shape is an error, so it never replaces good data on screen. */
export function checkSummary(s: unknown): EspnSummary {
  const c = (s as EspnSummary)?.header?.competitions?.[0];
  if (!c || !Array.isArray(c.competitors) || c.competitors.length !== 2 || !c.status?.type?.state)
    throw new Error("ESPN sent a game page we can't read");
  if (!c.competitors.some((x) => x.homeAway === 'home') || !c.competitors.some((x) => x.homeAway === 'away'))
    throw new Error("ESPN sent a game page we can't read");
  return s as EspnSummary;
}

export function checkScoreboard(s: unknown): EspnScoreboard {
  const ev = (s as EspnScoreboard)?.events;
  if (!Array.isArray(ev)) throw new Error("ESPN sent a scoreboard we can't read");
  for (const e of ev) {
    const c = e?.competitions?.[0];
    if (!e?.id || !e.status?.type?.state || !c || !Array.isArray(c.competitors) || c.competitors.length !== 2)
      throw new Error("ESPN sent a scoreboard we can't read");
  }
  return s as EspnScoreboard;
}

async function getOptional<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      if (r.status !== 404) console.warn(`Gridiron: ${url} answered ${r.status}`);
      return null;
    }
    return (await r.json()) as T;
  } catch (e) {
    console.warn(`Gridiron: couldn't load ${url}`, e);
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

export async function getScoreboard(ref: WeekRef | undefined, signal?: AbortSignal): Promise<EspnScoreboard> {
  return checkScoreboard(await getJson<unknown>(scoreboardUrl(ref), signal));
}

/** The scoreboard for one calendar day (US Eastern, as ESPN files games), e.g. the day of the game being viewed. */
export async function getScoreboardForDay(isoDate: string, signal?: AbortSignal): Promise<EspnScoreboard> {
  if (SNAPSHOT) return getScoreboard(undefined, signal);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(isoDate))
    .replace(/-/g, '');
  return checkScoreboard(await getJson<unknown>(`${ESPN}/scoreboard?dates=${day}`, signal));
}

export async function getSummary(id: string, signal?: AbortSignal): Promise<EspnSummary> {
  const url = SNAPSHOT ? `./snap/summary-${id}.json` : `${ESPN}/summary?event=${encodeURIComponent(id)}`;
  return checkSummary(await getJson<unknown>(url, signal));
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
  byCut?: { cut: string; teamGames: number; mae: number; p90: number; bias: number; baselineMae: number }[];
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
