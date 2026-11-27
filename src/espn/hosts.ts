// The privacy promise in one place: only ESPN's own pages and image hosts reach a link or an image on the page, so the
// page talks to this site and to ESPN and nothing else (README, "Privacy"). Every URL that comes out of ESPN's JSON
// and lands in an href or a src passes `espnUrl`: clip links and thumbnails (./clips) and team logos (./model).

const ESPN_HOST = /(^|\.)(espn\.com|espncdn\.com)$|^espnmedia-cdn\.akamaized\.net$/;

const warned = new Set<string>();

/** As `espnUrl`, and a URL that was there but is dropped (another host, not https) logs once per kind and host, so a
 *  vanished logo or clip says why. `what` names it in the log ("the logo for SEA", "a clip link"). */
export function espnUrlOrWarn(u: string | undefined, what: string, kind: string): string | null {
  const ok = espnUrl(u);
  if (u && !ok) {
    let host = u;
    try {
      host = new URL(u).host;
    } catch {
      // Not a URL at all: the whole string stands in for the host.
    }
    const k = `${kind}:${host}`;
    if (!warned.has(k)) {
      warned.add(k);
      console.warn(`Gridiron: ESPN sent ${what} on a host other than ESPN's (${u}); it is left out`);
    }
  }
  return ok;
}

/** The URL when it is https on an ESPN host, else null. */
export function espnUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && ESPN_HOST.test(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}
