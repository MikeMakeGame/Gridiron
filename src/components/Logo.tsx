// A team logo that shows the team's abbreviation in its circle until the image arrives (or if it never does),
// so a slow phone connection never shows an empty ring.
// On a team fill it asks for the logo set that reads on that fill (`on`, from ../espn/colors); with no fill, the
// set that reads on the page: the light-background set in the day look, the dark one otherwise. The offline
// snapshot bundles only the dark set (format.ts smallLogo), so there `on` and the look change nothing.
import { useState } from 'preact/hooks';
import { useTheme } from '../theme';
import type { LogoSet } from '../espn/colors';

export function Logo({ src: dark, abbr, size, on }: { src: string; abbr: string; size: number; on?: LogoSet }) {
  const [loaded, setLoaded] = useState(false);
  const theme = useTheme();
  const set: LogoSet = on ?? (theme === 'day' ? 'light' : 'dark');
  const src = set === 'light' ? dark.replace('/teamlogos/nfl/500-dark/', '/teamlogos/nfl/500/') : dark;
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
