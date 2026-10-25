// The little football field: both end zones in team colours (away on the left, home on the right, as the scorebar
// reads), the line of scrimmage, the line to gain, the drive so far and the last snap's path.
// ESPN's yard lines count from the home goal line; here x counts from the away goal line (0) to the home one (100).
import type { Game, Play } from '../espn/model';
import { useWidth } from '../hooks/usePoll';
import { teamVars } from '../format';

export interface Spot {
  offenseId: string;
  ytg: number; // yards to the end zone for the offense
  down: number;
  distance: number;
}

const H = 96;

/** Where the offense's yards-to-go put the ball, from the away goal line. */
export function spotX(g: Game, offenseId: string, ytg: number): number {
  return offenseId === g.away.id ? 100 - ytg : ytg;
}

export function Field({ g, spot, note }: { g: Game; spot: Spot | null; note?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const ez = Math.round(w / 12);
  const fx = (x: number) => ez + (Math.max(0, Math.min(100, x)) / 100) * (w - 2 * ez);
  const off = spot ? (spot.offenseId === g.home.id ? g.home : g.away) : null;
  const toRight = spot?.offenseId === g.away.id; // away attacks the home end zone, on the right
  const los = spot ? spotX(g, spot.offenseId, spot.ytg) : null;
  const goalToGo = spot ? spot.distance >= spot.ytg : false;
  const gain = spot && spot.down > 0 && !goalToGo ? spotX(g, spot.offenseId, spot.ytg - spot.distance) : null;
  const drive = g.drives.find((d) => d.isLive && d.teamId === spot?.offenseId) ?? null;
  const driveStart = drive ? (toRight ? drive.startPos : 100 - drive.startPos) : null;
  const last = drive && los != null ? lastSnap(drive.plays, g, los) : null;

  return (
    <div class="field" ref={ref} role="img" aria-label={spot && off ? `${off.abbr} ball, ${yardWords(g, spot)}` : note ?? 'Field'}>
      {w > 0 && (
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
          <rect class="fld-turf" x={ez} y={0} width={w - 2 * ez} height={H} />
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={`s${i}`} class={`fld-stripe${i % 2 ? ' odd' : ''}`} x={fx(i * 10)} y={0} width={fx((i + 1) * 10) - fx(i * 10)} height={H} />
          ))}
          {spot && (
            // The red zone the offense is driving at.
            <rect class="fld-redzone" x={toRight ? fx(80) : fx(0)} y={0} width={fx(20) - fx(0)} height={H} />
          )}
          {Array.from({ length: 19 }, (_, i) => (
            // The lines stop above the yard numbers, so no number is struck through.
            <line key={`l${i}`} class={`fld-yd${i % 2 ? '' : ' ten'}`} x1={fx((i + 1) * 5)} x2={fx((i + 1) * 5)} y1={0} y2={H - 19} />
          ))}
          <EndZone g={g} side="away" x={0} w={ez} />
          <EndZone g={g} side="home" x={w - ez} w={ez} />

          {driveStart != null && los != null && off && (
            <g style={teamVars(off)} class="fld-team">
              <rect class="fld-drive" x={fx(Math.min(driveStart, los))} y={H / 2 - 3} width={Math.max(2, Math.abs(fx(los) - fx(driveStart)))} height={6} />
              <circle class="fld-start" cx={fx(driveStart)} cy={H / 2} r={3.5} />
            </g>
          )}
          {last && <path class={`fld-path${last.pass ? ' is-pass' : ''}`} d={last.d(fx, H)} />}
          {gain != null && <line class="fld-gain" x1={fx(gain)} x2={fx(gain)} y1={0} y2={H} />}
          {los != null && <line class="fld-los" x1={fx(los)} x2={fx(los)} y1={0} y2={H} />}
          {/* Over the lines, each with a turf-coloured knockout, so the scrimmage and gain lines never strike a number. */}
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((x) => (
            <text key={`n${x}`} class="fld-num" x={fx(x)} y={H - 6} text-anchor="middle">
              {x <= 50 ? x : 100 - x}
            </text>
          ))}
          {los != null && off && (
            <g transform={`translate(${fx(los)} ${H / 2})`}>
              <ellipse class="fld-ball" rx={7} ry={4.4} transform="rotate(-20)" />
              <line class="fld-lace" x1={-2.6} x2={2.6} y1={0} y2={0} transform="rotate(-20)" />
            </g>
          )}
          {los != null && off && (
            <g style={teamVars(off)} class="fld-team">
              <OffenseTag x={fx(los)} w={w} abbr={off.abbr} toRight={toRight} />
            </g>
          )}
          {!spot && note && (
            <text class="fld-note" x={w / 2} y={H / 2 + 5} text-anchor="middle">
              {note}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

function EndZone({ g, side, x, w }: { g: Game; side: 'home' | 'away'; x: number; w: number }) {
  const t = side === 'home' ? g.home : g.away;
  const cx = x + w / 2;
  return (
    <g class="fld-ez" style={teamVars(t)}>
      <rect x={x} y={0} width={w} height={H} />
      <text x={cx} y={H / 2} text-anchor="middle" dominant-baseline="central" transform={`rotate(${side === 'away' ? -90 : 90} ${cx} ${H / 2})`}>
        {t.abbr}
      </text>
    </g>
  );
}

// "NYG ▸" above the ball: who has it and which way they're going. Kept inside the field near the end zones.
function OffenseTag({ x, w, abbr, toRight }: { x: number; w: number; abbr: string; toRight: boolean }) {
  const tw = 14 + abbr.length * 8;
  const left = Math.max(2, Math.min(w - tw - 2, x - tw / 2));
  return (
    <g transform={`translate(${left} 4)`}>
      <rect class="fld-tag" width={tw} height={17} rx={2} />
      <text class="fld-tag-text" x={tw / 2} y={12.5} text-anchor="middle">
        {toRight ? `${abbr} ›` : `‹ ${abbr}`}
      </text>
    </g>
  );
}

// The drive's last real snap, drawn only when it ends where the ball is now (otherwise the feed has moved on past it).
function lastSnap(plays: Play[], g: Game, los: number) {
  const p = [...plays].reverse().find((x) => (x.kind === 'pass' || x.kind === 'rush') && !x.noPlay && x.down > 0);
  if (!p) return null;
  const from = spotX(g, p.offenseId, p.ytg);
  const to = spotX(g, p.endTeamId, p.endYtg);
  if (Math.abs(to - los) > 1.5 || Math.abs(to - from) < 1) return null;
  const pass = p.kind === 'pass' && !/sacked|scrambles/i.test(p.text);
  return {
    pass,
    d: (fx: (x: number) => number, h: number) => {
      const a = fx(from);
      const b = fx(to);
      const y = h / 2;
      // A throw arcs; a run stays on the ground.
      return pass ? `M${a},${y} Q${(a + b) / 2},${y - h * 0.62} ${b},${y}` : `M${a},${y} L${b},${y}`;
    },
  };
}

function yardWords(g: Game, s: Spot): string {
  const x = spotX(g, s.offenseId, s.ytg);
  const side = x < 50 ? g.away.abbr : g.home.abbr;
  const yl = Math.round(x < 50 ? x : 100 - x);
  return yl === 50 ? 'at midfield' : `at the ${side} ${yl}`;
}
