// The live numbers grid: the stats that say how a team is actually playing, not just yards. The first four show;
// the rest sit behind "More". Every stat name explains itself on a tap.
import { useEffect, useState } from 'preact/hooks';
import { getCalibration, type Calibration } from '../espn/api';
import type { Game } from '../espn/model';
import { teamNumbers, type TeamNumbers } from '../stats/live';
import { num, pct, signed, teamVars, yardText } from '../format';
import { Term, TipNote, useTips } from './Tip';

type Better = 'high' | 'low' | 'none';

interface Row {
  term: string;
  a: string;
  h: string;
  av: number | null;
  hv: number | null;
  better: Better;
}

const SHOWN = 4;

export function Numbers({ g, epReady }: { g: Game; epReady: boolean }) {
  const [cal, setCal] = useState<Calibration | null>(null);
  const [more, setMore] = useState(false);
  const [tip, toggleTip] = useTips();
  useEffect(() => {
    if (epReady) getCalibration().then(setCal);
  }, [epReady]);
  const A = teamNumbers(g, g.away);
  const H = teamNumbers(g, g.home);
  if (!A.plays && !H.plays) return <p class="empty">Numbers appear after the first snap.</p>;

  const rows: Row[] = [
    row('Success rate', A, H, (t) => t.successRate, pct, 'high'),
    ...(epReady ? [row('EPA / play', A, H, (t) => t.epaPerPlay, (x) => signed(x, 2), 'high')] : []),
    row('Yards / play', A, H, (t) => t.yardsPerPlay, (x) => num(x, 1), 'high'),
    row('Explosive plays', A, H, (t) => t.explosives, (x) => (x == null ? '–' : String(x)), 'high'),
    row('Early-down pass rate', A, H, (t) => t.earlyDownPassRate, pct, 'none'),
    row('Avg 3rd-down distance', A, H, (t) => (t.thirdDowns ? t.avgThirdDistance : null), (x) => num(x, 1), 'low'),
    row('Points / drive', A, H, (t) => (t.drives ? t.pointsPerDrive : null), (x) => num(x, 2), 'high'),
    {
      ...row('Turnovers (win % given away)', A, H, (t) => t.turnoverWpCost, () => '', 'low'),
      a: A.turnovers ? `${A.turnovers} · ${pct(A.turnoverWpCost)}` : '0',
      h: H.turnovers ? `${H.turnovers} · ${pct(H.turnoverWpCost)}` : '0',
    },
    row('Avg drive start', A, H, (t) => t.avgStart, (x) => (x == null ? '–' : yardText(x)), 'high'),
  ];
  const shown = more ? rows : rows.slice(0, SHOWN);
  // The live EPA's track record goes where the question comes up: in its own explanation.
  const epaExtra = cal ? `Checked on ${cal.games} games: within ${cal.mae.toFixed(2)} of nflverse's by the final${halftime(cal)}.` : undefined;

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
      {shown.map((r) => {
        const win = winner(r);
        const extra = r.term === 'EPA / play' ? epaExtra : undefined;
        return (
          <div class="nums-row" key={r.term}>
            <span class="k">
              <Term term={r.term} open={tip === r.term} onToggle={() => toggleTip(r.term)} extra={extra}>
                {r.term === 'EPA / play' ? (
                  <>
                    EPA / play <span class="k-est">est.</span>
                  </>
                ) : undefined}
              </Term>
            </span>
            <span class={`v away${win === 'h' ? ' worse' : ''}`} style={teamVars(g.away)}>
              {r.a}
            </span>
            <span class={`v home${win === 'a' ? ' worse' : ''}`} style={teamVars(g.home)}>
              {r.h}
            </span>
            {tip === r.term && <TipNote term={r.term} extra={extra} class="in-grid" />}
          </div>
        );
      })}
      {rows.length > SHOWN && (
        <button class="nums-more" type="button" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Fewer' : `${rows.length - SHOWN} more`}
          <span class="chev" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function halftime(c: Calibration): string {
  const h = c.byCut?.find((x) => x.cut === 'Q2');
  return h ? `, ${h.mae.toFixed(2)} at halftime` : '';
}

function row(term: string, A: TeamNumbers, H: TeamNumbers, f: (t: TeamNumbers) => number | null, fmt: (x: number | null) => string, better: Better): Row {
  const av = f(A);
  const hv = f(H);
  return { term, a: fmt(av), h: fmt(hv), av, hv, better };
}

function winner(r: Row): 'a' | 'h' | null {
  if (r.better === 'none' || r.av == null || r.hv == null || r.av === r.hv) return null;
  const aWins = r.better === 'high' ? r.av > r.hv : r.av < r.hv;
  return aWins ? 'a' : 'h';
}
