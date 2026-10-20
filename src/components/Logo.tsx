// A team logo that shows the team's abbreviation in its circle until the image arrives (or if it never does),
// so a slow phone connection never shows an empty ring.
import { useState } from 'preact/hooks';

export function Logo({ src, abbr, size }: { src: string; abbr: string; size: number }) {
  const [loaded, setLoaded] = useState(false);
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
