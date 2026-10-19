// Post-game, from nflverse: the model numbers (EPA, CPOE, pass rate over expected) once the nightly file lands.
import { useEffect, useState } from 'preact/hooks';
import { getAdvanced, type AdvancedGame, type AdvancedPlay, type AdvancedTeam } from '../espn/api';
import type { Game } from '../espn/model';
import { periodLabel } from '../espn/model';
import { num, pct, signed, teamVars } from '../format';
import { teamNumbers } from '../stats/live';

export function Advanced({ g }: { g: Game }) {
  const [adv, setAdv] = useState<AdvancedGame | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getAdvanced(g.id).then((a) => live && setAdv(a));
    return () => {
      live = false;
    };
  }, [g.id]);

  if (adv === undefined) return null;
  if (!adv) {
    return (
      <p class="empty">
        {g.state === 'post'
          ? 'nflverse posts the model numbers overnight; they show here once the nightly build picks them up.'
          : 'Model numbers (EPA, CPOE, pass rate over expected) arrive the morning after the game.'}
      </p>
    );
  }

  const A = adv.away;
  const H = adv.home;
  const estA = teamNumbers(g, g.away).epaPerPlay;
  const estH = teamNumbers(g, g.home).epaPerPlay;
  const rows: [string, (t: AdvancedTeam) => number | null, (x: number | null) => string, 'high' | 'low' | 'none'][] = [
    ['EPA / play', (t) => t.epa_play, (x) => signed(x, 2), 'high'],
    ['Pass EPA / dropback', (t) => t.pass_epa, (x) => signed(x, 2), 'high'],
    ['Rush EPA / carry', (t) => t.rush_epa, (x) => signed(x, 2), 'high'],
    ['Success rate (EPA > 0)', (t) => t.success, pct, 'high'],
    ['Early-down EPA', (t) => t.early_epa, (x) => signed(x, 2), 'high'],
    ['Pass rate over expected', (t) => t.proe, (x) => (x == null ? '–' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(0)}%`), 'none'],
    ['Explosive rate', (t) => t.explosive_rate, pct, 'high'],
  ];

  return (
    <div class="adv">
      <div class="nums">
        <div class="nums-head">
          <span class="k">
            <span class="tag-model">nflverse</span>
          </span>
          <span class="v away" style={teamVars(g.away)}>
            {g.away.abbr}
          </span>
          <span class="v home" style={teamVars(g.home)}>
            {g.home.abbr}
          </span>
        </div>
        {rows.map(([k, f, fmt, better]) => {
          const av = f(A);
          const hv = f(H);
          const win = better === 'none' || av == null || hv == null || av === hv ? null : (better === 'high') === av > hv ? 'a' : 'h';
          return (
            <div class="nums-row" key={k}>
              <span class="k">{k}</span>
              <span class={`v away${win === 'a' ? ' better' : ''}`} style={teamVars(g.away)}>
                {fmt(av)}
              </span>
              <span class={`v home${win === 'h' ? ' better' : ''}`} style={teamVars(g.home)}>
                {fmt(hv)}
              </span>
            </div>
          );
        })}
      </div>

      {adv.qbs.length > 0 && (
        <table class="pl-table qb-table">
          <caption>Quarterbacks</caption>
          <thead>
            <tr>
              <th class="pl-name" scope="col" />
              <th scope="col">DB</th>
              <th scope="col">EPA/DB</th>
              <th scope="col">CPOE</th>
              <th scope="col">aDOT</th>
              <th scope="col">YAC%</th>
            </tr>
          </thead>
          <tbody>
            {adv.qbs.map((q) => (
              <tr key={q.name} style={teamVars(q.side === 'home' ? g.home : g.away)}>
                <td class="pl-name">{q.name}</td>
                <td>{q.dropbacks}</td>
                <td>{signed(q.epa_db, 2)}</td>
                <td>{q.cpoe == null ? '–' : `${q.cpoe > 0 ? '+' : ''}${num(q.cpoe, 1)}`}</td>
                <td>{num(q.adot, 1)}</td>
                <td>{pct(q.yac_share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <TopPlays title="Biggest plays by EPA" plays={adv.top_epa} g={g} metric="epa" />
      <TopPlays title="Biggest plays by win probability" plays={adv.top_wpa} g={g} metric="wpa" />
      <p class="nums-note">
        nflfastR model values via nflverse ({adv.source}), built {adv.built}. DB = dropbacks (passes, sacks, scrambles). CPOE = completion % over expected.
        {estA != null && estH != null && (
          <>
            {' '}
            Check on this page's live estimate: it said {g.away.abbr} {signed(estA, 2)}, {g.home.abbr} {signed(estH, 2)} EPA/play; nflverse says {signed(A.epa_play, 2)} and{' '}
            {signed(H.epa_play, 2)}.
          </>
        )}
      </p>
    </div>
  );
}

function TopPlays({ title, plays, g, metric }: { title: string; plays: AdvancedPlay[]; g: Game; metric: 'epa' | 'wpa' }) {
  if (!plays.length) return null;
  return (
    <div class="topplays">
      <h3 class="topplays-title">{title}</h3>
      {plays.map((p, i) => {
        const t = p.side === 'home' ? g.home : g.away;
        const v = metric === 'epa' ? p.epa : p.wpa ?? 0;
        return (
          <div class="play" key={i} style={teamVars(t)}>
            <div class="play-dd">
              {t.abbr} · {periodLabel(p.qtr)} {p.clock}
            </div>
            <div class="play-text">{p.desc}</div>
            <div class="play-badges">
              <span class={`epa ${v > 0 ? 'pos' : 'neg'}`}>{metric === 'epa' ? `${signed(v, 1)} EPA` : `${signed(v * 100, 1)}% WP`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
