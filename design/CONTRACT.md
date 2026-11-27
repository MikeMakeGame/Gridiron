# Gridiron DOM contract

The Preact components emit these class names; `src/styles.css` styles them.
Both sides keep these class names. Add classes freely; never rename these.

Viewport target: 390x844 portrait phone first; must not break at 320 or look silly at 1280 (center a max-width column, ~560px).
Dark by default. Tabular numerals everywhere numbers sit in columns.
Team colors arrive as CSS custom properties on the element: `--tc` (primary hex, e.g. `#AA0000`) and `--tc2` (alternate). Some team primaries are near-black (e.g. LV `#000000`), so the styles must keep marks visible on dark (lift luminance / use outline).
Team tiles wear the team's own colour: an element with `.has-fill` also carries `--fill` (the fill), `--on-fill` (its text: white, ink or black, picked by contrast in `src/espn/colors.ts`, 4.5:1 or better) and `--fill2` (the stripe, the team's other colour). Fill rules key on `.has-fill`; without it (ESPN sent no colour, a console line says so) the element keeps the plain dark look. `.is-split` rides with `.has-fill` on the home side when its fill reads as the away fill's and its other colour is neutral or clashes too (draw a divider; the scoreboard band does). One colour per team per view: when the home side swaps to its other colour, its `--tc` swaps too. When the two teams' lines would read as one, the home element also carries `--ta-ln` / `--ta-ld`, the OKLCH lightness its `--ta` takes on night and day instead of the shared lift. Text on a fill is `--on-fill` at full strength, never dimmed; a status colour (green, red) sits on a chip of page instead. The tiles: `.sb-team`, `.sbar-team`, `.so-card`, `.cmp-team`, `.kp-team`, `.pl-team` (its `.pl-team-name`). `--tile-edge` (per look) is the hairline round a filled card or plate.

## Root
- `.app` root; `.view-scoreboard` or `.view-game` modifier; `.is-short` on a game page when the screen is 700 px tall or less, and `.is-unpinned` when the score bar plus the Story's pin would take more than 65% of the screen height (`PIN_MAX_SHARE`) (a phone turned to landscape; the pin then scrolls with the page). Both are re-decided only when the width changes too (a rotation, a resized window), so the pinned chart never resizes mid-scroll as a phone's toolbar collapses.
- `.topbar` app header on the scoreboard: `.brand`, `.week` (e.g. "Week 6"), `.fresh`.
- `.fresh` freshness pill, everywhere: text like "7s ago", the age of the data on screen (on a game page, of the last update the model could read, not of the last fetch). States: `.is-live` (green, under 30s), `.is-stale` (amber, 45s+; also "can't read ESPN · 3m" while the newest update can't be read, never green then), `.is-dead` (red, 2min+, text "tap to refresh"), `.is-idle` (no polling: pre/final). It is a button.
- `.feed-note` (game page, under `.game-head`): one amber line while ESPN's newest update can't be read ("Can't read ESPN's latest update; showing the game as of 3m ago"), or while a replay is held at a play past which its data doesn't read ("The replay can't go past this play"; the dock's `.replay-pos` then shows the held play and wears `.is-held`), or while a game is still "pre" 15 minutes past its kickoff time ("Kickoff delayed?", and "Stopped waiting for kickoff" at 4 hours), or has no kickoff time set ("Kickoff time not set yet; checking every 6 h").
- `.dock.is-replay` holds `.replay`: `.replay-toggle`, `input.replay-scrub`, `.replay-pos` ("80/142"; `.is-held`, amber, when the page holds at an earlier play), `.replay-exit`.
- the page itself sits inside one boundary too: if the game's own view crashes, the page shows an `.error` line, a "Try again" (`.week-next`) and the dock with its pill, and the feed keeps polling.
- `.tab-crash` (a `.tabpane` in place of a tab whose view crashed): an `.error` line and a "Try again" button (`.week-next`) that resets only that tab.

## Scoreboard
- `.sb-list` list of cards. Group headings `.sb-group` ("Live", "Today", "Final", "Upcoming").
- `.sb-game` card (a button/link). State modifier: `.is-live` | `.is-pre` | `.is-final`. `.is-close` when live and within 8 points in the 4th.
  - `.sb-teams` holds two `.sb-team` bands (away first), each with `--tc` and its fill: `img.logo` (the logo set that reads on the fill), `.abbr`, `.rec` (record "4-2"), `.score`, `.poss` (a small ball marker, present only for the team with the ball), `.is-winner` modifier on the final winner (a pointer in its text colour at the band's edge aims at its score; a visually hidden `.sr` "winner"), `.is-loser` on the final loser (a lighter, smaller score).
  - `.sb-side` (live and pre): the plain box right of the bands, holding `.sb-status` and `.sb-sit` / `.sb-meta`. `.sb-ot` (a final in overtime) is a page-coloured badge over the bands.
  - `.sb-status`: "Q3 4:12" / "Final" / "Final/OT" / "Mon 5:15 PM".
  - `.sb-sit` (live only): "3rd & 4 · SF 38". `.is-redzone` modifier.
  - `.sb-wp` (live only): a 2-segment bar along the tile's bottom, under the bands, `.sb-wp-away` and `.sb-wp-home` with inline `width:%` and `--tc`.
  - `.sb-meta` (pre only): broadcast + spread, e.g. "ESPN · SF -7.5".

## Game page (five tabs)
- `.game-head` sticky at top, holding the score bar and the tabs:
  - `.scorebar`: `.sbar-team.away` and `.sbar-team.home`, each with `--tc` and its fill, running to its screen edge: `img.logo`, `.abbr`, `.score`, `.poss` ball marker when that team has it, and `.sbar-glyphs` holding `.tos` (three `.to` dots, `.to.used` when spent) and `.giveaways` (turnover icon + count, only when above 0; red on a chip of page when on a fill). On a final, `.is-winner` (a `.win-mark` pointer in the ball's slot aimed at the score, and a visually hidden `.sr` "winner") and `.is-loser` (a lighter, smaller score).
  - `.sbar-mid`: `.clock` ("Q2 2:14" / "Half" / "Final"), a clock `.icon` while live.
  - a visually hidden `p.sr` (`aria-live="polite"`) after the score bar: the score in words, so a screen reader hears each change (empty before kickoff and during a replay).
  - `.tabs`: five `button.tab` (`role="tab"`, `.is-on` for the open one): Live (Preview before kickoff, Final after), Story, Standouts, Stats, Players. `.tab-dot` on Story when a key play landed while another tab was open (never during a replay). The open tab is in the link: `#/g/<id>/<now|story|standouts|stats|players>`.
- `.icon`: inline SVG glyphs in currentColor (`.icon-clock`, `-ball`, `-turnover`, `-flag`, `-zone`, `-sack`, ...), from `components/Icons.tsx`.
- Live tab (`.surface`):
  - `.situation`: "3rd & 4 · SF 38" plus `.sit-extra` chips with an icon ("Red zone", "≈2 possessions left"). `.is-redzone` modifier.
  - `.field`: an SVG field. Away end zone on the left, home on the right (`.fld-ez` with `--tc`); `.fld-redzone` (the 20 the offense is driving at), `.fld-los` (line of scrimmage), `.fld-gain` (line to gain), `.fld-drive` + `.fld-start` (the drive so far), `.fld-path` (the last snap; `.is-pass` arcs), `.fld-ball`, `.fld-tag` (offense and direction), `.fld-note` when no ball is down ("HALFTIME").
  - `.driveline`: "NYG drive · 6 plays · 41 yds".
  - `.jump-row`: a row that opens another tab (label, one-line answer, chevron).
  - `.glance`: two `.cmp` rows from the Stats tab (total yards, time of possession).
  - `.game-clips` (a final with ESPN's game highlight): `h3.sub-title`, then `.game-clip` rows (an `a.clip` and its headline).
- `h3.sub-title`: a heading inside a tab ("Key plays", "Drives", "How well they're playing").
- Story tab (`.tabpane.is-story`): `.story` holds `.story-pin` (sticky under `.game-head`, whose height arrives as `--head-h` on `.app`) and the list.
  - `.story-pin`: `.wpchart` with `.wp-rail` under it (one `button.mk.mk-<kind>` per marked play; `.mk-film` dot when it has a clip; `.is-sel`), `.wp-dot` and `.wp-guide` on the chart (the guide runs from the play's spot to its marker, which may be nudged sideways), `.wp-readout` (a fixed two lines, one on short screens), then `.chips`: one `button.chip.chip-<group>` per filter (`aria-pressed`, `.is-on`; groups scores, turnovers, swings, injuries, fourth, kicks, sacks, punts, penalties, clips) holding a static `.mk` shape and `.chip-n` (the count). `.mk-legend` is gone: the chips wear the shapes.
  - marker kinds (`.mk-<kind>`, `.kp-<kind>`): td, fg, safety, two-pt, int, fumble, muff, downs, fourth-go, miss, xp-miss, punt-block, punt, sack, penalty, injury, swing, clip.
  - `ol.keyplays` of `li.kp.kp-<kind>` (the whole row takes a tap; its `.kp-main` is the keyboard's button, `role="button"`, `tabindex="0"`, `aria-pressed`, Enter or Space; `.kp-team` chip, `.kp-kind`, `.kp-when`, `.kp-score`, `.kp-detail` (one line more: who was hurt, the flag, how the punt ended), `.kp-text` and `.kp-badges` (only on the play's own event), `a.clip`), with `li.kp-rule` dividers (label, then `.kp-rule-score`; `.is-minor` for a two-minute warning).
  - then the drives, in a `.sec` fold (`#story-drives`) holding `.drives`.
- Standouts tab: `.standouts` holds two `section.so-block` (`.is-good`, `.is-rough`), each an `h3.sub-title` ("Good so far" / "Good games") and an `ol.so-list` of `li.so-card` (`.is-good` / `.is-rough`, with `--tc` and its fill; `.so-score` sits on a chip of page): `.so-team` (abbr chip), `.so-name`, `.so-pos` (QB, RB, WR / TE, Defense, K / P), `.so-score` (signed expected points), `p.so-why` (the line that earned it); then a `.sec-note` with the "impact" tip.
- `.base-switch` (top of Stats, and of the Players compare): `button.tip.base-k` ("vs league avg", tap to explain), `.base-opts` holding two `button.base-opt` (`aria-pressed`, `.is-on`): This season, Last 3 seasons; `p.tip-note.base-tip` when open. Absent when there are no league averages.
- Stats tab: `.tally` (rows won per side, as `.tk` ticks), then `.cmp` head to head: `.cmp-head` (two `.cmp-team` heads, each a name plate in its team's fill, half the width each), `.cmp-row` per stat with `.cmp-v.away` / `.cmp-v.home` (`.is-better` / `.is-worse`), `.cmp-k` (label, optional icon), `.cmp-bar` with two `.cmp-half` growing from the middle (`i.is-worse` greys the side that did worse).
  - against the league average: `small.avg-d` inside a `.cmp-v` (an arrow and the gap, `.is-good` / `.is-bad` / `.is-even` / `.is-neutral`, its sentence in `title`), and `b.cmp-avg` in each `.cmp-half` (a tick at `--at`, the average's place on the bar's scale).
- `a.clip`: an ESPN highlight thumbnail with `.clip-play` and `.clip-len`; it opens ESPN's own clip page in a new tab.
- `.lastplay`: `.lp-label` ("Last play"), `.lp-text`, `.wpd` badge.
- `.wpd` (WP delta badge, reused in play lists): text like "SF +4.1%". Modifiers `.big` (|delta| >= 10%), and `--tc` of the team that gained.
- `.epa` (EPA badge, reused): "+1.8" with `.pos` / `.neg` modifiers and `.est` when estimated.
- `.wpchart`: an inline SVG, full width, ~96px tall. Inside: `path.wp-line`, `line.wp-mid` (50% rule), `circle.wp-now`, `rect.wp-q` quarter bands (alternate subtle shading), `.wp-label` text for the two team abbreviations at top/bottom edges. Home on top (100%) and away on bottom (0%); the line takes `stroke` from a gradient or plain currentColor.
- `.nums` grid (the post-game nflverse block only): a header row `.nums-head` (two team abbr cells with `--tc`), then `.nums-row` per stat: `.k` (label), `.v.away`, `.v.home`, `.worse` on the side that lost that stat.
- `.drives` list:
  - `.qrule` divider between quarters: "Q2 · 7-3".
  - `.drive` row (a button), `--tc`: `.drive-team` (abbr + quarter), `.drive-track` (100-yard track, always attacking rightward), `.drive-bar` (start-to-end span), `.drive-cap` end glyph with modifiers `.cap-td` `.cap-fg` `.cap-punt` `.cap-to` (turnover) `.cap-downs` `.cap-half` `.cap-miss` (missed FG) `.cap-live`, `.drive-res` (result code "TD", "PUNT"), `.drive-sub` ("6p 41y 3:02"). `.is-open` when expanded. `.is-live` for the current drive (pulsing end cap allowed; nothing else animates).
  - `.drive-plays` (inside an open drive): `.play` rows: `.play-dd` ("2nd & 7 · SF 41"), `.play-text`, `.play-badges` holding `.wpd` / `.epa`. `.play.is-score`, `.play.is-turnover`, `.play.is-penalty`, `.play.is-new` (just arrived; one-shot highlight, fades over ~2s).
- `.players`: `h3.sub-title` "Compare", then `.pos-compare`: `.pos-tabs` of `button.pos-tab` (`aria-pressed`, `.is-on`; QB, RB, WR / TE, Defense, K / P), the `.base-switch` (or `p.pos-note` for defense), one `.pos-pair` per pair of players (a `.cmp` whose `.cmp-team` heads are player names), and `button.more` ("Show all"). Then `h3.sub-title` "Box score": per-team blocks `.pl-team` with `--tc`; per category `table.pl-table` with `caption`, `th`, `td`; first column `.pl-name`.
- `.adv` post-game nflverse block: same `.nums` grid + `.topplays` list of `.play`.
- `.dock`: fixed bottom bar: `.dock-back` (to the week) and the game's one action (the freshness pill, or Replay on a final).
- `.footer`: data credits, with links to the nflverse data and its CC BY 4.0 license and a line on what Gridiron changed; `.footer a` underlined.
- `.empty`, `.error` states (one line, centered).

## Motion
Only two things animate: `.play.is-new` (one-shot fade) and `.drive-cap.cap-live` / `.wp-now` (slow pulse). Respect `prefers-reduced-motion`. (The tabs' colour change is a hover transition, not motion.)
