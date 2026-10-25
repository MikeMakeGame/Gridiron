// The app's glyphs: inline SVG in currentColor, so they take the text colour and look the same on every phone
// (emoji differ by OS). Each draws on a 16 x 16 grid.
import type { JSX } from 'preact';

export type IconName = 'clock' | 'ball' | 'turnover' | 'flag' | 'goalpost' | 'play' | 'bolt' | 'sack' | 'zone' | 'stop';

const PATHS: Record<IconName, JSX.Element> = {
  clock: (
    <>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </>
  ),
  // A football seen from the side, laces up.
  ball: (
    <>
      <path d="M2.2 8C3.6 4.6 6 3.2 8 3.2s4.4 1.4 5.8 4.8C12.4 11.4 10 12.8 8 12.8S3.6 11.4 2.2 8Z" fill="currentColor" />
      <path d="M6 8h4M6.8 7v2M8 7v2M9.2 7v2" stroke="var(--icon-cut, #000)" stroke-width=".9" stroke-linecap="round" opacity=".7" />
    </>
  ),
  // Two arrows trading places: the ball changed hands.
  turnover: (
    <path
      d="M3 5.5h8.5M9 3l2.5 2.5L9 8M13 10.5H4.5M7 8l-2.5 2.5L7 13"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  ),
  flag: (
    <>
      <path d="M4 14V2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M4.6 3h7.4l-1.8 2.75L12 8.5H4.6Z" fill="currentColor" />
    </>
  ),
  goalpost: (
    <path d="M8 14V8.5M3.5 8.5h9M3.5 8.5V2.5M12.5 8.5V2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  ),
  play: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M6.4 5.1v5.8L11 8Z" fill="var(--icon-cut, #000)" />
    </>
  ),
  bolt: <path d="M9.2 1.8 4 9h3.4l-.9 5.2L12 7H8.5Z" fill="currentColor" />,
  sack: (
    <>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M5 8h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </>
  ),
  zone: (
    <>
      <rect x="2.25" y="3.25" width="11.5" height="9.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <rect x="9" y="3.25" width="4.75" height="9.5" fill="currentColor" />
    </>
  ),
  stop: (
    <>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M3.6 12.4 12.4 3.6" stroke="currentColor" stroke-width="1.5" />
    </>
  ),
};

export function Icon({ name, size = 16, class: cls, label }: { name: IconName; size?: number; class?: string; label?: string }) {
  return (
    <svg
      class={`icon icon-${name}${cls ? ` ${cls}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {PATHS[name]}
    </svg>
  );
}
