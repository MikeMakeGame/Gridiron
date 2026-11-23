// Players, from ESPN's play-by-play text: who threw, ran, caught, sacked, picked off, forced, recovered and kicked on
// each play. One ledger feeds the Players tab's position compare and the Standouts tab, and because it is built from
// the plays (not the box score) it stops where a replay stops, and follows a live game play by play.
//
// The standouts score (`impactOf`), in expected points:
//   - a passer gets the estimated EPA of each of his dropbacks (passes, sacks, scrambles)
//   - a runner gets the EPA of his designed runs; a receiver the EPA of every pass thrown to him ("EPA when
//     targeted"), except an interception, which is the passer's alone
//   - a defender gets, per sack, interception, tackle for loss and pass defended, what that kind of play costs an
//     offense on average (measured by the nflverse build); a sack scores once, as a sack, though the box score also
//     counts it as a tackle for loss; a lost fumble's value is split between the player who forced it and the one
//     who recovered it
//   - a kicker gets points over expectation: a make earns 3 x (1 - the league's make rate from that distance), a miss
//     loses 3 x that rate; extra points the same with 1
// Passer and receiver both count a completion (the usual "EPA when targeted"), so a big throw lifts both.
// Return men and punters aren't scored. Post-game, nflverse's own EPA replaces a quarterback's estimate.
import type { Game, Play, TeamInfo } from '../espn/model';
import { teamFromCode } from '../espn/model';
import { PLAYER } from './moments';
import type { AdvancedGame } from '../espn/api';
import type { Baselines, ImpactWeights } from './baselines';
import { signed } from '../format';

/** The groups the position compare lines up, in its order. */
export type PositionGroup = 'qb' | 'rb' | 'wr' | 'def' | 'k';
export const POSITION_GROUPS: readonly PositionGroup[] = ['qb', 'rb', 'wr', 'def', 'k'];
export const GROUP_NAME: Record<PositionGroup, string> = { qb: 'QB', rb: 'RB', wr: 'WR / TE', def: 'Defense', k: 'K / P' };

export interface FieldGoal {
  dist: number;
  made: boolean;
}

export interface PlayerLine {
  key: string;
  name: string;
  teamId: string;
  // passing (a dropback is a pass, a sack or a scramble)
  dropbacks: number;
  att: number;
  comp: number;
  passYds: number;
  passTd: number;
  ints: number;
  sacked: number;
  scrambles: number;
  passEpa: number;
  passEpaN: number;
  passSucc: number;
  // rushing (carries include scrambles, as the box score counts them)
  carries: number;
  rushYds: number;
  rushTd: number;
  rushEpa: number;
  rushEpaN: number;
  rushSucc: number;
  // receiving
  targets: number;
  rec: number;
  recYds: number;
  recTd: number;
  recEpa: number;
  recEpaN: number;
  fumblesLost: number;
  // defense
  tackles: number;
  sacks: number;
  tfl: number;
  defInts: number;
  passesDefended: number;
  forced: number;
  forcedLost: number;
  recovered: number;
  qbHits: number;
  // kicking
  fgs: FieldGoal[];
  xpMade: number;
  xpAtt: number;
  punts: number;
  puntYds: number;
}

function blank(name: string, teamId: string): PlayerLine {
  return {
    key: `${teamId}|${name}`, name, teamId,
    dropbacks: 0, att: 0, comp: 0, passYds: 0, passTd: 0, ints: 0, sacked: 0, scrambles: 0, passEpa: 0, passEpaN: 0, passSucc: 0,
    carries: 0, rushYds: 0, rushTd: 0, rushEpa: 0, rushEpaN: 0, rushSucc: 0,
    targets: 0, rec: 0, recYds: 0, recTd: 0, recEpa: 0, recEpaN: 0, fumblesLost: 0,
    tackles: 0, sacks: 0, tfl: 0, defInts: 0, passesDefended: 0, forced: 0, forcedLost: 0, recovered: 0, qbHits: 0,
    fgs: [], xpMade: 0, xpAtt: 0, punts: 0, puntYds: 0,
  };
}

// "R.Doubs INTERCEPTED" and "K.Juszczyk." are a name plus the text after it.
function clean(name: string): string {
  return name.replace(/ [A-Z]{2,}$/, '').replace(/\.+$/, '').trim();
}

// A name starts a word: without the guard, "TOUCHDOWN. T.Bass" reads as the name "N. T.Bass".
const P = String.raw`(?<![\w.'-])(${PLAYER})`;
const LEAD = new RegExp(String.raw`^\s*(?:(?:\([^)]*\)|${PLAYER} reported in as eligible\.|Direct snap to ${PLAYER}\.)\s*)*`);
const PASSER = new RegExp(String.raw`^${P} (pass|sacked|scrambles)\b`);
const TARGET = new RegExp(String.raw`\bpass\b[^.(]*?\b(?:to|intended for) ${P}`);
const RUSHER = new RegExp(String.raw`^${P} `);
const PICKED = new RegExp(String.raw`INTERCEPTED by ${P}`);
const FORCED = new RegExp(String.raw`FUMBLES \(${P}\)`);
const RECOVERED = new RegExp(String.raw`RECOVERED by ([A-Z]{2,3})-(${PLAYER})`);
// No 'i' flag on anything holding PLAYER: case-blind, "TOUCHDOWN. E.Pineiro" reads as a name starting "DOWN.".
const KICK_FG = new RegExp(String.raw`${P} (\d+) yard field goal is (GOOD|Good|No Good|NO GOOD|BLOCKED|Blocked)`);
const KICK_XP = new RegExp(String.raw`${P} extra point is (GOOD|Good|No Good|NO GOOD|BLOCKED|Blocked)`);
const PUNTER = new RegExp(String.raw`${P} punts (\d+) yards?`);
const NAME_ONLY = new RegExp(String.raw`^${PLAYER}$`);

/** The names in a tackle bracket: "(L.Gifford; K.White)", "(K.Hamilton, Z.Young)", "(sack split by A.Key and L.Latu)". */
export function namesIn(group: string): string[] {
  return group
    .replace(/^sack split by /i, '')
    .split(/;|,| and /)
    .map((s) => clean(s.trim()))
    .filter((s) => NAME_ONLY.test(s));
}

/** The snap itself: the formation and "reported in as eligible" notes off the front, and the try after a touchdown
 *  off the back ("TWO-POINT CONVERSION ATTEMPT. J.Allen pass to K.Coleman is incomplete" is not the touchdown pass). */
export function playBody(text: string): string {
  const t = text.replace(LEAD, '');
  const cut = t.search(/TWO-POINT CONVERSION ATTEMPT|\S+ extra point is /);
  return cut >= 0 ? t.slice(0, cut) : t;
}

// The yards the play's text gives the ball carrier ("for 8 yards", "for no gain"): the box score's number. ESPN's
// statYardage is the net after a spot foul, which once cost D.Henry 20 yards of a holding call's run.
function carrierYards(first: string, fallback: number): number {
  const m = first.match(/\bfor (-?\d+) yards?\b|\bfor no gain\b/);
  return m ? Number(m[1] ?? 0) : fallback;
}

// The first part of a play: everything before a fumble, an interception, a penalty or an injury note, where the
// brackets name the defense's tacklers (later brackets can name the other side, tackling a returner).
function firstPart(body: string): string {
  const cut = body.search(/ FUMBLES| INTERCEPTED|PENALTY on|Penalty on| was injured|\. Touchback/);
  return cut >= 0 ? body.slice(0, cut) : body;
}

/** Every player's line for the game (or the replay, as far as it has got). */
export function playerLines(g: Game): PlayerLine[] {
  const lines = new Map<string, PlayerLine>();
  const line = (name: string, teamId: string) => {
    const n = clean(name);
    const k = `${teamId}|${n}`;
    let l = lines.get(k);
    if (!l) lines.set(k, (l = blank(n, teamId)));
    return l;
  };
  for (const p of g.plays) {
    const body = playBody(p.text);
    const stands = !p.noPlay && p.down > 0;

    if (p.kind === 'pass' || p.kind === 'rush') creditSnap(g, p, body, stands, line);
    if (p.kind === 'fg' && !p.noPlay) {
      const m = body.match(KICK_FG);
      if (m) line(m[1], p.offenseId).fgs.push({ dist: Number(m[2]), made: /^good$/i.test(m[3]) });
    }
    // An extra point rides on its touchdown's row; the scoring side kicked it.
    const xp = p.noPlay ? null : p.text.match(KICK_XP);
    if (xp) {
      const kicker = line(xp[1], p.defPts >= 6 ? p.defenseId : p.offenseId);
      kicker.xpAtt++;
      if (/^good$/i.test(xp[2])) kicker.xpMade++;
    }
    if (p.kind === 'punt' && !p.noPlay) {
      const m = body.match(PUNTER);
      if (m) {
        const l = line(m[1], p.offenseId);
        l.punts++;
        l.puntYds += Number(m[2]);
      }
    }
  }
  return [...lines.values()];
}

function creditSnap(
  g: Game,
  p: Play,
  body: string,
  stands: boolean,
  line: (name: string, teamId: string) => PlayerLine,
): void {
  const td = stands && p.scoring && p.offPts >= 6;
  const epa = p.epa;
  const pm = body.match(PASSER);
  const first = firstPart(body);
  const gain = carrierYards(first, p.yards);
  const sack = pm?.[2] === 'sacked';
  const scramble = pm?.[2] === 'scrambles';
  let carrier: PlayerLine | null = null;

  if (pm) {
    const qb = line(pm[1], p.offenseId);
    if (epa != null) {
      qb.passEpa += epa;
      qb.passEpaN++;
    }
    if (stands) {
      qb.dropbacks++;
      if (p.success) qb.passSucc++;
      if (sack) {
        qb.sacked++;
        carrier = qb;
      } else if (scramble) {
        qb.scrambles++;
        qb.carries++;
        qb.rushYds += gain;
        if (td) qb.rushTd++;
        carrier = qb;
      } else {
        qb.att++;
        const picked = /INTERCEPTED/.test(body);
        if (picked) qb.ints++;
        const complete = !picked && !/\bincomplete\b/i.test(body);
        const tm = body.match(TARGET);
        const target = tm ? line(tm[1], p.offenseId) : null;
        if (complete) {
          qb.comp++;
          qb.passYds += gain;
          if (td) qb.passTd++;
        }
        if (target) {
          target.targets++;
          if (complete) {
            target.rec++;
            target.recYds += gain;
            if (td) target.recTd++;
            carrier = target;
          }
        }
      }
    }
    // A target gets the play's EPA even when a flag wiped it out, as nflverse counts it; an interception is the
    // passer's alone (a receiver isn't charged for a throw the defense caught).
    if (!sack && !scramble && epa != null && !/INTERCEPTED/.test(body)) {
      const tm = body.match(TARGET);
      if (tm) {
        const t = line(tm[1], p.offenseId);
        t.recEpa += epa;
        t.recEpaN++;
      }
    }
  } else if (p.kind === 'rush') {
    const rm = body.match(RUSHER);
    if (rm) {
      const rb = line(rm[1], p.offenseId);
      if (epa != null) {
        rb.rushEpa += epa;
        rb.rushEpaN++;
      }
      if (stands) {
        rb.carries++;
        rb.rushYds += gain;
        if (td) rb.rushTd++;
        if (p.success) rb.rushSucc++;
        carrier = rb;
      }
    }
  }
  if (!stands) return;

  // The defense, from the brackets in the play's first part.
  if (sack) {
    const m = first.match(/sacked\b[^(]*\(([^)]*)\)/);
    const who = m ? namesIn(m[1]) : [];
    for (const n of who) {
      const d = line(n, p.defenseId);
      d.sacks += 1 / who.length;
      d.tfl += 1 / who.length; // a sack is a tackle for loss in the box score too
      d.tackles++;
    }
  } else if (/\bincomplete\b/i.test(first)) {
    // "pass incomplete short left to X (Y)": Y broke it up.
    const m = first.match(/\bincomplete\b[^(]*\(([^)]*)\)/);
    for (const n of m ? namesIn(m[1]) : []) line(n, p.defenseId).passesDefended++;
  } else {
    const m = first.match(/\bfor (?:-?\d+ yards?|no gain)[^(]*\(([^)]*)\)/) ?? first.match(/\bpushed ob at [^(]*\(([^)]*)\)/);
    const who = m ? namesIn(m[1]) : [];
    for (const n of who) {
      const d = line(n, p.defenseId);
      d.tackles++;
      if (gain < 0) d.tfl += 1 / who.length;
    }
  }
  for (const m of first.matchAll(/\[([^\]]*)\]/g)) for (const n of namesIn(m[1])) line(n, p.defenseId).qbHits++;

  const picked = body.match(PICKED);
  if (picked) line(picked[1], p.defenseId).defInts++;
  const forced = body.match(FORCED);
  const rec = body.match(RECOVERED);
  const recTeam = rec ? teamFromCode(g, rec[1]) : null;
  const lost = !!recTeam && recTeam.id === p.defenseId;
  if (forced) {
    const f = line(forced[1], p.defenseId);
    f.forced++;
    if (lost) f.forcedLost++;
  }
  if (rec && recTeam && lost) line(rec[2], recTeam.id).recovered++;
  if (lost && carrier) carrier.fumblesLost++;
}

// ---- which group a player is lined up in ------------------------------------------------------------------------

/** ESPN's box score carries no positions, so a player's group is where most of his touches were: dropbacks (QB),
 *  designed carries (RB) or targets (WR / TE); then kickers and punters; then anyone with a defensive play. */
export function groupOf(l: PlayerLine): PositionGroup | null {
  const designed = l.carries - l.scrambles;
  if (l.dropbacks > 0 && l.dropbacks >= designed && l.dropbacks >= l.targets) return 'qb';
  if (designed > 0 && designed >= l.targets) return 'rb';
  if (l.targets > 0) return 'wr';
  if (l.fgs.length || l.xpAtt || l.punts) return 'k';
  if (defPlays(l) > 0) return 'def';
  return null;
}

export const defPlays = (l: PlayerLine) => l.tackles + l.defInts + l.passesDefended + l.forced + l.recovered + l.qbHits;

/** How much a player did, for ordering within a group. */
export function volume(l: PlayerLine, grp: PositionGroup): number {
  switch (grp) {
    case 'qb':
      return l.dropbacks;
    case 'rb':
      return l.carries - l.scrambles + l.targets / 2;
    case 'wr':
      return l.targets;
    case 'k':
      return l.fgs.length + l.xpAtt + l.punts;
    case 'def':
      return defPlays(l) + 2 * (l.sacks + l.defInts + l.forced);
  }
}

/** Below this a player "barely played": he sits behind the compare's "show all". */
export const SHOW_MIN: Record<PositionGroup, number> = { qb: 5, rb: 3, wr: 2, def: 3, k: 1 };

// ---- the standouts score ----------------------------------------------------------------------------------------

/** The standouts weights with every value present (the file's may be missing or null; `weightsFrom` fills them). */
export interface Weights {
  sack: number;
  interception: number;
  fumbleLost: number;
  tackleForLoss: number;
  passDefended: number;
  /** [lowest distance in the band, make rate], bands ascending from 0; never empty. */
  fgMake: [number, number][];
  xpMake: number;
}

// MMG-CONTENT-IN-CODE: KEEP the documented fallback for when data/baselines.json is missing or lacks a weight (both
// log); the nflverse build writes measured values there (these are its 2023-2025 output, built 2026-11-22). The one
// fallback home: nothing below substitutes a value of its own.
export const FALLBACK_WEIGHTS: Weights = {
  sack: 1.77,
  interception: 4.43,
  fumbleLost: 4.96,
  tackleForLoss: 1.18,
  passDefended: 0.9,
  fgMake: [
    [0, 0.978],
    [30, 0.939],
    [40, 0.803],
    [50, 0.74],
    [55, 0.608],
  ],
  xpMake: 0.959,
};

const warnedWeights = new Set<string>();
function warnWeight(field: string) {
  if (warnedWeights.has(field)) return;
  warnedWeights.add(field);
  console.warn(`Gridiron: data/baselines.json has no usable standouts weight "${field}"; using the built-in one`);
}

const SCALARS = ['sack', 'interception', 'fumbleLost', 'tackleForLoss', 'passDefended', 'xpMake'] as const;

/** The file's measured weights, each missing or unusable one replaced by FALLBACK_WEIGHTS's (warned once per field).
 *  Without the file at all, the fallback whole (getBaselines has already said the file is missing). */
export function weightsFrom(b: Baselines | null): Weights {
  if (!b) return FALLBACK_WEIGHTS;
  const w: Partial<ImpactWeights> = b.impact ?? {};
  const out: Weights = { ...FALLBACK_WEIGHTS };
  for (const k of SCALARS) {
    const v = w[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else warnWeight(k);
  }
  const bands = w.fgMake;
  const ok = Array.isArray(bands) && bands.length > 0 && bands[0][0] === 0 && bands.every(([lo, r], i) => Number.isFinite(lo) && r >= 0 && r <= 1 && (i === 0 || lo > bands[i - 1][0]));
  if (ok) out.fgMake = bands;
  else warnWeight('fgMake');
  return out;
}

function makeRate(w: Weights, dist: number): number {
  let r = w.fgMake[0][1];
  for (const [lo, rate] of w.fgMake) if (dist >= lo) r = rate;
  return r;
}

/** Tackles for loss that weren't sacks: the box score counts a sack as both, the score counts it once (as a sack),
 *  and the build measures the tackle-for-loss weight on non-sack plays. */
export const nonSackTfl = (l: PlayerLine) => Math.max(0, l.tfl - l.sacks);

export interface Impact {
  total: number;
  pass: number;
  rush: number;
  rec: number;
  def: number;
  kick: number;
  /** The quarterback's dropback EPA came from nflverse (post-game) rather than the live estimate. */
  nflverse: boolean;
}

export function impactOf(l: PlayerLine, w: Weights, qbEpa?: number | null): Impact {
  const pass = qbEpa ?? l.passEpa;
  const def =
    w.sack * l.sacks +
    w.interception * l.defInts +
    (w.fumbleLost / 2) * (l.forcedLost + l.recovered) +
    w.tackleForLoss * nonSackTfl(l) +
    w.passDefended * l.passesDefended;
  let kick = 0;
  for (const fg of l.fgs) {
    const r = makeRate(w, fg.dist);
    kick += fg.made ? 3 * (1 - r) : -3 * r;
  }
  kick += l.xpMade * (1 - w.xpMake) - (l.xpAtt - l.xpMade) * w.xpMake;
  const total = pass + l.rushEpa + l.recEpa + def + kick;
  return { total, pass, rush: l.rushEpa, rec: l.recEpa, def, kick, nflverse: qbEpa != null };
}

export interface Standout {
  line: PlayerLine;
  team: TeamInfo;
  group: PositionGroup | null;
  impact: Impact;
  why: string;
}

/** How many cards a side shows, and how far from zero a score must be to earn one. */
export const STANDOUT_CARDS = 4;
export const STANDOUT_MIN = 1.5;

/** nflverse's dropback EPA per quarterback, by name and side, for a final that has its per-game file. */
export function nflverseQbEpa(g: Game, adv: AdvancedGame | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!adv || g.state !== 'post' || g.truncated) return out;
  for (const q of adv.qbs) {
    if (q.epa_db == null) continue;
    const team = q.side === 'home' ? g.home : g.away;
    out.set(`${team.id}|${q.name}`, q.epa_db * q.dropbacks);
  }
  return out;
}

/** The game's best and roughest performers, both teams: up to STANDOUT_CARDS each, |score| >= STANDOUT_MIN. */
export function standouts(g: Game, w: Weights, qbEpa: Map<string, number> = new Map()): { good: Standout[]; rough: Standout[] } {
  const lines = playerLines(g);
  const used = new Set<string>();
  const all: Standout[] = lines.map((l) => {
    const nv = qbEpa.get(l.key);
    if (nv != null) used.add(l.key);
    const impact = impactOf(l, w, nv);
    return { line: l, team: l.teamId === g.home.id ? g.home : g.away, group: groupOf(l), impact, why: whyLine(l, impact) };
  });
  for (const k of qbEpa.keys()) if (!used.has(k)) console.warn(`Gridiron: nflverse quarterback ${k} matched no passer in ESPN's plays; his estimate stays`);
  const ranked = [...all].sort((a, b) => b.impact.total - a.impact.total);
  return {
    good: ranked.filter((s) => s.impact.total >= STANDOUT_MIN).slice(0, STANDOUT_CARDS),
    rough: ranked.filter((s) => s.impact.total <= -STANDOUT_MIN).reverse().slice(0, STANDOUT_CARDS),
  };
}

// ---- the one-line "why" -----------------------------------------------------------------------------------------

const count = (n: number, one: string, many: string = `${one}s`) => {
  const v = Math.round(n * 2) / 2;
  if (v === 1) return `${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}`;
  return `${v % 1 ? v.toFixed(1) : v} ${many}`;
};

/** "2 INT, −9.4 EPA on dropbacks", "3 sacks, a forced fumble": the parts that made the score, biggest first. */
export function whyLine(l: PlayerLine, imp: Impact): string {
  const parts: { size: number; text: string }[] = [];
  if (l.dropbacks || imp.pass) {
    const bits = [`${l.comp}/${l.att}`, `${l.passYds} yds`];
    if (l.passTd) bits.push(`${l.passTd} TD`);
    if (l.ints) bits.push(`${l.ints} INT`);
    if (l.sacked >= 3) bits.push(`sacked ${l.sacked}x`);
    parts.push({ size: imp.pass, text: `${bits.join(', ')}, ${signed(imp.pass, 1)} EPA on dropbacks${imp.nflverse ? ' (nflverse)' : ''}` });
  }
  if (l.rushEpaN) {
    parts.push({
      size: imp.rush,
      text: `${l.carries} carr${l.carries === 1 ? 'y' : 'ies'}, ${l.rushYds} yds${l.rushTd ? `, ${l.rushTd} TD` : ''}, ${signed(imp.rush, 1)} EPA on runs`,
    });
  }
  if (l.recEpaN) {
    parts.push({
      size: imp.rec,
      text: `${l.rec} of ${l.targets} for ${l.recYds} yds${l.recTd ? `, ${l.recTd} TD` : ''}, ${signed(imp.rec, 1)} EPA when targeted`,
    });
  }
  if (imp.def) {
    const bits: string[] = [];
    if (l.sacks) bits.push(count(l.sacks, 'sack'));
    if (l.defInts) bits.push(count(l.defInts, 'interception'));
    if (l.forced) bits.push(count(l.forced, 'forced fumble'));
    if (l.recovered) bits.push(count(l.recovered, 'fumble recovery', 'fumble recoveries'));
    // Sacks are listed already; these are the other tackles behind the line.
    if (nonSackTfl(l) >= 0.5) bits.push(count(nonSackTfl(l), 'tackle for loss', 'tackles for loss'));
    if (l.passesDefended) bits.push(count(l.passesDefended, 'pass defended', 'passes defended'));
    if (bits.length) parts.push({ size: imp.def, text: bits.join(', ') });
  }
  if (l.fgs.length || l.xpAtt) {
    const made = l.fgs.filter((f) => f.made);
    const missed = l.fgs.filter((f) => !f.made);
    const bits: string[] = [];
    if (l.fgs.length) bits.push(`${made.length}/${l.fgs.length} field goals${made.length ? `, long ${Math.max(...made.map((f) => f.dist))}` : ''}`);
    if (missed.length) bits.push(`missed from ${missed.map((f) => f.dist).join(' and ')}`);
    if (l.xpAtt > l.xpMade) bits.push(l.xpAtt - l.xpMade === 1 ? 'missed an extra point' : `missed ${l.xpAtt - l.xpMade} extra points`);
    parts.push({ size: imp.kick, text: bits.join(', ') });
  }
  // The parts pulling the same way as the score (by half a point or more), biggest first; two at most.
  const sign = imp.total >= 0 ? 1 : -1;
  const pick = parts.filter((x) => x.size * sign >= 0.5).sort((a, b) => Math.abs(b.size) - Math.abs(a.size));
  const out = (pick.length ? pick : parts).slice(0, 2).map((x) => x.text);
  // A lost fumble has no score of its own (its cost is already in the play's EPA), so it's a note on a rough line.
  if (sign < 0 && l.fumblesLost) out.push(l.fumblesLost === 1 ? 'lost a fumble' : `lost ${l.fumblesLost} fumbles`);
  return out.join(' · ');
}
