// One row per drive, every drive attacking rightward. Tap a row for its plays.
import { useState } from 'preact/hooks';
import type { Drive, Game, Play } from '../espn/model';
import { periodLabel } from '../espn/model';
import { teamVars } from '../format';
import { Epa, WpDelta } from './Badges';

export function Drives({ g, fresh }: { g: Game; fresh: Set<string> }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rows: preact.JSX.Element[] = [];
  let period = 0;
  for (const d of g.drives) {
    if (d.period !== period) {
      period = d.period;
      rows.push(
        <div class="qrule" key={`q${period}`}>
          {periodLabel(period)} · {g.away.abbr} {d.scoreBefore.away} – {g.home.abbr} {d.scoreBefore.home}
        </div>,
      );
    }
    const isOpen = open.has(d.id) || d.isLive;
    rows.push(<DriveRow key={d.id} g={g} d={d} open={isOpen} onToggle={() => toggle(d.id)} fresh={fresh} />);
  }

  if (!g.drives.length) return <p class="empty">Drives appear after kickoff.</p>;
  return <div class="drives">{rows}</div>;
}

function DriveRow({ g, d, open, onToggle, fresh }: { g: Game; d: Drive; open: boolean; onToggle: () => void; fresh: Set<string> }) {
  const t = d.teamId === g.home.id ? g.home : g.away;
  const lo = Math.max(0, Math.min(d.startPos, d.endPos));
  const hi = Math.min(100, Math.max(d.startPos, d.endPos));
  const back = d.endPos < d.startPos;
  const plays = d.plays.filter((p) => p.kind !== 'kick');
  return (
    <div class={`drive-wrap${open ? ' is-open' : ''}`}>
      <button class={`drive${open ? ' is-open' : ''}${d.isLive ? ' is-live' : ''}`} style={teamVars(t)} onClick={onToggle} aria-expanded={open}>
        <span class="drive-team">
          <b>{d.abbr}</b>
          <small>
            {periodLabel(d.period)} {d.startClock}
          </small>
        </span>
        <span class="drive-track">
          <span class={`drive-bar${back ? ' is-back' : ''}`} style={{ left: `${lo}%`, width: `${Math.max(0.8, hi - lo)}%` }} />
          <span class={`drive-cap cap-${d.cap}`} style={{ left: `${d.endPos}%` }} />
        </span>
        <span class="drive-res">
          {d.isLive ? 'NOW' : d.resultCode}
          <small class="drive-sub">
            {d.offensivePlays}p {d.yards}y {d.elapsed}
          </small>
        </span>
      </button>
      {open && (
        <div class="drive-plays">
          {plays.map((p) => (
            <PlayRow key={p.id} g={g} p={p} isNew={fresh.has(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PlayRow({ g, p, isNew }: { g: Game; p: Play; isNew?: boolean }) {
  const cls = ['play', p.scoring && 'is-score', p.turnover && 'is-turnover', p.penalty && 'is-penalty', isNew && 'is-new'].filter(Boolean).join(' ');
  return (
    <div class={cls}>
      <div class="play-dd">
        {p.ddText} <span class="play-clock">· {periodLabel(p.period)} {p.clock}</span>
      </div>
      <div class="play-text">{p.text}</div>
      <div class="play-badges">
        <WpDelta g={g} p={p} />
        <Epa v={p.epa} />
      </div>
    </div>
  );
}
