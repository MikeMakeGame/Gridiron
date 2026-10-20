// Polite, cached ESPN reads for the build scripts: one request at a time, a pause between them, a timeout on each.
// ESPN's API is unofficial, so one batch backs off as a whole: a 429/503, or three network errors, timeouts or 5xx
// answers in a row, stops every later network read in this run. A 404 is one missing game and doesn't count.
// Cached summaries still load, so a stopped batch works with what it already has.
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CACHE = join(import.meta.dirname, '..', '.cache', 'espn');
const PAUSE_MS = 750;
const TIMEOUT_MS = 15_000;
const MAX_FAILS_IN_A_ROW = 3;
let last = 0;
let failsInARow = 0;
let stoppedFor: string | null = null;

/** Thrown for every network read once the batch has stopped; callers can tell it apart from one bad game. */
export class BatchStopped extends Error {
  override name = 'BatchStopped';
}

/** Why this run stopped reading ESPN, or null while it still reads. */
export function batchStopped(): string | null {
  return stoppedFor;
}

function stop(why: string): never {
  stoppedFor ??= why;
  console.error(`espn-cache: stopped reading ESPN for this run: ${stoppedFor}`);
  throw new BatchStopped(stoppedFor);
}

function failed(e: unknown): never {
  if (++failsInARow >= MAX_FAILS_IN_A_ROW) stop(`${failsInARow} failures in a row (last: ${e})`);
  throw e;
}

async function request(url: string): Promise<Response> {
  if (stoppedFor) throw new BatchStopped(stoppedFor);
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  let r: Response;
  try {
    r = await fetch(url, { headers: { 'User-Agent': 'gridiron-personal-viewer' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    failed(e); // network error or timeout
  }
  if (r.status === 429 || r.status === 503) {
    const ra = r.headers.get('Retry-After');
    stop(`ESPN answered ${r.status}${ra ? ` with Retry-After ${ra}` : ''}`);
  }
  if (r.status >= 500) failed(new Error(`${r.status} for ${url}`));
  if (!r.ok) throw new Error(`${r.status} for ${url}`); // a missing game, not ESPN pushing back
  failsInARow = 0;
  return r;
}

export async function politeFetch(url: string): Promise<unknown> {
  return (await request(url)).json();
}

export async function politeBytes(url: string): Promise<Buffer> {
  return Buffer.from(await (await request(url)).arrayBuffer());
}

/** A finished game never changes, so its summary is cached for good; anything else for maxAgeMin. */
export async function summary(id: string, maxAgeMin = 10): Promise<any> {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, `summary-${id}.json`);
  if (existsSync(path)) {
    const cached = JSON.parse(readFileSync(path, 'utf8'));
    const final = cached?.header?.competitions?.[0]?.status?.type?.state === 'post';
    if (final || Date.now() - statSync(path).mtimeMs < maxAgeMin * 60_000) return cached;
  }
  const d = await politeFetch(`${ESPN}/summary?event=${encodeURIComponent(id)}`);
  writeFileSync(path, JSON.stringify(d));
  return d;
}

export async function scoreboard(query = ''): Promise<any> {
  return politeFetch(`${ESPN}/scoreboard${query}`);
}
