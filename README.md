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

nflverse's EPA arrives the morning after. During the game this page estimates it: `scripts/nflverse_build.py` bakes an expected-points table (down x distance x yard line, 4 seasons of nflfastR's own EP), and each snap's EPA is EP after minus EP before (TD = 7, FG = 3, safety = -2, turnovers flip the sign).

`scripts/calibrate.ts` runs the page's own code over ESPN's play-by-play for every finished game of the season and compares each team's EPA/play with nflverse's. On 2026 weeks 1-6 (92 games, 184 team-games): mean error 0.04 per play, 90% within 0.08, bias -0.005. The page prints that line under the numbers.

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

`.github/workflows/pages.yml` builds on push and every morning at 4:30 AM Pacific (after nflverse posts the night's games), then publishes to Pages. ESPN sends `Access-Control-Allow-Origin: *`, so each visitor's browser reads ESPN directly; the site itself is static.

## Data and terms

- **Live data**: ESPN's unofficial `site.api.espn.com` JSON. Undocumented, can change without notice, and ESPN's terms don't grant this use: keep it personal, keep polling polite (15 s while live and visible, paused when the tab is hidden, backs off on errors).
- **Advanced stats**: [nflverse](https://github.com/nflverse/nflverse-data) play-by-play (nflfastR models), CC-BY 4.0. Credit stays in the footer.

## Layout

- `src/espn/` ESPN types, fetches, and `model.ts` (summary JSON -> one `Game` shape)
- `src/stats/` live numbers and the EPA estimate
- `src/components/` Preact views
- `src/styles.css` the visual layer; `design/CONTRACT.md` is the class-name contract between components and styles
- `scripts/` nflverse build (Python stdlib), calibration and snapshot (tsx)
