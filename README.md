# Gridiron

A phone-first live NFL viewer with no ads. One scroll per game: score, the situation, the last play and how much it swung win probability, a whole-game WP chart, the current drive, the numbers that say how each team is actually playing, a drive chart, then the box score.

## What it shows

- **Scoreboard**: every game of the week, live ones first, with down & distance and a win-probability bar. Polls every 15 s while a game is live.
- **Game page**
  - sticky score bar with a freshness pill ("7s ago": green under 30 s, amber past 45 s, red past 2 min; tap to refetch)
  - situation, last play with its WP swing and its estimated EPA
  - WP chart for the whole game; drag it to read any play
  - current drive on a 100-yard strip
  - **How they're playing**, live: success rate, EPA/play (est.), yards/play, explosive plays, early-down pass rate, 3rd-down distance, points/drive, turnovers and the win % they cost, average drive start
  - drive chart: one row per drive, every drive attacking rightward, result glyph at the end; tap a row for its plays
  - box score (passing, rushing, receiving; defense, kicking, returns behind one tap)
  - after the game: nflverse model numbers (EPA pass/rush, success, CPOE, pass rate over expected, top plays by EPA and WPA)
  - finished games can be replayed play by play "as if live"

## Live EPA, estimated, and how good the estimate is

nflverse's EPA arrives the morning after. During the game this page estimates it: `scripts/nflverse_build.py` bakes an expected-points table (down x distance x yard line, from nflfastR's own EP over 2022-2025), and each scrimmage snap's EPA is EP after minus EP before (TD = 7, safety = -2, a change of possession flips the sign).

`scripts/calibrate.ts` runs the page's own code over ESPN's play-by-play for every finished game of the season, stops at the end of Q1, Q2, Q3 and the final, and compares each team's EPA/play so far with nflverse's for the same quarters. The EP table is built from 2022-2025 only, so 2026 games are unseen. On 2026 weeks 1-6 (92 games, 184 team-games):

| Checked at | Mean miss | 90% within | Guess-the-average baseline |
|---|---|---|---|
| End of Q1 | 0.067 | 0.134 | 0.313 |
| Halftime | 0.053 | 0.118 | 0.194 |
| End of Q3 | 0.049 | 0.110 | 0.174 |
| Final | 0.040 | 0.085 | 0.154 |

Single plays are rougher (0.15 mean miss per play); the team number is the one to trust. The page prints the final and halftime figures under the number.

## What the live feed actually does (Monday Night Football, 10-19)

`scripts/live-probe.ts` logged the game summary every 20 s for the whole game; `scripts/probe-report.ts` summarizes the log.

- ESPN's game summary has **no `situation` block** during a live game, and no timeouts anywhere in it. The page takes down & distance from the latest play and timeouts from the scoreboard feed (polled every 30 s while the game is live).
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

Then open http://127.0.0.1:5191. `npm run nflverse` writes `public/data/` (EP table + per-game advanced stats); the app works without it, minus EPA.

Optional: `npx tsx scripts/calibrate.ts` refreshes the calibration line (one polite ESPN request per new finished game, cached).

### The frozen copy (Claude artifact)

A Claude artifact can't fetch ESPN, so it gets a snapshot: `npx tsx scripts/snapshot.ts` freezes this week's games into `snapshot-public/`, and `npm run build:snapshot` builds `dist-snapshot/`, which runs with no network.

### Hosting (GitHub Pages)

`.github/workflows/pages.yml` builds on push and twice a day (18:00 and 06:00 UTC; nflverse's 2026 file was updated at 16:28 UTC on Monday 10-19), then publishes to Pages. ESPN sends `Access-Control-Allow-Origin: *`, so each visitor's browser reads ESPN directly; the site itself is static.

## Data and terms

- **Live data**: ESPN's unofficial `site.api.espn.com` JSON. Undocumented, can change without notice, and ESPN's terms don't grant this use: keep it personal, keep polling polite (15 s while live and visible, paused when the tab is hidden, backs off on errors).
- **Advanced stats**: [nflverse](https://github.com/nflverse/nflverse-data) play-by-play (nflfastR models), CC-BY 4.0. Credit stays in the footer.

## Layout

- `src/espn/` ESPN types, fetches, and `model.ts` (summary JSON -> one `Game` shape)
- `src/stats/` live numbers and the EPA estimate
- `src/components/` Preact views
- `src/styles.css` the visual layer; `design/CONTRACT.md` is the class-name contract between components and styles
- `scripts/` nflverse build (Python stdlib), calibration and snapshot (tsx)
