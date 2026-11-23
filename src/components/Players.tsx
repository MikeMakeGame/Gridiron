// Players: the position compare (QB vs QB first), then the box score, the three categories people read by default
// and the rest behind one tap.
import { useState } from 'preact/hooks';
import type { Game } from '../espn/model';
import type { BaselineId } from '../stats/baselines';
import type { AvgCtx } from './TeamStats';
import { PositionCompare } from './PositionCompare';
import type { EspnBoxPlayerCategory } from '../espn/types';
import { fillClass, teamVars } from '../format';

const MAIN = ['passing', 'rushing', 'receiving'];
const MORE = ['defensive', 'interceptions', 'fumbles', 'kicking', 'punting', 'kickReturns', 'puntReturns'];
const TITLE: Record<string, string> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  defensive: 'Defense',
  interceptions: 'Interceptions',
  fumbles: 'Fumbles',
  kicking: 'Kicking',
  punting: 'Punting',
  kickReturns: 'Kick returns',
  puntReturns: 'Punt returns',
};

export function Players({ g, avg, onPick }: { g: Game; avg: AvgCtx; onPick: (id: BaselineId) => void }) {
  const [more, setMore] = useState(false);
  const teams = g.box?.players ?? [];
  if (!teams.length && !g.plays.length) return <p class="empty">Box score appears after kickoff.</p>;
  // ESPN lists away first; keep the page's away-then-home order regardless.
  const ordered = [...teams].sort((a, b) => (a.team.id === g.away.id ? -1 : b.team.id === g.away.id ? 1 : 0));
  const cats = more ? [...MAIN, ...MORE] : MAIN;
  return (
    <div class="players">
      <h3 class="sub-title">Compare</h3>
      <PositionCompare g={g} avg={avg} onPick={onPick} />
      {ordered.length > 0 && <h3 class="sub-title">Box score</h3>}
      {g.truncated && ordered.length > 0 && <p class="nums-note">Replay: this box score is the final one.</p>}
      {ordered.map((t) => {
        const info = t.team.id === g.home.id ? g.home : g.away;
        return (
          <div class={`pl-team${fillClass(info)}`} key={t.team.id} style={teamVars(info)}>
            <h3 class="pl-team-name">{info.name}</h3>
            {cats.map((name) => {
              const c = t.statistics.find((x) => x.name === name);
              return c && c.athletes.length ? <CatTable key={name} c={c} /> : null;
            })}
          </div>
        );
      })}
      {ordered.length > 0 && (
        <button class="more" onClick={() => setMore(!more)}>
          {more ? 'Fewer tables' : 'Defense, kicking, returns'}
        </button>
      )}
    </div>
  );
}

function CatTable({ c }: { c: EspnBoxPlayerCategory }) {
  const rows = c.name === 'defensive' ? c.athletes.slice(0, 6) : c.athletes;
  return (
    <table class="pl-table">
      <caption>{TITLE[c.name] ?? c.text ?? c.name}</caption>
      <thead>
        <tr>
          <th class="pl-name" scope="col" />
          {c.labels.map((l) => (
            <th scope="col">{l}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.athlete.id}>
            <td class="pl-name">{a.athlete.shortName ?? a.athlete.displayName}</td>
            {a.stats.map((s) => (
              <td>{s}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
