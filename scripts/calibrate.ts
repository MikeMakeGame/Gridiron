// End-to-end check of the live EPA estimate: run the page's own model over ESPN's play-by-play for every
// finished game nflverse has, and compare each team's EPA/play with nflverse's. Writes public/data/calibration.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGame } from '../src/espn/model';
import { teamNumbers } from '../src/stats/live';
import type { EpTable } from '../src/stats/ep';
import { summary } from './espn-cache';

const DATA = join(import.meta.dirname, '..', 'public', 'data');
const ep: EpTable = JSON.parse(readFileSync(join(DATA, 'ep_table.json'), 'utf8'));
const files = readdirSync(join(DATA, 'games')).filter((f) => f.endsWith('.json'));

const rows: { id: string; team: string; est: number; nflverse: number; err: number }[] = [];
for (const f of files) {
  const adv = JSON.parse(readFileSync(join(DATA, 'games', f), 'utf8'));
  let s;
  try {
    s = await summary(adv.espn);
  } catch (e) {
    console.error(`skip ${adv.espn}: ${e}`);
    continue;
  }
  const g = buildGame(s, { ep });
  if (g.state !== 'post') continue;
  for (const side of ['home', 'away'] as const) {
    const est = teamNumbers(g, g[side]).epaPerPlay;
    const truth = adv[side].epa_play;
    if (est == null || truth == null) continue;
    rows.push({ id: adv.espn, team: g[side].abbr, est, nflverse: truth, err: est - truth });
  }
}

const abs = rows.map((r) => Math.abs(r.err)).sort((a, b) => a - b);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const out = {
  built: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  teamGames: rows.length,
  games: new Set(rows.map((r) => r.id)).size,
  mae: +mean(abs).toFixed(3),
  bias: +mean(rows.map((r) => r.err)).toFixed(3),
  p90: +abs[Math.floor(abs.length * 0.9)].toFixed(3),
  max: +abs[abs.length - 1].toFixed(3),
  worst: [...rows].sort((a, b) => Math.abs(b.err) - Math.abs(a.err)).slice(0, 5),
};
writeFileSync(join(DATA, 'calibration.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
