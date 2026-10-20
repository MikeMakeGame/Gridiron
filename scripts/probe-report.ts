// Turns a live-probe log into the numbers that matter: poll spacing, how long after a snap (ESPN's own wallclock)
// the play reached us, whether the score ever went backwards, and what the feed did and didn't carry.
// Usage: npx tsx scripts/probe-report.ts <eventId>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { summary } from './espn-cache';

const id = process.argv[2];
const ROOT = join(import.meta.dirname, '..');
const lines = readFileSync(join(ROOT, '.cache', `live-${id}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const live = lines.filter((l) => l.status && l.status !== 'STATUS_SCHEDULED');
const gaps = live.slice(1).map((l, i) => (Date.parse(l.at) - Date.parse(live[i].at)) / 1000);
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

// First time each play id showed up as the latest play.
const firstSeen = new Map<string, number>();
for (const l of live) if (l.lastPlay?.id && !firstSeen.has(l.lastPlay.id)) firstSeen.set(l.lastPlay.id, Date.parse(l.at));

const s: any = await summary(id, 0);
const wall = new Map<string, number>();
for (const d of [...(s.drives?.previous ?? []), ...(s.drives?.current ? [s.drives.current] : [])])
  for (const p of d.plays ?? []) if (p.wallclock) wall.set(p.id, Date.parse(p.wallclock));
const lags = [...firstSeen].filter(([pid]) => wall.has(pid)).map(([pid, t]) => (t - wall.get(pid)!) / 1000);

let dips = 0;
for (let i = 1; i < live.length; i++) {
  const [a1, h1] = live[i - 1].score.match(/\d+/g).map(Number);
  const [a2, h2] = live[i].score.match(/\d+/g).map(Number);
  if (a2 < a1 || h2 < h1) dips++;
}

const out = {
  polls: lines.length,
  livePolls: live.length,
  firstLive: live[0]?.at,
  last: lines[lines.length - 1]?.at,
  finalStatus: lines[lines.length - 1]?.status,
  pollGapSec: { median: med(gaps), p95: q(gaps, 0.95) },
  errors: lines.filter((l) => l.error).length,
  playsSeenAsLatest: firstSeen.size,
  lagAfterSnapSec: { n: lags.length, median: med(lags), p90: q(lags, 0.9) },
  scoreWentBackwards: dips,
  summaryHadSituation: live.some((l) => l.hasSituation),
  summaryHadCurrentDrive: live.filter((l) => l.status === 'STATUS_IN_PROGRESS').every((l) => l.hasCurrentDrive),
  winProbabilityRows: lines[lines.length - 1]?.wpCount,
  medianResponseMs: med(live.map((l) => l.ms).filter(Boolean)),
};
writeFileSync(join(ROOT, '.cache', `probe-report-${id}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
