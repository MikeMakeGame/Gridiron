// Evidence log for a live game: polls one summary every 20 s and writes one JSON line per poll
// (what ESPN served, what the page's model made of it). Stops at the final. Usage: npx tsx scripts/live-probe.ts <eventId>
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGame } from '../src/espn/model';
import { teamNumbers } from '../src/stats/live';

const id = process.argv[2];
if (!id) throw new Error('usage: live-probe <eventId>');
const ROOT = join(import.meta.dirname, '..');
mkdirSync(join(ROOT, '.cache'), { recursive: true });
const LOG = join(ROOT, '.cache', `live-${id}.jsonl`);
let ep = null;
try {
  ep = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'ep_table.json'), 'utf8'));
} catch {}

for (;;) {
  const t0 = Date.now();
  let line: Record<string, unknown> = { at: new Date().toISOString() };
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`);
    const s: any = await r.json();
    const g = buildGame(s, { ep });
    const st = s.header.competitions[0].status;
    line = {
      ...line,
      ms: Date.now() - t0,
      status: st.type.name,
      clock: g.clockText,
      score: `${g.away.abbr} ${g.away.score} - ${g.home.abbr} ${g.home.score}`,
      plays: g.plays.length,
      drives: g.drives.length,
      liveDrive: g.drives.find((d) => d.isLive)?.abbr ?? null,
      hasSituation: !!s.situation,
      situationKeys: s.situation ? Object.keys(s.situation) : [],
      situation: g.situation?.text ?? null,
      timeouts: g.situation ? [g.situation.awayTimeouts, g.situation.homeTimeouts] : null,
      hasCurrentDrive: !!s.drives?.current,
      wpCount: s.winprobability?.length ?? 0,
      lastPlay: g.lastPlay ? { id: g.lastPlay.id, text: g.lastPlay.text.slice(0, 120), wpHome: g.lastPlay.wpHome, epa: g.lastPlay.epa } : null,
      espnLastUpdated: s.meta?.lastUpdatedAt ?? null,
      epaEst: [teamNumbers(g, g.away).epaPerPlay, teamNumbers(g, g.home).epaPerPlay],
    };
    appendFileSync(LOG, JSON.stringify(line) + '\n');
    if (st.type.state === 'post') break;
  } catch (e) {
    appendFileSync(LOG, JSON.stringify({ ...line, error: String(e) }) + '\n');
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
