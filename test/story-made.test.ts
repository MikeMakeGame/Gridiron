// The Story's classifier on a hand-written game in ESPN's format (test/fixtures/story-made-up.ts: invented teams,
// players and text, so it is committed and runs on CI, where ESPN's real play text, test/fixtures/espn-plays.json,
// is absent). One row per kind of event; test/story.test.ts runs the same rules on ESPN's real text when it's there.
import { describe, expect, it, vi } from 'vitest';
import { buildGame } from '../src/espn/model';
import { DEFAULT_GROUPS, dividers, groupCounts, moments, storyRows, visibleMoments, type Moment, type MomentKind } from '../src/stats/moments';
import { AWAY, HOME, madeUpSummary, ROW } from './fixtures/story-made-up';

const game = (upto?: number) => buildGame(madeUpSummary(), { upto });
const of = (ms: Moment[], id: string) => ms.filter((m) => m.play.id === id);
const kinds = (ms: Moment[], id: string) => of(ms, id).map((m) => m.kind);

describe('every kind of Story event, on made-up rows in ESPN’s format', () => {
  const ms = moments(game(), new Set([ROW.clip]));

  it('a sack, with the injury on the same play riding along, and when the player came back', () => {
    const [sack, hurt] = of(ms, ROW.sackAndInjury);
    expect([sack.kind, sack.teamId, sack.detail, sack.primary]).toEqual(['sack', HOME.id, '-6 yds', true]);
    expect([hurt.kind, hurt.teamId, hurt.detail, hurt.primary]).toEqual(['injury', AWAY.id, 'Q.Testman · back Q1 2:00', false]);
    expect(kinds(ms, ROW.injuryReturn)).toEqual([]); // the return note is not an event of its own
  });

  it('a big flag that wiped out the play is the play’s event; a 5-yard false start is nothing', () => {
    const [flag] = of(ms, ROW.bigFlag);
    expect([flag.kind, flag.label, flag.teamId]).toEqual(['penalty', 'Defensive Pass Interference', AWAY.id]);
    expect(flag.detail).toBe('on C.Corner (HOM) · 34 yds · 1st down');
    expect(kinds(ms, ROW.smallFlag)).toEqual([]);
  });

  it('a flag on a team with no player named rides on its play', () => {
    const [flag] = of(ms, ROW.kickoffTeamFlag);
    expect([flag.kind, flag.label, flag.detail, flag.primary, flag.teamId]).toEqual(['penalty', 'Unsportsmanlike Conduct', 'on AWY · 15 yds', false, HOME.id]);
  });

  it('touchdowns carry their two-point tries and missed or blocked extra points', () => {
    expect(of(ms, ROW.tdTwoPointGood).map((m) => [m.kind, m.label])).toEqual([
      ['td', 'Touchdown'],
      ['two-pt', 'Two-point try good'],
    ]);
    expect(of(ms, ROW.tdTwoPointGood)[0].score).toBe('AWY 8 – HOM 0');
    expect(of(ms, ROW.tdTwoPointFailed).map((m) => m.label)).toEqual(['Touchdown', 'Two-point try failed']);
    const xp = of(ms, ROW.tdXpMissed);
    expect(xp.map((m) => m.label)).toEqual(['Touchdown', 'Missed extra point']);
    expect(xp[1].teamId).toBe(HOME.id); // credited to the defense
    expect(of(ms, ROW.tdXpBlocked).map((m) => m.label)).toEqual(['Touchdown', 'Blocked extra point']);
  });

  it('a field goal and a safety are scores; the safety still counts as a sack', () => {
    expect(of(ms, ROW.fgGood).map((m) => [m.kind, m.teamId, m.score])).toEqual([['fg', HOME.id, 'AWY 8 – HOM 3']]);
    const [safety] = of(ms, ROW.safety);
    expect([safety.kind, safety.teamId]).toEqual(['safety', AWAY.id]);
    expect(safety.groups).toEqual(expect.arrayContaining(['scores', 'sacks']));
  });

  it('turnovers: an interception and a fumble, credited to the side that took the ball', () => {
    expect(of(ms, ROW.interception).map((m) => [m.kind, m.teamId])).toEqual([['int', AWAY.id]]);
    expect(of(ms, ROW.fumble).map((m) => [m.kind, m.teamId])).toEqual([['fumble', HOME.id]]);
  });

  it('fourth downs: converted, and stopped (which is also a turnover)', () => {
    const [go] = of(ms, ROW.fourthConverted);
    expect([go.kind, go.detail]).toEqual(['fourth-go', '4th & 2 · 3 yds']);
    const [stop] = of(ms, ROW.fourthStopped);
    expect([stop.kind, stop.teamId]).toEqual(['downs', HOME.id]);
    expect(stop.groups).toEqual(expect.arrayContaining(['fourth', 'turnovers']));
  });

  it('kicks: a missed field goal says how it missed, a blocked one says blocked (not a fumble)', () => {
    const [miss] = of(ms, ROW.fgMissed);
    expect([miss.kind, miss.label, miss.detail, miss.teamId]).toEqual(['miss', 'Missed field goal', '52 yds · wide right', AWAY.id]);
    const [blk] = of(ms, ROW.fgBlocked);
    expect([blk.kind, blk.label, blk.detail]).toEqual(['miss', 'Blocked field goal', '49 yds']);
  });

  it('punts: how far and how it ended; blocked (not a fumble); muffed and lost', () => {
    const [punt] = of(ms, ROW.punt);
    expect([punt.kind, punt.teamId, punt.detail]).toEqual(['punt', HOME.id, '44 yds · returned 10']);
    expect(kinds(ms, ROW.puntBlocked)).toEqual(['punt-block']);
    const [muff] = of(ms, ROW.muff);
    expect([muff.kind, muff.teamId]).toEqual(['muff', AWAY.id]);
    expect(muff.groups).toEqual(['turnovers', 'punts']);
  });

  it('a big win-probability swing, and a play that is only there for its clip', () => {
    const [swing] = of(ms, ROW.swing);
    expect([swing.kind, swing.label, swing.teamId]).toEqual(['swing', 'Pass 12 yds', AWAY.id]);
    const [clip] = of(ms, ROW.clip);
    expect([clip.kind, clip.groups]).toEqual(['clip', ['clips']]);
  });

  it('covers every kind of event there is', () => {
    const all: MomentKind[] = ['td', 'fg', 'safety', 'two-pt', 'int', 'fumble', 'muff', 'downs', 'fourth-go', 'miss', 'xp-miss', 'punt-block', 'punt', 'sack', 'penalty', 'injury', 'swing', 'clip'];
    expect(new Set(ms.map((m) => m.kind))).toEqual(new Set(all));
  });

  it('counts per chip, and the default chips hide punts and penalties', () => {
    const c = groupCounts(ms);
    // Scores: four touchdowns, two two-point tries, a field goal and a safety. Punts: a punt, a blocked one, a muff.
    expect([c.scores, c.injuries, c.penalties, c.punts, c.clips]).toEqual([8, 1, 2, 3, 1]);
    const vis = visibleMoments(ms, new Set(DEFAULT_GROUPS));
    expect(vis.some((m) => m.kind === 'punt' || m.kind === 'penalty')).toBe(false);
    expect(vis.some((m) => m.kind === 'muff')).toBe(true); // a muff is a turnover too
  });

  it('the list puts the end of the first quarter between the events either side of it, with the score', () => {
    const g = game();
    const rows = storyRows(moments(g), dividers(g), false);
    const at = rows.findIndex((r) => r.type === 'divider');
    expect(rows[at].type === 'divider' && [rows[at].d.label, rows[at].d.score]).toEqual(['End of Q1', 'AWY 8 – HOM 0']);
    const before = rows[at - 1];
    expect(before.type === 'event' && before.m.play.id).toBe(ROW.kickoffTeamFlag);
  });
});

describe('the replay cut, on the made-up game', () => {
  it('shows nothing after the cut, and the injury is "not back yet" before the return note', () => {
    const at1 = moments(game(1));
    expect(at1.every((m) => m.play.idx < 1)).toBe(true);
    expect(of(at1, ROW.sackAndInjury).find((m) => m.kind === 'injury')!.detail).toBe('Q.Testman · not back yet');
    expect(game(6).breaks).toEqual([]); // the end of Q1 comes after the sixth play, so a cut there hasn't reached it
    expect(game(7).breaks.map((b) => b.kind)).toEqual(['end-quarter']);
  });

  it('builds without a warning (both teams known, both coloured)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    moments(game());
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
