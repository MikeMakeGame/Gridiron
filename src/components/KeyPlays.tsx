// The timeline's markers as a list: each play that mattered, with its time, what it was, the score after it, and
// ESPN's highlight clip when there is one (a thumbnail that opens ESPN's own player).
import { useEffect, useRef } from 'preact/hooks';
import type { Game } from '../espn/model';
import { periodLabel } from '../espn/model';
import type { Clip } from '../espn/clips';
import { momentLabel, type Moment } from '../stats/moments';
import { teamVars } from '../format';
import { WpDelta } from './Badges';

export function KeyPlays({
  g,
  marks,
  clips,
  selected,
  onSelect,
}: {
  g: Game;
  marks: Moment[];
  clips: Map<string, Clip>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  // A marker tapped on the chart brings its row into view.
  useEffect(() => {
    if (!selected) return;
    list.current?.querySelector(`[data-play="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  if (!marks.length) return <p class="empty">No scores, turnovers or big swings yet.</p>;
  // Newest first while it's live (the thing that just happened is on top); in order once it's over.
  const ordered = g.state === 'post' ? marks : [...marks].reverse();
  return (
    <ol class="keyplays" ref={list}>
      {ordered.map((m) => {
        const t = m.teamId === g.home.id ? g.home : g.away;
        const clip = clips.get(m.play.id);
        return (
          <li
            key={m.play.id}
            data-play={m.play.id}
            class={`kp kp-${m.kind}${m.play.id === selected ? ' is-sel' : ''}`}
            style={teamVars(t)}
            onClick={() => onSelect(m.play.id === selected ? null : m.play.id)}
          >
            <span class={`mk mk-${m.kind} is-static`} aria-hidden="true">
              <span class="mk-shape" />
            </span>
            <div class="kp-main">
              <div class="kp-head">
                {/* The team as a chip, so "NO" reads as New Orleans and never as "no highlight". */}
                <span class="kp-team">{t.abbr}</span>
                <b class="kp-kind">{momentLabel(m)}</b>
                <span class="kp-when">
                  {periodLabel(m.play.period)} {m.play.clock}
                </span>
                {m.score && <span class="kp-score">{m.score}</span>}
              </div>
              <div class="kp-text">{m.play.text}</div>
              {/* A swing under 3 points is noise next to a score; the badge shows only when it says something. */}
              <div class="kp-badges">
                <WpDelta g={g} p={m.play} min={0.03} />
              </div>
            </div>
            {clip && <ClipThumb clip={clip} />}
          </li>
        );
      })}
    </ol>
  );
}

export function ClipThumb({ clip }: { clip: Clip }) {
  return (
    <a
      class="clip"
      href={clip.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${clip.headline} (opens ESPN)`}
      onClick={(e) => e.stopPropagation()}
    >
      {clip.thumb ? <img src={clip.thumb} alt="" loading="lazy" width={96} height={54} /> : <span class="clip-blank" />}
      <span class="clip-play" aria-hidden="true" />
      {clip.seconds != null && <span class="clip-len">{fmtLen(clip.seconds)}</span>}
      <span class="sr">Watch on ESPN: {clip.headline}</span>
    </a>
  );
}

function fmtLen(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}
