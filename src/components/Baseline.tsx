// The league-average switch: This season | Last 3 seasons, with one tap-to-explain line on what the average is and
// why there's no all-time one. Hidden when data/baselines.json isn't there (no markers then either).
import { useState } from 'preact/hooks';
import { BASELINE_IDS, baselinesProblem, MIN_SEASON_WEEKS, type BaselineId, type Baselines, type BaselineScope } from '../stats/baselines';
import { GLOSSARY } from '../glossary';

const TERM = 'League average';

export function BaselineSwitch({
  base,
  id,
  onPick,
  scope = 'team',
}: {
  base: Baselines | null;
  id: BaselineId;
  onPick: (id: BaselineId) => void;
  scope?: BaselineScope;
}) {
  const [open, setOpen] = useState(false);
  if (!base) return null;
  // getBaselines refuses a partial file; this guards a caller handing over one it built itself.
  const problem = baselinesProblem(base);
  if (problem) {
    console.warn(`Gridiron: the average switch can't read these averages (${problem}); hiding it`);
    return null;
  }
  const s = base.windows.season;
  const l3 = base.windows.last3;
  const tip = [
    GLOSSARY[TERM],
    `This season: ${s.weeks} week${s.weeks === 1 ? '' : 's'} so far. Last 3 seasons: ${l3.seasons[0]}-${l3.seasons[l3.seasons.length - 1]}. Until ${MIN_SEASON_WEEKS} weeks of this season are in, the last 3 seasons are the default.`,
    scope !== 'team' && base.qualifiers[scope] ? `Players: ${base.qualifiers[scope]}.` : '',
    ...Object.values(base.windows[id].excluded ?? {}),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div class="base-switch">
      <button class="tip base-k" type="button" aria-expanded={open} data-tip={tip} onClick={() => setOpen(!open)}>
        vs league avg
      </button>
      <span class="base-opts" role="group" aria-label="Compare with the league average of">
        {BASELINE_IDS.map((b) => (
          <button
            key={b}
            type="button"
            class={`base-opt${b === id ? ' is-on' : ''}`}
            aria-pressed={b === id}
            disabled={!(base.windows[b]?.games > 0)}
            onClick={() => onPick(b)}
          >
            {base.windows[b].label}
          </button>
        ))}
      </span>
      {open && (
        <p class="tip-note base-tip" role="note">
          {tip}
        </p>
      )}
    </div>
  );
}
