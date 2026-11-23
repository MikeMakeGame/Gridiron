// Whole-game win probability. Home on top. Drag or tap to read any play. Under the chart, a rail of markers for the
// story's events the filter chips leave on (scores, turnovers, big swings, ...), shaped like the drive caps.
import type { Game } from '../espn/model';
import { periodLabel } from '../espn/model';
import { SHORT_SCREEN, useWidth } from '../hooks/usePoll';
import { teamVars, wpText } from '../format';
import { railMarks, type Moment } from '../stats/moments';

export function WpChart({
  g,
  marks = [],
  clipIds,
  selected = null,
  onSelect,
}: {
  g: Game;
  marks?: Moment[];
  clipIds?: Set<string>;
  selected?: string | null;
  onSelect?: (playId: string | null) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  // On a short screen the pinned chart gives up height so the list under it keeps most of the screen (decided once
  // per load, so it never resizes mid-scroll).
  const H = SHORT_SCREEN ? 64 : 96;
  const pts = g.plays.filter((p) => p.wpHome != null);
  const span = g.regulationSec;
  const x = (s: number) => (s / span) * w;
  const y = (wp: number) => 4 + (1 - wp) * (H - 8);

  const d = pts.length && w ? `M${x(0).toFixed(1)},${y(pts[0].wpHome!).toFixed(1)} ` + pts.map((p) => `L${x(p.gameSec).toFixed(1)},${y(p.wpHome!).toFixed(1)}`).join(' ') : '';
  const last = pts[pts.length - 1];
  const quarters = Math.ceil(span / 900);

  const onPoint = (ev: PointerEvent) => {
    if (!pts.length || !w || !onSelect) return;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const s = ((ev.clientX - r.left) / r.width) * span;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].gameSec - s) < Math.abs(pts[best].gameSec - s)) best = i;
    onSelect(pts[best].id);
  };

  const sel = selected ? g.plays.find((p) => p.id === selected) ?? null : null;
  const selWp = sel?.wpHome ?? null;
  const homeNow = last?.wpHome ?? null;
  const done = g.state === 'post';
  // Every score keeps its marker; crowded ones are nudged apart, and the guide line runs from the play's true spot
  // on the chart to its marker.
  const rail = w ? railMarks(marks, (m: Moment) => x(m.play.gameSec), w) : [];

  return (
    <div class="wpchart-wrap">
      <div class="wpchart" ref={ref} style={{ height: `${H}px` }} onPointerDown={onPoint} onPointerMove={(e) => e.buttons && onPoint(e)} role="img" aria-label="Win probability chart">
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
            {Array.from({ length: quarters }, (_, i) => (
              <rect key={i} class={`wp-q${i % 2 ? ' odd' : ''}`} x={x(i * 900)} y={0} width={x(Math.min(span, (i + 1) * 900)) - x(i * 900)} height={H} />
            ))}
            {Array.from({ length: quarters }, (_, i) => (
              <text key={`q${i}`} class="wp-qlabel" x={x(Math.min(span, i * 900 + 450))} y={H - 2} text-anchor="middle">
                {i < 4 ? `Q${i + 1}` : 'OT'}
              </text>
            ))}
            <line class="wp-mid" x1={0} x2={w} y1={y(0.5)} y2={y(0.5)} />
            <text class="wp-qlabel" x={w - 2} y={y(0.5) - 3} text-anchor="end">
              50%
            </text>
            {rail.map(({ m, px }) => (
              <line key={`g${m.key}`} class={`wp-guide${m.play.id === selected ? ' is-sel' : ''}`} x1={x(m.play.gameSec)} x2={px} y1={y(m.play.wpHome ?? 0.5)} y2={H} />
            ))}
            {d && <path class="wp-line" d={d} />}
            {rail.map(({ m }) =>
              m.play.wpHome != null ? (
                <circle key={`d${m.key}`} class="wp-dot" style={teamVars(m.teamId === g.home.id ? g.home : g.away)} cx={x(m.play.gameSec)} cy={y(m.play.wpHome)} r={m.kind === 'swing' ? 2.5 : 3.5} />
              ) : null,
            )}
            {last && <circle class="wp-now" cx={x(last.gameSec)} cy={y(last.wpHome!)} r={4} />}
            {last && !done && (
              // Who's winning right now, written at the end of the line, so the chart reads without the caption.
              <text
                class="wp-now-label"
                x={Math.min(x(last.gameSec) + 8, w - 4)}
                // Off the line: below it when the line runs high, above it when it runs low.
                y={y(last.wpHome!) < H / 2 ? Math.min(H - 6, y(last.wpHome!) + 18) : Math.max(14, y(last.wpHome!) - 8)}
                text-anchor={x(last.gameSec) + 70 > w ? 'end' : 'start'}
                style={teamVars(last.wpHome! >= 0.5 ? g.home : g.away)}
              >
                {last.wpHome! >= 0.5 ? `${g.home.abbr} ${wpText(last.wpHome!)}` : `${g.away.abbr} ${wpText(1 - last.wpHome!)}`}
              </text>
            )}
            {sel && <line class="wp-pick" x1={x(sel.gameSec)} x2={x(sel.gameSec)} y1={0} y2={H} />}
            <text class="wp-label home" x={4} y={14} style={teamVars(g.home)}>
              {g.home.abbr}
            </text>
            <text class="wp-label away" x={4} y={H - 6} style={teamVars(g.away)}>
              {g.away.abbr}
            </text>
          </svg>
        )}
      </div>
      {rail.length > 0 && (
        <div class="wp-rail" aria-label="Key plays">
          {rail.map(({ m, px }) => (
            <button
              key={m.key}
              class={`mk mk-${m.kind}${m.play.id === selected ? ' is-sel' : ''}`}
              style={{ left: `${px}px`, ...teamVars(m.teamId === g.home.id ? g.home : g.away) }}
              onClick={() => onSelect?.(m.play.id === selected ? null : m.play.id)}
              aria-label={`${m.label}, ${periodLabel(m.play.period)} ${m.play.clock}`}
              title={`${m.label} · ${periodLabel(m.play.period)} ${m.play.clock}`}
            >
              <span class="mk-shape" />
              {clipIds?.has(m.play.id) && m.kind !== 'clip' && <span class="mk-film" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
      {/* No legend: the filter chips under the chart wear the same shapes. */}
      <div class="wp-readout">
        {sel ? (
          <>
            <b>
              {periodLabel(sel.period)} {sel.clock}
            </b>{' '}
            {selWp != null && (selWp >= 0.5 ? `${g.home.abbr} ${wpText(selWp)}` : `${g.away.abbr} ${wpText(1 - selWp)}`)} · {sel.text}
          </>
        ) : done ? (
          <span class="wp-hint">Drag the chart, or tap a marker, to read any play.</span>
        ) : homeNow != null ? (
          <>
            Win probability now: <b>{homeNow >= 0.5 ? `${g.home.abbr} ${wpText(homeNow)}` : `${g.away.abbr} ${wpText(1 - homeNow)}`}</b>
            <span class="wp-hint"> · drag the chart, or tap a marker</span>
          </>
        ) : (
          'Win probability appears after kickoff.'
        )}
      </div>
    </div>
  );
}

