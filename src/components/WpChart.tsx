// Whole-game win probability. Home on top. Drag or tap to read any play.
import { useState } from 'preact/hooks';
import type { Game } from '../espn/model';
import { periodLabel } from '../espn/model';
import { useWidth } from '../hooks/usePoll';
import { teamVars, wpText } from '../format';

const H = 96;

export function WpChart({ g }: { g: Game }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [pick, setPick] = useState<number | null>(null);
  const pts = g.plays.filter((p) => p.wpHome != null);
  const span = g.regulationSec;
  const x = (s: number) => (s / span) * w;
  const y = (wp: number) => 4 + (1 - wp) * (H - 8);

  const d = pts.length && w ? `M${x(0).toFixed(1)},${y(pts[0].wpHome!).toFixed(1)} ` + pts.map((p) => `L${x(p.gameSec).toFixed(1)},${y(p.wpHome!).toFixed(1)}`).join(' ') : '';
  const last = pts[pts.length - 1];
  const quarters = Math.ceil(span / 900);

  const onPoint = (ev: PointerEvent) => {
    if (!pts.length || !w) return;
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const s = ((ev.clientX - r.left) / r.width) * span;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].gameSec - s) < Math.abs(pts[best].gameSec - s)) best = i;
    setPick(best);
  };

  const sel = pick != null ? pts[pick] : null;
  const homeNow = last?.wpHome ?? null;
  const done = g.state === 'post';

  return (
    <div class="wpchart-wrap">
      <div class="wpchart" ref={ref} onPointerDown={onPoint} onPointerMove={(e) => e.buttons && onPoint(e)} role="img" aria-label="Win probability chart">
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
            {d && <path class="wp-line" d={d} />}
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
      <div class="wp-readout">
        {sel ? (
          <>
            <b>
              {periodLabel(sel.period)} {sel.clock}
            </b>{' '}
            {sel.wpHome! >= 0.5 ? `${g.home.abbr} ${wpText(sel.wpHome!)}` : `${g.away.abbr} ${wpText(1 - sel.wpHome!)}`} · {sel.text}
          </>
        ) : done ? (
          <span class="wp-hint">Drag the chart to read win probability at any play.</span>
        ) : homeNow != null ? (
          <>
            Win probability now: <b>{homeNow >= 0.5 ? `${g.home.abbr} ${wpText(homeNow)}` : `${g.away.abbr} ${wpText(1 - homeNow)}`}</b>
            <span class="wp-hint"> · drag the chart to read any play</span>
          </>
        ) : (
          'Win probability appears after kickoff.'
        )}
      </div>
    </div>
  );
}
