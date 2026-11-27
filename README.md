# Gridiron

A phone-first live NFL viewer with no ads and no betting lines. Each game opens on the field (where the ball is, the line to gain, the drive so far and the last snap), with the game's story, a head-to-head of the team stats and the box score one tab away.

Live at https://mikemakegame.github.io/Gridiron/ (GitHub Pages; add it to your phone's home screen).

A personal, non-commercial project. Not affiliated with ESPN, the NFL or any team.

## What it shows

- **Scoreboard**: every game of the week as tiles, live ones first, with down & distance and a win-probability bar along each live tile's bottom edge; two columns on a wide screen. ESPN is polled only while a game is live (every 15 s; 30 s at halftime). Before kickoff the page fetches once and arms one more fetch for the next kickoff time (30-45 s after it, the last 15 s at random so open pages don't all ask at once; a kickoff more than 6 h off re-checks every 6 h, and so does a game whose kickoff time ESPN hasn't set yet, with a line saying so), then polls live once the game is on. If ESPN still says "pre" past the kickoff, it checks every 15 s for 15 minutes, then every minute with a "Kickoff delayed?" line on the game page, and stops 4 hours after the kickoff time, saying so. With the browser's Data Saver on, every cadence and retry is 4x slower (live, a delayed kickoff, the error backoff, an unreadable update's retries; the delayed-kickoff line shows the stretched interval), but a kickoff wait is never stretched; a failed fetch at kickoff retries on the normal backoff, not at the next re-arm; after the final, or in a week with nothing ahead, it fetches once and then only when you tap the freshness pill. The same rule holds on a game page, where the game summary and the scoreboard (for timeouts and "just in" plays) run as one feed: the scoreboard polls exactly while the game is live, one tap on the pill refreshes both, and a tab coming back from the background re-checks both. The arrows step through the regular season and on into the playoffs, using ESPN's own calendar; a browsed week stays in the link (`#/w/2026-3-1` is the Wild Card round) and survives opening a game.
- **Game page**: a sticky score bar (timeouts as dots, turnovers with an icon) over five tabs; the open tab is in the link (`#/g/<id>/stats`)
  - **Live** (Preview before kickoff, Final after): the situation, a little football field (end zones in team colours, line of scrimmage in blue, line to gain in yellow, the red zone the offense is driving at, the drive so far, the last snap's path), the last play (on a final, the play of the game) with its win-probability swing, and three stats at a glance
  - **Story**: the whole-game win-probability chart with a rail of markers under it, and the game's events as a list beneath, with the end of each quarter, halftime and the two-minute warnings between them. Events: scores (and two-point tries), turnovers (a muffed punt the kickers recover too), fourth downs converted or stopped, missed or blocked field goals and extra points, blocked punts, punts (how far, how they ended), sacks, penalties of 15+ yards or that hand over a first down (named, with who and how far), injuries (who, when, and whether they came back, from ESPN's play text), big win-probability swings, and plays with a highlight clip
    - a row of chips under the chart filters both the list and the rail (Scores, Turnovers, Big swings, Injuries, 4th downs, Kicks, Sacks, Punts, Penalties, Clips, each with its count); everything but Punts and Penalties is on to start, and your choice is remembered in this browser
    - the chart and the chips stay pinned under the score bar while the list scrolls beneath them; tapping a marker highlights its row and moves the page only as far as needed to show it, never the chart off screen; tapping a row (or Tab to it and Enter) marks its play on the chart. On a short screen the chart shrinks; where the score bar and the pinned chart would take more than 65% of the screen (a phone turned to landscape; a portrait phone takes about half), the chart scrolls with the page instead. Both are re-decided on a rotation, never mid-scroll
    - every score, turnover and stop on downs keeps its marker on the rail; close ones are nudged apart, with a guide line to the play's spot on the chart
    - the drives sit one tap away under the list
    - a live game opens on Live; a final opens here
  - **Standouts**: the game's best and roughest players, both teams, up to four of each, ranked by one impact score in expected points, each with the line that earned it ("2 INT, −9.4 EPA on dropbacks", "3 sacks, a forced fumble"). Live it says "so far"; a replay stops where the replay is; after the game nflverse's quarterback EPA replaces the estimate. How the score is built: `src/stats/players.ts`
  - **Stats**: who's winning more of the numbers, then ESPN's team stats head to head (each with a bar from the middle out; the better side keeps its colour), then the numbers that say how each team is actually playing (success rate, EPA/play est., explosive plays and more); after the game, nflverse's model numbers. Each number with a league average carries a small ▲ / ▼ and the gap under it (green better, red worse) and a tick on its bar where the average sits (see League averages below)
  - **Players**: a compare that lines the two teams up one position group at a time (QB first, then RB, WR / TE, defense, K / P), in pairs, busiest first, each stat with a bar and its league average; players who barely played sit behind "Show all". ESPN's box score has no positions, so a player's group is where most of his touches were. Then the box score (passing, rushing, receiving; defense, kicking, returns behind one tap)
  - the Standouts tab and the compare read the players from ESPN's play text (who threw, ran, caught, sacked, picked off, forced, recovered, kicked), so they follow a live game and a replay play by play. On the 97 cached 2026 games the text agrees with ESPN's box score on over 99% of sacks and field goals and 97%+ of catches and carries; the misses are laterals, spikes and two players a team's text can't tell apart ("B.Robinson")
  - **Highlight clips**: ESPN posts one-play clips for some games, 6-20 minutes after the snap, without saying which play they show. Gridiron pins each to its play by the names and yardage in the headline and the time it was posted (`src/espn/clips.ts`); a pinned clip shows as a thumbnail that opens ESPN's own player. Many games get none during the game.
  - every stat name explains itself: tap it (or hover with a mouse) for one sentence
  - a bottom dock where the thumb is: back to the week, and the game's one action (the freshness pill live or before kickoff: green under 30 s, amber past 45 s, red past 2 min, tap to refetch; Replay on a final). The pill's age is the age of the game on screen: when ESPN answers with an update Gridiron can't read, the last readable game stays up, the pill turns amber with "can't read ESPN · 3m" (never green) and a line under the score bar says so, and the console logs it once per kind of error. While it can't read, the page fetches at least every 30 s for 20 minutes, even if that unreadable update says the game is over, and the line says what happens next: "Still trying" only while a fetch is under 10 minutes away, the time of the next check when it is further off (a kickoff hours away), or that nothing will check until a tap
  - finished games can be replayed play by play "as if live", from the dock; a play whose data doesn't read holds the replay at the nearest play before it that does, with a line saying the replay can't go past it and the held play's number in the dock (it never jumps to the final score)
  - each tab has its own safety net: if ESPN's data breaks one tab's view, that tab shows "Try again" and the score bar, the pill and the polling carry on; the page as a whole has one too, with the pill still in the dock. After each crash, either tries once more on its own when a newer update reads (and says so while that is still to come), then waits for the tap
- **Team colours**: every tile that shows a team wears the team's own colour, like a broadcast score bug: the scoreboard's tiles (each team a band, away on top, the clock and down & distance in a plain box beside them), the score bar's two halves, the Standouts cards, the compare's column heads, the box score's team names and the Story's team chips. The fill is the team's primary (its alternate when the primary is black, white or grey), its stripe the other colour, its text white or ink by computed contrast, and the logo is the set that reads on it. Each team is one colour per view, tile and lines alike. Two teams whose fills would read as one (navy at navy) are told apart by colour distance: the home side wears its other colour everywhere, or, when that colour is grey, black or white, keeps its own with a gap between the two. When two teams' chart lines would still read as one, the home side's lines move lighter or darker, never to another hue (`src/espn/colors.ts`). A final marks its winner with a pointer at the score and a smaller, lighter loser's score, not by colour alone. A team ESPN sends no colour for keeps the plain dark tile, with a console line; one with no usable alternate colour gets a primary-only tile.
- **Looks**: Night (dark, the default) and Day (high contrast for sunlight), from the top bar or the "Look, data and credits" row; your system's light/dark setting picks one until you choose. The browser's own colour scheme and its bar colour follow the look. Team fills are the same colour in both; every filled tile, card, plate and score-bar half has a hairline edge, darker on Day, instead of a muted fill. Every team colour clears 4.5:1 in both as an accent; a fill's text clears 4.5:1 by how it is picked. `python scripts/team_contrast.py .cache/espn` prints both tables, every clashing pairing and every lifted line, and exits 1 when an accent or a lifted line falls under 3:1 on a page, or a fill's text under 4.5:1 (which only a drift between the script and `colors.ts` could cause).
- **Keys**, where there's a keyboard: ← → change week, Esc back to the games, ← → step a replay, Enter or Space on a Story row to mark it on the chart. A screen reader hears each score change as it lands (not during a replay).

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

## League averages

`scripts/nflverse_build.py` writes `public/data/baselines.json`: the league's average per team game, and per position for players, over two windows, with a switch between them on the Stats and Players tabs (your pick is remembered in this browser).

- **This season**: the regular-season games so far. It's the default once 4 weeks are fully played (every scheduled game of the week in nflverse's data); before that, early-season samples are noise and the default is the last 3 seasons. The default is computed from the data, not set by date.
- **Last 3 seasons**: the three completed seasons before this one.
- **No all-time average**: the passing era, rule changes and the 2024 kickoff rule make old numbers a different sport.
- **The 2024 kickoff rule** moved drive starts, so a window that reaches back before 2024 has no drive-start average (the switch's explanation says so).
- **Rates, not totals, mid-game**: a rate (per play, per attempt, per drive) is compared live and final; a total (yards, sacks, turnovers) only after the final, because a live game's totals are partial. One rule, in `src/stats/baselines.ts`, beside the table of which way is better for each stat (a high sack rate reads as bad).
- **Players count toward an average** only in games with enough volume (`QUALIFIERS` in the build script, written into the file and shown in the switch's explanation). Defenders have no average: the play-by-play has no snap counts to make a rate from.
- Rates are pooled over every play in the window, by the page's own definitions (its success rate is the 40/60/100 rule, not nflverse's EPA > 0). This is separate from the EP table's 2022-2025 window above.
- Without the file the page works as before, with no average markers (a console line says why), and the standouts score uses the weights written in `src/stats/players.ts`.

## What the live feed actually does (Monday Night Football, 10-19)

`scripts/live-probe.ts` logged the game summary every 20 s for the whole game; `scripts/probe-report.ts` summarizes the log.

- ESPN's game summary has **no `situation` block** during a live game, and no timeouts anywhere in it. The page takes down & distance from the latest play and timeouts from the scoreboard feed (polled at the game's own cadence, exactly while the game is live).
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

Then open http://127.0.0.1:5231. `npm run nflverse` writes `public/data/` (EP table, per-game advanced stats, league averages); the app works without it, minus EPA, the Standouts tab and the average markers.

Optional: `npx tsx scripts/calibrate.ts` refreshes the calibration line (one polite ESPN request per new finished game, cached). If ESPN answers 429/503, or three requests fail in a row, the run stops asking and works from the cache.

### Offline snapshot

For a host that blocks network access: `npx tsx scripts/snapshot.ts` freezes this week's games into `snapshot-public/`, and `npm run build:snapshot` builds `dist-snapshot/`, which runs with no network and can replay any finished game.

### Tests

```bash
npm test
```

The polling engine (`src/hooks/poller.ts`) runs under fake timers: a hung request recovers, errors never poll faster than the normal schedule, ESPN's Retry-After holds against a manual refresh and a returning tab, a view with nothing live and nothing ahead is fetched once and then only on a tap, a board or game waiting on a kickoff fetches again at the kickoff and then goes live, and a malformed answer never replaces good data. The game feed (`src/hooks/feed.ts`) runs under fake timers too: a game opened before kickoff goes live at kickoff, the scoreboard starts, refreshes, wakes and stops with the summary, and a tab hidden through kickoff re-checks when it comes back. One cooldown covers the whole tab: once ESPN pushes back (a 429, or any explicit Retry-After), no poller asks again until the wait is over; a 503 without a Retry-After is a busy server and takes the normal error backoff (15, 30, 60 s and up), and "Retry-After: 0" is no wait. Play-classification tests cover kneels, spikes, flags that wipe out a play, muffed punts, safeties, and a score that jumps ahead for one row (ESPN did this in TEN @ IND, 2026-10-18, and it hid two touchdowns). The game page's glue is tested without a page: a feed that keeps answering with an update the model can't read keeps the last good game and an amber pill (never green) that logs once, the scoreboard's "just in" snap shows until the summary catches up and expires 90 s after it was first seen (`src/espn/ahead.ts`), a replay cut that breaks the model holds before it and never shows the final, and the pin's fit on a short or turned screen. The Story's classifier runs on CI on a hand-written game in ESPN's format (`test/fixtures/story-made-up.ts`: invented teams, players and text, one row per kind of event, committed). The Story's tests also run on real ESPN play text (`test/fixtures/espn-plays.json`; see the note after this paragraph): every kind of event, injuries and returns, the filter chips, the quarter dividers and the replay cutoff; with the local ESPN cache present they also check every cached game: every scoring play is an event and keeps its marker on the rail, every injury line is an event, and nothing shows past a replay cut. Week tests cover stepping from week 18 into the playoffs and back, both ends of the season, and the week link. Player tests run on hand-written plays in ESPN's format (a sack scores once, though the box score also counts it as a tackle for loss; interceptions, kicks, the fallback weights) and on one whole real game (`test/fixtures/espn-game-401872656.json`, trimmed): every quarterback's line, sack, interception and kick against ESPN's box score, the position groups, the replay cutoff and the standouts ranking; with the local cache they check every cached game's box score. Colour tests cover the text pick on a fill (every grey from black to white clears 4.5:1), one colour per team (the swap, the divider for a grey or black alternate, the line lift), the missing-colour and bad-alternate fallbacks, that styles.css and the contrast script carry the same ink and line numbers, and, with the cache, every team's primary and alternate as a fill and every pairing of two teams (a divider only for a neutral alternate, readable text, lines apart on both looks). Average tests cover the default (week count, counting only weeks whose every game is in), rates-live-totals-final, the better-direction table, the missing-file fallback, a refused partial or wrong-version file, and the shape the build script writes (it runs on a small made-up play-by-play; skipped, with a console line, where there's no Python).

The two JSON files in `test/fixtures/` are ESPN's own play text, so they stay out of git (ESPN's terms don't grant redistributing it). `python -X utf8 -I scripts/make_fixtures.py` rebuilds them from the local ESPN cache; without them, the tests that read them skip with a console line and the rest run.

### Hosting (GitHub Pages)

`.github/workflows/pages.yml` builds on push and twice a day (18:00 and 06:00 UTC; nflverse's 2026 file was updated at 16:28 UTC on Monday 10-19), then publishes to Pages. ESPN sends `Access-Control-Allow-Origin: *`, so each visitor's browser reads ESPN directly; the site itself is static. The build uses relative paths, so it works at any Pages sub-path.

For a fork: in the repository's settings, set Pages to build from GitHub Actions; the workflow does the rest.

## Data and terms

- **Live data**: ESPN's unofficial `site.api.espn.com` JSON. Undocumented, can change without notice, and ESPN's terms don't grant this use: keep it personal, keep polling polite (15 s while live and visible, paused when the tab is hidden, backs off on errors).
- **Advanced stats**: [nflverse](https://github.com/nflverse/nflverse-data) play-by-play (nflfastR models), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Gridiron changes it: it sums the plays into per-game team and quarterback numbers and into league averages, and builds the expected-points table behind the live EPA estimate from past seasons (see above). The app's footer carries the same credit and links. The repo doesn't store the derived data; the workflow rebuilds it.
- **Code**: MIT (see `LICENSE`), which covers the code only, not ESPN's data, nflverse's data, or team names and logos.
- **Font**: Barlow Condensed (SIL Open Font License), served from this site; see `src/fonts/README.md`.
- **Privacy**: no ads, no analytics, no cookies. Your browser talks to this site and to ESPN (scores, logos, and clip thumbnails from ESPN's image CDN), nothing else; a clip link, clip thumbnail or team logo on any other host is dropped, with a console line (one rule for all three, `src/espn/hosts.ts`).

## Layout

- `src/espn/` ESPN types, fetches, and `model.ts` (summary JSON -> one `Game` shape)
- `src/stats/` live numbers and the EPA estimate
- `src/components/` Preact views
- `src/styles.css` the visual layer; `design/CONTRACT.md` is the class-name contract between components and styles
- `scripts/` nflverse build (Python stdlib), calibration and snapshot (tsx)
