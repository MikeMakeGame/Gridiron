// The story as a list: each event with its time, what it was, the score after it, a line more (who was hurt, the
// penalty, how the punt ended), and ESPN's highlight clip when there is one (a thumbnail that opens ESPN's own
// player). Quarter dividers between them. Above the list, the filter chips; the chart and the chips stay pinned
// while the list scrolls under them.
import { useEffect, useRef } from 'preact/hooks';
import type { Game } from '../espn/model';
import { periodLabel } from '../espn/model';
import type { Clip } from '../espn/clips';
import { GROUP_LABEL, GROUP_SHAPE, GROUPS, type MomentGroup, type StoryRow } from '../stats/moments';
import { fillClass, teamVars } from '../format';
import { WpDelta } from './Badges';

export function KeyPlays({
  g,
  rows,
  total,
  clips,
  selected,
  onSelect,
}: {
  g: Game;
  rows: StoryRow[];
  /** Events before filtering, to tell "nothing yet" from "nothing with these filters". */
  total: number;
  clips: Map<string, Clip>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  // A marker tapped on the chart brings its row into view between the pinned chart and the dock, moving the page
  // only as far as it must (a row already in view stays put), so the chart never leaves the screen.
  useEffect(() => {
    if (!selected || !list.current) return;
    const row = list.current.querySelector<HTMLElement>(`[data-play="${CSS.escape(selected)}"]`);
    // No row for it: the play was picked by dragging along the chart, or a chip has since hidden its event. Nothing
    // to scroll to, and nothing wrong, so no log.
    if (!row) return;
    const pin = list.current.closest('.story')?.querySelector('.story-pin');
    const top = (pin?.getBoundingClientRect().bottom ?? 0) + 8;
    const bottom = (document.querySelector('.dock')?.getBoundingClientRect().top ?? window.innerHeight) - 8;
    const r = row.getBoundingClientRect();
    const by = r.top < top ? r.top - top : r.bottom > bottom ? Math.min(r.bottom - bottom, r.top - top) : 0;
    if (by) window.scrollBy({ top: by, behavior: 'smooth' });
  }, [selected]);

  if (!total) return <p class="empty">No scores, turnovers or big swings yet.</p>;
  if (!rows.some((r) => r.type === 'event')) return <p class="empty">Nothing with these filters. Switch a chip on above.</p>;
  return (
    <ol class="keyplays" ref={list}>
      {rows.map((r) => {
        if (r.type === 'divider') {
          return (
            <li key={r.d.key} class={`kp-rule${r.d.minor ? ' is-minor' : ''}`}>
              <span>{r.d.label}</span>
              {r.d.score && <span class="kp-rule-score">{r.d.score}</span>}
            </li>
          );
        }
        const m = r.m;
        const t = m.teamId === g.home.id ? g.home : g.away;
        const clip = m.primary ? clips.get(m.play.id) : undefined;
        const on = m.play.id === selected;
        const toggle = () => onSelect(on ? null : m.play.id);
        return (
          <li key={m.key} data-play={m.play.id} class={`kp kp-${m.kind}${on ? ' is-sel' : ''}`} style={teamVars(t)} onClick={toggle}>
            <span class={`mk mk-${m.kind} is-static`} aria-hidden="true">
              <span class="mk-shape" />
            </span>
            {/* The row's text is its button for a keyboard or a screen reader (the clip link beside it stays its own
                control); a pointer can tap anywhere on the row. */}
            <div
              class="kp-main"
              role="button"
              tabIndex={0}
              aria-pressed={on}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                toggle();
              }}
            >
              <div class="kp-head">
                {/* The team as a chip, so "NO" reads as New Orleans and never as "no highlight". */}
                <span class={`kp-team${fillClass(t)}`}>{t.abbr}</span>
                <b class="kp-kind">{m.label}</b>
                <span class="kp-when">
                  {periodLabel(m.play.period)} {m.play.clock}
                </span>
                {m.score && <span class="kp-score">{m.score}</span>}
              </div>
              {m.detail && <div class="kp-detail">{m.detail}</div>}
              {/* An injury or a flag riding on a play repeats none of it: its line says what it needs. */}
              {m.primary && <div class="kp-text">{m.play.text}</div>}
              {/* A swing under 3 points is noise next to a score; the badge shows only when it says something. */}
              {m.primary && (
                <div class="kp-badges">
                  <WpDelta g={g} p={m.play} min={0.03} />
                </div>
              )}
            </div>
            {clip && <ClipThumb clip={clip} />}
          </li>
        );
      })}
    </ol>
  );
}

/** One chip per kind of event, with its marker shape and how many this game has; a chip with none is left out. */
export function StoryFilters({ on, counts, onToggle }: { on: ReadonlySet<MomentGroup>; counts: Record<MomentGroup, number>; onToggle: (g: MomentGroup) => void }) {
  const shown = GROUPS.filter((k) => counts[k] > 0);
  if (!shown.length) return null;
  return (
    <div class="chips" role="group" aria-label="Show in the story">
      {shown.map((k) => (
        <button key={k} type="button" class={`chip chip-${k}${on.has(k) ? ' is-on' : ''}`} aria-pressed={on.has(k)} onClick={() => onToggle(k)}>
          <span class={`mk mk-${GROUP_SHAPE[k]} is-static`} aria-hidden="true">
            <span class="mk-shape" />
          </span>
          {GROUP_LABEL[k]}
          <span class="chip-n">{counts[k]}</span>
        </button>
      ))}
    </div>
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
