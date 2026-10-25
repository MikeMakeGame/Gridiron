// Head to head: away on the left, home on the right, each stat with a bar from the middle out. The side that did
// better keeps its team colour; the other steps back to grey. The first rows show; the rest sit behind "more".
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Game } from '../espn/model';
import { compareRows, edge, tally, type CompareRow } from '../stats/teamstats';
import { teamVars } from '../format';
import { Icon, type IconName } from './Icons';
import { TipNote, useTips } from './Tip';
import { GLOSSARY } from '../glossary';

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
}

const SHOWN = 7;
const PRIMARY = ['totalYards', 'netPassingYards', 'rushingYards', 'thirdDownEff', 'turnovers', 'possessionTime', 'penalties'];

export function TeamStats({ g }: { g: Game }) {
  const rows = compareRows(g);
  if (!rows.length) return <p class="empty">Team stats appear after kickoff.</p>;
  // ESPN's seven that answer the question first, in the order a broadcast shows them.
  const ordered = [...PRIMARY.map((k) => rows.find((r) => r.key === k)).filter(Boolean), ...rows.filter((r) => !PRIMARY.includes(r.key))] as CompareRow[];
  const t = tally(rows);
  return (
    <div class="cmp-block">
      <Tally g={g} a={t.a} h={t.h} />
      <Compare g={g} lines={ordered.map(toLine)} shown={SHOWN} />
    </div>
  );
}

function toLine(r: CompareRow): Line {
  return { key: r.key, label: r.label, away: r.away, home: r.home, av: r.av, hv: r.hv, win: edge(r), icon: r.icon, bar: true };
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

export function Compare({ g, lines, shown = lines.length, tips = false }: { g: Game; lines: Line[]; shown?: number; tips?: boolean }) {
  const [more, setMore] = useState(false);
  const [tip, toggleTip] = useTips();
  const list = more ? lines : lines.slice(0, shown);
  return (
    <div class="cmp">
      <div class="cmp-head">
        <span class="cmp-team away" style={teamVars(g.away)}>
          {g.away.abbr}
        </span>
        <span class="cmp-team home" style={teamVars(g.home)}>
          {g.home.abbr}
        </span>
      </div>
      {list.map((l) => {
        const max = Math.max(l.av ?? 0, l.hv ?? 0);
        const share = (v: number | null) => (max > 0 && v != null && v > 0 ? `${(v / max) * 100}%` : '0%');
        const explain = tips && GLOSSARY[l.label];
        return (
          <div class="cmp-row" key={l.key}>
            <span class={`cmp-v away${l.win === 'a' ? ' is-better' : l.win === 'h' ? ' is-worse' : ''}`} style={teamVars(g.away)}>
              {l.away}
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
            </span>
            {l.bar && (
              <span class="cmp-bar">
                <span class="cmp-half away">
                  <i class={l.win === 'h' ? 'is-worse' : ''} style={{ ...teamVars(g.away), width: share(l.av) }} />
                </span>
                <span class="cmp-half home">
                  <i class={l.win === 'a' ? 'is-worse' : ''} style={{ ...teamVars(g.home), width: share(l.hv) }} />
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
