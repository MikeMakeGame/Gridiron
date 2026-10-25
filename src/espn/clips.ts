// ESPN's highlight clips, pinned to the plays they show. ESPN doesn't link a clip to a play id, so each one-play clip
// is matched on the names and numbers in its headline against the play text, among the plays that happened before it
// was published (clips post 6-20 min after the snap; checked 8 of 8 on PIT-NO, 10-25).
import type { EspnVideo } from './types';
import type { Play } from './model';

export interface Clip {
  id: number;
  headline: string;
  seconds: number | null;
  thumb: string | null;
  href: string; // ESPN's own clip page
}

export interface GameClips {
  byPlay: Map<string, Clip>;
  /** Clips that aren't one play (a full-game highlight): the game's, not a play's. */
  game: Clip[];
}

const NOT_NAMES = new Set(['TD', 'FG', 'NFL', 'OT', 'The', 'A', 'An']);
const WINDOW_MS = 60 * 60_000;

// Only ESPN's own pages and image hosts reach a link or an image: the page talks to ESPN and nothing else.
const ESPN_HOST = /(^|\.)(espn\.com|espncdn\.com)$|^espnmedia-cdn\.akamaized\.net$/;

function espnUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && ESPN_HOST.test(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function toClip(v: EspnVideo): Clip | null {
  const href = espnUrl(v.links?.web?.href);
  if (!href || !v.headline) return null;
  return { id: v.id, headline: v.headline, seconds: v.duration ?? null, thumb: espnUrl(v.thumbnail), href };
}

// Capitalised words in the headline are the names ("Tyler Shough", "Barion Brown"); play text spells them "T.Shough".
function names(headline: string): string[] {
  return (headline.match(/\b[A-Z][A-Za-z'-]{2,}/g) ?? [])
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => !NOT_NAMES.has(w))
    .map((w) => w.toLowerCase());
}

function score(v: EspnVideo, p: Play): number {
  const h = v.headline;
  const text = p.text.toLowerCase();
  let s = 0;
  for (const n of names(h)) if (new RegExp(`(^|[\\s.(])${n.replace(/[^a-z'-]/g, '')}\\b`).test(text)) s += 2;
  for (const n of (h.match(/\b\d{1,2}\b/g) ?? []).map(Number)) if (Math.abs(p.yards) === n || text.includes(`${n} yard`)) s += 3;
  if (/\bTD\b|touchdown/i.test(h) && p.scoring) s += 2;
  if (/\bFG\b|field goal/i.test(h) && p.kind === 'fg') s += 3;
  if (/intercept|\bpick/i.test(h) && /intercept/i.test(text)) s += 3;
  if (/fumble/i.test(h) && /fumble/i.test(text)) s += 3;
  if (/sack/i.test(h) && /sacked/i.test(text)) s += 3;
  return s;
}

export function matchClips(videos: EspnVideo[] | undefined, plays: Play[]): GameClips {
  const byPlay = new Map<string, Clip>();
  const game: Clip[] = [];
  const candidates: { clip: Clip; play: Play; s: number }[] = [];
  for (const v of videos ?? []) {
    const clip = toClip(v);
    if (!clip) continue;
    if (v.tracking?.coverageType !== 'OnePlay') {
      game.push(clip);
      continue;
    }
    const pub = Date.parse(v.originalPublishDate ?? '');
    let best: { play: Play; s: number; timed: boolean } | null = null;
    for (const p of plays) {
      const at = Date.parse(p.wallclock ?? '');
      const timed = Number.isFinite(pub) && Number.isFinite(at);
      if (timed && (at > pub || pub - at > WINDOW_MS)) continue;
      // Among equal matches, the play nearest the publish time wins.
      const s = score(v, p) - (timed ? (pub - at) / WINDOW_MS : 0);
      if (!best || s > best.s) best = { play: p, s, timed };
    }
    // A name plus a number, or a name plus the kind of play: anything less is a guess. Without times to rule plays
    // out, it takes more: two names and a number.
    if (best && best.s >= (best.timed ? 4 : 6)) candidates.push({ clip, play: best.play, s: best.s });
  }
  // One clip per play: the surest match keeps it.
  candidates.sort((a, b) => b.s - a.s);
  for (const c of candidates) if (!byPlay.has(c.play.id)) byPlay.set(c.play.id, c.clip);
  return { byPlay, game };
}
