// Polite, cached ESPN reads for the build scripts (one request at a time, a pause between them).
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CACHE = join(import.meta.dirname, '..', '.cache', 'espn');
const PAUSE_MS = 750;
let last = 0;

async function politeFetch(url: string): Promise<unknown> {
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const r = await fetch(url, { headers: { 'User-Agent': 'gridiron-personal-viewer' } });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.json();
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
