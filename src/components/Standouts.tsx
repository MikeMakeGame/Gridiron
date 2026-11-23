// The Standouts tab: the game's best and roughest performers, both teams, ranked by one impact score (expected
// points added, see ../stats/players), each with the line that earned it. Live it says "so far" and follows each
// play; in a replay it stops where the replay is; after the game nflverse's quarterback EPA replaces the estimate.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getAdvanced, type AdvancedGame } from '../espn/api';
import type { Game } from '../espn/model';
import type { Baselines } from '../stats/baselines';
import { GROUP_NAME, nflverseQbEpa, standouts, STANDOUT_MIN, weightsFrom, type Standout } from '../stats/players';
import { fillClass, signed, teamVars } from '../format';
import { Term, TipNote, useTips } from './Tip';

let warnedNoEp = false;

export function Standouts({ g, base, epReady }: { g: Game; base: Baselines | null; epReady: boolean }) {
  const final = g.state === 'post' && !g.truncated;
  const [adv, setAdv] = useState<AdvancedGame | null>(null);
  const [tip, toggleTip] = useTips();
  useEffect(() => {
    if (!final) return;
    let live = true;
    getAdvanced(g.id).then((a) => live && setAdv(a));
    return () => {
      live = false;
    };
  }, [g.id, final]);
  const weights = useMemo(() => weightsFrom(base), [base]);
  const so = useMemo(() => standouts(g, weights, nflverseQbEpa(g, adv)), [g, weights, adv]);

  if (!g.plays.length) return <p class="empty">Standouts start at kickoff.</p>;
  if (!epReady) {
    if (!warnedNoEp) {
      warnedNoEp = true;
      console.warn('Gridiron: no EP table, so no EPA to rank players by; the Standouts tab waits for it');
    }
    return <p class="empty">Standouts need the EPA table, which hasn't loaded.</p>;
  }
  const soFar = !final;
  return (
    <div class="standouts">
      <Block title={soFar ? 'Good so far' : 'Good games'} tone="good" list={so.good} g={g} />
      <Block title={soFar ? 'Rough so far' : 'Rough games'} tone="rough" list={so.rough} g={g} />
      <p class="sec-note">
        Ranked by{' '}
        <Term term="Impact" open={tip === 'Impact'} onToggle={() => toggleTip('Impact')}>
          impact
        </Term>
        , in expected points; a card needs {STANDOUT_MIN} either way.{adv ? ' Quarterbacks use nflverse’s EPA.' : ' EPA is estimated live.'}
      </p>
      <TipNote term={tip} />
    </div>
  );
}

function Block({ title, tone, list, g }: { title: string; tone: 'good' | 'rough'; list: Standout[]; g: Game }) {
  return (
    <section class={`so-block is-${tone}`}>
      <h3 class="sub-title">{title}</h3>
      {list.length ? (
        <ol class="so-list">
          {list.map((s) => (
            <li class={`so-card is-${tone}${fillClass(s.team)}`} key={s.line.key} style={teamVars(s.team)}>
              <span class="so-team">{s.team.abbr}</span>
              <span class="so-name">{s.line.name}</span>
              {s.group && <span class="so-pos">{GROUP_NAME[s.group]}</span>}
              <span class="so-score" aria-label={`impact ${signed(s.impact.total, 1)} expected points`}>
                {signed(s.impact.total, 1)}
              </span>
              <p class="so-why">{s.why}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p class="empty">{g.state === 'post' && !g.truncated ? 'Nobody stood out this way.' : 'Nobody yet.'}</p>
      )}
    </section>
  );
}
