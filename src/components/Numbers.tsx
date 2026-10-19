// The live numbers grid: the stats that say how a team is actually playing, not just yards.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getCalibration, type Calibration } from '../espn/api';
import type { Game } from '../espn/model';
import { teamNumbers, type TeamNumbers } from '../stats/live';
import { num, pct, signed, teamVars, yardText } from '../format';

type Better = 'high' | 'low' | 'none';

interface Row {
  k: ComponentChildren;
  a: string;
  h: string;
  av: number | null;
  hv: number | null;
  better: Better;
}

export function Numbers({ g, epReady }: { g: Game; epReady: boolean }) {
  const [cal, setCal] = useState<Calibration | null>(null);
  useEffect(() => {
    if (epReady) getCalibration().then(setCal);
  }, [epReady]);
  const A = teamNumbers(g, g.away);
  const H = teamNumbers(g, g.home);
  const rows: Row[] = [
    row('Success rate', A, H, (t) => t.successRate, pct, 'high'),
    ...(epReady
      ? [row(<>EPA / play <span class="tag-est">est.</span></>, A, H, (t) => t.epaPerPlay, (x) => signed(x, 2), 'high')]
      : []),
    row('Yards / play', A, H, (t) => t.yardsPerPlay, (x) => num(x, 1), 'high'),
    row('Explosive plays', A, H, (t) => t.explosives, (x) => (x == null ? '–' : String(x)), 'high'),
    row('Early-down pass rate', A, H, (t) => t.earlyDownPassRate, pct, 'none'),
    row('Avg 3rd-down distance', A, H, (t) => (t.thirdDowns ? t.avgThirdDistance : null), (x) => num(x, 1), 'low'),
    row('Points / drive', A, H, (t) => (t.drives ? t.pointsPerDrive : null), (x) => num(x, 2), 'high'),
    row(
      'Turnovers (win % given away)',
      A,
      H,
      (t) => t.turnoverWpCost,
      () => '',
      'low',
    ),
    row('Avg drive start', A, H, (t) => t.avgStart, (x) => (x == null ? '–' : yardText(x)), 'high'),
  ];
  // Turnover row text needs both numbers.
  const to = rows.find((r) => r.k === 'Turnovers (win % given away)')!;
  to.a = A.turnovers ? `${A.turnovers} · ${pct(A.turnoverWpCost)}` : '0';
  to.h = H.turnovers ? `${H.turnovers} · ${pct(H.turnoverWpCost)}` : '0';

  if (!A.plays && !H.plays) return <p class="empty">Numbers appear after the first snap.</p>;

  return (
    <div class="nums">
      <div class="nums-head">
        <span class="k" />
        <span class="v away" style={teamVars(g.away)}>
          {g.away.abbr}
        </span>
        <span class="v home" style={teamVars(g.home)}>
          {g.home.abbr}
        </span>
      </div>
      {rows.map((r, i) => {
        const win = winner(r);
        return (
          <div class="nums-row" key={i}>
            <span class="k">{r.k}</span>
            <span class={`v away${win === 'a' ? ' better' : ''}`} style={teamVars(g.away)}>
              {r.a}
            </span>
            <span class={`v home${win === 'h' ? ' better' : ''}`} style={teamVars(g.home)}>
              {r.h}
            </span>
          </div>
        );
      })}
      <p class="nums-note">
        Scrimmage plays only ({A.plays} {g.away.abbr}, {H.plays} {g.home.abbr}). Success: 40% of the distance on 1st down, 60% on 2nd, all of it on 3rd/4th.
        Explosive: run 10+ or pass 20+. Early downs skip the last 2 minutes of each half.
        {epReady && ' EPA est. = expected points after the snap minus before, from a table baked from nflverse.'}
        {cal && ` Checked against nflverse's final numbers on ${cal.games} games this season: off by ${cal.mae.toFixed(2)} per play on average, 90% within ${cal.p90.toFixed(2)}.`}
      </p>
    </div>
  );
}

function row(k: ComponentChildren, A: TeamNumbers, H: TeamNumbers, f: (t: TeamNumbers) => number | null, fmt: (x: number | null) => string, better: Better): Row {
  const av = f(A);
  const hv = f(H);
  return { k, a: fmt(av), h: fmt(hv), av, hv, better };
}

function winner(r: Row): 'a' | 'h' | null {
  if (r.better === 'none' || r.av == null || r.hv == null || r.av === r.hv) return null;
  const aWins = r.better === 'high' ? r.av > r.hv : r.av < r.hv;
  return aWins ? 'a' : 'h';
}
