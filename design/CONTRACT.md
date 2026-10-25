# Gridiron DOM contract

The Preact components emit these class names; `src/styles.css` styles them.
Both sides keep these class names. Add classes freely; never rename these.

Viewport target: 390x844 portrait phone first; must not break at 320 or look silly at 1280 (center a max-width column, ~560px).
Dark by default. Tabular numerals everywhere numbers sit in columns.
Team colors arrive as CSS custom properties on the element: `--tc` (primary hex, e.g. `#AA0000`) and `--tc2` (alternate). Some team primaries are near-black (e.g. LV `#000000`), so the styles must keep marks visible on dark (lift luminance / use outline).

## Root
- `.app` root; `.view-scoreboard` or `.view-game` modifier.
- `.topbar` app header on the scoreboard: `.brand`, `.week` (e.g. "Week 6"), `.fresh`.
- `.fresh` freshness pill, everywhere: text like "7s ago". States: `.is-live` (green, under 30s), `.is-stale` (amber, 45s+), `.is-dead` (red, 2min+, text "tap to refresh"), `.is-idle` (no polling: pre/final). It is a button.

## Scoreboard
- `.sb-list` list of cards. Group headings `.sb-group` ("Live", "Today", "Final", "Upcoming").
- `.sb-game` card (a button/link). State modifier: `.is-live` | `.is-pre` | `.is-final`. `.is-close` when live and within 8 points in the 4th.
  - two `.sb-team` rows (away first), each with `--tc`: `img.logo`, `.abbr`, `.rec` (record "4-2"), `.score`, `.poss` (a small ball marker, present only for the team with the ball), `.is-winner` modifier on the final winner, `.is-loser` on the final loser.
  - `.sb-status`: "Q3 4:12" / "Final" / "Final/OT" / "Mon 5:15 PM".
  - `.sb-sit` (live only): "3rd & 4 · SF 38". `.is-redzone` modifier.
  - `.sb-wp` (live only): a 2-segment bar, `.sb-wp-away` and `.sb-wp-home` with inline `width:%` and `--tc`.
  - `.sb-meta` (pre only): broadcast + spread, e.g. "ESPN · SF -7.5".

## Game page (four tabs)
- `.game-head` sticky at top, holding the score bar and the tabs:
  - `.scorebar`: `.sbar-team.away` and `.sbar-team.home`, each with `--tc`: `img.logo`, `.abbr`, `.score`, `.poss` ball marker when that team has it, and `.sbar-glyphs` holding `.tos` (three `.to` dots, `.to.used` when spent) and `.giveaways` (turnover icon + count, only when above 0).
  - `.sbar-mid`: `.clock` ("Q2 2:14" / "Half" / "Final"), a clock `.icon` while live.
  - `.tabs`: four `button.tab` (`role="tab"`, `.is-on` for the open one): Live (Preview before kickoff, Final after), Story, Stats, Players. `.tab-dot` on Story when a key play landed while another tab was open. The open tab is in the link: `#/g/<id>/<now|story|stats|players>`.
- `.icon`: inline SVG glyphs in currentColor (`.icon-clock`, `-ball`, `-turnover`, `-flag`, `-zone`, `-sack`, ...), from `components/Icons.tsx`.
- Live tab (`.surface`):
  - `.situation`: "3rd & 4 · SF 38" plus `.sit-extra` chips with an icon ("Red zone", "≈2 possessions left"). `.is-redzone` modifier.
  - `.field`: an SVG field. Away end zone on the left, home on the right (`.fld-ez` with `--tc`); `.fld-redzone` (the 20 the offense is driving at), `.fld-los` (line of scrimmage), `.fld-gain` (line to gain), `.fld-drive` + `.fld-start` (the drive so far), `.fld-path` (the last snap; `.is-pass` arcs), `.fld-ball`, `.fld-tag` (offense and direction), `.fld-note` when no ball is down ("HALFTIME").
  - `.driveline`: "NYG drive · 6 plays · 41 yds".
  - `.jump-row`: a row that opens another tab (label, one-line answer, chevron).
  - `.glance`: two `.cmp` rows from the Stats tab (total yards, time of possession).
  - `.game-clips` (a final with ESPN's game highlight): `h3.sub-title`, then `.game-clip` rows (an `a.clip` and its headline).
- `h3.sub-title`: a heading inside a tab ("Key plays", "Drives", "How well they're playing").
- Story tab (`.tabpane`): `.wpchart` with `.wp-rail` and `.mk-legend` under it (one `button.mk.mk-<kind>` per key play: td, fg, safety, int, fumble, downs, miss, swing, clip; `.mk-film` dot when it has a clip; `.is-sel`), `.wp-dot` and `.wp-guide` on the chart; `ol.keyplays` of `li.kp.kp-<kind>` (`.kp-team` chip, `.kp-kind`, `.kp-when`, `.kp-score`, `.kp-text`, `.kp-badges`, `a.clip`); then `.drives`.
- Stats tab: `.tally` (rows won per side, as `.tk` ticks), then `.cmp` head to head: `.cmp-head`, `.cmp-row` per stat with `.cmp-v.away` / `.cmp-v.home` (`.is-better` / `.is-worse`), `.cmp-k` (label, optional icon), `.cmp-bar` with two `.cmp-half` growing from the middle (`i.is-worse` greys the side that did worse).
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
- `.players`: per-team blocks `.pl-team` with `--tc`; per category `table.pl-table` with `caption`, `th`, `td`; first column `.pl-name`.
- `.adv` post-game nflverse block: same `.nums` grid + `.topplays` list of `.play`.
- `.dock`: fixed bottom bar: `.dock-back` (to the week) and the game's one action (the freshness pill, or Replay on a final).
- `.footer`: data credits, with links to the nflverse data and its CC BY 4.0 license and a line on what Gridiron changed; `.footer a` underlined.
- `.empty`, `.error` states (one line, centered).

## Motion
Only two things animate: `.play.is-new` (one-shot fade) and `.drive-cap.cap-live` / `.wp-now` (slow pulse). Respect `prefers-reduced-motion`. (The tabs' colour change is a hover transition, not motion.)
