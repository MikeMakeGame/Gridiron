// Two looks: "night" (the default, true black) and "day" (high contrast for a phone in sunlight).
// The choice is remembered on this device; with nothing remembered, a light system setting picks day.
import { useEffect, useState } from 'preact/hooks';

export type Theme = 'night' | 'day';
const KEY = 'gridiron:theme';
const listeners = new Set<() => void>();

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'day' || v === 'night' ? v : null;
  } catch {
    return null;
  }
}

function initial(): Theme {
  const s = stored();
  if (s) return s;
  try {
    return matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
  } catch {
    return 'night';
  }
}

let current: Theme = initial();
document.documentElement.dataset.theme = current;
applyChrome(current);

// The browser's own chrome follows the look: `color-scheme` (form controls, scrollbars, the page before the styles
// load) and `theme-color` (the phone's status and address bars), which index.html starts as night's. The colour is
// the look's own page colour, read from styles.css (`--bg`) once it applies, so it lives in one place.
function applyChrome(t: Theme): void {
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', t === 'day' ? 'light' : 'dark');
  // A task, not an animation frame: a tab opened in the background runs no frames until it's shown.
  setTimeout(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!bg || !meta) {
      console.warn(`Gridiron: the ${t} look's browser colour wasn't set (${!bg ? 'no --bg in styles.css yet' : 'no theme-color meta tag'})`);
      return;
    }
    meta.setAttribute('content', bg);
  }, 0);
}

export function setTheme(t: Theme): void {
  current = t;
  document.documentElement.dataset.theme = t;
  applyChrome(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // Not remembered; the switch still works for this visit.
  }
  listeners.forEach((f) => f());
}

export function useTheme(): Theme {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return current;
}
