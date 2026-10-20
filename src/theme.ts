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

export function setTheme(t: Theme): void {
  current = t;
  document.documentElement.dataset.theme = t;
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
