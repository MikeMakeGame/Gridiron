// A team logo that shows the team's abbreviation in its circle until the image arrives (or if it never does),
// so a slow phone connection never shows an empty ring.
// In the day look it asks ESPN for the light-background logo set instead of the dark one.
import { useState } from 'preact/hooks';
import { useTheme } from '../theme';

export function Logo({ src: dark, abbr, size }: { src: string; abbr: string; size: number }) {
  const [loaded, setLoaded] = useState(false);
  const src = useTheme() === 'day' ? dark.replace('/teamlogos/nfl/500-dark/', '/teamlogos/nfl/500/') : dark;
  return (
    <>
      {!loaded && (
        <span class="logo logo-ph" aria-hidden="true">
          {abbr}
        </span>
      )}
      <img
        class={`logo${loaded ? '' : ' logo-loading'}`}
        src={src}
        alt=""
        width={size}
        height={size}
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
