// Turns dist-snapshot/index.html into the shape a Claude artifact publishes: page content only
// (the host wraps it in its own <html>/<head>/<body>), title first, the side-gutter promise beside it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'dist-snapshot');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
const keep = (re: RegExp) => [...head.matchAll(re)].map((m) => m[0].trim());

const out = [
  '<title>Gridiron</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...keep(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g),
  ...keep(/<script type="module"[^>]*><\/script>/g),
  body.trim(),
].join('\n');
writeFileSync(join(dir, 'artifact.html'), out + '\n');
console.log(out);
