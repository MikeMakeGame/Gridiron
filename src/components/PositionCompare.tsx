// The Players tab's compare: the two teams' players at one position group at a time, lined up in pairs (each
// side's busiest first), every stat with a bar and, where the league has one, its average. QB vs QB opens.
// Built from the play-by-play (../stats/players), so it follows a replay play by play.
import { useMemo, useState } from 'preact/hooks';
import type { Game } from '../espn/model';
import {
  GROUP_NAME,
  groupOf,
  playerLines,
  POSITION_GROUPS,
  SHOW_MIN,
  volume,
  type PlayerLine,
  type PositionGroup,
} from '../stats/players';
import { STATS, vsAverage, type BaselineId, type BaselineScope, type StatKey } from '../stats/baselines';
import type { Better } from '../stats/teamstats';
import { num, pct, signed } from '../format';
import { Compare, type AvgCtx, type Line } from './TeamStats';
import { BaselineSwitch } from './Baseline';

interface Spec {
  label: string;
  stat?: StatKey;
  better?: Better;
  val: (l: PlayerLine) => number | null;
  show: (l: PlayerLine) => string;
  bar?: boolean;
  est?: boolean;
}

const rate = (n: number, d: number) => (d > 0 ? n / d : null);
const int = (f: (l: PlayerLine) => number): Pick<Spec, 'val' | 'show'> => ({ val: f, show: (l) => String(Math.round(f(l) * 2) / 2) });

// MMG-CONTENT-IN-CODE: KEEP presentation (which stats each group shows, in what order), like the box score's columns.
const SPECS: Record<PositionGroup, Spec[]> = {
  qb: [
    { label: 'Comp / att', stat: 'compPct', val: (l) => rate(l.comp, l.att), show: (l) => `${l.comp}/${l.att}` },
    { label: 'Pass yards', stat: 'passYards', ...int((l) => l.passYds), bar: true },
    { label: 'Yds / attempt', stat: 'yardsPerAttempt', val: (l) => rate(l.passYds, l.att), show: (l) => num(rate(l.passYds, l.att), 1), bar: true },
    { label: 'EPA / dropback', stat: 'epaPerDropback', val: (l) => rate(l.passEpa, l.passEpaN), show: (l) => signed(rate(l.passEpa, l.passEpaN), 2), est: true },
    { label: 'Success rate', stat: 'successRate', val: (l) => rate(l.passSucc, l.dropbacks), show: (l) => pct(rate(l.passSucc, l.dropbacks)), bar: true },
    { label: 'Pass TD', stat: 'passTd', ...int((l) => l.passTd), bar: true },
    { label: 'INT', stat: 'interceptions', ...int((l) => l.ints), bar: true },
    { label: 'Sack rate', stat: 'sackRate', val: (l) => rate(l.sacked, l.dropbacks), show: (l) => pct(rate(l.sacked, l.dropbacks)), bar: true },
    { label: 'Rush yards', better: 'high', ...int((l) => l.rushYds) },
  ],
  rb: [
    { label: 'Carries', better: 'none', ...int((l) => l.carries), bar: true },
    { label: 'Rush yards', stat: 'rushYards', ...int((l) => l.rushYds), bar: true },
    { label: 'Yds / carry', stat: 'yardsPerCarry', val: (l) => rate(l.rushYds, l.carries), show: (l) => num(rate(l.rushYds, l.carries), 1), bar: true },
    { label: 'EPA / carry', stat: 'epaPerCarry', val: (l) => rate(l.rushEpa, l.rushEpaN), show: (l) => signed(rate(l.rushEpa, l.rushEpaN), 2), est: true },
    {
      label: 'Success rate', stat: 'successRate', bar: true,
      val: (l) => rate(l.rushSucc, l.carries - l.scrambles), show: (l) => pct(rate(l.rushSucc, l.carries - l.scrambles)),
    },
    { label: 'Rush TD', stat: 'rushTd', ...int((l) => l.rushTd), bar: true },
    { label: 'Receiving yards', better: 'high', ...int((l) => l.recYds), bar: true },
  ],
  wr: [
    { label: 'Targets', better: 'none', ...int((l) => l.targets), bar: true },
    { label: 'Catches', better: 'high', ...int((l) => l.rec), bar: true },
    { label: 'Rec yards', stat: 'recYards', ...int((l) => l.recYds), bar: true },
    { label: 'Catch rate', stat: 'catchRate', val: (l) => rate(l.rec, l.targets), show: (l) => pct(rate(l.rec, l.targets)), bar: true },
    { label: 'Yds / target', stat: 'yardsPerTarget', val: (l) => rate(l.recYds, l.targets), show: (l) => num(rate(l.recYds, l.targets), 1), bar: true },
    { label: 'EPA / target', stat: 'epaPerTarget', val: (l) => rate(l.recEpa, l.recEpaN), show: (l) => signed(rate(l.recEpa, l.recEpaN), 2), est: true },
    { label: 'TD', stat: 'recTd', ...int((l) => l.recTd), bar: true },
  ],
  def: [
    { label: 'Tackles', better: 'high', ...int((l) => l.tackles), bar: true },
    { label: 'Sacks', better: 'high', ...int((l) => l.sacks), bar: true },
    { label: 'Tackles for loss', better: 'high', ...int((l) => l.tfl), bar: true },
    { label: 'Interceptions', better: 'high', ...int((l) => l.defInts), bar: true },
    { label: 'Passes defended', better: 'high', ...int((l) => l.passesDefended), bar: true },
    { label: 'Forced fumbles', better: 'high', ...int((l) => l.forced), bar: true },
    { label: 'QB hits', better: 'high', ...int((l) => l.qbHits), bar: true },
  ],
  k: [
    {
      label: 'Field goals', stat: 'fgPct',
      val: (l) => (l.fgs.length ? rate(l.fgs.filter((f) => f.made).length, l.fgs.length) : null),
      show: (l) => (l.fgs.length ? `${l.fgs.filter((f) => f.made).length}/${l.fgs.length}` : '–'),
    },
    {
      label: 'Long', better: 'high', bar: true,
      val: (l) => (l.fgs.some((f) => f.made) ? Math.max(...l.fgs.filter((f) => f.made).map((f) => f.dist)) : null),
      show: (l) => (l.fgs.some((f) => f.made) ? String(Math.max(...l.fgs.filter((f) => f.made).map((f) => f.dist))) : '–'),
    },
    { label: 'Extra points', stat: 'xpPct', val: (l) => rate(l.xpMade, l.xpAtt), show: (l) => (l.xpAtt ? `${l.xpMade}/${l.xpAtt}` : '–') },
    { label: 'Punts', better: 'none', val: (l) => (l.punts ? l.punts : null), show: (l) => (l.punts ? String(l.punts) : '–') },
    { label: 'Punt avg', stat: 'puntAvg', val: (l) => rate(l.puntYds, l.punts), show: (l) => num(rate(l.puntYds, l.punts), 1), bar: true },
  ],
};

const SCOPE: Record<PositionGroup, BaselineScope | null> = { qb: 'qb', rb: 'rb', wr: 'wr', def: null, k: 'k' };

type Pair = [PlayerLine | null, PlayerLine | null];

function zip(a: PlayerLine[], b: PlayerLine[]): Pair[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i] ?? null, b[i] ?? null]);
}

/** Each side's players in a group, busiest first, paired by rank. Kickers pair with kickers, punters with punters. */
export function pairsFor(g: Game, lines: PlayerLine[], grp: PositionGroup): Pair[] {
  const side = (teamId: string, keep: (l: PlayerLine) => boolean = () => true) =>
    lines.filter((l) => l.teamId === teamId && groupOf(l) === grp && keep(l)).sort((x, y) => volume(y, grp) - volume(x, grp));
  if (grp === 'k') {
    const kicks = (l: PlayerLine) => l.fgs.length + l.xpAtt > 0;
    return [...zip(side(g.away.id, kicks), side(g.home.id, kicks)), ...zip(side(g.away.id, (l) => !kicks(l)), side(g.home.id, (l) => !kicks(l)))];
  }
  return zip(side(g.away.id), side(g.home.id));
}

export function PositionCompare({ g, avg, onPick }: { g: Game; avg: AvgCtx; onPick: (id: BaselineId) => void }) {
  const [grp, setGrp] = useState<PositionGroup>('qb');
  const [all, setAll] = useState(false);
  const lines = useMemo(() => playerLines(g), [g]);
  const pairs = pairsFor(g, lines, grp);
  const played = (p: Pair) => p.some((l) => l && volume(l, grp) >= SHOW_MIN[grp]);
  const main = pairs.filter(played);
  const rest = pairs.filter((p) => !played(p));
  const shown = all ? pairs : main;
  const scope = SCOPE[grp];
  return (
    <div class="pos-compare">
      <div class="pos-tabs" role="group" aria-label="Position">
        {POSITION_GROUPS.map((p) => (
          <button key={p} type="button" class={`pos-tab${p === grp ? ' is-on' : ''}`} aria-pressed={p === grp} onClick={() => (setGrp(p), setAll(false))}>
            {GROUP_NAME[p]}
          </button>
        ))}
      </div>
      {scope ? (
        <BaselineSwitch base={avg.base} id={avg.id} onPick={onPick} scope={scope} />
      ) : (
        avg.base && <p class="sec-note pos-note">No league average for defenders: the play-by-play has no snap counts to make a rate from.</p>
      )}
      {shown.length === 0 && <p class="empty">No {GROUP_NAME[grp]} plays yet.</p>}
      {shown.map(([a, h]) => (
        <div class="pos-pair" key={`${a?.key ?? '-'}~${h?.key ?? '-'}`}>
          <Compare g={g} heads={[a?.name ?? '–', h?.name ?? '–']} lines={pairLines(SPECS[grp], a, h, scope, avg)} tips />
        </div>
      ))}
      {rest.length > 0 && (
        <button class="more" type="button" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Only the main players' : `Show all (${rest.length} more)`}
        </button>
      )}
    </div>
  );
}

function pairLines(specs: Spec[], a: PlayerLine | null, h: PlayerLine | null, scope: BaselineScope | null, avg: AvgCtx): Line[] {
  const out: Line[] = [];
  for (const s of specs) {
    const av = a ? s.val(a) : null;
    const hv = h ? s.val(h) : null;
    if (av == null && hv == null) continue;
    const better = s.stat ? STATS[s.stat].better : s.better ?? 'none';
    const win = better === 'none' || av == null || hv == null || av === hv ? null : (better === 'high') === av > hv ? 'a' : 'h';
    const mark = (v: number | null) => (scope && s.stat ? vsAverage(avg.base, avg.id, scope, s.stat, v, avg.final) : null);
    out.push({
      key: s.label,
      label: s.label,
      away: a ? s.show(a) : '–',
      home: h ? s.show(h) : '–',
      av,
      hv,
      win,
      bar: !!s.bar && (av ?? 0) >= 0 && (hv ?? 0) >= 0,
      est: s.est,
      am: mark(av),
      hm: mark(hv),
    });
  }
  return out;
}
