// Freezes this week's games into snapshot-public/ so `vite build --mode snapshot` makes a self-contained copy
// (the Claude artifact can't reach ESPN). Usage: npx tsx scripts/snapshot.ts [--week N]
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreboard, summary } from './espn-cache';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'snapshot-public');
const weekArg = process.argv.indexOf('--week');
const query = weekArg > 0 ? `?week=${process.argv[weekArg + 1]}&seasontype=2` : '';

// Keys the app never reads; dropping them takes a summary from ~640 KB to a fraction of that.
const DROP_TOP = ['news', 'article', 'videos', 'standings', 'injuries', 'againstTheSpread', 'leaders', 'broadcasts', 'gameInfo', 'odds', 'meta', 'format'];
const DROP_PLAY = ['teamParticipants', 'participants', 'modified', 'mediaId', 'probability'];

function slimSummary(s: any): any {
  for (const k of DROP_TOP) delete s[k];
  const slimPlays = (ps: any[]) => ps?.forEach((p) => DROP_PLAY.forEach((k) => delete p[k]));
  s.drives?.previous?.forEach((d: any) => slimPlays(d.plays));
  if (s.drives?.current) slimPlays(s.drives.current.plays);
  slimPlays(s.scoringPlays ?? []);
  s.winprobability = s.winprobability?.map((w: any) => ({ playId: w.playId, homeWinPercentage: w.homeWinPercentage }));
  s.pickcenter = s.pickcenter?.slice(0, 1).map((p: any) => ({ details: p.details }));
  for (const c of s.header?.competitions ?? []) delete c.broadcasts;
  return s;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'snap'), { recursive: true });
mkdirSync(join(OUT, 'logos'), { recursive: true });
mkdirSync(join(OUT, 'data', 'games'), { recursive: true });

const sb: any = await scoreboard(query);
const logos = new Map<string, string>();
for (const e of sb.events) {
  for (const c of e.competitions[0].competitors) {
    const url: string = c.team.logo ?? '';
    const name = url.split('/').pop();
    if (name) logos.set(name, url.replace('https://a.espncdn.com', ''));
  }
}
writeFileSync(join(OUT, 'snap', 'scoreboard.json'), JSON.stringify(sb));

let bytes = 0;
for (const e of sb.events) {
  const s = slimSummary(structuredClone(await summary(e.id, 2)));
  for (const c of s.header.competitions[0].competitors) {
    const url: string = c.team.logos?.[0]?.href ?? '';
    const name = url.split('/').pop();
    if (name) logos.set(name, url.replace('https://a.espncdn.com', ''));
  }
  const json = JSON.stringify(s);
  bytes += json.length;
  writeFileSync(join(OUT, 'snap', `summary-${e.id}.json`), json);
  const adv = join(ROOT, 'public', 'data', 'games', `${e.id}.json`);
  if (existsSync(adv)) cpSync(adv, join(OUT, 'data', 'games', `${e.id}.json`));
}
for (const f of ['ep_table.json', 'calibration.json']) {
  const p = join(ROOT, 'public', 'data', f);
  if (existsSync(p)) cpSync(p, join(OUT, 'data', f));
}

// Small logos, so the snapshot never reaches for ESPN's CDN.
for (const [name, path] of logos) {
  const r = await fetch(`https://a.espncdn.com/combiner/i?img=${path}&w=80&h=80`);
  if (r.ok) writeFileSync(join(OUT, 'logos', name), Buffer.from(await r.arrayBuffer()));
  await new Promise((res) => setTimeout(res, 150));
}

console.log(`snapshot: ${sb.events.length} games, ${(bytes / 1024).toFixed(0)} KB of summaries, ${logos.size} logos`);
