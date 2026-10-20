// Turns dist-snapshot/index.html into page content only, for an embedding host that wraps pages in its own
// <html>/<head>/<body>: title first, then the host's side-gutter hint, stylesheets, the script and the mount point.
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
