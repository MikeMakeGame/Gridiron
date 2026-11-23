// Head to head: away on the left, home on the right, each stat with a bar from the middle out. The side that did
// better keeps its team colour; the other steps back to grey. The first rows show; the rest sit behind "more".
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Game } from '../espn/model';
import { compareRows, edge, tally, type CompareRow } from '../stats/teamstats';
import { fillClass, teamVars } from '../format';
import { Icon, type IconName } from './Icons';
import { TipNote, useTips } from './Tip';
import { GLOSSARY } from '../glossary';
import { vsAverage, type AvgMark, type BaselineId, type Baselines, type StatKey } from '../stats/baselines';

/** The chosen league average, threaded to every comparison on a tab. */
export interface AvgCtx {
  base: Baselines | null;
  id: BaselineId;
  final: boolean;
}

// ESPN's team rows that have a league average, by row key.
const TEAM_STAT: Record<string, StatKey> = {
  totalYards: 'totalYards',
  netPassingYards: 'netPassingYards',
  rushingYards: 'rushingYards',
  yardsPerPlay: 'yardsPerPlay',
  firstDowns: 'firstDowns',
  thirdDownEff: 'thirdDownRate',
  redZoneAttempts: 'redZoneTdRate',
  turnovers: 'turnovers',
  sacks: 'sacksTaken',
  penalties: 'penaltyYards',
};

export interface Line {
  key: string;
  label: string;
  away: string;
  home: string;
  av: number | null;
  hv: number | null;
  /** Which side did better: 'a', 'h' or null (a tie, or a stat with no better side). */
  win: 'a' | 'h' | null;
  icon?: IconName | null;
  /** Bars only make sense for counts and rates (not for EPA, which runs below zero). */
  bar?: boolean;
  /** A live estimate, marked "est." beside its name. */
  est?: boolean;
  note?: ComponentChildren;
  /** Each side against the league average (../stats/baselines vsAverage); absent when there is nothing to compare. */
  am?: AvgMark | null;
  hm?: AvgMark | null;
}

const SHOWN = 7;
const PRIMARY = ['totalYards', 'netPassingYards', 'rushingYards', 'thirdDownEff', 'turnovers', 'possessionTime', 'penalties'];

export function TeamStats({ g, avg }: { g: Game; avg?: AvgCtx }) {
  const rows = compareRows(g);
  if (!rows.length) return <p class="empty">Team stats appear after kickoff.</p>;
  // ESPN's seven that answer the question first, in the order a broadcast shows them.
  const ordered = [...PRIMARY.map((k) => rows.find((r) => r.key === k)).filter(Boolean), ...rows.filter((r) => !PRIMARY.includes(r.key))] as CompareRow[];
  const t = tally(rows);
  return (
    <div class="cmp-block">
      <Tally g={g} a={t.a} h={t.h} />
      {/* A replay's box score is the final one: no average marks on numbers from the future. */}
      <Compare g={g} lines={ordered.map((r) => toLine(r, g.truncated ? undefined : avg))} shown={SHOWN} />
    </div>
  );
}

function toLine(r: CompareRow, avg?: AvgCtx): Line {
  const stat = TEAM_STAT[r.key];
  // "0/0" (no red-zone trip yet) is no rate at all, not 0%.
  const mark = (v: number, shown: string) => (avg && stat && shown !== '0/0' ? vsAverage(avg.base, avg.id, 'team', stat, v, avg.final) : null);
  return {
    key: r.key, label: r.label, away: r.away, home: r.home, av: r.av, hv: r.hv, win: edge(r), icon: r.icon, bar: true,
    am: mark(r.av, r.away), hm: mark(r.hv, r.home),
  };
}

// "NYG better in 8 · HOU in 3": the one-line answer, drawn as two blocks of ticks.
function Tally({ g, a, h }: { g: Game; a: number; h: number }) {
  const lead = a > h ? g.away : h > a ? g.home : null;
  return (
    <div class="tally" aria-label={`${g.away.abbr} better in ${a}, ${g.home.abbr} better in ${h}`}>
      <div class="tally-head">
        {lead ? (
          <>
            <b style={teamVars(lead)} class="tally-lead">
              {lead.abbr}
            </b>{' '}
            winning more of the numbers
          </>
        ) : (
          'Even on the numbers'
        )}
      </div>
      <div class="tally-bar">
        <span class="tally-side away" style={teamVars(g.away)}>
          <b>{a}</b> {g.away.abbr}
        </span>
        <span class="tally-ticks">
          {Array.from({ length: a }, (_, i) => (
            <i key={`a${i}`} class="tk away" style={teamVars(g.away)} />
          ))}
          {Array.from({ length: h }, (_, i) => (
            <i key={`h${i}`} class="tk home" style={teamVars(g.home)} />
          ))}
        </span>
        <span class="tally-side home" style={teamVars(g.home)}>
          {g.home.abbr} <b>{h}</b>
        </span>
      </div>
    </div>
  );
}

/** A value's quiet mark against the league average: an arrow and the gap, under the number. */
function AvgD({ m }: { m: AvgMark | null | undefined }) {
  if (!m) return null;
  const arrow = m.verdict === 'even' ? '' : m.delta > 0 ? '▲' : '▼';
  return (
    <small class={`avg-d is-${m.verdict}`} title={m.title} aria-label={m.title}>
      {arrow}
      {m.text}
    </small>
  );
}

export function Compare({
  g,
  lines,
  shown = lines.length,
  tips = false,
  heads,
}: {
  g: Game;
  lines: Line[];
  shown?: number;
  tips?: boolean;
  /** What heads each column (player names in the position compare); the team abbreviations otherwise. */
  heads?: [ComponentChildren, ComponentChildren];
}) {
  const [more, setMore] = useState(false);
  const [tip, toggleTip] = useTips();
  const list = more ? lines : lines.slice(0, shown);
  return (
    <div class="cmp">
      <div class="cmp-head">
        <span class={`cmp-team away${fillClass(g.away)}`} style={teamVars(g.away)}>
          {heads ? heads[0] : g.away.abbr}
        </span>
        <span class={`cmp-team home${fillClass(g.home)}`} style={teamVars(g.home)}>
          {heads ? heads[1] : g.home.abbr}
        </span>
      </div>
      {list.map((l) => {
        // The average sits on the same scale as the bars, as a tick on each half.
        const avg = l.am?.avg ?? l.hm?.avg ?? null;
        const max = Math.max(l.av ?? 0, l.hv ?? 0, avg ?? 0);
        const share = (v: number | null) => (max > 0 && v != null && v > 0 ? `${(v / max) * 100}%` : '0%');
        const tick = avg != null && avg > 0 && max > 0 ? `${(avg / max) * 100}%` : null;
        const explain = tips && GLOSSARY[l.label];
        return (
          <div class="cmp-row" key={l.key}>
            <span class={`cmp-v away${l.win === 'a' ? ' is-better' : l.win === 'h' ? ' is-worse' : ''}`} style={teamVars(g.away)}>
              {l.away}
              <AvgD m={l.am} />
            </span>
            <span class="cmp-k">
              {l.icon && <Icon name={l.icon} size={13} />}
              {explain ? (
                <button class="tip" type="button" aria-expanded={tip === l.label} data-tip={GLOSSARY[l.label]} onClick={() => toggleTip(l.label)}>
                  {l.label}
                </button>
              ) : (
                l.label
              )}
              {l.est && <span class="k-est">est.</span>}
            </span>
            <span class={`cmp-v home${l.win === 'h' ? ' is-better' : l.win === 'a' ? ' is-worse' : ''}`} style={teamVars(g.home)}>
              {l.home}
              <AvgD m={l.hm} />
            </span>
            {l.bar && (
              <span class="cmp-bar">
                <span class="cmp-half away">
                  <i class={l.win === 'h' ? 'is-worse' : ''} style={{ ...teamVars(g.away), width: share(l.av) }} />
                  {tick && <b class="cmp-avg" style={{ '--at': tick }} aria-hidden="true" />}
                </span>
                <span class="cmp-half home">
                  <i class={l.win === 'a' ? 'is-worse' : ''} style={{ ...teamVars(g.home), width: share(l.hv) }} />
                  {tick && <b class="cmp-avg" style={{ '--at': tick }} aria-hidden="true" />}
                </span>
              </span>
            )}
            {l.note}
            {tip === l.label && <TipNote term={l.label} class="cmp-tip" />}
          </div>
        );
      })}
      {lines.length > shown && (
        <button class="nums-more" type="button" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Fewer' : `${lines.length - shown} more`}
          <span class="chev" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
