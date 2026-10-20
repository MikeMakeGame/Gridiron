// End-to-end check of the live EPA estimate: run the page's own model over ESPN's play-by-play for every
// finished game nflverse has, cut at the end of Q1, Q2, Q3 and at the final, and compare each team's
// EPA/play so far with nflverse's for the same quarters. A do-nothing baseline (guess the season average)
// says whether the error is small. Writes public/data/calibration.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGame } from '../src/espn/model';
import { teamNumbers } from '../src/stats/live';
import type { EpTable } from '../src/stats/ep';
import { summary } from './espn-cache';

const DATA = join(import.meta.dirname, '..', 'public', 'data');
const ep: EpTable = JSON.parse(readFileSync(join(DATA, 'ep_table.json'), 'utf8'));
const files = readdirSync(join(DATA, 'games')).filter((f) => f.endsWith('.json'));
const CUTS = ['Q1', 'Q2', 'Q3', 'Final'] as const;

type Row = { id: string; team: string; cut: (typeof CUTS)[number]; est: number; nflverse: number };
const rows: Row[] = [];
for (const f of files) {
  const adv = JSON.parse(readFileSync(join(DATA, 'games', f), 'utf8'));
  let s;
  try {
    s = await summary(adv.espn);
  } catch (e) {
    console.error(`skip ${adv.espn}: ${e}`);
    continue;
  }
  const full = buildGame(s, { ep });
  if (full.state !== 'post') continue;
  CUTS.forEach((cut, k) => {
    const upto = cut === 'Final' ? undefined : full.plays.filter((p) => p.period <= k + 1).length;
    const g = upto == null ? full : buildGame(s, { ep, upto });
    for (const side of ['home', 'away'] as const) {
      const est = teamNumbers(g, g[side]).epaPerPlay;
      const truth = cut === 'Final' ? adv[side].epa_play : adv[side].thru_q?.[k];
      if (est == null || truth == null) continue;
      rows.push({ id: adv.espn, team: g[side].abbr, cut, est, nflverse: truth });
    }
  });
}

if (!rows.length) {
  console.error('calibrate: no finished games matched; leaving calibration.json as it was');
  process.exit(0);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const byCut = CUTS.map((cut) => {
  const rs = rows.filter((r) => r.cut === cut);
  const err = rs.map((r) => Math.abs(r.est - r.nflverse));
  const avg = mean(rs.map((r) => r.nflverse));
  return {
    cut,
    teamGames: rs.length,
    mae: r3(mean(err)),
    p90: r3(q(err, 0.9)),
    bias: r3(mean(rs.map((r) => r.est - r.nflverse))),
    baselineMae: r3(mean(rs.map((r) => Math.abs(r.nflverse - avg)))),
  };
});
const fin = byCut[byCut.length - 1];
const finRows = rows.filter((r) => r.cut === 'Final');
const out = {
  built: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  games: new Set(finRows.map((r) => r.id)).size,
  teamGames: fin.teamGames,
  // Full-game figures, kept at the top level for the page's one-line summary.
  mae: fin.mae,
  bias: fin.bias,
  p90: fin.p90,
  max: r3(Math.max(...finRows.map((r) => Math.abs(r.est - r.nflverse)))),
  byCut,
  worst: [...finRows].sort((a, b) => Math.abs(b.est - b.nflverse) - Math.abs(a.est - a.nflverse)).slice(0, 5),
};
writeFileSync(join(DATA, 'calibration.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, worst: undefined }, null, 1));
