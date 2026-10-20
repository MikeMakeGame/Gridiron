// Keyboard shortcuts for the frequent actions, arrows and Esc only (no letter keys to collide with anything).
// Ignored while typing in a field or working a slider, which use the arrows themselves.
import { useEffect, useRef } from 'preact/hooks';

export function useKeys(map: Partial<Record<'ArrowLeft' | 'ArrowRight' | 'Escape', () => void>>): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
      const f = ref.current[e.key as keyof typeof map];
      if (!f) return;
      e.preventDefault();
      f();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// Esc also hides a hover explanation until the mouse moves again (WCAG 1.4.13: content on hover is dismissible).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.documentElement.classList.add('tips-off');
});
window.addEventListener('mousemove', () => document.documentElement.classList.remove('tips-off'), { passive: true });
