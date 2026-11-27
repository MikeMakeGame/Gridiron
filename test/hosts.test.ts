// The privacy promise: a URL from ESPN's JSON reaches an href or a src only on an ESPN host (src/espn/hosts.ts), for
// clips and logos alike.
import { describe, expect, it, vi } from 'vitest';
import { espnUrl } from '../src/espn/hosts';
import { teamInfo } from '../src/espn/model';
import { matchClips } from '../src/espn/clips';
import type { EspnCompetitor } from '../src/espn/types';

const competitor = (abbr: string, logo: string) =>
  ({ id: abbr, homeAway: 'home', team: { id: abbr, abbreviation: abbr, displayName: abbr, color: '1d4f91', alternateColor: 'ffffff', logo } }) as EspnCompetitor;

describe('ESPN hosts only', () => {
  it('lets https ESPN hosts through and nothing else', () => {
    expect(espnUrl('https://a.espncdn.com/i/teamlogos/nfl/500/sea.png')).toBe('https://a.espncdn.com/i/teamlogos/nfl/500/sea.png');
    expect(espnUrl('https://www.espn.com/video/clip?id=1')).not.toBeNull();
    expect(espnUrl('http://a.espncdn.com/x.png')).toBeNull(); // not https
    expect(espnUrl('https://espncdn.com.evil.example/x.png')).toBeNull();
    expect(espnUrl('https://tracker.example/espn.com.png')).toBeNull();
    expect(espnUrl('./logos/sea.png')).toBeNull();
    expect(espnUrl(undefined)).toBeNull();
  });

  it('drops a team logo on any other host, with one console line per team', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(teamInfo(competitor('AAA', 'https://a.espncdn.com/i/teamlogos/nfl/500/aaa.png')).logo).toBe('https://a.espncdn.com/i/teamlogos/nfl/500/aaa.png');
    expect(teamInfo(competitor('BBB', 'https://cdn.example/bbb.png')).logo).toBe('');
    expect(teamInfo(competitor('BBB', 'https://cdn.example/bbb.png')).logo).toBe('');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('logo for BBB'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('drops a clip link or thumbnail on any other host, with one console line per host', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const video = (href: string, thumbnail: string) => ({ id: 1, headline: 'A.Name 40-yard catch', links: { web: { href } }, thumbnail, tracking: { coverageType: 'Highlight' } });
    const out = matchClips([video('https://tracker.example/clip', ''), video('https://tracker.example/clip2', ''), video('https://www.espn.com/video/clip?id=2', 'https://img.example/t.jpg')], []);
    expect(out.game.map((c) => [c.href, c.thumb])).toEqual([['https://www.espn.com/video/clip?id=2', null]]);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('clip link'))).toHaveLength(1);
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('clip thumbnail'))).toHaveLength(1);
    warn.mockRestore();
  });
});
