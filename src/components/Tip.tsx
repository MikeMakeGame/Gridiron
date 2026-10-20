// Stat names that explain themselves. A dotted underline marks a name that has an explanation: tap it and one
// sentence opens under its row (one at a time per block); with a mouse, hovering shows the same sentence.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { GLOSSARY } from '../glossary';

export function useTips(): [string | null, (term: string) => void] {
  const [open, setOpen] = useState<string | null>(null);
  return [open, (term) => setOpen((o) => (o === term ? null : term))];
}

export function tipText(term: string, extra?: string): string {
  return [GLOSSARY[term], extra].filter(Boolean).join(' ');
}

export function Term({ term, open, onToggle, extra, children }: { term: string; open: boolean; onToggle: () => void; extra?: string; children?: ComponentChildren }) {
  if (!GLOSSARY[term]) return <>{children ?? term}</>;
  return (
    <button class="tip" type="button" aria-expanded={open} data-tip={tipText(term, extra)} onClick={onToggle}>
      {children ?? term}
    </button>
  );
}

export function TipNote({ term, extra, class: cls = '' }: { term: string | null; extra?: string; class?: string }) {
  if (!term || !GLOSSARY[term]) return null;
  return (
    <p class={`tip-note ${cls}`} role="note">
      {tipText(term, extra)}
    </p>
  );
}
