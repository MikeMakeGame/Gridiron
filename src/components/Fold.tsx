// A section that stays closed until asked: its summary row carries the label and a one-line headline, so the page
// reads as a list of answers and each one opens to its detail. Open/closed is remembered per section on this device.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

const key = (id: string) => `gridiron:open:${id}`;

function remembered(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) === '1';
  } catch {
    return false;
  }
}

export function Fold({ id, label, headline, children }: { id: string; label: string; headline?: ComponentChildren; children: ComponentChildren }) {
  const [open, setOpen] = useState(() => remembered(id));
  return (
    <details
      class="sec"
      id={id}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        if (now === open) return;
        setOpen(now);
        try {
          localStorage.setItem(key(id), now ? '1' : '0');
        } catch {
          // Not remembered; it still opens.
        }
      }}
    >
      <summary class="sec-sum">
        <span class="sec-label">{label}</span>
        {headline != null && <span class="sec-head">{headline}</span>}
        <span class="chev" aria-hidden="true" />
      </summary>
      {/* Rendered only when open: charts measure their width, and closed sections cost nothing. */}
      {open && <div class="sec-body">{children}</div>}
    </details>
  );
}
