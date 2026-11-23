// The game's story as events: scores, turnovers, fourth downs, kicks, punts, sacks, big penalties, injuries, and
// anything that swung win probability by 10 points or more. Each event belongs to one or more filter groups; the
// Story tab shows the groups the viewer has switched on, in the list and on the chart's marker rail.
import type { Game, GameBreak, Play } from '../espn/model';
import { periodLabel, teamFromCode } from '../espn/model';

export type MomentKind =
  | 'td'
  | 'fg'
  | 'safety'
  | 'two-pt'
  | 'int'
  | 'fumble'
  | 'muff'
  | 'downs'
  | 'fourth-go'
  | 'miss'
  | 'xp-miss'
  | 'punt-block'
  | 'punt'
  | 'sack'
  | 'penalty'
  | 'injury'
  | 'swing'
  | 'clip';

/** The filter chips, in the order they sit on the page. */
export type MomentGroup = 'scores' | 'turnovers' | 'swings' | 'injuries' | 'fourth' | 'kicks' | 'sacks' | 'punts' | 'penalties' | 'clips';

export const GROUPS: readonly MomentGroup[] = ['scores', 'turnovers', 'swings', 'injuries', 'fourth', 'kicks', 'sacks', 'punts', 'penalties', 'clips'];

export const GROUP_LABEL: Record<MomentGroup, string> = {
  scores: 'Scores',
  turnovers: 'Turnovers',
  swings: 'Big swings',
  injuries: 'Injuries',
  fourth: '4th downs',
  kicks: 'Kicks',
  sacks: 'Sacks',
  punts: 'Punts',
  penalties: 'Penalties',
  clips: 'Clips',
};

/** The marker shape each chip wears. */
export const GROUP_SHAPE: Record<MomentGroup, MomentKind> = {
  scores: 'td',
  turnovers: 'int',
  swings: 'swing',
  injuries: 'injury',
  fourth: 'fourth-go',
  kicks: 'miss',
  sacks: 'sack',
  punts: 'punt',
  penalties: 'penalty',
  clips: 'clip',
};

// Which chips show each kind. A stopped fourth down is a turnover too; a lost muff is a punt and a turnover; a
// blocked punt is a punt and a kick. Any primary event that swung 10+ points also shows under Big swings, any whose
// play has a clip under Clips, and any whose play was a sack under Sacks (see `moments`).
const KIND_GROUPS: Record<MomentKind, readonly MomentGroup[]> = {
  td: ['scores'],
  fg: ['scores'],
  safety: ['scores'],
  'two-pt': ['scores'],
  int: ['turnovers'],
  fumble: ['turnovers'],
  muff: ['turnovers', 'punts'],
  downs: ['fourth', 'turnovers'],
  'fourth-go': ['fourth'],
  miss: ['kicks'],
  'xp-miss': ['kicks'],
  'punt-block': ['punts', 'kicks'],
  punt: ['punts'],
  sack: ['sacks'],
  penalty: ['penalties'],
  injury: ['injuries'],
  swing: ['swings'],
  clip: ['clips'],
};

/** Everything but punts and penalties: those come every few minutes and would bury the plays that turned the game. */
export const DEFAULT_GROUPS: readonly MomentGroup[] = GROUPS.filter((g) => g !== 'punts' && g !== 'penalties');

export interface Moment {
  /** Unique within a game: one play can carry several events (a touchdown, its two-point try, an injury on it). */
  key: string;
  play: Play;
  kind: MomentKind;
  /** The team the event helped: the scorer, the side that took the ball, the side win probability moved to. For an
   *  injury, the injured player's team; for a sack, the defense; for a punt, the punting team. */
  teamId: string;
  /** "NYG 21 – HOU 14": the score after a scoring play, else null. */
  score: string | null;
  label: string;
  /** One line more: who was hurt and whether they came back, the penalty and its yards, how the punt ended. */
  detail: string | null;
  /** The play's own event (one per play); the rest ride along with it. Only the primary carries the play's win-probability swing and clip. */
  primary: boolean;
  groups: MomentGroup[];
}

const SWING = 0.1;
// When two markers land on the same spot on the rail, the higher one stays.
export const RANK: Record<MomentKind, number> = {
  td: 6,
  safety: 5,
  int: 4,
  fumble: 4,
  muff: 4,
  downs: 3,
  fg: 3,
  'fourth-go': 2.5,
  'punt-block': 2.5,
  miss: 2,
  'two-pt': 2,
  'xp-miss': 1.8,
  injury: 1.6,
  clip: 1.5,
  sack: 1.2,
  penalty: 1.1,
  swing: 1,
  punt: 0.8,
};

// A player as ESPN writes one: "S.Darnold", "Aj.Terrell", "H.To'oTo'o", "J.Croskey-Merritt", "A.St. Brown". Tight on
// purpose: a loose name let "TWO-POINT CONVERSION ATTEMPT. ... CAR-D.Lewis" read as an injury to team "TWO".
export const PLAYER = String.raw`[A-Z][a-z]{0,3}\.\s?[A-Z][\w'.-]*(?: [A-Z][\w'-]+)?`;
const INJURED = new RegExp(String.raw`\b([A-Z]{2,3})-(${PLAYER}) was injured during the play`, 'g');
const RETURNED = new RegExp(String.raw`Injury Update: ([A-Z]{2,3})-(${PLAYER}) has returned to the game`, 'g');
// "PENALTY on SEA-J.Jobe, Defensive Pass Interference, 34 yards, enforced at SEA 36 - No Play." The player is optional
// ("PENALTY on NE, Delay of Game, 5 yards"); a declined or offsetting flag carries no yards and is not matched.
const FLAG = /(?:PENALTY|Penalty) on ([A-Z]{2,3})(?:-([^,]+))?, ([^,]+?), (\d+) yards?, enforced/g;

export interface Injury {
  code: string;
  name: string;
}

/** Players ESPN's play text says were hurt on this play. */
export function injuriesIn(text: string): Injury[] {
  return [...text.matchAll(INJURED)].map((m) => ({ code: m[1], name: m[2].trim() }));
}

function returnsIn(text: string): Injury[] {
  return [...text.matchAll(RETURNED)].map((m) => ({ code: m[1], name: m[2].trim() }));
}

export interface Flag {
  code: string;
  player: string | null;
  name: string;
  yards: number;
}

/** Accepted penalties in a play's text, with their yards. */
export function flagsIn(text: string): Flag[] {
  return [...text.matchAll(FLAG)].map((m) => ({ code: m[1], player: m[2]?.trim() || null, name: m[3].trim(), yards: Number(m[4]) }));
}

/** The flag that makes a play's penalty worth a line in the story: 15+ yards, or a defensive foul that hands the offense a first down. */
export function bigFlag(g: Pick<Game, 'home' | 'away'>, p: Play): (Flag & { teamId: string; firstDown: boolean }) | null {
  let best: (Flag & { teamId: string; firstDown: boolean }) | null = null;
  for (const f of flagsIn(p.text)) {
    const t = teamFromCode(g, f.code);
    if (!t) continue;
    const onDefense = t.id === p.defenseId;
    const firstDown =
      onDefense && p.down > 0 && p.endTeamId === p.offenseId && p.endDown === 1 && (p.down > 1 || p.endDistance >= 10 || p.endDistance >= p.endYtg);
    if (f.yards < 15 && !firstDown) continue;
    if (!best || f.yards > best.yards) best = { ...f, teamId: t.id, firstDown };
  }
  return best;
}

const isSack = (p: Play) => p.kind === 'pass' && !p.noPlay && (/^sack/i.test(p.typeText) || /\bsacked\b/i.test(p.text));

/** `clipIds`: plays with a highlight clip, which earn a marker even when nothing else about them does. */
export function moments(g: Game, clipIds?: Set<string>): Moment[] {
  const out: Moment[] = [];
  let prevHome = 0;
  let prevAway = 0;
  const other = (id: string) => (id === g.home.id ? g.away.id : g.home.id);
  for (const p of g.plays) {
    const dh = p.homeScore - prevHome;
    const da = p.awayScore - prevAway;
    prevHome = p.homeScore;
    prevAway = p.awayScore;
    const scorer = dh > 0 ? g.home.id : da > 0 ? g.away.id : null;
    const pts = Math.max(dh, da);
    const score = scorer ? `${g.away.abbr} ${p.awayScore} – ${g.home.abbr} ${p.homeScore}` : null;
    const swungTo = p.wpDelta >= 0 ? g.home.id : g.away.id;
    const flag = bigFlag(g, p);
    const evs: Omit<Moment, 'key' | 'groups'>[] = [];
    const add = (kind: MomentKind, teamId: string, label: string, detail: string | null = null, primary = false) =>
      evs.push({ play: p, kind, teamId, score: primary ? score : null, label, detail, primary });

    // The play's own event, best first.
    let kind: MomentKind | null = null;
    let teamId = swungTo;
    let detail: string | null = null;
    let label: string | null = null;
    // An extra point or a two-point try rides with its touchdown.
    if (p.scoring && scorer && p.kind !== 'xp') {
      kind = pts >= 6 ? 'td' : pts === 3 ? 'fg' : pts === 2 ? 'safety' : null;
      teamId = scorer;
    }
    // ESPN flags a blocked kick as a turnover; it's a blocked kick (below), not a fumble.
    const blockedKick = (p.kind === 'fg' && /\bblocked\b/i.test(p.text)) || (p.kind === 'punt' && (/punt is blocked/i.test(p.text) || /^blocked punt/i.test(p.typeText)));
    // The side with the ball after the play gained it (a muffed punt the kicking team recovers counts for the kickers).
    if (!kind && p.turnover && !blockedKick) {
      kind = /intercept/i.test(p.text) ? 'int' : p.kind === 'punt' && /\bmuff/i.test(`${p.typeText} ${p.text}`) ? 'muff' : 'fumble';
      teamId = p.endTeamId;
    }
    // ESPN doesn't always flag a muffed punt the kickers recover as a turnover; the ball ending with them says it.
    if (!kind && p.kind === 'punt' && !p.noPlay && /\bmuffs\b/i.test(p.text) && p.endTeamId === p.offenseId) {
      kind = 'muff';
      teamId = p.offenseId;
    }
    const snap = p.down === 4 && !p.noPlay && (p.kind === 'pass' || p.kind === 'rush') && !p.scoring;
    if (!kind && snap && p.endTeamId !== p.offenseId) {
      kind = 'downs';
      teamId = p.endTeamId;
    }
    if (!kind && snap && p.endTeamId === p.offenseId && p.endDown === 1) {
      kind = 'fourth-go';
      teamId = p.offenseId;
      detail = `4th & ${p.distance >= p.ytg && p.ytg <= 10 ? 'goal' : p.distance} · ${p.yards} yds`;
    }
    if (!kind && p.kind === 'fg' && /no good|missed|blocked/i.test(p.text)) {
      kind = 'miss';
      teamId = p.defenseId;
      const m = p.text.match(/(\d+) yard field goal is (?:no good, ([^,]+)|blocked)/i);
      if (/blocked/i.test(p.text)) label = 'Blocked field goal';
      if (m) detail = m[2] ? `${m[1]} yds · ${m[2].toLowerCase()}` : `${m[1]} yds`;
    }
    if (!kind && blockedKick && p.kind === 'punt' && !p.noPlay) {
      kind = 'punt-block';
      teamId = p.defenseId;
    }
    if (!kind && p.kind === 'punt' && !p.noPlay) {
      kind = 'punt';
      teamId = p.offenseId;
      detail = puntDetail(p);
    }
    if (!kind && isSack(p)) {
      kind = 'sack';
      teamId = p.defenseId;
      detail = `${p.yards} yds`;
    }
    // A play that is nothing but the flag: the flag is its event.
    if (!kind && flag && (p.kind === 'penalty' || p.noPlay)) {
      kind = 'penalty';
      teamId = other(flag.teamId);
    }
    if (!kind && p.wpHome != null && Math.abs(p.wpDelta) >= SWING) kind = 'swing';
    if (!kind && clipIds?.has(p.id)) {
      kind = 'clip';
      teamId = p.offenseId;
    }
    if (kind === 'penalty' && flag) {
      label = flag.name;
      detail = flagDetail(g, flag);
    }
    if (kind) add(kind, teamId, label ?? defaultLabel(kind, p), detail, true);

    // What rides along with it.
    if (!p.noPlay && /two-point conversion attempt/i.test(p.text)) {
      const good = /attempt succeeds/i.test(p.text);
      add('two-pt', scorer ?? p.offenseId, good ? 'Two-point try good' : 'Two-point try failed');
    }
    if (!p.noPlay && /extra point is (no good|blocked)/i.test(p.text)) {
      const blocked = /extra point is blocked/i.test(p.text);
      add('xp-miss', scorer ? other(scorer) : p.defenseId, blocked ? 'Blocked extra point' : 'Missed extra point');
    }
    if (flag && kind !== 'penalty') add('penalty', other(flag.teamId), flag.name, flagDetail(g, flag));
    for (const inj of injuriesIn(p.text)) {
      const t = teamFromCode(g, inj.code);
      if (!t) continue;
      add('injury', t.id, 'Injury', `${inj.name} · ${returnNote(g, p, inj)}`);
    }

    evs.forEach((e, n) => {
      const groups = new Set(KIND_GROUPS[e.kind]);
      if (e.primary && p.wpHome != null && Math.abs(p.wpDelta) >= SWING) groups.add('swings');
      if (e.primary && clipIds?.has(p.id)) groups.add('clips');
      // A sack that was also a turnover, a stop on 4th down or a safety still counts as a sack.
      if (e.primary && isSack(p)) groups.add('sacks');
      out.push({ ...e, key: `${p.id}:${e.kind}:${n}`, groups: [...groups] });
    });
  }
  return out;
}

// Whether the player came back, as far as this game (or this replay) has got.
function returnNote(g: Game, p: Play, inj: Injury): string {
  for (const q of g.plays) {
    if (q.idx <= p.idx) continue;
    if (returnsIn(q.text).some((r) => r.code === inj.code && r.name === inj.name)) return `back ${periodLabel(q.period)} ${q.clock}`;
    // Hurt again later: the first return note belongs to this injury only up to then.
    if (injuriesIn(q.text).some((r) => r.code === inj.code && r.name === inj.name)) break;
  }
  return g.state === 'post' && !g.truncated ? 'did not return' : 'not back yet';
}

function flagDetail(g: Game, f: Flag & { teamId: string; firstDown: boolean }): string {
  const t = f.teamId === g.home.id ? g.home : g.away;
  return [`on ${f.player ? `${f.player} (${t.abbr})` : t.abbr}`, `${f.yards} yds`, f.firstDown ? '1st down' : null].filter(Boolean).join(' · ');
}

// "48 yds · fair catch", "51 yds · returned 12", "touchback".
function puntDetail(p: Play): string {
  const x = p.text;
  const dist = x.match(/punts (\d+) yards?/i)?.[1];
  const end = /\bmuffs\b/i.test(x)
    ? 'muffed, returner kept it'
    : /touchback/i.test(x)
      ? 'touchback'
      : /fair catch/i.test(x)
        ? 'fair catch'
        : /downed by/i.test(x)
          ? 'downed'
          : /out of bounds/i.test(x)
            ? 'out of bounds'
            : (() => {
                const r = x.match(/\. [A-Z][\w.'-]* (?:to|pushed ob at|ran ob at) .*? for (-?\d+) yards?/);
                return r ? `returned ${r[1]}` : /for no gain/i.test(x) ? 'returned 0' : null;
              })();
  return [dist ? `${dist} yds` : null, end].filter(Boolean).join(' · ');
}

function defaultLabel(kind: MomentKind, p: Play): string {
  return kind === 'swing' || kind === 'clip' ? playType(p) : MOMENT_LABEL[kind];
}

/** What a play was, in a broadcast's words: "Pass 49 yds", "Run 12 yds", "Sack". For markers that are only a swing or a clip. */
export function playType(p: Play): string {
  const t = p.text.toLowerCase();
  if (/sacked/.test(t)) return 'Sack';
  if (p.kind === 'pass') return /incomplete/.test(t) ? 'Incomplete pass' : /scrambles/.test(t) ? `Scramble ${p.yards} yds` : `Pass ${p.yards} yds`;
  if (p.kind === 'rush') return `Run ${p.yards} yds`;
  if (p.kind === 'punt') return 'Punt';
  if (p.kind === 'kick') return 'Kickoff';
  if (p.kind === 'fg') return 'Field goal try';
  if (p.kind === 'penalty') return 'Penalty';
  return p.typeText || 'Play';
}

export const MOMENT_LABEL: Record<MomentKind, string> = {
  td: 'Touchdown',
  fg: 'Field goal',
  safety: 'Safety',
  'two-pt': 'Two-point try',
  int: 'Interception',
  fumble: 'Fumble lost',
  muff: 'Muffed punt, lost',
  downs: 'Stopped on 4th down',
  'fourth-go': '4th down converted',
  miss: 'Missed field goal',
  'xp-miss': 'Missed extra point',
  'punt-block': 'Blocked punt',
  punt: 'Punt',
  sack: 'Sack',
  penalty: 'Penalty',
  injury: 'Injury',
  swing: 'Big swing',
  clip: 'Highlight',
};

// ---- the chart's marker rail -------------------------------------------------------------------------------------

// Scores, turnovers and stops on downs: the plays that turn a game always keep their marker.
const KEEP_RANK = 3;
/** Two markers closer than this (px) would sit on top of each other. */
export const RAIL_GAP = 14;

/** Where each marker sits on the rail (`at` gives a marker's true x). Every score, turnover and stop on downs keeps
 *  its marker: close ones are nudged apart instead of dropped (a field goal two minutes after a fumble used to vanish
 *  from the rail on a phone, 153 scores over the 2026 cache). Anything else is kept only where it has room. */
export function railMarks(ms: Moment[], at: (m: Moment) => number, width: number): { m: Moment; px: number }[] {
  // One marker per play: its best event.
  const best = new Map<string, Moment>();
  for (const m of ms) {
    const b = best.get(m.play.id);
    if (!b || RANK[m.kind] > RANK[b.kind]) best.set(m.play.id, m);
  }
  const ranked = [...best.values()].sort((a, b) => RANK[b.kind] - RANK[a.kind] || Math.abs(b.play.wpDelta) - Math.abs(a.play.wpDelta));
  const kept: { m: Moment; px: number }[] = ranked.filter((m) => RANK[m.kind] >= KEEP_RANK).map((m) => ({ m, px: at(m) }));
  for (const m of ranked) {
    if (RANK[m.kind] >= KEEP_RANK) continue;
    const px = at(m);
    if (kept.every((k) => Math.abs(k.px - px) >= RAIL_GAP)) kept.push({ m, px });
  }
  kept.sort((a, b) => a.m.play.idx - b.m.play.idx);
  // Spread crowded markers: push right to keep the gap, then back from the right edge.
  for (let i = 1; i < kept.length; i++) kept[i].px = Math.max(kept[i].px, kept[i - 1].px + RAIL_GAP);
  if (kept.length) kept[kept.length - 1].px = Math.min(kept[kept.length - 1].px, width);
  for (let i = kept.length - 2; i >= 0; i--) kept[i].px = Math.min(kept[i].px, kept[i + 1].px - RAIL_GAP);
  // More than the rail can space out (a 358px rail fits about 25): overlap rather than leave the rail.
  for (const k of kept) k.px = Math.max(0, k.px);
  return kept;
}

// ---- filters ----------------------------------------------------------------------------------------------------

export function visibleMoments(ms: Moment[], on: ReadonlySet<MomentGroup>): Moment[] {
  return ms.filter((m) => m.groups.some((g) => on.has(g)));
}

export function groupCounts(ms: Moment[]): Record<MomentGroup, number> {
  const out = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<MomentGroup, number>;
  for (const m of ms) for (const g of m.groups) out[g]++;
  return out;
}

export const FILTER_KEY = 'gridiron:story-filters';

/** The viewer's saved chips, or the default set when nothing (or nothing readable) is saved. */
export function parseFilters(raw: string | null): Set<MomentGroup> {
  if (raw == null) return new Set(DEFAULT_GROUPS);
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) return new Set(v.filter((x): x is MomentGroup => (GROUPS as readonly string[]).includes(x)));
    console.warn('Gridiron: saved story filters are not a list; using the defaults');
  } catch (e) {
    console.warn('Gridiron: saved story filters are unreadable; using the defaults', e);
  }
  return new Set(DEFAULT_GROUPS);
}

export function serializeFilters(on: ReadonlySet<MomentGroup>): string {
  return JSON.stringify(GROUPS.filter((g) => on.has(g)));
}

// ---- the list ---------------------------------------------------------------------------------------------------

export interface Divider {
  key: string;
  label: string;
  /** "AWY 7 – HOM 3" at the break, or null for a two-minute warning. */
  score: string | null;
  afterIdx: number;
  /** A two-minute warning, as opposed to the end of a quarter. */
  minor: boolean;
}

export type StoryRow = { type: 'event'; m: Moment } | { type: 'divider'; d: Divider };

/** The list's quarter dividers: ESPN's own end-of-quarter and two-minute rows, plus a period change ESPN didn't mark. */
export function dividers(g: Game): Divider[] {
  const scoreAt = (idx: number) => {
    const p = idx >= 0 ? g.plays[idx] : null;
    return `${g.away.abbr} ${p?.awayScore ?? 0} – ${g.home.abbr} ${p?.homeScore ?? 0}`;
  };
  const out: Divider[] = g.breaks.map((b: GameBreak, i) => ({
    key: `b${i}`,
    label:
      b.kind === 'two-minute'
        ? `Two-minute warning · ${periodLabel(b.period)}`
        : b.kind === 'half'
          ? 'Halftime'
          : b.kind === 'end-regulation'
            ? 'End of regulation'
            : `End of ${periodLabel(b.period)}`,
    score: b.kind === 'two-minute' ? null : scoreAt(b.afterIdx),
    afterIdx: b.afterIdx,
    minor: b.kind === 'two-minute',
  }));
  const ended = new Set(g.breaks.filter((b) => b.kind !== 'two-minute').map((b) => b.period));
  for (let i = 1; i < g.plays.length; i++) {
    const a = g.plays[i - 1].period;
    if (g.plays[i].period !== a && !ended.has(a)) {
      out.push({ key: `p${a}`, label: a === 2 ? 'Halftime' : a === 4 ? 'End of regulation' : `End of ${periodLabel(a)}`, score: scoreAt(i - 1), afterIdx: i - 1, minor: false });
    }
  }
  return out.sort((x, y) => x.afterIdx - y.afterIdx);
}

/** Events and dividers in reading order: game order, or newest first (`newestFirst`, while it's live). Events of one
 *  play stay together with the play's own event first. A divider shows only between two shown events, or after the
 *  last one (the latest break while it's live), so a filter never leaves a stack of empty dividers. */
export function storyRows(ms: Moment[], ds: Divider[], newestFirst: boolean): StoryRow[] {
  const rows: StoryRow[] = [];
  let di = 0;
  let lastIdx = -Infinity;
  for (const m of ms) {
    const idx = m.play.idx;
    const gap: Divider[] = [];
    while (di < ds.length && ds[di].afterIdx < idx) gap.push(ds[di++]);
    if (lastIdx !== -Infinity) for (const d of pickGap(gap)) rows.push({ type: 'divider', d });
    rows.push({ type: 'event', m });
    lastIdx = idx;
  }
  // The latest breaks, after the last event (halftime while it's halftime).
  if (lastIdx !== -Infinity) for (const d of pickGap(ds.slice(di))) rows.push({ type: 'divider', d });
  if (!newestFirst) return rows;
  // Newest first: reverse the order of plays, but keep each play's own events in their order.
  const groups: StoryRow[][] = [];
  for (const r of rows) {
    const prev = groups[groups.length - 1];
    if (r.type === 'event' && prev && prev[0].type === 'event' && prev[0].m.play.id === r.m.play.id) prev.push(r);
    else groups.push([r]);
  }
  return groups.reverse().flat();
}

// Several breaks between two shown events: the last end of a quarter speaks for the gap, and a two-minute warning
// after it still shows (the end of Q3, then the Q4 warning, before a late score).
function pickGap(gap: Divider[]): Divider[] {
  let end = -1;
  for (let i = 0; i < gap.length; i++) if (!gap[i].minor) end = i;
  let two = -1;
  for (let i = end + 1; i < gap.length; i++) if (gap[i].minor) two = i;
  return [end, two].filter((i) => i >= 0).map((i) => gap[i]);
}
