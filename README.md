# Gridiron

A phone-first live NFL viewer with no ads and no betting lines. Each game opens on the field (where the ball is, the line to gain, the drive so far and the last snap), with the game's story, a head-to-head of the team stats and the box score one tab away.

Live at https://mikemakegame.github.io/Gridiron/ (GitHub Pages; add it to your phone's home screen).

A personal, non-commercial project. Not affiliated with ESPN, the NFL or any team.

## What it shows

- **Scoreboard**: every game of the week as tiles, live ones first, with down & distance and a win-probability bar along each live tile's bottom edge; two columns on a wide screen. ESPN is polled only while a game is live (every 15 s; 30 s at halftime). Before kickoff, after the final, or in a week with nothing on, the page fetches once and then only when you tap the freshness pill. The arrows step through the regular season and on into the playoffs, using ESPN's own calendar; a browsed week stays in the link (`#/w/2026-3-1` is the Wild Card round) and survives opening a game.
- **Game page**: a sticky score bar (timeouts as dots, turnovers with an icon) over four tabs; the open tab is in the link (`#/g/<id>/stats`)
  - **Live** (Preview before kickoff, Final after): the situation, a little football field (end zones in team colours, line of scrimmage in blue, line to gain in yellow, the red zone the offense is driving at, the drive so far, the last snap's path), the last play (on a final, the play of the game) with its win-probability swing, and three stats at a glance
  - **Story**: the whole-game win-probability chart with a rail of markers under it (touchdowns, field goals, turnovers, big swings, and any play with a highlight clip), the same plays as a list, then the drives. A live game opens on Live; a final opens here
  - **Stats**: who's winning more of the numbers, then ESPN's team stats head to head (each with a bar from the middle out; the better side keeps its colour), then the numbers that say how each team is actually playing (success rate, EPA/play est., explosive plays and more); after the game, nflverse's model numbers
  - **Players**: the box score (passing, rushing, receiving; defense, kicking, returns behind one tap)
  - **Highlight clips**: ESPN posts one-play clips for some games, 6-20 minutes after the snap, without saying which play they show. Gridiron pins each to its play by the names and yardage in the headline and the time it was posted (`src/espn/clips.ts`); a pinned clip shows as a thumbnail that opens ESPN's own player. Many games get none during the game.
  - every stat name explains itself: tap it (or hover with a mouse) for one sentence
  - a bottom dock where the thumb is: back to the week, and the game's one action (the freshness pill live or before kickoff: green under 30 s, amber past 45 s, red past 2 min, tap to refetch; Replay on a final)
  - finished games can be replayed play by play "as if live", from the dock
- **Looks**: Night (dark, the default) and Day (high contrast for sunlight), from the top bar or the "Look, data and credits" row; your system's light/dark setting picks one until you choose. Every team colour clears 4.5:1 contrast in both (`python scripts/team_contrast.py .cache/espn`).
- **Keys**, where there's a keyboard: ← → change week, Esc back to the games, ← → step a replay.

## Live EPA, estimated, and how good the estimate is

nflverse's EPA arrives the morning after. During the game this page estimates it: `scripts/nflverse_build.py` bakes an expected-points table (down x distance x yard line, from nflfastR's own EP over 2022-2025), and each snap's EPA is EP after minus EP before (TD = 7, safety = -2, a change of possession flips the sign). It counts the snaps nflverse counts: passes and runs, including ones a flag wiped out, but not kneel-downs or spikes.

`scripts/calibrate.ts` runs the page's own code over ESPN's play-by-play for every finished game of the season, stops at the end of Q1, Q2, Q3 and the final, and compares each team's EPA/play so far with nflverse's for the same quarters. The EP table is built from 2022-2025 only, so 2026 games are unseen. On 2026 weeks 1-6 (92 games, 184 team-games):

| Checked at | Mean miss | 90% within | Guess-the-average baseline |
|---|---|---|---|
| End of Q1 | 0.048 | 0.110 | 0.313 |
| Halftime | 0.037 | 0.072 | 0.194 |
| End of Q3 | 0.033 | 0.067 | 0.173 |
| Final | 0.033 | 0.073 | 0.154 |

Single plays are rougher (0.15 mean miss per play); the team number is the one to trust. The page prints the final and halftime figures under the number.

## What the live feed actually does (Monday Night Football, 10-19)

`scripts/live-probe.ts` logged the game summary every 20 s for the whole game; `scripts/probe-report.ts` summarizes the log.

- ESPN's game summary has **no `situation` block** during a live game, and no timeouts anywhere in it. The page takes down & distance from the latest play and timeouts from the scoreboard feed (polled every 15 s with the game while it is live).
- ESPN's scoreboard feed posts each new play 10-20 s before the game summary does, so the top of the game page shows that play first, marked "just in", until the summary catches up.
- Plays appear in the feed about a minute after the snap (median ~55 s from ESPN's own `wallclock`, including our poll gap).
- The header clock only moves when a play is posted.
- No score ever went backwards during the live game (it does happen in finished games' rows; see `buildGame`).

## Run it

```bash
npm install
```

```bash
npm run nflverse
```

```bash
npm run dev
```

Then open http://127.0.0.1:5231. `npm run nflverse` writes `public/data/` (EP table + per-game advanced stats); the app works without it, minus EPA.

Optional: `npx tsx scripts/calibrate.ts` refreshes the calibration line (one polite ESPN request per new finished game, cached). If ESPN answers 429/503, or three requests fail in a row, the run stops asking and works from the cache.

### Offline snapshot

For a host that blocks network access: `npx tsx scripts/snapshot.ts` freezes this week's games into `snapshot-public/`, and `npm run build:snapshot` builds `dist-snapshot/`, which runs with no network and can replay any finished game.

### Tests

```bash
npm test
```

The polling engine (`src/hooks/poller.ts`) runs under fake timers: a hung request recovers, errors never poll faster than the normal schedule, ESPN's Retry-After holds against a manual refresh and a returning tab, a view with nothing live is fetched once and then only on a tap, and a malformed answer never replaces good data. One cooldown covers the whole tab: once ESPN pushes back, no poller asks again until the wait is over. Play-classification tests cover kneels, spikes, flags that wipe out a play, muffed punts and safeties. Week tests cover stepping from week 18 into the playoffs and back, both ends of the season, and the week link.

### Hosting (GitHub Pages)

`.github/workflows/pages.yml` builds on push and twice a day (18:00 and 06:00 UTC; nflverse's 2026 file was updated at 16:28 UTC on Monday 10-19), then publishes to Pages. ESPN sends `Access-Control-Allow-Origin: *`, so each visitor's browser reads ESPN directly; the site itself is static. The build uses relative paths, so it works at any Pages sub-path.

For a fork: in the repository's settings, set Pages to build from GitHub Actions; the workflow does the rest.

## Data and terms

- **Live data**: ESPN's unofficial `site.api.espn.com` JSON. Undocumented, can change without notice, and ESPN's terms don't grant this use: keep it personal, keep polling polite (15 s while live and visible, paused when the tab is hidden, backs off on errors).
- **Advanced stats**: [nflverse](https://github.com/nflverse/nflverse-data) play-by-play (nflfastR models), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Gridiron changes it: it sums the plays into per-game team and quarterback numbers, and builds the expected-points table behind the live EPA estimate from past seasons (see above). The app's footer carries the same credit and links. The repo doesn't store the derived data; the workflow rebuilds it.
- **Code**: MIT (see `LICENSE`), which covers the code only, not ESPN's data, nflverse's data, or team names and logos.
- **Font**: Barlow Condensed (SIL Open Font License), served from this site; see `src/fonts/README.md`.
- **Privacy**: no ads, no analytics, no cookies. Your browser talks to this site and to ESPN (scores, logos, and clip thumbnails from ESPN's image CDN), nothing else; a clip link or thumbnail on any other host is dropped.

## Layout

- `src/espn/` ESPN types, fetches, and `model.ts` (summary JSON -> one `Game` shape)
- `src/stats/` live numbers and the EPA estimate
- `src/components/` Preact views
- `src/styles.css` the visual layer; `design/CONTRACT.md` is the class-name contract between components and styles
- `scripts/` nflverse build (Python stdlib), calibration and snapshot (tsx)
