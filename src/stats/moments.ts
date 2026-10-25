// The plays that earn a marker on the timeline: scores, turnovers, and anything else that swung win probability
// by 10 points or more. Roughly 10-18 a game.
import type { Game, Play } from '../espn/model';

export type MomentKind = 'td' | 'fg' | 'safety' | 'int' | 'fumble' | 'downs' | 'miss' | 'swing' | 'clip';

export interface Moment {
  play: Play;
  kind: MomentKind;
  /** The team the play helped: the scorer, the side that took the ball, or the side win probability moved to. */
  teamId: string;
  /** "NYG 21 – HOU 14": the score after a scoring play, else null. */
  score: string | null;
}

const SWING = 0.1;
// When two markers land on the same spot on the rail, the higher one stays.
export const RANK: Record<MomentKind, number> = { td: 6, safety: 5, int: 4, fumble: 4, downs: 3, fg: 3, miss: 2, clip: 1.5, swing: 1 };

/** `clipIds`: plays with a highlight clip, which earn a marker even when nothing else about them does. */
export function moments(g: Game, clipIds?: Set<string>): Moment[] {
  const out: Moment[] = [];
  let prevHome = 0;
  let prevAway = 0;
  for (const p of g.plays) {
    const dh = p.homeScore - prevHome;
    const da = p.awayScore - prevAway;
    prevHome = p.homeScore;
    prevAway = p.awayScore;
    const scorer = dh > 0 ? g.home.id : da > 0 ? g.away.id : null;
    const pts = Math.max(dh, da);
    const score = scorer ? `${g.away.abbr} ${p.awayScore} – ${g.home.abbr} ${p.homeScore}` : null;
    const swungTo = p.wpDelta >= 0 ? g.home.id : g.away.id;
    let kind: MomentKind | null = null;
    let teamId = swungTo;
    // An extra point or a two-point try rides with its touchdown.
    if (p.scoring && scorer && p.kind !== 'xp') {
      kind = pts >= 6 ? 'td' : pts === 3 ? 'fg' : pts === 2 ? 'safety' : null;
      teamId = scorer;
    }
    // The side with the ball after the play gained it (a muffed punt the kicking team recovers counts for the kickers).
    if (!kind && p.turnover) {
      kind = /intercept/i.test(p.text) ? 'int' : 'fumble';
      teamId = p.endTeamId;
    }
    if (!kind && p.down === 4 && !p.noPlay && (p.kind === 'pass' || p.kind === 'rush') && p.endTeamId !== p.offenseId && !p.scoring) {
      kind = 'downs';
      teamId = p.endTeamId;
    }
    if (!kind && p.kind === 'fg' && /no good|missed|blocked/i.test(p.text)) {
      kind = 'miss';
      teamId = p.defenseId;
    }
    if (!kind && p.wpHome != null && Math.abs(p.wpDelta) >= SWING) kind = 'swing';
    if (!kind && clipIds?.has(p.id)) {
      kind = 'clip';
      teamId = p.offenseId;
    }
    if (kind) out.push({ play: p, kind, teamId, score });
  }
  return out;
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

/** The marker's label: the event, or for a swing or a clip, the play itself. */
export function momentLabel(m: Moment): string {
  return m.kind === 'swing' || m.kind === 'clip' ? playType(m.play) : MOMENT_LABEL[m.kind];
}

export const MOMENT_LABEL: Record<MomentKind, string> = {
  td: 'Touchdown',
  fg: 'Field goal',
  safety: 'Safety',
  int: 'Interception',
  fumble: 'Fumble lost',
  downs: 'Turnover on downs',
  miss: 'Missed field goal',
  swing: 'Big swing',
  clip: 'Highlight',
};
